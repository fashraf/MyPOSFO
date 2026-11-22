import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bell,
  BellOff,
  Bike,
  Check,
  Flame,
  LayoutGrid,
  List,
  Maximize2,
  Minimize2,
  Package,
  RotateCcw,
  ShoppingBag,
  Timer,
  Utensils,
  type LucideIcon, Car } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { catalogService, kitchenService, printGroupService, safeCall } from '@/services';
import { elapsedSeconds, formatElapsed, prepMinutes, urgencyOf } from '@/types/kitchen';
import type { KitchenOrder, KitchenOrderItem, KitchenOrderStatus, OrderType, UrgencyBand } from '@/types/kitchen';
import type { PrintGroup } from '@/types/printing';
import { playChime, ticketLabel, viewOf } from '@/features/kitchen/kds';
import { KitchenOrderDialog, type OrderAction } from '@/features/kitchen/KitchenOrderDialog';
import { KitchenAnalytics } from '@/features/kitchen/KitchenAnalytics';

/*
 * The kitchen screen.
 *
 * Five tabs across the top — Active, Ordered, Preparing, Completed, Cancelled
 * — each with its count; tapping one filters the board. Cards are compact so
 * a busy lunch still fits. Starting an order is one tap (with Undo); finishing
 * or reopening anything opens the order and asks once, so nothing is marked
 * done by accident and anything done can be undone.
 */

type Tab = 'active' | 'open' | 'preparing' | 'done' | 'cancelled';
const POLL_MS = 5000;
const UNDO_MS = 6000;

const TYPE_ICON: Record<OrderType, LucideIcon> = { dine_in: Utensils, takeaway: ShoppingBag, delivery: Bike, drive_thru: Car, other: Package };
const STRIP: Record<UrgencyBand, string> = { normal: 'bg-success-500', warning: 'bg-warning-400', late: 'bg-danger-500' };
const TIMER: Record<UrgencyBand, string> = { normal: 'text-success-700', warning: 'text-warning-700', late: 'text-danger-600' };
const PILL: Record<KitchenOrderStatus, string> = {
  open: 'bg-info-50 text-info-700',
  preparing: 'bg-warning-50 text-warning-700',
  ready: 'bg-success-50 text-success-700',
  completed: 'bg-ink-100 text-ink-600',
  cancelled: 'bg-danger-50 text-danger-700',
};

const inTab = (o: KitchenOrder, tab: Tab) =>
  tab === 'active' ? o.status === 'open' || o.status === 'preparing'
  : tab === 'done' ? o.status === 'ready' || o.status === 'completed'
  : o.status === tab;

