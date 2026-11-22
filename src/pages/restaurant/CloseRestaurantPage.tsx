import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChefHat, CreditCard, LockKeyhole, Store } from 'lucide-react';
import { Button, Checkbox, FormField, LoadingState, PageHeader, PriceInput, Textarea } from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { cn } from '@/lib/cn';
import { toMinorUnits } from '@/lib/format';
import { ROUTES } from '@/routes/paths';
import { restaurantSessionService, safeCall } from '@/services';
import { differenceState, type SessionSettings, type SessionSummary } from '@/types/restaurantSession';
import {
  DifferencePill,
  Figure,
  NoBranch,
  NoPermission,
  Notice,
  Panel,
  RestaurantTabs,
  SessionAlerts,
  useActor,
  useBranchSession,
  useRs,
} from '@/features/restaurant/shared';
import { CloseConfirm } from '@/features/restaurant/CloseConfirm';
import { EMPTY_REASON, focusField, ReasonPicker, reasonText, reasonValid, type ReasonValue } from '@/features/restaurant/ReasonPicker';
import { DIFFERENCE_REASONS, PENDING_REASONS } from '@/types/restaurantSession';
import { CashFormula, PaymentTable, SalesSummaryBlock, SessionInfo } from '@/features/restaurant/SessionBlocks';

