import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ROUTES } from '@/routes/paths';
import type { RestaurantSession } from '@/types/restaurantSession';
import { hoursMinutes } from './CloseConfirm';
import { DifferencePill, StatusPill, useRs } from './shared';

const methodAmount = (s: RestaurantSession, method: string) => s.summary?.byMethod.find((m) => m.method === method)?.amountH ?? 0;
const minutesOf = (s: RestaurantSession) => Math.max(0, Math.floor(((s.closedAt ? Date.parse(s.closedAt) : Date.now()) - Date.parse(s.openedAt)) / 60000));
const hm = (mins: number) => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;

interface Day {
  date: string;
  sessions: RestaurantSession[];
  firstOpen: string;
  lastClose: string | null;
  minutes: number;
  openingH: number;
  cashH: number;
  cardH: number;
  totalH: number;
  diffH: number | null;
  openedBy: string[];
  closedBy: string[];
  reasons: string[];
  anyOpen: boolean;
}

function groupByDay(rows: RestaurantSession[]): Day[] {
  const map = new Map<string, RestaurantSession[]>();
  for (const s of rows) map.set(s.businessDate, [...(map.get(s.businessDate) ?? []), s]);
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, sessions]) => {
      const sorted = [...sessions].sort((a, b) => a.openedAt.localeCompare(b.openedAt));
      const closed = sorted.filter((s) => s.status === 'closed');
      const anyOpen = sorted.some((s) => s.status === 'open');
      return {
        date,
        sessions: sorted,
        firstOpen: sorted[0].openedAt,
        lastClose: anyOpen ? null : closed.map((s) => s.closedAt!).sort().at(-1) ?? null,
        minutes: sorted.reduce((a, s) => a + minutesOf(s), 0),
        openingH: sorted.reduce((a, s) => a + s.openingBalanceH, 0),
        cashH: sorted.reduce((a, s) => a + methodAmount(s, 'cash'), 0),
        cardH: sorted.reduce((a, s) => a + methodAmount(s, 'card'), 0),
        totalH: sorted.reduce((a, s) => a + (s.summary?.totalH ?? 0), 0),
        diffH: closed.length ? closed.reduce((a, s) => a + (s.differenceH ?? 0), 0) : null,
        openedBy: [...new Set(sorted.map((s) => s.openedBy))],
        closedBy: [...new Set(closed.map((s) => s.closedBy ?? ''))].filter(Boolean),
        reasons: sorted.map((s) => s.discrepancyReason).filter((x): x is string => !!x),
        anyOpen,
      };
    });
}

/**
 * Session history as a list of days. Each day row sums its sessions (all
 * branches in view); expanding it shows every session of that day with who
 * opened and closed it, the cash and card takings and the difference with its
 * reason.
 */