export default function KitchenPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();
  const rootRef = useRef<HTMLDivElement>(null);

  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>('active');
  const [station, setStation] = useState('all');
  const [typeFilter, setTypeFilter] = useState<OrderType | 'all'>('all');
  const [stations, setStations] = useState<PrintGroup[]>([]);
  const [stationOf, setStationOf] = useState<Map<string, string | null>>(new Map());
  const [view, setView] = useState<'grid' | 'list'>(() => (readFlag('kds.list', false) ? 'list' : 'grid'));
  const [sound, setSound] = useState(() => readFlag('kds.sound', true));
  const [fullscreen, setFullscreen] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<{ snapshot: KitchenOrder; message: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openAction, setOpenAction] = useState<OrderAction | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const known = useRef<Set<string> | null>(null);
  const undoTimer = useRef<number>();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    const result = await safeCall(() => kitchenService.list());
    if (!result.ok) return;
    if (known.current) {
      const added = result.data.filter((o) => !known.current!.has(o.id) && o.status === 'open').map((o) => o.id);
      if (added.length) {
        setFresh((cur) => new Set([...cur, ...added]));
        if (readFlag('kds.sound', true)) playChime();
        window.setTimeout(() => setFresh((cur) => new Set([...cur].filter((id) => !added.includes(id)))), 8000);
      }
    }
    known.current = new Set(result.data.map((o) => o.id));
    setOrders(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    void Promise.all([safeCall(() => catalogService.posItems()), safeCall(() => printGroupService.list())]).then(([items, groups]) => {
      if (items.ok) setStationOf(new Map(items.data.map((item) => [item.id, item.printGroupId])));
      if (groups.ok) setStations(groups.data.filter((g) => g.status === 'active'));
    });
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const inStation = useCallback(
    (item: KitchenOrderItem) => station === 'all' || stationOf.get(item.productId) === station,
    [station, stationOf],
  );

  /* Today only, filtered by station and type; the tab is applied last so the counts stay honest. */
  const scoped = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter(
      (o) =>
        (o.status === 'open' || o.status === 'preparing' || new Date(o.createdAt).toDateString() === today) &&
        o.items.some(inStation) &&
        (typeFilter === 'all' || o.orderType === typeFilter),
    );
  }, [orders, inStation, typeFilter]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { active: 0, open: 0, preparing: 0, done: 0, cancelled: 0 };
    for (const o of scoped) (['active', 'open', 'preparing', 'done', 'cancelled'] as Tab[]).forEach((tb) => inTab(o, tb) && (c[tb] += 1));
    return c;
  }, [scoped]);

  const visible = useMemo(() => {
    const list = scoped.filter((o) => inTab(o, tab));
    /* Waiting work oldest first; finished work newest first. */
    const asc = tab === 'active' || tab === 'open' || tab === 'preparing';
    return list.sort((a, b) => (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * (asc ? 1 : -1));
  }, [scoped, tab]);

  const lateCount = scoped.filter((o) => (o.status === 'open' || o.status === 'preparing') && urgencyOf(elapsedSeconds(o, now)) === 'late').length;
  const opened = orders.find((o) => o.id === openId) ?? null;

  function remember(snapshot: KitchenOrder, message: string) {
    window.clearTimeout(undoTimer.current);
    setUndo({ snapshot, message });
    undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  }

  async function setStatus(order: KitchenOrder, status: KitchenOrderStatus, withUndo: boolean) {
    const result = await safeCall(() => kitchenService.setStatus(order.id, status));
    if (!result.ok) {
      toast.error(t('kitchen.toast.failed'), result.error.message);
      return;
    }
    setOrders((cur) => cur.map((o) => (o.id === order.id ? result.data : o)));
    if (withUndo) remember(order, t(`kdsDone.${status}`, { order: ticketLabel(order) }));
    else toast.success(t(`kdsDone.${status}`, { order: ticketLabel(order) }));
  }

  async function confirmAction(action: OrderAction) {
    if (!opened) return;
    if (action.kind === 'status') {
      await setStatus(opened, action.status, false);
      return;
    }
    const result = await safeCall(() => kitchenService.setItemProgress(opened.id, action.item.id, action.done ? action.item.quantity : 0));
    if (result.ok) {
      setOrders((cur) => cur.map((o) => (o.id === opened.id ? result.data : o)));
      if (result.data.status === 'ready' && opened.status !== 'ready') toast.success(t('kdsDone.ready', { order: ticketLabel(opened) }));
    }
  }

  async function undoLast() {
    if (!undo) return;
    const { snapshot } = undo;
    setUndo(null);
    const result = await safeCall(() => kitchenService.restore(snapshot));
    if (result.ok) setOrders((cur) => cur.map((o) => (o.id === snapshot.id ? result.data : o)));
  }

  /* The card's main button: starting is safe (one tap, Undo); finishing or reopening asks first. */
  function primary(order: KitchenOrder) {
    if (order.status === 'open') void setStatus(order, 'preparing', true);
    else if (order.status === 'preparing') openOrder(order, { kind: 'status', status: 'ready' });
    else if (order.status === 'ready') openOrder(order, { kind: 'status', status: 'preparing' });
    else openOrder(order, null);
  }

  function openOrder(order: KitchenOrder, action: OrderAction | null) {
    setOpenAction(action);
    setOpenId(order.id);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
  }

  const tabs: { key: Tab; tone: string }[] = [
    { key: 'active', tone: 'text-ink-900' },
    { key: 'open', tone: 'text-info-700' },
    { key: 'preparing', tone: 'text-warning-700' },
    { key: 'done', tone: 'text-success-700' },
    { key: 'cancelled', tone: 'text-danger-600' },
  ];
  const filtersOn = (station !== 'all' ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0);

  return (
    <div ref={rootRef} className={cn('relative flex flex-col gap-2.5 overflow-hidden', fullscreen
        ? 'h-screen w-screen bg-canvas p-4'
        /* Fills the shell's content area (which already ends above the phone
           bottom bar). On a phone the whole page scrolls instead, so the three
           control rows scroll away and the tickets get the screen. */
        : 'h-full min-h-[32rem] max-[560px]:h-auto max-[560px]:min-h-0 max-[560px]:overflow-visible')}>
      {/* Row 1: title, status tabs, tools */}
      <header className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="me-1">
          <h1 className="text-lg font-semibold leading-tight text-ink-900">{t('kitchen.title')}</h1>
          <p className="numeric text-xs text-ink-500">
            {new Date(now).toLocaleTimeString(language === 'ar' ? 'ar-SA' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
            {lateCount > 0 && <span className="ms-2 font-semibold text-danger-600">{t('kdsTabs.late', { count: String(lateCount) })}</span>}
          </p>
        </div>

        {/* Below lg the tabs get their own full-width row and scroll sideways
            rather than wrapping onto a second line. */}
        <div role="tablist" className="flex flex-wrap gap-1 rounded-xl border border-ink-200 bg-surface p-1 max-lg:order-last max-lg:w-full max-lg:flex-nowrap max-lg:overflow-x-auto max-lg:overscroll-x-contain max-lg:no-scrollbar">
          {tabs.map(({ key, tone }) => {
            const on = tab === key;
            return (
              <button key={key} type="button" role="tab" aria-selected={on} onClick={() => setTab(key)}
                className={cn('inline-flex min-h-[2.5rem] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition touch:min-h-[2.75rem] touch:text-md',
                  on ? 'bg-info-50 text-info-800 ring-1 ring-info-200' : 'text-ink-600 hover:bg-ink-50')}>
                {t(`kdsTabs.${key}`)}
                <span className={cn('numeric min-w-[1.5rem] rounded-full px-1.5 text-center text-xs font-bold', on ? 'bg-white' : 'bg-ink-100', tone)}>{counts[key]}</span>
              </button>
            );
          })}
        </div>

        <div className="ms-auto flex items-center gap-1.5">
          <button type="button" onClick={() => setStatsOpen(true)}
            aria-label={t('kdsStats.button')}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-ink-200 bg-surface px-3 text-sm font-medium text-ink-700 hover:border-info-300 hover:text-info-700 touch:h-11 max-sm:w-11 max-sm:justify-center max-sm:px-0">
            <BarChart3 className="h-4 w-4" /> <span className="max-sm:hidden">{t('kdsStats.button')}</span>
          </button>
          <div className="flex rounded-lg border border-ink-200 bg-surface p-0.5">
            <ViewButton icon={LayoutGrid} label={t('kdsView.grid')} on={view === 'grid'} onClick={() => { setView('grid'); writeFlag('kds.list', false); }} />
            <ViewButton icon={List} label={t('kdsView.list')} on={view === 'list'} onClick={() => { setView('list'); writeFlag('kds.list', true); }} />
          </div>
          <ToolButton icon={sound ? Bell : BellOff} label={sound ? t('kds.soundOn') : t('kds.soundOff')} active={sound}
            onClick={() => { const next = !sound; setSound(next); writeFlag('kds.sound', next); if (next) playChime(); }} />
          <ToolButton icon={fullscreen ? Minimize2 : Maximize2} label={fullscreen ? t('kds.exitFull') : t('kds.full')} onClick={toggleFullscreen} />
        </div>
      </header>

      {/* Row 2: filters */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-ink-200 bg-surface px-3 py-1.5 max-sm:px-2">
        {stations.length > 0 && (
          <FilterGroup label={t('kds.filters.station')}>
            {[{ id: 'all', nameAr: 'الكل', nameEn: 'All' }, ...stations].map((s) => (
              <FilterChip key={s.id} on={station === s.id} onClick={() => setStation(s.id)}>{language === 'ar' ? s.nameAr : s.nameEn}</FilterChip>
            ))}
          </FilterGroup>
        )}
        <FilterGroup label={t('kds.filters.type')}>
          {(['all', 'dine_in', 'takeaway', 'delivery'] as const).map((type) => (
            <FilterChip key={type} on={typeFilter === type} onClick={() => setTypeFilter(type)}>
              {type === 'all' ? t('kds.filters.all') : t(`kitchen.orderType.${type}`)}
            </FilterChip>
          ))}
        </FilterGroup>
        {filtersOn > 0 && (
          <button type="button" onClick={() => { setStation('all'); setTypeFilter('all'); }} className="text-sm font-medium text-info-700 hover:underline">
            {t('kds.filters.clear')}
          </button>
        )}
      </div>

      {/* Board */}
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain max-[560px]:overflow-visible">
        {loading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2.5">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-48 animate-pulse rounded-xl bg-ink-100" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="grid h-full place-items-center rounded-xl border border-dashed border-ink-300 bg-surface text-center max-[560px]:h-auto max-[560px]:min-h-[16rem]">
            <div className="p-8">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success-50 text-success-600"><Check className="h-7 w-7" /></span>
              <p className="mt-3 text-lg font-semibold text-ink-900">{t(`kdsEmpty.${tab}`)}</p>
              <p className="mt-1 text-sm text-ink-500">{filtersOn ? t('kds.noneFilteredHint') : t('kds.allClearHint')}</p>
            </div>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] items-start gap-2.5">
            {visible.map((order) => (
              <Card key={order.id} order={order} now={now} language={language} fresh={fresh.has(order.id)} inStation={inStation}
                onOpen={() => openOrder(order, null)} onPrimary={() => primary(order)} />
            ))}
          </div>
        ) : (
          <ListView orders={visible} now={now} language={language} inStation={inStation} onOpen={(o) => openOrder(o, null)} onPrimary={primary} />
        )}
      </main>

      {undo && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-toast flex justify-center px-4 max-[560px]:fixed max-[560px]:bottom-[calc(5rem+env(safe-area-inset-bottom,0px))]">
          <div role="status" className="pointer-events-auto flex items-center gap-4 rounded-xl border border-ink-200 bg-surface px-4 py-2.5 shadow-overlay">
            <span className="text-md font-medium text-ink-900">{undo.message}</span>
            <button type="button" onClick={() => void undoLast()} className="min-h-[2.5rem] rounded-lg bg-info-600 px-4 text-sm font-semibold text-white hover:bg-info-700">
              {t('kds.undo')}
            </button>
          </div>
        </div>
      )}

      <KitchenOrderDialog order={opened} open={Boolean(opened)} onClose={() => setOpenId(null)} onConfirm={confirmAction} initialAction={openAction} now={now} />
      <KitchenAnalytics open={statsOpen} onClose={() => setStatsOpen(false)} orders={orders} />
    </div>
  );
}

