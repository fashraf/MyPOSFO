import { RefreshButton } from '@/components/ui';
import { useTicketScope } from '@/hooks/useTicketScope';
import { newestOrderFirst } from '@/lib/orderSort';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bike, Check, HandPlatter, Package, ShoppingBag, Undo2, Utensils, type LucideIcon, Car } from 'lucide-react';
import { ConfirmModal } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { kitchenService, safeCall } from '@/services';
import { formatElapsed } from '@/types/kitchen';
import type { KitchenOrder, OrderType } from '@/types/kitchen';
import { playChime, ticketLabel, viewOf } from '@/features/kitchen/kds';
import { EditedBadge } from '@/features/kitchen/EditedBadge';

/*
 * Collection & dispatch — the pass.
 *
 * What the kitchen has finished, waiting to leave: delivery orders first
 * (a driver is usually waiting), then pickup. One big button per order —
 * "Dispatched" for delivery, "Handed over" for everything else — with a
 * confirmation, and the Done tab can put an order back if it was tapped by
 * mistake.
 */

type Tab = 'ready' | 'done';
const TYPE_ICON: Record<OrderType, LucideIcon> = { dine_in: Utensils, takeaway: ShoppingBag, delivery: Bike, drive_thru: Car, other: Package };
const POLL_MS = 5000;

