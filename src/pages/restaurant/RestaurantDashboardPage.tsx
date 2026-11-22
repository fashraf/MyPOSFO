import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Coins, History, LockKeyhole, Receipt, Store, Timer, Wallet } from 'lucide-react';
import { Button, LoadingState, PageHeader } from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { ROUTES } from '@/routes/paths';
import { restaurantSessionService, safeCall } from '@/services';
import type { RestaurantSession, SessionSummary } from '@/types/restaurantSession';
import { differenceState } from '@/types/restaurantSession';
import { cn } from '@/lib/cn';
import {
  calendarToday,
  DifferencePill,
  durationText,
  Figure,
  isCrossMidnight,
  NoBranch,
  Notice,
  Panel,
  RestaurantTabs,
  SessionAlerts,
  StatusPill,
  useBranchSession,
  useRs,
} from '@/features/restaurant/shared';
import { QuickCloseDialog, QuickOpenDialog } from '@/features/restaurant/QuickDialogs';

export default function RestaurantDashboardPage() {
  const { r, money, dateTime, longDate } = useRs();
  const { can, branches, viewingAllBranches, activeBranch } = useSession();
  const { session, open, settings, loading, branchId, reload } = useBranchSession();
  const [dialog, setDialog] = useState<'open' | 'close' | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [, setNow] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!session) {
      setSummary(null);
      return;
    }
    safeCall(() => restaurantSessionService.summary(session.id)).then((res) => res.ok && setSummary(res.data));
  }, [session]);

  const isOpen = !!open;
  const diffState = differenceState(session?.status === 'closed' ? session.differenceH : undefined);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={r('nav.group')}
        title={r('dashboard.title')}
        description={activeBranch ? (activeBranch.nameEn ? `${activeBranch.nameEn} · ${activeBranch.city}` : activeBranch.nameAr) : undefined}
        actions={
          <div className="flex gap-2">
            {isOpen ? (
              <>
                <Link to={ROUTES.restaurantSession}><Button variant="secondary" leadingIcon={<Receipt className="h-4 w-4" />}>{r('actions.viewSession')}</Button></Link>
                {can('restaurant.session.close') && (
                  <Button variant="danger" leadingIcon={<LockKeyhole className="h-4 w-4" />} onClick={() => setDialog('close')} data-testid="dash-close">{r('actions.close')}</Button>
                )}
              </>
            ) : (
              can('restaurant.session.open') && (
                <Button leadingIcon={<Store className="h-4 w-4" />} onClick={() => setDialog('open')} data-testid="dash-open">{r('actions.open')}</Button>
              )
            )}
          </div>
        }
      />
      <RestaurantTabs />
      <QuickOpenDialog open={dialog === 'open'} onClose={() => setDialog(null)} onOpened={reload} />
      <QuickCloseDialog open={dialog === 'close'} session={open} onClose={() => setDialog(null)} onClosed={reload} />

      {!branchId ? (
        <NoBranch />
      ) : loading ? (
        <LoadingState />
      ) : (
        <>
          {isOpen ? (
            <Notice tone="success" icon={<span className="mt-1 block h-2 w-2 animate-pulse rounded-full bg-success-500" />} testId="open-indicator">
              {r('dashboard.openBanner', { date: longDate(open!.businessDate) })}
            </Notice>
          ) : (
            <Notice tone="danger" testId="closed-banner">
              <div className="font-semibold">{r('closedBanner')}</div>
              {!can('restaurant.session.open') && <div className="mt-0.5 text-danger-700">{r('dashboard.askManager')}</div>}
            </Notice>
          )}
          <SessionAlerts session={session} settings={settings} />

          <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-3">
            {/* 1. Status */}
            <Panel title={r('dashboard.cards.status')} testId="card-status" className="col-span-2 md:col-span-1">
              <div className="mb-3"><StatusPill open={isOpen} /></div>
              {session ? (
                <div className="grid grid-cols-2 gap-3">
                  <Figure label={r('fields.sessionId')} value={session.number} testId="session-number" />
                  <Figure
                    label={r('fields.businessDate')}
                    value={longDate(session.businessDate, true)}
                    testId="business-date"
                    hint={isCrossMidnight(session) ? r('dashboard.calendarIs', { date: longDate(calendarToday()) }) : undefined}
                  />
                  <Figure label={r('fields.openedBy')} value={session.openedBy} />
                  <Figure label={r('fields.openedAt')} value={dateTime(session.openedAt)} />
                  <Figure label={isOpen ? r('fields.openFor') : r('fields.duration')} value={durationText(session.openedAt, session.closedAt, r)} />
                  {!isOpen && <Figure label={r('fields.closedAt')} value={dateTime(session.closedAt)} />}
                </div>
              ) : (
                <p className="text-sm text-ink-500">{r('dashboard.never')}</p>
              )}
            </Panel>

            {/* 2. Opening balance */}
            <Panel title={r('dashboard.cards.opening')} testId="card-opening">
              <div className="flex items-center gap-3">
                <span className="hidden h-10 w-10 place-items-center rounded-xl sm:grid bg-info-50 text-info-700"><Coins className="h-5 w-5" /></span>
                <Figure big label={r('dashboard.sub.opening')} value={money(session?.openingBalanceH)} testId="opening-balance" />
              </div>
              {session?.openingNotes && <p className="mt-3 text-xs text-ink-500">{session.openingNotes}</p>}
            </Panel>

            {/* 3. Total sales */}
            <Panel title={r('dashboard.cards.sales')} testId="card-sales" className="col-span-2 md:col-span-1">
              <Figure big label={r('dashboard.sub.sales')} value={money(summary?.totalH)} testId="total-sales" />
              <div className="mt-3 grid grid-cols-3 gap-3 border-t border-ink-100 pt-3">
                <Figure label={r('fields.gross')} value={money(summary?.grossH)} />
                <Figure label={r('fields.net')} value={money(summary?.netH)} />
                <Figure label={r('fields.vat')} value={money(summary?.vatH)} />
                <Figure label={r('fields.orders')} value={summary?.orders ?? '—'} testId="orders-count" />
                <Figure label={r('fields.completed')} value={summary?.completed ?? '—'} />
                <Figure label={r('fields.cancelled')} value={summary?.cancelled ?? '—'} />
              </div>
            </Panel>

            {/* 4. Expected cash */}
            <Panel title={r('dashboard.cards.expected')} testId="card-expected">
              <div className="flex items-center gap-3">
                <span className="hidden h-10 w-10 place-items-center rounded-xl sm:grid bg-ink-100 text-ink-700"><Wallet className="h-5 w-5" /></span>
                <Figure
                  big
                  label={r('dashboard.sub.expected')}
                  value={money(session?.status === 'closed' ? session.expectedClosingH : summary?.cash.expectedH)}
                  testId="expected-cash"
                />
              </div>
              <p className="mt-3 text-xs text-ink-500">{r('formula.short')}</p>
            </Panel>

            {/* 5. Actual closing */}
            <Panel title={r('dashboard.cards.actual')} testId="card-actual">
              <Figure
                big
                label={r('dashboard.sub.actual')}
                value={session?.status === 'closed' ? money(session.actualClosingH) : r('notRecorded')}
                tone={session?.status === 'closed' ? undefined : 'muted'}
                testId="actual-closing"
              />
              {session?.status === 'closed' && <p className="mt-2 text-xs text-ink-500">{r('dashboard.countedBy', { name: session.closedBy ?? '' })}</p>}
            </Panel>

            {/* 6. Difference */}
            <Panel
              title={r('dashboard.cards.difference')}
              testId="card-difference"
              className={cn(
                diffState === 'balanced' && 'border-success-200',
                diffState === 'shortage' && 'border-danger-300 bg-danger-50/40',
                diffState === 'surplus' && 'border-warning-300 bg-warning-50/40',
              )}
            >
              <Figure
                big
                label={r('dashboard.sub.difference')}
                value={session?.status === 'closed' ? money(session.differenceH) : r('diff.pending')}
                tone={diffState === 'shortage' ? 'danger' : diffState === 'surplus' ? 'warning' : diffState === 'balanced' ? 'success' : 'muted'}
                testId="cash-difference"
              />
              <div className="mt-2"><DifferencePill diffH={session?.status === 'closed' ? session.differenceH : undefined} /></div>
              {session?.discrepancyReason && <p className="mt-2 text-xs text-ink-600">{session.discrepancyReason}</p>}
            </Panel>
          </div>

          {summary && summary.byMethod.length > 0 && (
            <Panel title={r('dashboard.byMethod')}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {summary.byMethod.map((m) => (
                  <div key={m.method} className="rounded-xl border border-ink-100 p-3">
                    <div className="text-xs text-ink-500">{r(`method.${m.method}`)} · {r('countOrders', { n: m.count })}</div>
                    <div className="text-lg font-semibold tabular-nums">{money(m.amountH)}</div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {viewingAllBranches && branches.length > 1 && <BranchOverview />}

          <div className="flex flex-wrap gap-2">
            {can('restaurant.session.view_history') && (
              <Link to={ROUTES.restaurantHistory}><Button variant="ghost" leadingIcon={<History className="h-4 w-4" />}>{r('nav.history')}</Button></Link>
            )}
            <Link to={ROUTES.restaurantCash}><Button variant="ghost" leadingIcon={<CalendarDays className="h-4 w-4" />}>{r('nav.cash')}</Button></Link>
            {settings && <span className="ms-auto inline-flex items-center gap-1 text-xs text-ink-500"><Timer className="h-3.5 w-3.5" />{r('dashboard.thresholds', { hours: settings.longSessionHours, amount: money(settings.discrepancyThresholdH) })}</span>}
          </div>
        </>
      )}
    </div>
  );
}

function BranchOverview() {
  const { r, money, longDate } = useRs();
  const { branches } = useSession();
  const [rows, setRows] = useState<{ id: string; name: string; session: RestaurantSession | null }[]>([]);

  useEffect(() => {
    Promise.all(
      branches.map(async (b) => {
        const res = await safeCall(() => restaurantSessionService.latest(b.id));
        return { id: b.id, name: b.nameEn || b.nameAr, session: res.ok ? res.data : null };
      }),
    ).then(setRows);
  }, [branches]);

  return (
    <Panel title={r('dashboard.allBranches')}>
      <div className="divide-y divide-ink-100">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="font-medium">{row.name}</span>
            <span className="text-ink-500">{row.session ? `${row.session.number} · ${longDate(row.session.businessDate)}` : '—'}</span>
            <span className="tabular-nums">{money(row.session?.openingBalanceH)}</span>
            <StatusPill open={row.session?.status === 'open'} />
          </div>
        ))}
      </div>
    </Panel>
  );
}
