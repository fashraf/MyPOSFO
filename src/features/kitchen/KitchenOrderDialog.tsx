import { useEffect, useState } from 'react';
import { Ban, Check, Flame, Plus, RotateCcw, Timer, Undo2 } from 'lucide-react';
import { SizedDialog } from '@/components/ui';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { elapsedSeconds, formatElapsed, prepMinutes, urgencyOf } from '@/types/kitchen';
import type { KitchenOrder, KitchenOrderItem, KitchenOrderStatus } from '@/types/kitchen';
import { ticketLabel, viewOf } from './kds';

export type OrderAction =
  | { kind: 'item'; item: KitchenOrderItem; done: boolean }
  | { kind: 'status'; status: KitchenOrderStatus };

const MOD_STYLE = { remove: 'bg-danger-50 text-danger-700', add: 'bg-success-50 text-success-700', size: 'bg-warning-50 text-warning-800' } as const;

/**
 * One order, at 60% of the screen.
 *
 * Every change — an item done or not done, the order started, completed or
 * reopened — is asked once in plain words at the bottom ("Mark Fries as
 * done?") and needs a second tap. Anything done can be undone from here:
 * a done item can be marked not done, a completed order can be reopened.
 */
export function KitchenOrderDialog({
  order,
  open,
  onClose,
  onConfirm,
  initialAction,
  now,
}: {
  order: KitchenOrder | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (action: OrderAction) => Promise<void>;
  initialAction?: OrderAction | null;
  now: number;
}) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const [pending, setPending] = useState<OrderAction | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setPending(initialAction ?? null);
  }, [open, initialAction]);

  if (!order) return null;
  const view = (item: KitchenOrderItem) => viewOf(item, language);
  const seconds = elapsedSeconds(order, now);
  const band = urgencyOf(seconds);
  const prep = prepMinutes(order);
  const editable = order.status === 'open' || order.status === 'preparing';
  const doneCount = order.items.filter((i) => i.completedQuantity >= i.quantity).length;

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    await onConfirm(pending);
    setBusy(false);
    setPending(null);
  }

  const question = !pending
    ? null
    : pending.kind === 'item'
      ? t(pending.done ? 'kdsOrder.confirm.itemDone' : 'kdsOrder.confirm.itemUndo', { item: view(pending.item).name })
      : t(`kdsOrder.confirm.${pending.status}`, { order: ticketLabel(order) });

  const statusPill: Record<KitchenOrderStatus, string> = {
    open: 'bg-info-50 text-info-700',
    preparing: 'bg-warning-50 text-warning-700',
    ready: 'bg-success-50 text-success-700',
    completed: 'bg-success-50 text-success-700',
    cancelled: 'bg-danger-50 text-danger-700',
  };

  /* The order-level actions available from where it is now. */
  const actions: { status: KitchenOrderStatus; label: string; icon: typeof Check; tone: string }[] =
    order.status === 'open'
      ? [{ status: 'preparing', label: t('kdsOrder.action.start'), icon: Flame, tone: 'bg-info-600 hover:bg-info-700 text-white' }]
      : order.status === 'preparing'
        ? [
            { status: 'ready', label: t('kdsOrder.action.complete'), icon: Check, tone: 'bg-success-600 hover:bg-success-700 text-white' },
            { status: 'open', label: t('kdsOrder.action.backToOrdered'), icon: Undo2, tone: 'border border-ink-200 text-ink-700 hover:bg-ink-50' },
          ]
        : order.status === 'ready'
          ? [{ status: 'preparing', label: t('kdsOrder.action.reopen'), icon: RotateCcw, tone: 'border border-ink-200 text-ink-700 hover:bg-ink-50' }]
          : [];

  return (
    <SizedDialog
      open={open}
      onClose={onClose}
      busy={busy}
      size={60}
      title={
        <span className="flex items-center gap-2">
          <span className="numeric">{ticketLabel(order)}</span>
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', statusPill[order.status])}>{t(`kdsStatus.${order.status}`)}</span>
        </span>
      }
      subtitle={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{t(`kitchen.orderType.${order.orderType}`)}{order.customerName ? ` · ${order.customerName}` : ''}</span>
          {editable ? (
            <span className={cn('numeric inline-flex items-center gap-1 font-medium', band === 'late' ? 'text-danger-600' : band === 'warning' ? 'text-warning-700' : 'text-success-700')}>
              <Timer className="h-3.5 w-3.5" /> {formatElapsed(seconds)}
            </span>
          ) : prep !== null ? (
            <span className="numeric">{t('kdsOrder.tookMinutes', { minutes: String(Math.round(prep)) })}</span>
          ) : null}
          {editable && <span>{t('kdsOrder.progress', { done: String(doneCount), total: String(order.items.length) })}</span>}
        </span>
      }
      footer={
        pending ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-md font-semibold text-ink-900">{question}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPending(null)} disabled={busy}
                className="min-h-[2.75rem] rounded-lg border border-ink-200 px-4 text-sm font-medium text-ink-700 hover:bg-ink-50">
                {t('kdsOrder.no')}
              </button>
              <button type="button" onClick={() => void confirm()} disabled={busy} autoFocus
                className="min-h-[2.75rem] rounded-lg bg-info-600 px-5 text-sm font-semibold text-white hover:bg-info-700 disabled:opacity-60">
                {t('kdsOrder.yes')}
              </button>
            </div>
          </div>
        ) : actions.length ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {actions.slice().reverse().map((a) => (
              <button key={a.status} type="button" onClick={() => setPending({ kind: 'status', status: a.status })}
                className={cn('inline-flex min-h-[2.75rem] items-center gap-2 rounded-lg px-4 text-sm font-semibold', a.tone)}>
                <a.icon className="h-4 w-4" /> {a.label}
              </button>
            ))}
          </div>
        ) : order.status === 'cancelled' ? (
          <p className="text-sm text-danger-700">{t('kdsOrder.cancelledNote', { reason: order.cancelReason ? t(`cancelOrder.reasons.${order.cancelReason}` as never) : '—' })}</p>
        ) : (
          <p className="text-sm text-ink-500">{t('kdsOrder.collectedNote')}</p>
        )
      }
    >
      <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
        {order.items.map((item) => {
          const done = item.completedQuantity >= item.quantity;
          const v = view(item);
          const selected = pending?.kind === 'item' && pending.item.id === item.id;
          return (
            <li key={item.id} className={cn('flex items-center gap-3 px-3 py-2.5', selected && 'bg-info-50/60')}>
              <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full border-2', done ? 'border-success-500 bg-success-500 text-white' : 'border-ink-300')}>
                {done && <Check className="h-4 w-4" strokeWidth={3} />}
              </span>
              <span className="numeric w-8 shrink-0 text-md font-bold text-ink-900">{item.quantity}×</span>
              <span className="min-w-0 flex-1">
                <span className={cn('block text-md font-medium text-ink-900', done && 'text-ink-400 line-through')}>{v.name}</span>
                {(v.mods.length > 0 || v.meal) && (
                  <span className="mt-0.5 flex flex-wrap items-center gap-1">
                    {v.mods.map((m, i) => (
                      <span key={i} className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold', MOD_STYLE[m.tone])}>
                        {m.tone === 'remove' ? <Ban className="h-3 w-3" /> : m.tone === 'add' ? <Plus className="h-3 w-3" /> : null}
                        {m.label}
                      </span>
                    ))}
                    {v.meal && <span className="text-xs text-ink-400">{t('kds.inMeal', { meal: v.meal })}</span>}
                  </span>
                )}
                {v.note && <span className="mt-1 block rounded bg-warning-50 px-2 py-0.5 text-sm text-warning-800">{v.note}</span>}
              </span>
              {editable && (
                <button type="button" onClick={() => setPending({ kind: 'item', item, done: !done })}
                  className={cn('shrink-0 rounded-lg px-3 py-2 text-sm font-medium',
                    done ? 'border border-ink-200 text-ink-700 hover:bg-ink-50' : 'bg-success-50 text-success-700 hover:bg-success-100')}>
                  {done ? t('kdsOrder.markNotDone') : t('kdsOrder.markDone')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </SizedDialog>
  );
}