export default function DispatchPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('ready');
  const [type, setType] = useState<OrderType | 'all'>('all');
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState<{ order: KitchenOrder; to: 'completed' | 'ready' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<Set<string> | null>(null);

  const load = useCallback(async () => {
    const r = await safeCall(() => kitchenService.list());
    if (!r.ok) return;
    setOrders(r.data);
    setLoading(false);
    const readyIds = r.data.filter((o) => o.status === 'ready').map((o) => o.id);
    setSeen((prev) => {
      if (prev && readyIds.some((id) => !prev.has(id))) playChime();
      return new Set(readyIds);
    });
  }, []);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [load]);
  void seen;

  const today = new Date().toDateString();
  const sessionOrders = useTicketScope(orders);
  const ready = useMemo(
    () => sessionOrders
      .filter((o) => o.status === 'ready' && (type === 'all' || o.orderType === type))
      .sort(newestOrderFirst),
    [sessionOrders, type],
  );
  const done = useMemo(
    () => sessionOrders
      .filter((o) => o.status === 'completed' && new Date(o.collectedAt ?? o.updatedAt).toDateString() === today && (type === 'all' || o.orderType === type))
      .sort(newestOrderFirst),
    [sessionOrders, type, today],
  );
  const delivery = ready.filter((o) => o.orderType === 'delivery');
  const pickup = ready.filter((o) => o.orderType !== 'delivery');

  async function apply() {
    if (!confirm) return;
    setBusy(true);
    const r = await safeCall(() => kitchenService.setStatus(confirm.order.id, confirm.to));
    setBusy(false);
    if (r.ok) {
      setOrders((cur) => cur.map((o) => (o.id === r.data.id ? r.data : o)));
      const key = confirm.to === 'ready' ? 'collect.toast.back' : confirm.order.orderType === 'delivery' ? 'collect.toast.dispatched' : 'collect.toast.handed';
      toast.success(t(key, { order: ticketLabel(confirm.order) }));
    } else {
      toast.error(t('kitchen.toast.failed'), r.error.message);
    }
    setConfirm(null);
  }

  const waited = (o: KitchenOrder) => Math.max(0, Math.floor((now - new Date(o.readyAt ?? o.updatedAt).getTime()) / 1000));

  const Ticket = ({ o }: { o: KitchenOrder }) => {
    const Icon = TYPE_ICON[o.orderType] ?? Package;
    const secs = waited(o);
    const late = secs > 5 * 60;
    return (
      <article className="flex flex-col rounded-xl border border-ink-200 bg-surface p-3 shadow-xs">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="numeric text-3xl font-bold leading-none text-ink-900">{ticketLabel(o)}</p>
            <div className="mt-1"><EditedBadge order={o} /></div>
            <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-ink-600">
              <Icon className="h-4 w-4 text-ink-400" /> {t(`kitchen.orderType.${o.orderType}`)}
              {o.customerName && <span className="truncate text-ink-400">· {o.customerName}</span>}
            </p>
          </div>
          <span className={cn('numeric rounded-full px-2 py-0.5 text-xs font-semibold', late ? 'bg-danger-50 text-danger-700' : 'bg-success-50 text-success-700')}
            data-tip={t('collect.waitingTip')}>
            {formatElapsed(secs)}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-ink-600 touch:line-clamp-3 touch:text-md">{o.items.map((i) => `${i.quantity}× ${viewOf(i, language).name}`).join(' · ')}</p>
        <button type="button" onClick={() => setConfirm({ order: o, to: 'completed' })}
          className={cn('mt-3 flex h-11 items-center justify-center gap-2 rounded-lg text-md font-semibold text-white transition-transform active:scale-[0.98] touch:h-12',
            o.orderType === 'delivery' ? 'bg-info-600 hover:bg-info-700' : 'bg-success-600 hover:bg-success-700')}>
          {o.orderType === 'delivery' ? <Bike className="h-5 w-5" /> : <Check className="h-5 w-5" />}
          {o.orderType === 'delivery' ? t('collect.dispatch') : t('collect.handOver')}
        </button>
      </article>
    );
  };

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <div className="me-2">
          <h1 className="text-lg font-semibold text-ink-900">{t('collect.title')}</h1>
          <p className="text-xs text-ink-500">{t('collect.subtitle')}</p>
        </div>
        <RefreshButton onRefresh={load} className="ms-auto sm:order-last" />
        <div role="tablist" className="flex gap-1 rounded-xl border border-ink-200 bg-surface p-1 max-sm:order-last max-sm:w-full">
          {(['ready', 'done'] as Tab[]).map((key) => {
            const on = tab === key;
            const count = key === 'ready' ? ready.length : done.length;
            return (
              <button key={key} type="button" role="tab" aria-selected={on} onClick={() => setTab(key)}
                className={cn('inline-flex min-h-[2.5rem] items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium touch:min-h-[2.75rem] touch:text-md max-sm:flex-1 max-sm:justify-center', on ? 'bg-info-50 text-info-800 ring-1 ring-info-200' : 'text-ink-600 hover:bg-ink-50')}>
                {t(`collect.tabs.${key}`)}
                <span className={cn('numeric rounded-full px-1.5 text-xs font-bold', on ? 'bg-white' : 'bg-ink-100', key === 'ready' ? 'text-success-700' : 'text-ink-600')}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-1 rounded-xl border border-ink-200 bg-surface px-2 py-1 max-sm:order-last max-sm:ms-0 max-sm:w-full max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:no-scrollbar">
          {(['all', 'delivery', 'takeaway', 'dine_in'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)}
              className={cn('min-h-[2rem] shrink-0 whitespace-nowrap rounded-full border px-2.5 text-sm font-medium touch:min-h-[2.5rem] touch:px-3.5', type === k ? 'border-info-200 bg-info-50 text-info-700' : 'border-transparent text-ink-600 hover:bg-ink-100')}>
              {k === 'all' ? t('kds.filters.all') : t(`kitchen.orderType.${k}`)}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-ink-100" />)}</div>
      ) : tab === 'ready' ? (
        ready.length === 0 ? (
          <div className="grid place-items-center rounded-xl border border-dashed border-ink-300 bg-surface py-16 text-center">
            <HandPlatter className="h-10 w-10 text-ink-300" />
            <p className="mt-3 text-lg font-semibold text-ink-900">{t('collect.empty')}</p>
            <p className="text-sm text-ink-500">{t('collect.emptyHint')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {delivery.length > 0 && (
              <section>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-700"><Bike className="h-4 w-4 text-info-600" /> {t('collect.deliveryHeading', { count: String(delivery.length) })}</h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">{delivery.map((o) => <Ticket key={o.id} o={o} />)}</div>
              </section>
            )}
            {pickup.length > 0 && (
              <section>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-700"><ShoppingBag className="h-4 w-4 text-success-600" /> {t('collect.pickupHeading', { count: String(pickup.length) })}</h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">{pickup.map((o) => <Ticket key={o.id} o={o} />)}</div>
              </section>
            )}
          </div>
        )
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-200 bg-surface">
          {done.length === 0 ? (
            <p className="p-8 text-center text-sm text-ink-500">{t('collect.noneDone')}</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {done.map((o) => {
                const Icon = TYPE_ICON[o.orderType] ?? Package;
                return (
                  <li key={o.id} className="flex items-center gap-3 px-3 py-2 max-sm:flex-wrap max-sm:gap-x-3 max-sm:gap-y-1 max-sm:py-3">
                    <span className="numeric w-16 font-bold text-ink-900">{ticketLabel(o)}</span>
                    <EditedBadge order={o} />
                    <span className="inline-flex w-28 items-center gap-1 text-sm text-ink-600"><Icon className="h-4 w-4 text-ink-400" />{t(`kitchen.orderType.${o.orderType}`)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-600 max-sm:order-last max-sm:basis-full">{o.items.map((i) => `${i.quantity}× ${viewOf(i, language).name}`).join(' · ')}</span>
                    <span className="numeric text-xs text-ink-500">
                      {o.orderType === 'delivery' ? t('collect.dispatchedAt') : t('collect.handedAt')}{' '}
                      {new Date(o.collectedAt ?? o.updatedAt).toLocaleTimeString(language === 'ar' ? 'ar-SA' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button type="button" onClick={() => setConfirm({ order: o, to: 'ready' })} aria-label={t('collect.undo')}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-ink-200 text-ink-500 hover:text-ink-900 touch:h-11 touch:w-11 max-sm:ms-auto">
                      <Undo2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <ConfirmModal
        open={Boolean(confirm)}
        loading={busy}
        variant="primary"
        title={confirm ? t(confirm.to === 'ready' ? 'collect.confirm.backTitle' : confirm.order.orderType === 'delivery' ? 'collect.confirm.dispatchTitle' : 'collect.confirm.handTitle', { order: ticketLabel(confirm.order) }) : ''}
        description={confirm ? t(confirm.to === 'ready' ? 'collect.confirm.backBody' : 'collect.confirm.body') : ''}
        confirmLabel={t('kdsOrder.yes')}
        cancelLabel={t('kdsOrder.no')}
        onConfirm={() => void apply()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
