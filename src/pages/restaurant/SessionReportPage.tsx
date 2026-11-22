import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer, RotateCcw } from 'lucide-react';
import { Button, ConfirmModal, FormField, LoadingState, PageHeader, Textarea } from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { cn } from '@/lib/cn';
import { ROUTES } from '@/routes/paths';
import { restaurantSessionService, safeCall } from '@/services';
import type { CashMovement, RestaurantSession, SessionAuditEntry, SessionSummary } from '@/types/restaurantSession';
import { differenceState } from '@/types/restaurantSession';
import { DifferencePill, Figure, NoPermission, Notice, Panel, RestaurantTabs, useActor, useRs } from '@/features/restaurant/shared';
import { AuditTrail, CashFormula, MovementsList, PaymentTable, SalesSummaryBlock, SessionInfo, TransactionsTable } from '@/features/restaurant/SessionBlocks';

export default function SessionReportPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const { r, money, dateTime, longDate } = useRs();
  const { can, branches } = useSession();
  const actor = useActor();
  const toast = useToast();

  const [session, setSession] = useState<RestaurantSession | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [audit, setAudit] = useState<SessionAuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [busy, setBusy] = useState(false);

  const allowed = can('restaurant.session.view_history') || can('restaurant.session.view_reports') || can('restaurant.session.close');

  const load = useCallback(async () => {
    const [s, sum, mv, au] = await Promise.all([
      safeCall(() => restaurantSessionService.get(id)),
      safeCall(() => restaurantSessionService.summary(id)),
      safeCall(() => restaurantSessionService.movements(id)),
      safeCall(() => restaurantSessionService.auditLog(id)),
    ]);
    if (!s.ok) return setError(s.error.message);
    setSession(s.data);
    if (sum.ok) setSummary(sum.data);
    if (mv.ok) setMovements(mv.data);
    if (au.ok) setAudit(au.data);
  }, [id]);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const reopen = async () => {
    setBusy(true);
    const res = await safeCall(() => restaurantSessionService.reopen(id, reopenReason, actor));
    setBusy(false);
    setReopening(false);
    if (!res.ok) return toast.error(r('report.reopenFailed'), res.error.message);
    toast.success(r('report.reopened'));
    setReopenReason('');
    load();
  };

  const branch = branches.find((b) => b.id === session?.branchId);
  const state = differenceState(session?.differenceH);

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <PageHeader
          eyebrow={<Link to={ROUTES.restaurantHistory} className="inline-flex items-center gap-1 hover:underline"><ArrowLeft className="h-3 w-3" />{r('nav.history')}</Link>}
          title={session ? r('report.title', { number: session.number }) : r('report.loading')}
          description={session ? `${longDate(session.businessDate, true)} · ${branch ? branch.nameEn || branch.nameAr : ''}` : undefined}
          actions={
            session && (
              <div className="flex gap-2">
                {session.status === 'closed' && can('restaurant.session.reopen') && (
                  <Button variant="ghost" leadingIcon={<RotateCcw className="h-4 w-4" />} onClick={() => setReopening(true)} data-testid="reopen">{r('report.reopen')}</Button>
                )}
                <Button variant="secondary" leadingIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()} data-testid="print-report">{r('report.print')}</Button>
              </div>
            )
          }
        />
        <div className="mt-4"><RestaurantTabs /></div>
      </div>

      {!allowed ? (
        <NoPermission what={r('perm.history')} />
      ) : error ? (
        <Notice tone="danger">{error}</Notice>
      ) : !session || !summary ? (
        <LoadingState />
      ) : (
        <div className="space-y-4" data-testid="session-report">
          {params.get('closed') === '1' && session.status === 'closed' && (
            <Notice tone="success" testId="closed-success">{r('report.justClosed')}</Notice>
          )}
          {/* Print heading: the shell is hidden on paper. */}
          <div className="hidden print:block">
            <h1 className="text-xl font-bold">{r('report.title', { number: session.number })}</h1>
            <p className="text-sm">{longDate(session.businessDate, true)} · {branch?.nameEn || branch?.nameAr} · {r('report.printedAt', { at: dateTime(new Date().toISOString()) })}</p>
          </div>

          <SessionInfo session={session} />

          {session.status === 'closed' && (
            <Panel
              title={r('report.closing')}
              testId="closing-record"
              className={cn(state === 'shortage' && 'border-danger-300', state === 'surplus' && 'border-warning-300', state === 'balanced' && 'border-success-300')}
            >
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <Figure label={r('fields.closedAt')} value={dateTime(session.closedAt)} />
                <Figure label={r('fields.closedBy')} value={session.closedBy ?? '—'} />
                <Figure label={r('fields.expectedCash')} value={money(session.expectedClosingH)} testId="report-expected" />
                <Figure label={r('fields.actualClosing')} value={money(session.actualClosingH)} testId="report-actual" />
                <Figure
                  label={r('fields.difference')}
                  value={money(session.differenceH)}
                  testId="report-difference"
                  tone={state === 'shortage' ? 'danger' : state === 'surplus' ? 'warning' : 'success'}
                />
                <div><div className="text-xs font-medium text-ink-500">{r('cols.status')}</div><DifferencePill diffH={session.differenceH} /></div>
              </div>
              {(session.discrepancyReason || session.closingNotes || session.discrepancyApprovedBy || session.pendingOverride) && (
                <dl className="mt-4 grid gap-2 border-t border-ink-100 pt-3 text-sm">
                  {session.discrepancyReason && <div><dt className="inline font-medium">{r('fields.discrepancyReason')}: </dt><dd className="inline">{session.discrepancyReason}</dd></div>}
                  {session.discrepancyApprovedBy && <div><dt className="inline font-medium">{r('report.approvedBy')}: </dt><dd className="inline">{session.discrepancyApprovedBy}</dd></div>}
                  {session.pendingOverride && (
                    <div><dt className="inline font-medium">{r('report.override')}: </dt><dd className="inline">{r('report.overrideText', { n: session.pendingOverride.count, by: session.pendingOverride.by, reason: session.pendingOverride.reason })}</dd></div>
                  )}
                  {session.closingNotes && <div><dt className="inline font-medium">{r('fields.closingNotes')}: </dt><dd className="inline">{session.closingNotes}</dd></div>}
                </dl>
              )}
              {!!session.reopenCount && <p className="mt-2 text-xs text-warning-700">{r('report.reopenedTimes', { n: session.reopenCount })}</p>}
            </Panel>
          )}

          <SalesSummaryBlock summary={summary} />
          <div className="grid gap-4 lg:grid-cols-5 print:block">
            <div className="lg:col-span-3"><PaymentTable summary={summary} /></div>
            <div className="lg:col-span-2"><CashFormula summary={summary} /></div>
          </div>
          <Panel title={r('blocks.movements')}><MovementsList movements={movements} /></Panel>
          <Panel title={r('report.audit')}><AuditTrail entries={audit} /></Panel>
          <TransactionsTable summary={summary} limit={100} />
        </div>
      )}

      <ConfirmModal
        open={reopening}
        title={r('report.reopenTitle')}
        description={r('report.reopenBody')}
        confirmLabel={r('report.reopen')}
        cancelLabel={r('actions.goBack')}
        variant="warning"
        loading={busy}
        onConfirm={() => (reopenReason.trim() ? reopen() : undefined)}
        onCancel={() => setReopening(false)}
      >
        <ul className="mb-3 list-disc space-y-1 ps-5 text-sm text-ink-700" data-testid="reopen-effects">
          <li>{r('effects.reopen.orders')}</li>
          <li>{r('effects.reopen.cleared')}</li>
          <li>{r('effects.reopen.audit')}</li>
        </ul>
        <FormField label={r('report.reopenReason')} required>
          <Textarea data-testid="reopen-reason" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} rows={3} />
        </FormField>
      </ConfirmModal>
    </div>
  );
}
