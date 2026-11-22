import { useEffect, useState } from 'react';
import { ChefHat, Clock, Coins, CreditCard, LockKeyhole, Receipt, ShoppingBag, Wallet } from 'lucide-react';
import { Button, Checkbox, SizedDialog } from '@/components/ui';
import { cn } from '@/lib/cn';
import { differenceState, type RestaurantSession, type SessionSummary } from '@/types/restaurantSession';
import { DifferencePill, useRs } from './shared';

export function hoursMinutes(fromIso: string, toIso?: string): string {
  const mins = Math.max(0, Math.floor(((toIso ? Date.parse(toIso) : Date.now()) - Date.parse(fromIso)) / 60000));
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
}

function Card({ icon, label, value, sub, tone, testId }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'danger' | 'warning' | 'success'; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'rounded-xl border p-3',
        tone === 'danger' ? 'border-danger-200 bg-danger-50' : tone === 'warning' ? 'border-warning-200 bg-warning-50' : tone === 'success' ? 'border-success-200 bg-success-50' : 'border-ink-200 bg-surface',
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-ink-500">{icon}{label}</div>
      <div className={cn('mt-1 truncate text-lg font-semibold tabular-nums', tone === 'danger' ? 'text-danger-700' : tone === 'warning' ? 'text-warning-800' : tone === 'success' ? 'text-success-700' : 'text-ink-900')}>{value}</div>
      {sub && <div className="truncate text-xs text-ink-500">{sub}</div>}
    </div>
  );
}

/**
 * The last screen before a session closes: the day in clear cards, what
 * closing does, and a tick-box so nobody closes the restaurant by accident.
 * A shortage, a surplus or open kitchen orders never stop the close — they are
 * shown plainly and their reasons go on the record.
 */
export function CloseConfirm({
  open,
  session,
  summary,
  actualH,
  differenceReason,
  pendingReason,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  session: RestaurantSession;
  summary: SessionSummary;
  actualH: number;
  differenceReason: string;
  pendingReason: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { r, money, time, dateTime } = useRs();
  const [ticked, setTicked] = useState(false);
  useEffect(() => {
    if (open) setTicked(false);
  }, [open]);

  const cash = summary.byMethod.find((m) => m.method === 'cash');
  const card = summary.byMethod.find((m) => m.method === 'card');
  const credit = summary.byMethod.find((m) => m.method === 'credit');
  const last = summary.transactions[0];
  const expected = summary.cash.expectedH;
  const diff = actualH - expected;
  const state = differenceState(diff);

  return (
    <SizedDialog
      open={open}
      onClose={onCancel}
      busy={busy}
      size={50}
      title={r('confirmClose.title', { number: session.number })}
      subtitle={r('close.confirmMessage')}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-800" data-testid="close-confirm-tick">
            <Checkbox checked={ticked} onChange={(e) => setTicked(e.target.checked)} />
            {r('confirmClose.tick')}
          </label>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={busy}>{r('actions.goBack')}</Button>
            <Button variant="danger" leadingIcon={<LockKeyhole className="h-4 w-4" />} disabled={!ticked} loading={busy} onClick={onConfirm} data-testid="close-confirm-button">
              {r('close.confirmButton')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4" data-testid="close-confirm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Card icon={<Coins className="h-3.5 w-3.5" />} label={r('fields.openingBalance')} value={money(session.openingBalanceH)} testId="cc-opening" />
          <Card icon={<Receipt className="h-3.5 w-3.5" />} label={r('confirmClose.total')} value={money(summary.totalH)} sub={r('countOrders', { n: summary.completed })} testId="cc-total" />
          <Card icon={<Wallet className="h-3.5 w-3.5" />} label={r('method.cash')} value={money(cash?.amountH ?? 0)} sub={r('countOrders', { n: cash?.count ?? 0 })} testId="cc-cash" />
          <Card icon={<CreditCard className="h-3.5 w-3.5" />} label={r('method.card')} value={money(card?.amountH ?? 0)} sub={credit?.amountH ? `${r('method.credit')} ${money(credit.amountH)}` : r('countOrders', { n: card?.count ?? 0 })} testId="cc-card" />
          <Card icon={<Clock className="h-3.5 w-3.5" />} label={r('confirmClose.time')} value={hoursMinutes(session.openedAt)} sub={`${dateTime(session.openedAt)} →`} testId="cc-time" />
          <Card icon={<ShoppingBag className="h-3.5 w-3.5" />} label={r('confirmClose.lastOrder')} value={last ? time(last.at) : '—'} sub={last ? `${last.invoiceNumber} · ${money(last.totalH)}` : r('confirmClose.noOrders')} testId="cc-last" />
        </div>

        <div
          className={cn(
            'grid grid-cols-3 gap-2 rounded-xl border-2 p-3 text-center',
            state === 'balanced' && 'border-success-300 bg-success-50/60',
            state === 'shortage' && 'border-danger-300 bg-danger-50/60',
            state === 'surplus' && 'border-warning-300 bg-warning-50/60',
          )}
          data-testid="cc-difference"
          data-state={state}
        >
          <div><div className="text-xs text-ink-500">{r('fields.expectedCash')}</div><div className="font-semibold tabular-nums">{money(expected)}</div></div>
          <div><div className="text-xs text-ink-500">{r('fields.actualCounted')}</div><div className="font-semibold tabular-nums">{money(actualH)}</div></div>
          <div>
            <div className="text-xs text-ink-500">{r('fields.difference')}</div>
            <div className={cn('font-bold tabular-nums', state === 'shortage' && 'text-danger-700', state === 'surplus' && 'text-warning-800', state === 'balanced' && 'text-success-700')}>
              {diff > 0 ? '+' : ''}{money(diff)}
            </div>
          </div>
          <div className="col-span-3 flex justify-center"><DifferencePill diffH={diff} /></div>
          {diff !== 0 && differenceReason && <p className="col-span-3 text-start text-xs text-ink-700"><b>{r('fields.discrepancyReason')}:</b> {differenceReason}</p>}
        </div>

        {summary.pendingOrders > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-900" data-testid="cc-pending">
            <ChefHat className="mt-0.5 h-4 w-4 shrink-0" />
            <div><b>{r('close.pendingTitle', { n: summary.pendingOrders })}</b>{pendingReason && <> — {pendingReason}</>}</div>
          </div>
        )}

        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-ink-900">{r('confirmClose.whatHappens')}</h3>
          <ul className="space-y-1 text-sm text-ink-700" data-testid="cc-effects">
            <li>• {r('effects.close.orders')}</li>
            <li>• {r('effects.close.frozen')}</li>
            <li>• {diff === 0 ? r('effects.close.balanced') : r(diff < 0 ? 'effects.close.shortage' : 'effects.close.surplus', { amount: money(Math.abs(diff)) })}</li>
            {summary.pendingOrders > 0 && <li>• {r('effects.close.pending', { n: summary.pendingOrders })}</li>}
            <li>• {r('confirmClose.drawer', { amount: money(actualH) })}</li>
            <li>• {r('effects.close.report')}</li>
          </ul>
        </div>
      </div>
    </SizedDialog>
  );
}
