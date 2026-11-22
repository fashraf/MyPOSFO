import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { AlertTriangle, Clock, MoonStar } from 'lucide-react';
import { useSession } from '@/contexts/SessionContext';
import { useI18n, type TranslationKey } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { restaurantSessionService, safeCall, type SessionActor } from '@/services';
import { useDataVersion } from '@/services/dataVersion';
import { ROUTES } from '@/routes/paths';
import {
  businessDateOf,
  differenceState,
  RESTAURANT_TZ,
  type DifferenceState,
  type RestaurantSession,
  type SessionSettings,
} from '@/types/restaurantSession';

/** `rs.*` translations with a short call site. */
export function useRs() {
  const { t, language } = useI18n();
  const r = useCallback(
    (key: string, vars?: Record<string, string | number>) => t(`rs.${key}` as TranslationKey, vars),
    [t],
  );
  const money = useCallback((h: number | undefined | null) => (h === undefined || h === null ? '—' : formatCurrency(h, { language })), [language]);
  const dateTime = useCallback(
    (iso: string | undefined) =>
      iso
        ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-GB', {
            timeZone: RESTAURANT_TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          }).format(new Date(iso))
        : '—',
    [language],
  );
  const time = useCallback(
    (iso: string) =>
      new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-GB', { timeZone: RESTAURANT_TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)),
    [language],
  );
  /** "November 20" for a yyyy-mm-dd business date. */
  const longDate = useCallback(
    (ymd: string, withYear = false) =>
      new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US', {
        timeZone: 'UTC', month: 'long', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}),
      }).format(new Date(`${ymd}T12:00:00Z`)),
    [language],
  );
  const methodLabel = useCallback((m: string) => r(`method.${m}`), [r]);
  return { r, t, language, money, dateTime, time, longDate, methodLabel };
}

export function useActor(): SessionActor {
  const { user, permissions } = useSession();
  const { language } = useI18n();
  return useMemo(
    () => ({
      id: user?.id ?? null,
      name: user ? (language === 'ar' ? user.nameAr : user.nameEn) || `${user.firstName} ${user.lastName}` : 'System',
      permissions,
    }),
    [user, permissions, language],
  );
}

export function durationText(fromIso: string, toIso: string | undefined, r: (k: string, v?: Record<string, string | number>) => string): string {
  const ms = Math.max(0, (toIso ? Date.parse(toIso) : Date.now()) - Date.parse(fromIso));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return r('duration', { h, m });
}

export function hoursOpen(s: RestaurantSession): number {
  return ((s.closedAt ? Date.parse(s.closedAt) : Date.now()) - Date.parse(s.openedAt)) / 3_600_000;
}

/** Today's calendar date in Riyadh. */
export function calendarToday(): string {
  return businessDateOf(new Date());
}

export function isCrossMidnight(s: RestaurantSession | null | undefined): boolean {
  return !!s && s.status === 'open' && s.businessDate < calendarToday();
}

/**
 * The open (or most recent) session at the active branch, kept fresh.
 * Re-reads on any sale and every 20 s, so the counters move while you watch.
 */
export function useBranchSession() {
  const { activeBranch } = useSession();
  const version = useDataVersion('sales');
  const [session, setSession] = useState<RestaurantSession | null>(null);
  const [settings, setSettings] = useState<SessionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const branchId = activeBranch?.id ?? null;
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!branchId) {
        setSession(null);
        setLoading(false);
        return;
      }
      const [latest, cfg] = await Promise.all([
        safeCall(() => restaurantSessionService.latest(branchId)),
        safeCall(() => restaurantSessionService.settings()),
      ]);
      if (!alive) return;
      /* Keep the same object when nothing changed. The 20-second refresh used
         to hand every screen a "new" session, which reset any open dialog. */
      const next = latest.ok ? latest.data : null;
      setSession((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      if (cfg.ok) setSettings((prev) => (JSON.stringify(prev) === JSON.stringify(cfg.data) ? prev : cfg.data));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [branchId, version, tick]);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 20_000);
    return () => clearInterval(id);
  }, []);

  const open = session?.status === 'open' ? session : null;
  return { session, open, settings, loading, reload, branchId };
}

/* ------------------------------------------------------------- visuals */

const DIFF_TONE: Record<DifferenceState, string> = {
  balanced: 'bg-success-50 text-success-700 ring-success-200',
  shortage: 'bg-danger-50 text-danger-700 ring-danger-200',
  surplus: 'bg-warning-50 text-warning-800 ring-warning-200',
  pending: 'bg-ink-100 text-ink-600 ring-ink-200',
};