export function DayHistoryGrid({ rows, branchName }: { rows: RestaurantSession[]; branchName: (id: string) => string }) {
  const { r, money, time, dateTime, longDate } = useRs();
  const days = useMemo(() => groupByDay(rows), [rows]);
  const [openDays, setOpenDays] = useState<Set<string>>(() => new Set(days[0] ? [days[0].date] : []));

  const toggle = (date: string) =>
    setOpenDays((cur) => {
      const next = new Set(cur);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  if (days.length === 0) return <p className="py-10 text-center text-sm text-ink-500">{r('history.empty')}</p>;

  const th = 'whitespace-nowrap px-3 py-2 text-start text-2xs font-semibold uppercase tracking-wider text-ink-500';
  const td = 'whitespace-nowrap px-3 py-2.5';

  return (
    <div className="overflow-x-auto" data-testid="day-history">
      <table className="w-full min-w-[1100px] text-sm">
        <thead className="bg-ink-50">
          <tr>
            <th className={th} aria-label={r('days.expand')} />
            <th className={th}>{r('days.day')}</th>
            <th className={th}>{r('days.opened')}</th>
            <th className={th}>{r('days.closed')}</th>
            <th className={th}>{r('days.duration')}</th>
            <th className={cn(th, 'text-end')}>{r('fields.openingBalance')}</th>
            <th className={cn(th, 'text-end')}>{r('method.cash')}</th>
            <th className={cn(th, 'text-end')}>{r('method.card')}</th>
            <th className={cn(th, 'text-end')}>{r('cols.total')}</th>
            <th className={th}>{r('fields.difference')}</th>
            <th className={th}>{r('days.reason')}</th>
            <th className={th}>{r('days.who')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {days.map((d) => {
            const expanded = openDays.has(d.date);
            return (
              <Fragment key={d.date}>
                <tr
                  data-testid="day-row"
                  className={cn('cursor-pointer hover:bg-ink-50', expanded && 'bg-info-50/40', d.anyOpen && 'bg-success-50/40')}
                  onClick={() => toggle(d.date)}
                  aria-expanded={expanded}
                >
                  <td className="w-8 px-2 text-ink-400">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="flip-rtl h-4 w-4" />}</td>
                  <td className={cn(td, 'font-semibold text-ink-900')}>
                    {longDate(d.date, true)}
                    <span className="ms-2 rounded-full bg-ink-100 px-1.5 py-0.5 text-2xs font-medium text-ink-600">{r('days.sessions', { n: d.sessions.length })}</span>
                  </td>
                  <td className={cn(td, 'tabular-nums')}>{time(d.firstOpen)}</td>
                  <td className={cn(td, 'tabular-nums')}>{d.anyOpen ? <StatusPill open /> : d.lastClose ? dateTime(d.lastClose) : '—'}</td>
                  <td className={cn(td, 'tabular-nums')}>{hm(d.minutes)}</td>
                  <td className={cn(td, 'text-end tabular-nums')}>{money(d.openingH)}</td>
                  <td className={cn(td, 'text-end tabular-nums')}>{money(d.cashH)}</td>
                  <td className={cn(td, 'text-end tabular-nums')}>{money(d.cardH)}</td>
                  <td className={cn(td, 'text-end font-semibold tabular-nums')}>{money(d.totalH)}</td>
                  <td className={td}><DifferencePill diffH={d.diffH} /></td>
                  <td className={cn(td, 'max-w-[14rem] truncate text-ink-600')} title={d.reasons.join(' · ')}>{d.reasons[0] ?? '—'}{d.reasons.length > 1 ? ` +${d.reasons.length - 1}` : ''}</td>
                  <td className={cn(td, 'max-w-[14rem] truncate text-ink-600')}>{d.openedBy.join(', ')}{d.closedBy.length ? ` → ${d.closedBy.join(', ')}` : ''}</td>
                </tr>
                {expanded && (
                  <tr data-testid="day-detail">
                    <td />
                    <td colSpan={11} className="bg-ink-50/60 px-3 py-3">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-2xs uppercase tracking-wider text-ink-500">
                            <th className="px-2 py-1 text-start">{r('fields.sessionId')}</th>
                            <th className="px-2 py-1 text-start">{r('fields.branch')}</th>
                            <th className="px-2 py-1 text-start">{r('days.openedBy')}</th>
                            <th className="px-2 py-1 text-start">{r('days.closedBy')}</th>
                            <th className="px-2 py-1 text-start">{r('days.duration')}</th>
                            <th className="px-2 py-1 text-end">{r('fields.openingBalance')}</th>
                            <th className="px-2 py-1 text-end">{r('method.cash')}</th>
                            <th className="px-2 py-1 text-end">{r('method.card')}</th>
                            <th className="px-2 py-1 text-end">{r('method.credit')}</th>
                            <th className="px-2 py-1 text-end">{r('fields.expectedCash')}</th>
                            <th className="px-2 py-1 text-end">{r('days.counted')}</th>
                            <th className="px-2 py-1 text-start">{r('fields.difference')}</th>
                            <th className="px-2 py-1 text-start">{r('days.reason')}</th>
                            <th className="px-2 py-1" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ink-200/70">
                          {d.sessions.map((s) => (
                            <tr key={s.id} data-testid="session-subrow" className="align-top">
                              <td className="px-2 py-1.5 font-medium">{s.number}</td>
                              <td className="px-2 py-1.5">{branchName(s.branchId)}</td>
                              <td className="px-2 py-1.5"><div>{s.openedBy}</div><div className="tabular-nums text-ink-500">{dateTime(s.openedAt)}</div></td>
                              <td className="px-2 py-1.5">{s.status === 'open' ? <StatusPill open /> : <><div>{s.closedBy}</div><div className="tabular-nums text-ink-500">{dateTime(s.closedAt)}</div></>}</td>
                              <td className="px-2 py-1.5 tabular-nums">{hoursMinutes(s.openedAt, s.closedAt)}</td>
                              <td className="px-2 py-1.5 text-end tabular-nums">{money(s.openingBalanceH)}</td>
                              <td className="px-2 py-1.5 text-end tabular-nums">{money(methodAmount(s, 'cash'))}</td>
                              <td className="px-2 py-1.5 text-end tabular-nums">{money(methodAmount(s, 'card'))}</td>
                              <td className="px-2 py-1.5 text-end tabular-nums">{money(methodAmount(s, 'credit'))}</td>
                              <td className="px-2 py-1.5 text-end tabular-nums">{money(s.expectedClosingH)}</td>
                              <td className="px-2 py-1.5 text-end tabular-nums">{money(s.actualClosingH)}</td>
                              <td className="px-2 py-1.5"><DifferencePill diffH={s.differenceH} /></td>
                              <td className="max-w-[16rem] px-2 py-1.5 text-ink-700">
                                {s.discrepancyReason ?? '—'}
                                {s.pendingOverride && <div className="text-warning-800">{r('days.pendingNote', { n: s.pendingOverride.count, reason: s.pendingOverride.reason })}</div>}
                              </td>
                              <td className="px-2 py-1.5 text-end">
                                <Link to={`${ROUTES.restaurantHistory}/${s.id}`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-info-700 hover:bg-info-50" onClick={(e) => e.stopPropagation()}>
                                  <FileText className="h-3.5 w-3.5" />{r('days.report')}
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