function Step({ letter, title, children }: { letter: string; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-ink-900 text-xs font-bold text-white">{letter}</span>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-700">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function CloseRestaurantPage() {
  const { r, money } = useRs();
  const { can } = useSession();
  const actor = useActor();
  const toast = useToast();
  const navigate = useNavigate();
  const { open, settings: liveSettings, loading, branchId, reload } = useBranchSession();

  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [settings, setSettings] = useState<SessionSettings | null>(null);
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [reasonV, setReasonV] = useState<ReasonValue>(EMPTY_REASON);
  const [overrideV, setOverrideV] = useState<ReasonValue>(EMPTY_REASON);
  const [cardMatched, setCardMatched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [idemKey] = useState(() => globalThis.crypto?.randomUUID?.() ?? `close-${Date.now()}`);

  const openId = open?.id;
  const refresh = useCallback(async () => {
    if (!openId) return;
    const res = await safeCall(() => restaurantSessionService.closingPreview(openId));
    if (res.ok) {
      setSummary(res.data.summary);
      setSettings(res.data.settings);
    }
  }, [openId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const expected = summary?.cash.expectedH ?? 0;
  const hasCount = counted.trim() !== '' && /^\d+(\.\d{1,2})?$/.test(counted.trim());
  const actualH = hasCount ? toMinorUnits(counted) : null;
  const diffH = actualH === null ? null : actualH - expected;
  const state = differenceState(diffH);
  const canApprove = can('restaurant.session.approve_discrepancy');
  const overLimit = diffH !== null && settings ? Math.abs(diffH) > settings.discrepancyThresholdH : false;
  const pending = summary?.pendingOrders ?? 0;
  const cardRow = summary?.byMethod.find((m) => m.method === 'card');
  const needsCardCheck = (cardRow?.amountH ?? 0) > 0;

  const labelOf = (group: 'difference' | 'pending') => (code: string) => r(`reasons.${group}.${code}`);
  const reason = reasonText(reasonV, labelOf('difference'));
  const overrideReason = reasonText(overrideV, labelOf('pending'));

  /* Each blocker knows which field fixes it, so the hint can take you there. */
  const blockers = useMemo(() => {
    const list: { text: string; field: string }[] = [];
    if (!hasCount) list.push({ text: r('close.block.count'), field: 'close-actual-cash' });
    if (diffH !== null && diffH !== 0 && !reasonValid(reasonV)) list.push({ text: r('close.block.reason'), field: reasonV.code === 'other' ? 'close-diff-reason-note' : 'close-diff-reason' });
    if (pending > 0 && !reasonValid(overrideV)) list.push({ text: r('close.block.override'), field: overrideV.code === 'other' ? 'close-pending-reason-note' : 'close-pending-reason' });
    if (overLimit && !canApprove) list.push({ text: r('close.block.limit'), field: 'close-actual-cash' });
    if (needsCardCheck && !cardMatched) list.push({ text: r('close.block.card'), field: 'card-matched' });
    return list;
  }, [hasCount, diffH, reasonV, overLimit, canApprove, pending, overrideV, needsCardCheck, cardMatched, r]);

  const tryClose = () => {
    const next: Record<string, string> = {};
    if (!hasCount) next.counted = r('close.errors.count');
    if (diffH !== null && diffH !== 0 && !reasonValid(reasonV)) next.reason = r('close.errors.reason');
    if (pending > 0 && !reasonValid(overrideV)) next.override = r('close.errors.override');
    setErrors(next);
    if (blockers.length === 0) setConfirming(true);
    else focusField(blockers[0].field);
  };

  const submit = async () => {
    if (!open || actualH === null) return;
    setBusy(true);
    const res = await safeCall(() =>
      restaurantSessionService.close(
        {
          sessionId: open.id,
          actualClosingH: actualH,
          closingNotes: notes,
          discrepancyReason: reason,
          pendingOverrideReason: pending > 0 ? overrideReason : undefined,
          idempotencyKey: idemKey,
        },
        actor,
      ),
    );
    setBusy(false);
    setConfirming(false);
    if (!res.ok) {
      setServerError(res.error.message);
      refresh();
      reload();
      return;
    }
    toast.success(r('close.done'), r('close.doneBody', { number: res.data.number }));
    navigate(`${ROUTES.restaurantHistory}/${res.data.id}?closed=1`);
  };

  const showCount = can('restaurant.session.reconcile') || can('restaurant.session.close');

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={r('nav.group')} title={r('close.title')} description={r('close.description')} />
      <RestaurantTabs />

      {!branchId ? (
        <NoBranch />
      ) : loading ? (
        <LoadingState />
      ) : !showCount ? (
        <NoPermission what={r('perm.close')} />
      ) : !open ? (
        <Notice tone="danger" testId="closed-banner">
          <div className="font-semibold">{r('close.nothingOpen')}</div>
          {can('restaurant.session.open') && (
            <Link to={ROUTES.restaurantOpen} className="mt-2 inline-block"><Button size="sm" leadingIcon={<Store className="h-4 w-4" />}>{r('actions.open')}</Button></Link>
          )}
        </Notice>
      ) : !summary ? (
        <LoadingState />
      ) : (
        <>
          <SessionAlerts session={open} settings={liveSettings} />
          <SessionInfo session={open} />

          {pending > 0 && (
            <Notice tone="warning" icon={<ChefHat className="h-4 w-4" />} testId="alert-pending">
              <div className="font-semibold">{r('close.pendingTitle', { n: pending })}</div>
              <div>{r('close.pendingOverride')}</div>
              <Link to={ROUTES.kitchen} className="mt-1 inline-block text-sm font-medium underline">{r('close.openKitchen')}</Link>
            </Notice>
          )}
          {serverError && <Notice tone="danger" testId="close-error">{serverError}</Notice>}

          <Step letter="A" title={r('close.stepA')}>
            <SalesSummaryBlock summary={summary} title={r('close.stepA')} />
          </Step>

          <Step letter="B" title={r('close.stepB')}>
            <PaymentTable summary={summary} title={r('close.stepB')} />
            {needsCardCheck && (
              <Notice tone="info" icon={<CreditCard className="h-4 w-4" />} testId="alert-card">
                <div>{r('close.cardCheck', { amount: money(cardRow!.netH) })}</div>
                <label className="mt-2 flex items-center gap-2 font-medium">
                  <Checkbox id="card-matched" data-testid="card-matched" checked={cardMatched} onChange={(e) => setCardMatched(e.target.checked)} />
                  {r('close.cardMatched')}
                </label>
              </Notice>
            )}
          </Step>

          <Step letter="C" title={r('close.stepC')}>
            <div className="grid gap-4 lg:grid-cols-2">
              <CashFormula summary={summary} title={r('close.formulaTitle')} />
              <Panel
                title={r('close.countTitle')}
                testId="count-panel"
                className={cn(
                  'border-2',
                  state === 'balanced' && 'border-success-300 bg-success-50/40',
                  state === 'shortage' && 'border-danger-300 bg-danger-50/50',
                  state === 'surplus' && 'border-warning-300 bg-warning-50/50',
                )}
              >
                <FormField label={r('fields.actualCounted')} required error={errors.counted} hint={r('close.countHint')}>
                  <PriceInput id="close-actual-cash" data-testid="actual-cash" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0.00" className="text-lg" />
                </FormField>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <Figure label={r('fields.expectedCash')} value={money(expected)} testId="close-expected" />
                  <Figure label={r('fields.actualCounted')} value={actualH === null ? '—' : money(actualH)} />
                </div>
                <div className="mt-4 rounded-xl bg-surface p-4 text-center ring-1 ring-ink-200">
                  <div className="text-xs font-medium uppercase tracking-wide text-ink-500">{r('fields.difference')}</div>
                  <div
                    data-testid="close-difference"
                    className={cn(
                      'mt-1 text-4xl font-bold tabular-nums',
                      state === 'balanced' && 'text-success-700',
                      state === 'shortage' && 'text-danger-700',
                      state === 'surplus' && 'text-warning-700',
                      state === 'pending' && 'text-ink-300',
                    )}
                  >
                    {diffH === null ? '—' : `${diffH > 0 ? '+' : ''}${money(diffH)}`}
                  </div>
                  <div className="mt-2"><DifferencePill diffH={diffH} /></div>
                  {overLimit && (
                    <p className="mt-2 text-xs font-medium text-danger-700" data-testid="over-limit">
                      {canApprove ? r('close.overLimitApprove', { limit: money(settings!.discrepancyThresholdH) }) : r('close.overLimitBlocked', { limit: money(settings!.discrepancyThresholdH) })}
                    </p>
                  )}
                </div>
              </Panel>
            </div>
          </Step>

          <Step letter="D" title={r('close.stepD')}>
            <Panel>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  label={r('fields.discrepancyReason')}
                  required={diffH !== null && diffH !== 0}
                  error={errors.reason}
                  hint={diffH === 0 ? r('close.reasonNotNeeded') : r('close.reasonHint')}
                >
                  {diffH === 0 ? (
                    <p className="text-sm text-success-700">{r('close.reasonNotNeeded')}</p>
                  ) : (
                    <ReasonPicker id="close-diff-reason" group="difference" codes={DIFFERENCE_REASONS} value={reasonV} onChange={setReasonV} invalid={!!errors.reason} />
                  )}
                </FormField>
                <FormField label={r('fields.closingNotes')} showOptional>
                  <Textarea data-testid="closing-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500} />
                </FormField>
                {pending > 0 && (
                  <FormField label={r('fields.overrideReason')} required error={errors.override} className="md:col-span-2">
                    <ReasonPicker id="close-pending-reason" group="pending" codes={PENDING_REASONS} value={overrideV} onChange={setOverrideV} invalid={!!errors.override} />
                  </FormField>
                )}
              </div>
            </Panel>
          </Step>

          <Step letter="E" title={r('close.stepE')}>
            <Panel testId="final-summary">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <Figure label={r('fields.totalSales')} value={money(summary.totalH)} />
                <Figure label={r('fields.orders')} value={summary.orders} />
                <Figure label={r('fields.openingBalance')} value={money(summary.cash.openingH)} />
                <Figure label={r('fields.expectedCash')} value={money(expected)} />
                <Figure label={r('fields.actualCounted')} value={actualH === null ? '—' : money(actualH)} />
                <Figure
                  label={r('fields.difference')}
                  value={diffH === null ? '—' : money(diffH)}
                  tone={state === 'shortage' ? 'danger' : state === 'surplus' ? 'warning' : state === 'balanced' ? 'success' : 'muted'}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
                <button type="button" className="text-start text-sm text-ink-500 hover:text-ink-800" data-testid="close-hint" onClick={() => blockers[0] && focusField(blockers[0].field)}>
                  {!can('restaurant.session.close') ? r('close.noCloseRight') : blockers.length ? <span className="underline decoration-dotted">{r('close.cannotYet', { why: blockers[0].text })}</span> : r('close.ready')}
                </button>
                <Button
                  variant="danger"
                  size="lg"
                  leadingIcon={<LockKeyhole className="h-4 w-4" />}
                  onClick={tryClose}
                  disabled={!can('restaurant.session.close')}
                  data-testid="close-submit"
                >
                  {r('actions.close')}
                </Button>
              </div>
            </Panel>
          </Step>
        </>
      )}

      {open && summary && actualH !== null && (
        <CloseConfirm
          open={confirming}
          session={open}
          summary={summary}
          actualH={actualH}
          differenceReason={diffH !== 0 ? reason : ''}
          pendingReason={pending > 0 ? overrideReason : ''}
          busy={busy}
          onConfirm={submit}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
