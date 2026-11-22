import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChefHat, Coins, CalendarDays, Clock, Store, User } from 'lucide-react';
import { Button, Checkbox, FormField, Input, PriceInput, SizedDialog } from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { cn } from '@/lib/cn';
import { toMinorUnits } from '@/lib/format';
import { ROUTES } from '@/routes/paths';
import { restaurantSessionService, safeCall } from '@/services';
import {
  businessDateOf,
  differenceState,
  DIFFERENCE_REASONS,
  PENDING_REASONS,
  type RestaurantSession,
  type SessionSummary,
} from '@/types/restaurantSession';
import { CloseConfirm, hoursMinutes } from './CloseConfirm';
import { EMPTY_REASON, focusField, ReasonPicker, reasonText, reasonValid, type ReasonValue } from './ReasonPicker';
import { DifferencePill, useActor, useRs } from './shared';

/* ------------------------------------------------------------------ open */

/**
 * Open the restaurant in one small dialog: count the float, tick, open.
 * The full form (back-dated opening, a different business date) stays on the
 * Open Restaurant page for the rare cases that need it.
 */
export function QuickOpenDialog({ open, onClose, onOpened }: { open: boolean; onClose: () => void; onOpened?: (s: RestaurantSession) => void }) {
  const { r, money, longDate } = useRs();
  const { activeBranch } = useSession();
  const actor = useActor();
  const toast = useToast();
  const [cash, setCash] = useState('');
  const [notes, setNotes] = useState('');
  const [ticked, setTicked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState('');

  useEffect(() => {
    if (open) {
      setCash('');
      setNotes('');
      setTicked(false);
      setError(null);
      setKey(globalThis.crypto?.randomUUID?.() ?? `open-${Date.now()}`);
      window.setTimeout(() => focusField('quick-open-cash'), 50);
    }
  }, [open]);

  const valid = cash.trim() !== '' && /^\d+(\.\d{1,2})?$/.test(cash.trim());
  const today = businessDateOf(new Date());

  const submit = async () => {
    if (!valid) {
      setError(r('open.errors.cashRequired'));
      focusField('quick-open-cash');
      return;
    }
    if (!activeBranch) return;
    setBusy(true);
    const res = await safeCall(() =>
      restaurantSessionService.open({ branchId: activeBranch.id, openingBalanceH: toMinorUnits(cash), notes, idempotencyKey: key }, actor),
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.success(r('open.done'), r('open.doneBody', { number: res.data.number }));
    onOpened?.(res.data);
    onClose();
  };

  return (
    <SizedDialog
      open={open}
      onClose={onClose}
      busy={busy}
      size={50}
      title={r('quick.openTitle')}
      subtitle={activeBranch ? activeBranch.nameEn || activeBranch.nameAr : undefined}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-800" data-testid="quick-open-tick">
            <Checkbox checked={ticked} onChange={(e) => setTicked(e.target.checked)} />
            {r('quick.openTick')}
          </label>
          <div className="flex gap-2">
            <Link to={ROUTES.restaurantOpen} onClick={onClose} className="self-center text-xs text-ink-500 underline hover:text-ink-800">{r('quick.moreOptions')}</Link>
            <Button leadingIcon={<Store className="h-4 w-4" />} disabled={!ticked || !valid} loading={busy} onClick={submit} data-testid="quick-open-submit">
              {r('open.confirmButton')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4" data-testid="quick-open">
        <p className="text-sm text-ink-600">{r('open.confirmMessage')}</p>
        <FormField label={r('fields.openingCash')} required error={error ?? undefined} hint={r('open.cashHint')}>
          <PriceInput id="quick-open-cash" data-testid="quick-open-cash" value={cash} onChange={(e) => { setCash(e.target.value); setError(null); }} placeholder="0.00" className="text-lg" />
        </FormField>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-xl border border-ink-200 p-2.5"><div className="flex items-center gap-1 text-xs text-ink-500"><CalendarDays className="h-3.5 w-3.5" />{r('fields.businessDate')}</div><div className="font-semibold">{longDate(today, true)}</div></div>
          <div className="rounded-xl border border-ink-200 p-2.5"><div className="flex items-center gap-1 text-xs text-ink-500"><User className="h-3.5 w-3.5" />{r('fields.openedBy')}</div><div className="truncate font-semibold">{actor.name}</div></div>
          <div className="rounded-xl border border-ink-200 p-2.5"><div className="flex items-center gap-1 text-xs text-ink-500"><Coins className="h-3.5 w-3.5" />{r('fields.openingBalance')}</div><div className="font-semibold tabular-nums">{valid ? money(toMinorUnits(cash)) : '—'}</div></div>
        </div>
        <FormField label={r('fields.notes')} showOptional>
          <Input inputSize="sm" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
        </FormField>
        <ul className="space-y-0.5 text-xs text-ink-500">
          <li>• {r('effects.open.orders')}</li>
          <li>• {r('effects.open.date', { date: longDate(today) })}</li>
        </ul>
      </div>
    </SizedDialog>
  );
}

/* ----------------------------------------------------------------- close */

/**
 * Close in two short steps inside a half-screen dialog:
 *   1. count the drawer (difference shows as you type), pick reasons if needed
 *   2. the day in cards + what closing does + tick-box → close
 * A shortage, surplus or open kitchen orders never block — they need a reason.
 */
export function QuickCloseDialog({ open, session, onClose, onClosed }: { open: boolean; session: RestaurantSession | null; onClose: () => void; onClosed?: (s: RestaurantSession) => void }) {
  const { r, money } = useRs();
  const actor = useActor();
  const toast = useToast();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [counted, setCounted] = useState('');
  const [diffReason, setDiffReason] = useState<ReasonValue>(EMPTY_REASON);
  const [pendingReason, setPendingReason] = useState<ReasonValue>(EMPTY_REASON);
  const [showErrors, setShowErrors] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [key, setKey] = useState('');

  /* Reset only when the dialog opens (or a different session is shown) —
     never on a background refresh, which would wipe what was typed. */
  const sessionId = session?.id;
  useEffect(() => {
    if (!open || !sessionId) return;
    setCounted('');
    setDiffReason(EMPTY_REASON);
    setPendingReason(EMPTY_REASON);
    setShowErrors(false);
    setReviewing(false);
    setServerError(null);
    setKey(globalThis.crypto?.randomUUID?.() ?? `close-${Date.now()}`);
    setSummary(null);
    safeCall(() => restaurantSessionService.closingPreview(sessionId)).then((res) => res.ok && setSummary(res.data.summary));
    window.setTimeout(() => focusField('quick-close-cash'), 80);
  }, [open, sessionId]);

  const hasCount = counted.trim() !== '' && /^\d+(\.\d{1,2})?$/.test(counted.trim());
  const actualH = hasCount ? toMinorUnits(counted) : null;
  const expected = summary?.cash.expectedH ?? 0;
  const diffH = actualH === null ? null : actualH - expected;
  const pending = summary?.pendingOrders ?? 0;
  const state = differenceState(diffH);

  /* The first thing still missing, with the field it lives in. */
  const missing = useMemo(() => {
    if (!hasCount) return { field: 'quick-close-cash', text: r('close.block.count') };
    if (diffH !== 0 && !reasonValid(diffReason)) return { field: diffReason.code === 'other' ? 'quick-close-diff-note' : 'quick-close-diff', text: r('close.block.reason') };
    if (pending > 0 && !reasonValid(pendingReason)) return { field: pendingReason.code === 'other' ? 'quick-close-pending-note' : 'quick-close-pending', text: r('close.block.override') };
    return null;
  }, [hasCount, diffH, diffReason, pending, pendingReason, r]);

  const labelOf = (group: 'difference' | 'pending') => (code: string) => r(`reasons.${group}.${code}`);

  const next = () => {
    setShowErrors(true);
    if (missing) {
      focusField(missing.field);
      return;
    }
    setReviewing(true);
  };

  const submit = async () => {
    if (!session || actualH === null) return;
    setBusy(true);
    const res = await safeCall(() =>
      restaurantSessionService.close(
        {
          sessionId: session.id,
          actualClosingH: actualH,
          discrepancyReason: diffH !== 0 ? reasonText(diffReason, labelOf('difference')) : undefined,
          pendingOverrideReason: pending > 0 ? reasonText(pendingReason, labelOf('pending')) : undefined,
          idempotencyKey: key,
        },
        actor,
      ),
    );
    setBusy(false);
    if (!res.ok) {
      setReviewing(false);
      setServerError(res.error.message);
      return;
    }
    toast.success(r('close.done'), r('close.doneBody', { number: res.data.number }));
    onClosed?.(res.data);
    onClose();
  };

  if (!session) return null;

  return (
    <>
      <SizedDialog
        open={open && !reviewing}
        onClose={onClose}
        size={50}
        title={r('quick.closeTitle', { number: session.number })}
        subtitle={r('quick.closeSub', { time: hoursMinutes(session.openedAt) })}
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <button type="button" className="min-w-0 truncate text-start text-sm text-ink-500 hover:text-ink-800" onClick={() => missing && focusField(missing.field)} data-testid="quick-close-hint">
              {missing ? <span className={cn(showErrors && 'font-medium text-danger-700')}>{r('quick.still', { what: missing.text })}</span> : r('quick.readyReview')}
            </button>
            <div className="flex shrink-0 gap-2">
              <Link to={ROUTES.restaurantClose} onClick={onClose} className="self-center text-xs text-ink-500 underline hover:text-ink-800">{r('quick.fullScreen')}</Link>
              <Button trailingIcon={<ArrowRight className="flip-rtl h-4 w-4" />} onClick={next} disabled={!summary} data-testid="quick-close-next">{r('quick.review')}</Button>
            </div>
          </div>
        }
      >
        {!summary ? (
          <div className="py-10 text-center text-sm text-ink-500">…</div>
        ) : (
          <div className="space-y-4" data-testid="quick-close">
            {serverError && <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800">{serverError}</div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label={r('fields.actualCounted')} required error={showErrors && !hasCount ? r('close.errors.count') : undefined} hint={r('close.countHint')}>
                <PriceInput id="quick-close-cash" data-testid="quick-close-cash" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0.00" className="text-lg" />
              </FormField>
              <div
                className={cn(
                  'rounded-xl border-2 p-3 text-center',
                  state === 'balanced' && 'border-success-300 bg-success-50/60',
                  state === 'shortage' && 'border-danger-300 bg-danger-50/60',
                  state === 'surplus' && 'border-warning-300 bg-warning-50/60',
                  state === 'pending' && 'border-ink-200',
                )}
              >
                <div className="text-xs text-ink-500">{r('fields.expectedCash')} <b className="tabular-nums text-ink-800">{money(expected)}</b></div>
                <div
                  data-testid="quick-close-difference"
                  className={cn('mt-1 text-3xl font-bold tabular-nums', state === 'shortage' && 'text-danger-700', state === 'surplus' && 'text-warning-800', state === 'balanced' && 'text-success-700', state === 'pending' && 'text-ink-300')}
                >
                  {diffH === null ? '—' : `${diffH > 0 ? '+' : ''}${money(diffH)}`}
                </div>
                <DifferencePill diffH={diffH} className="mt-1" />
              </div>
            </div>

            {diffH !== null && diffH !== 0 && (
              <FormField label={r('fields.discrepancyReason')} required error={showErrors && !reasonValid(diffReason) ? r('close.errors.reason') : undefined}>
                <ReasonPicker id="quick-close-diff" group="difference" codes={DIFFERENCE_REASONS} value={diffReason} onChange={setDiffReason} invalid={showErrors} />
              </FormField>
            )}

            {pending > 0 && (
              <div className="space-y-2 rounded-xl border border-warning-200 bg-warning-50/60 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-warning-900"><ChefHat className="h-4 w-4" />{r('close.pendingTitle', { n: pending })}</div>
                <FormField label={r('fields.overrideReason')} required error={showErrors && !reasonValid(pendingReason) ? r('close.errors.override') : undefined}>
                  <ReasonPicker id="quick-close-pending" group="pending" codes={PENDING_REASONS} value={pendingReason} onChange={setPendingReason} invalid={showErrors} />
                </FormField>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-xs text-ink-600">
              <div className="rounded-lg bg-ink-50 p-2">{r('fields.openingBalance')}<div className="text-sm font-semibold tabular-nums text-ink-900">{money(summary.cash.openingH)}</div></div>
              <div className="rounded-lg bg-ink-50 p-2">{r('cash.sales')}<div className="text-sm font-semibold tabular-nums text-ink-900">{money(summary.cash.salesH)}</div></div>
              <div className="rounded-lg bg-ink-50 p-2 flex flex-col"><span className="flex items-center gap-1"><Clock className="h-3 w-3" />{r('confirmClose.time')}</span><span className="text-sm font-semibold tabular-nums text-ink-900">{hoursMinutes(session.openedAt)}</span></div>
            </div>
          </div>
        )}
      </SizedDialog>

      {summary && actualH !== null && (
        <CloseConfirm
          open={open && reviewing}
          session={session}
          summary={summary}
          actualH={actualH}
          differenceReason={diffH !== 0 ? reasonText(diffReason, labelOf('difference')) : ''}
          pendingReason={pending > 0 ? reasonText(pendingReason, labelOf('pending')) : ''}
          busy={busy}
          onConfirm={submit}
          onCancel={() => setReviewing(false)}
        />
      )}
    </>
  );
}