/* ---- Card ---------------------------------------------------------------- */

function primaryLabel(order: KitchenOrder, t: (k: never, v?: Record<string, string>) => string): { label: string; tone: string; icon: LucideIcon } | null {
  switch (order.status) {
    case 'open': return { label: t('kdsOrder.action.start' as never), tone: 'bg-info-600 hover:bg-info-700 text-white', icon: Flame };
    case 'preparing': return { label: t('kdsOrder.action.complete' as never), tone: 'bg-success-600 hover:bg-success-700 text-white', icon: Check };
    case 'ready': return { label: t('kdsOrder.action.reopen' as never), tone: 'border border-ink-200 text-ink-700 hover:bg-ink-50', icon: RotateCcw };
    default: return null;
  }
}

function Card({ order, now, language, fresh, inStation, onOpen, onPrimary }: {
  order: KitchenOrder; now: number; language: string; fresh: boolean;
  inStation: (i: KitchenOrderItem) => boolean; onOpen: () => void; onPrimary: () => void;
}) {
  const { t } = useTranslation();
  const live = order.status === 'open' || order.status === 'preparing';
  const band = live ? urgencyOf(elapsedSeconds(order, now)) : 'normal';
  const TypeIcon = TYPE_ICON[order.orderType] ?? Package;
  const items = order.items.filter(inStation);
  const shown = items.slice(0, 6);
  const prep = prepMinutes(order);
  const action = primaryLabel(order, t as never);

  return (
    <article className={cn('flex flex-col overflow-hidden rounded-xl border border-ink-200 bg-surface shadow-xs', fresh && 'ring-2 ring-info-300', order.status === 'cancelled' && 'opacity-75')}>
      {live && <span aria-hidden className={cn('h-1', STRIP[band])} />}
      <button type="button" onClick={onOpen} className="flex-1 text-start hover:bg-ink-50/60">
        <header className="flex items-center justify-between gap-2 px-3 pb-1.5 pt-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="numeric text-lg font-bold text-ink-900 touch:text-xl">{ticketLabel(order)}</span>
            <TypeIcon className="h-4 w-4 shrink-0 text-ink-400" aria-label={t(`kitchen.orderType.${order.orderType}`)} />
            {order.customerName && <span className="truncate text-xs text-ink-400">{order.customerName}</span>}
          </span>
          {live ? (
            <span className={cn('numeric inline-flex items-center gap-1 text-md font-semibold', TIMER[band])}>
              <Timer className="h-3.5 w-3.5" /> {formatElapsed(elapsedSeconds(order, now))}
            </span>
          ) : (
            <span className={cn('rounded-full px-2 py-0.5 text-2xs font-semibold', PILL[order.status])}>
              {order.status === 'cancelled' ? t('kdsStatus.cancelled') : order.status === 'ready' ? t('kdsStatus.waiting') : t('kdsStatus.collected')}
            </span>
          )}
        </header>
        <ul className="space-y-0.5 border-t border-ink-100 px-3 py-1.5">
          {shown.map((item) => {
            const done = item.completedQuantity >= item.quantity;
            const v = viewOf(item, language);
            return (
              <li key={item.id} className="flex items-start gap-2 text-sm leading-snug touch:py-0.5 touch:text-md">
                <span className={cn('numeric w-6 shrink-0 font-bold', done ? 'text-ink-300' : 'text-ink-900')}>{item.quantity}×</span>
                <span className={cn('min-w-0 flex-1', done ? 'text-ink-400 line-through' : 'text-ink-800')}>
                  {v.name}
                  {v.mods.length > 0 && (
                    <span className="ms-1 text-xs">
                      {v.mods.map((m, i) => (
                        <span key={i} className={cn('me-1 font-semibold', m.tone === 'remove' ? 'text-danger-600' : m.tone === 'add' ? 'text-success-700' : 'text-warning-700')}>
                          {m.label}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                {done && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-600" />}
              </li>
            );
          })}
          {items.length > shown.length && <li className="text-xs text-ink-400">{t('kdsCard.more', { count: String(items.length - shown.length) })}</li>}
        </ul>
        {!live && prep !== null && <p className="numeric px-3 pb-1.5 text-xs text-ink-400">{t('kdsOrder.tookMinutes', { minutes: String(Math.round(prep)) })}</p>}
      </button>
      {action && (
        <div className="border-t border-ink-100 p-2">
          <button type="button" onClick={onPrimary} className={cn('flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-transform active:scale-[0.98] touch:h-12 touch:text-md', action.tone)}>
            <action.icon className="h-4 w-4 touch:h-5 touch:w-5" /> {action.label}
          </button>
        </div>
      )}
    </article>
  );
}

/* ---- List ---------------------------------------------------------------- */

function ListView({ orders, now, language, inStation, onOpen, onPrimary }: {
  orders: KitchenOrder[]; now: number; language: string; inStation: (i: KitchenOrderItem) => boolean;
  onOpen: (o: KitchenOrder) => void; onPrimary: (o: KitchenOrder) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-ink-50 text-start text-2xs font-semibold uppercase tracking-wider text-ink-500">
          <tr>
            <th className="px-3 py-2 text-start">{t('kdsList.order')}</th>
            <th className="px-3 py-2 text-start">{t('kdsList.items')}</th>
            <th className="px-3 py-2 text-start">{t('kdsList.time')}</th>
            <th className="px-3 py-2 text-start">{t('kdsList.status')}</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {orders.map((order) => {
            const live = order.status === 'open' || order.status === 'preparing';
            const band = urgencyOf(elapsedSeconds(order, now));
            const items = order.items.filter(inStation);
            const done = items.filter((i) => i.completedQuantity >= i.quantity).length;
            const TypeIcon = TYPE_ICON[order.orderType] ?? Package;
            const action = primaryLabel(order, t as never);
            const prep = prepMinutes(order);
            return (
              <tr key={order.id} onClick={() => onOpen(order)} className="cursor-pointer hover:bg-ink-50/60">
                <td className="whitespace-nowrap px-3 py-2">
                  <span className="numeric font-bold text-ink-900">{ticketLabel(order)}</span>
                  <span className="ms-2 inline-flex items-center gap-1 text-xs text-ink-500"><TypeIcon className="h-3.5 w-3.5" />{t(`kitchen.orderType.${order.orderType}`)}</span>
                </td>
                <td className="px-3 py-2 text-ink-700">
                  <span className="line-clamp-1">{items.map((i) => `${i.quantity}× ${viewOf(i, language).name}`).join(' · ')}</span>
                  {live && <span className="text-xs text-ink-400">{t('kdsOrder.progress', { done: String(done), total: String(items.length) })}</span>}
                </td>
                <td className={cn('numeric whitespace-nowrap px-3 py-2 font-semibold', live ? TIMER[band] : 'text-ink-500')}>
                  {live ? formatElapsed(elapsedSeconds(order, now)) : prep !== null ? t('kdsOrder.tookMinutes', { minutes: String(Math.round(prep)) }) : '—'}
                </td>
                <td className="px-3 py-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', PILL[order.status])}>
                    {order.status === 'ready' ? t('kdsStatus.waiting') : order.status === 'completed' ? t('kdsStatus.collected') : t(`kdsStatus.${order.status}`)}
                  </span>
                </td>
                <td className="px-3 py-2 text-end" onClick={(e) => e.stopPropagation()}>
                  {action && (
                    <button type="button" onClick={() => onPrimary(order)} className={cn('inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold', action.tone)}>
                      <action.icon className="h-4 w-4" /> {action.label}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---- Small parts --------------------------------------------------------- */

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1 max-sm:w-full max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:overscroll-x-contain max-sm:no-scrollbar">
      <span className="me-0.5 shrink-0 text-xs font-medium text-ink-500">{label}</span>
      {children}
    </div>
  );
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn('min-h-[2rem] shrink-0 whitespace-nowrap rounded-full border px-2.5 text-sm font-medium transition touch:min-h-[2.5rem] touch:px-3.5',
        on ? 'border-info-200 bg-info-50 text-info-700' : 'border-transparent text-ink-600 hover:bg-ink-100')}>
      {children}
    </button>
  );
}

function ViewButton({ icon: Icon, label, on, onClick }: { icon: LucideIcon; label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={on}
      className={cn('grid h-9 w-9 place-items-center rounded-md touch:h-10 touch:w-10', on ? 'bg-info-50 text-info-700' : 'text-ink-500 hover:text-ink-900')}>
      <Icon className="h-4 w-4" />
    </button>
  );
}

function ToolButton({ icon: Icon, label, onClick, active }: { icon: LucideIcon; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={active}
      className={cn('grid h-10 w-10 place-items-center rounded-lg border transition touch:h-11 touch:w-11',
        active ? 'border-info-200 bg-info-50 text-info-700' : 'border-ink-200 bg-surface text-ink-500 hover:text-ink-900')}>
      <Icon className="h-4 w-4" />
    </button>
  );
}

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* Private mode: the setting lasts for this visit only. */
  }
}