export function DifferencePill({ diffH, className }: { diffH: number | undefined | null; className?: string }) {
  const { r, money } = useRs();
  const state = differenceState(diffH);
  return (
    <span
      data-testid="difference-pill"
      data-state={state}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', DIFF_TONE[state], className)}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', { balanced: 'bg-success-500', shortage: 'bg-danger-500', surplus: 'bg-warning-500', pending: 'bg-ink-400' }[state])} />
      {r(`diff.${state}`)}
      {state !== 'pending' && state !== 'balanced' && <span className="tabular-nums">{money(Math.abs(diffH!))}</span>}
    </span>
  );
}

export function StatusPill({ open }: { open: boolean }) {
  const { r } = useRs();
  return (
    <span
      data-testid="restaurant-status"
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold tracking-wide ring-1 ring-inset',
        open ? 'bg-success-50 text-success-700 ring-success-200' : 'bg-danger-50 text-danger-700 ring-danger-200',
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', open ? 'animate-pulse bg-success-500' : 'bg-danger-500')} />
      {open ? r('status.open') : r('status.closed')}
    </span>
  );
}

const TABS: { to: string; key: string; end?: boolean }[] = [
  { to: ROUTES.restaurant, key: 'nav.dashboard', end: true },
  { to: ROUTES.restaurantOpen, key: 'nav.open' },
  { to: ROUTES.restaurantSession, key: 'nav.current' },
  { to: ROUTES.restaurantClose, key: 'nav.close' },
  { to: ROUTES.restaurantHistory, key: 'nav.history' },
  { to: ROUTES.restaurantCash, key: 'nav.cash' },
];

export function RestaurantTabs() {
  const { r } = useRs();
  return (
    <nav aria-label={r('nav.group')} className="flex gap-1 overflow-x-auto rounded-xl border border-ink-200 bg-surface p-1 print:hidden">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              isActive ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
            )
          }
        >
          {r(tab.key)}
        </NavLink>
      ))}
    </nav>
  );
}

export function Notice({ tone, icon, children, testId }: { tone: 'danger' | 'warning' | 'info' | 'success'; icon?: ReactNode; children: ReactNode; testId?: string }) {
  const tones = {
    danger: 'border-danger-200 bg-danger-50 text-danger-800',
    warning: 'border-warning-200 bg-warning-50 text-warning-900',
    info: 'border-info-200 bg-info-50 text-info-800',
    success: 'border-success-200 bg-success-50 text-success-800',
  };
  return (
    <div data-testid={testId} role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', tones[tone])}>
      <span className="mt-0.5 shrink-0">{icon ?? <AlertTriangle className="h-4 w-4" />}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Long-running and cross-midnight warnings. Never blocking. */
export function SessionAlerts({ session, settings }: { session: RestaurantSession | null; settings: SessionSettings | null }) {
  const { r, longDate } = useRs();
  if (!session || session.status !== 'open') return null;
  const long = settings && hoursOpen(session) > settings.longSessionHours;
  return (
    <div className="space-y-2">
      {isCrossMidnight(session) && (
        <Notice tone="info" icon={<MoonStar className="h-4 w-4" />} testId="alert-cross-midnight">
          {r('alerts.crossMidnight', { start: longDate(session.businessDate), today: longDate(calendarToday()) })}
        </Notice>
      )}
      {long && (
        <Notice tone="warning" icon={<Clock className="h-4 w-4" />} testId="alert-long-session">
          {r('alerts.longSession', { hours: settings!.longSessionHours })}
        </Notice>
      )}
    </div>
  );
}

/** A labelled figure. */
export function Figure({ label, value, hint, tone, testId, big }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'danger' | 'success' | 'warning' | 'muted'; testId?: string; big?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-ink-500">{label}</div>
      <div
        data-testid={testId}
        className={cn(
          'truncate font-semibold tabular-nums',
          big ? 'text-xl sm:text-2xl' : 'text-base',
          tone === 'danger' && 'text-danger-700',
          tone === 'success' && 'text-success-700',
          tone === 'warning' && 'text-warning-700',
          tone === 'muted' && 'text-ink-400',
          !tone && 'text-ink-900',
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-ink-500">{hint}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className, testId }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section data-testid={testId} className={cn('rounded-2xl border border-ink-200 bg-surface p-3 sm:p-5', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold text-ink-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function NoBranch() {
  const { r } = useRs();
  return <Notice tone="info">{r('noBranch')}</Notice>;
}

export function NoPermission({ what }: { what: string }) {
  const { r } = useRs();
  return (
    <Notice tone="danger" testId="no-permission">
      <div className="font-semibold">{r('perm.title')}</div>
      <div>{r('perm.body', { what })}</div>
    </Notice>
  );
}
