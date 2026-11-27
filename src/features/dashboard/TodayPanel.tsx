import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChefHat, LockKeyhole, Receipt, ShoppingCart, Store, UtensilsCrossed } from 'lucide-react';
import { useSession } from '@/contexts/SessionContext';
import { useTranslation, type TranslationKey } from '@/i18n';
import { cn } from '@/lib/cn';
import { ROUTES } from '@/routes/paths';
import { hoursMinutes } from '@/features/restaurant/CloseConfirm';
import { QuickCloseDialog, QuickOpenDialog } from '@/features/restaurant/QuickDialogs';
import { useBranchSession, useRs } from '@/features/restaurant/shared';

/** 3725 → "01:02:05"; past a day → "1d 03:04:05". */
function clock(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d > 0 ? `${d}d ` : ''}${two(h)}:${two(m)}:${two(s)}`;
}

/**
 * The top of the dashboard on every device: is the restaurant open, and the
 * four things people do next — one tap each. On a phone it is the first screen
 * an owner sees, so it carries what matters before any chart.
 */
export function TodayPanel() {
  const { t } = useTranslation();
  const { r, longDate } = useRs();
  const { can } = useSession();
  const { open, session, loading, reload } = useBranchSession();
  /* Live counter: how long the restaurant has been open, or closed. Over 24 hours it blinks. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const since = open ? open.openedAt : session?.closedAt ?? null;
  const elapsedS = since ? Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000)) : null;
  const overDay = elapsedS !== null && elapsedS >= 24 * 3600;
  const [dialog, setDialog] = useState<'open' | 'close' | null>(null);
  const tk = (k: string) => t(k as TranslationKey);

  const canSessions = can('restaurant.session.view');
  const actions = [
    can('pos.view') && { key: 'pos', to: ROUTES.pos, icon: ShoppingCart, label: tk('today.newOrder'), primary: true },
    can('kitchen.view') && { key: 'kitchen', to: ROUTES.kitchen, icon: ChefHat, label: tk('nav.kitchen') },
    can('sales.view') && { key: 'sales', to: ROUTES.sales, icon: Receipt, label: tk('nav.sales') },
    canSessions && { key: 'restaurant', to: ROUTES.restaurant, icon: UtensilsCrossed, label: tk('nav.restaurant') },
  ].filter(Boolean) as { key: string; to: string; icon: typeof Store; label: string; primary?: boolean }[];

  return (
    <section className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]" data-testid="today-panel">
      {canSessions && !loading && (
        <div
          className={cn(
            'flex items-center gap-3 rounded-2xl border p-4',
            open ? 'border-success-200 bg-success-50/70' : 'border-danger-200 bg-danger-50/70',
            overDay && 'blink-alert',
          )}
          data-over-day={overDay ? 'true' : undefined}
        >
          <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', open ? 'bg-success-100 text-success-700' : 'bg-danger-100 text-danger-700')}>
            {open ? <Store className="h-6 w-6" /> : <LockKeyhole className="h-6 w-6" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className={cn('flex items-center gap-2 text-base font-bold', open ? 'text-success-800' : 'text-danger-800')}>
              <span className={cn('h-2 w-2 rounded-full', open ? 'animate-pulse bg-success-500' : 'bg-danger-500')} />
              {open ? r('status.open') : r('status.closed')}
            </div>
            <div className="truncate text-xs text-ink-600">
              {open ? `${open.number} · ${longDate(open.businessDate)} · ${hoursMinutes(open.openedAt)}` : tk('today.closedHint')}
            </div>
            {elapsedS !== null && (
              <div
                data-testid="today-counter"
                className={cn('numeric mt-0.5 text-sm font-semibold', overDay ? 'text-danger-700' : open ? 'text-success-800' : 'text-ink-700')}
              >
                {tk(open ? 'today.openFor' : 'today.closedFor')} {clock(elapsedS)}
                {overDay && <span className="ms-1.5 text-xs font-bold">· {tk('today.overDay')}</span>}
              </div>
            )}
          </div>
          {open
            ? can('restaurant.session.close') && (
                <button type="button" onClick={() => setDialog('close')} className="h-11 shrink-0 rounded-xl bg-danger-600 px-4 text-sm font-semibold text-white active:bg-danger-700" data-testid="today-close">
                  {r('actions.close')}
                </button>
              )
            : can('restaurant.session.open') && (
                <button type="button" onClick={() => setDialog('open')} className="h-11 shrink-0 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-white active:bg-ink-800" data-testid="today-open">
                  {r('actions.open')}
                </button>
              )}
        </div>
      )}

      {actions.length > 0 && (
        <div className={cn('grid gap-2', actions.length >= 4 ? 'grid-cols-2 min-[400px]:grid-cols-4' : actions.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
          {actions.map(({ key, to, icon: Icon, label, primary }) => (
            <Link
              key={key}
              to={to}
              data-testid={`today-${key}`}
              className={cn(
                'group flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-center text-xs font-semibold transition-colors active:scale-[0.98]',
                primary ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-surface text-ink-800 hover:bg-ink-50',
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      )}

      <QuickOpenDialog open={dialog === 'open'} onClose={() => setDialog(null)} onOpened={reload} />
      <QuickCloseDialog open={dialog === 'close'} session={open} onClose={() => setDialog(null)} onClosed={reload} />
    </section>
  );
}
