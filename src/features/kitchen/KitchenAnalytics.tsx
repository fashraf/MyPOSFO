import { useMemo } from 'react';
import { SizedDialog } from '@/components/ui';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { LATE_AFTER_SECONDS, prepMinutes } from '@/types/kitchen';
import type { KitchenOrder, OrderType } from '@/types/kitchen';
import { ticketLabel, viewOf } from './kds';

/**
 * Today in the kitchen, on one screen.
 *
 * Six numbers first (what a manager asks: how many, how fast, how many late),
 * then four small charts drawn with plain bars. Laid out to fit a laptop
 * screen without scrolling.
 */
export function KitchenAnalytics({ open, onClose, orders }: { open: boolean; onClose: () => void; orders: KitchenOrder[] }) {
  const { t } = useTranslation();
  const { language } = useI18n();

  const data = useMemo(() => {
    const today = new Date().toDateString();
    const todays = orders.filter((o) => new Date(o.createdAt).toDateString() === today);
    const finished = todays.filter((o) => o.readyAt);
    const preps = finished.map((o) => prepMinutes(o) ?? 0);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const waits = todays.filter((o) => o.readyAt && o.collectedAt)
      .map((o) => (new Date(o.collectedAt!).getTime() - new Date(o.readyAt!).getTime()) / 60000);
    const onTime = finished.filter((o) => (prepMinutes(o) ?? 0) * 60 < LATE_AFTER_SECONDS).length;
    const items = todays.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);

    const hours = new Map<number, number>();
    for (const o of todays) {
      const h = new Date(o.createdAt).getHours();
      hours.set(h, (hours.get(h) ?? 0) + 1);
    }
    const hourKeys = [...hours.keys()];
    const minH = Math.min(...hourKeys, new Date().getHours());
    const maxH = Math.max(...hourKeys, new Date().getHours());
    const byHour = Array.from({ length: maxH - minH + 1 }, (_, i) => ({ hour: minH + i, count: hours.get(minH + i) ?? 0 }));

    const types: OrderType[] = ['dine_in', 'takeaway', 'delivery'];
    const byType = types.map((type) => {
      const list = todays.filter((o) => o.orderType === type);
      return { type, count: list.length, avg: avg(list.filter((o) => o.readyAt).map((o) => prepMinutes(o) ?? 0)) };
    });

    const top = new Map<string, number>();
    for (const o of todays) {
      if (o.status === 'cancelled') continue;
      for (const i of o.items) {
        const name = viewOf(i, language).name;
        top.set(name, (top.get(name) ?? 0) + i.quantity);
      }
    }
    const topItems = [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const slowest = [...finished].sort((a, b) => (prepMinutes(b) ?? 0) - (prepMinutes(a) ?? 0)).slice(0, 3);

    const statuses = {
      open: todays.filter((o) => o.status === 'open').length,
      preparing: todays.filter((o) => o.status === 'preparing').length,
      done: todays.filter((o) => o.status === 'ready' || o.status === 'completed').length,
      cancelled: todays.filter((o) => o.status === 'cancelled').length,
    };

    return {
      total: todays.length, avgPrep: avg(preps), avgWait: avg(waits),
      onTimePct: finished.length ? onTime / finished.length : null,
      cancelled: statuses.cancelled, items, byHour, byType, topItems, slowest, statuses,
      fastest: preps.length ? Math.min(...preps) : null,
    };
  }, [orders, language]);

  const mins = (m: number | null) => (m === null ? '—' : t('kdsStats.minutes', { n: m < 10 ? m.toFixed(1) : String(Math.round(m)) }));
  const pct = (p: number | null) => (p === null ? '—' : `${Math.round(p * 100)}%`);
  const maxHour = Math.max(1, ...data.byHour.map((h) => h.count));
  const maxType = Math.max(1, ...data.byType.map((x) => x.count));
  const maxTop = Math.max(1, ...data.topItems.map((x) => x[1]));
  const statusTotal = Math.max(1, data.statuses.open + data.statuses.preparing + data.statuses.done + data.statuses.cancelled);

  return (
    <SizedDialog open={open} onClose={onClose} placement="start" size={35} title={t('kdsStats.title')} subtitle={t('kdsStats.subtitle')} bodyClassName="space-y-4">
      {/* Key numbers */}
      <div className="grid grid-cols-3 gap-2">
        <Kpi label={t('kdsStats.orders')} value={String(data.total)} />
        <Kpi label={t('kdsStats.avgPrep')} value={mins(data.avgPrep)} tone={data.avgPrep !== null && data.avgPrep * 60 >= LATE_AFTER_SECONDS ? 'text-danger-600' : undefined} />
        <Kpi label={t('kdsStats.onTime')} value={pct(data.onTimePct)} tone={data.onTimePct !== null && data.onTimePct < 0.8 ? 'text-warning-700' : 'text-success-700'} />
        <Kpi label={t('kdsStats.avgWait')} value={mins(data.avgWait)} />
        <Kpi label={t('kdsStats.items')} value={String(data.items)} />
        <Kpi label={t('kdsStats.cancelled')} value={String(data.cancelled)} tone={data.cancelled ? 'text-danger-600' : undefined} />
      </div>

      {/* Status split */}
      <section>
        <Heading>{t('kdsStats.now')}</Heading>
        <div className="flex h-3 overflow-hidden rounded-full bg-ink-100">
          <span className="bg-info-500" style={{ width: `${(data.statuses.open / statusTotal) * 100}%` }} />
          <span className="bg-warning-400" style={{ width: `${(data.statuses.preparing / statusTotal) * 100}%` }} />
          <span className="bg-success-500" style={{ width: `${(data.statuses.done / statusTotal) * 100}%` }} />
          <span className="bg-danger-400" style={{ width: `${(data.statuses.cancelled / statusTotal) * 100}%` }} />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-600">
          <Legend color="bg-info-500" label={`${t('kdsStatus.open')} ${data.statuses.open}`} />
          <Legend color="bg-warning-400" label={`${t('kdsStatus.preparing')} ${data.statuses.preparing}`} />
          <Legend color="bg-success-500" label={`${t('kdsStatus.ready')} ${data.statuses.done}`} />
          <Legend color="bg-danger-400" label={`${t('kdsStatus.cancelled')} ${data.statuses.cancelled}`} />
        </div>
      </section>

      {/* Orders by hour */}
      <section>
        <Heading>{t('kdsStats.byHour')}</Heading>
        <div className="flex h-20 items-end gap-1">
          {data.byHour.map((h) => (
            <div key={h.hour} className="flex h-full flex-1 flex-col items-center gap-1" data-tip={`${h.hour}:00 · ${h.count}`}>
              <div className="flex w-full flex-1 items-end">
                <div className="w-full rounded-t bg-info-400" style={{ height: Math.round((h.count / maxHour) * 60) + (h.count ? 3 : 0) }} />
              </div>
              <span className="numeric text-[10px] text-ink-400">{h.hour}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* By order type */}
        <section>
          <Heading>{t('kdsStats.byType')}</Heading>
          <ul className="space-y-1.5">
            {data.byType.map((x) => (
              <li key={x.type} className="text-xs">
                <div className="flex justify-between text-ink-700">
                  <span>{t(`kitchen.orderType.${x.type}`)} · {x.count}</span>
                  <span className="numeric text-ink-500">{mins(x.avg)}</span>
                </div>
                <div className="mt-0.5 h-1.5 rounded-full bg-ink-100">
                  <div className="h-full rounded-full bg-info-400" style={{ width: `${(x.count / maxType) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Top items */}
        <section>
          <Heading>{t('kdsStats.topItems')}</Heading>
          <ul className="space-y-1.5">
            {data.topItems.length === 0 && <li className="text-xs text-ink-400">—</li>}
            {data.topItems.map(([name, count]) => (
              <li key={name} className="text-xs">
                <div className="flex justify-between gap-2 text-ink-700">
                  <span className="truncate">{name}</span>
                  <span className="numeric font-semibold">{count}</span>
                </div>
                <div className="mt-0.5 h-1.5 rounded-full bg-ink-100">
                  <div className="h-full rounded-full bg-success-500" style={{ width: `${(count / maxTop) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Slowest */}
      <section>
        <Heading>{t('kdsStats.slowest')}</Heading>
        <div className="grid grid-cols-3 gap-2">
          {data.slowest.length === 0 && <p className="col-span-3 text-xs text-ink-400">—</p>}
          {data.slowest.map((o) => (
            <div key={o.id} className="rounded-lg border border-ink-200 px-2.5 py-2">
              <p className="numeric text-sm font-semibold text-ink-900">{ticketLabel(o)}</p>
              <p className="numeric text-xs text-danger-600">{mins(prepMinutes(o))}</p>
            </div>
          ))}
        </div>
        {data.fastest !== null && <p className="mt-2 text-xs text-ink-500">{t('kdsStats.fastest', { m: mins(data.fastest) })}</p>}
      </section>
    </SizedDialog>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-ink-200 px-3 py-2">
      <p className="truncate text-[11px] font-medium text-ink-500">{label}</p>
      <p className={cn('numeric mt-0.5 text-lg font-semibold text-ink-900', tone)}>{value}</p>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-400">{children}</h3>;
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', color)} />
      {label}
    </span>
  );
}
