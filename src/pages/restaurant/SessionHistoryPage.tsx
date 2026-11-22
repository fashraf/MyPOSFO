import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTools, DatePicker, Tabs, LoadingState, PageHeader, SearchInput, Select, Table, TableBody, TableCell, TableEmptyRow, TableHead, TableHeaderCell, TableRow } from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { cn } from '@/lib/cn';
import { ROUTES } from '@/routes/paths';
import { restaurantSessionService, safeCall, type HistoryFilter } from '@/services';
import type { RestaurantSession } from '@/types/restaurantSession';
import { DayHistoryGrid } from '@/features/restaurant/DayHistoryGrid';
import { DifferencePill, durationText, NoPermission, Panel, RestaurantTabs, StatusPill, useRs } from '@/features/restaurant/shared';

export default function SessionHistoryPage() {
  const { r, money, dateTime, longDate } = useRs();
  const { can, branches, activeBranch } = useSession();
  const navigate = useNavigate();

  const [rows, setRows] = useState<RestaurantSession[] | null>(null);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [branchId, setBranchId] = useState(activeBranch?.id ?? '');
  const [status, setStatus] = useState<HistoryFilter['status']>('all');
  const [difference, setDifference] = useState<HistoryFilter['difference']>('all');
  const [user, setUser] = useState('');
  const [view, setView] = useState<'days' | 'sessions'>('days');

  const allowed = can('restaurant.session.view_history') || can('restaurant.session.view_reports');

  useEffect(() => {
    if (!allowed) return;
    setRows(null);
    const handle = setTimeout(() => {
      safeCall(() => restaurantSessionService.history({ branchId: branchId || null, from, to, status, difference, user, search })).then(
        (res) => setRows(res.ok ? res.data : []),
      );
    }, 150);
    return () => clearTimeout(handle);
  }, [allowed, branchId, from, to, status, difference, user, search]);

  const branchName = (id: string) => {
    const b = branches.find((x) => x.id === id);
    return b ? b.nameEn || b.nameAr : id;
  };

  const totals = useMemo(() => {
    const list = rows ?? [];
    return {
      sales: list.reduce((a, s) => a + (s.summary?.totalH ?? 0), 0),
      short: list.filter((s) => (s.differenceH ?? 0) < 0).reduce((a, s) => a + (s.differenceH ?? 0), 0),
      over: list.filter((s) => (s.differenceH ?? 0) > 0).reduce((a, s) => a + (s.differenceH ?? 0), 0),
    };
  }, [rows]);

  const exportColumns = ['Session', 'Business date', 'Branch', 'Opened', 'Closed', 'Opening', 'Expected', 'Actual', 'Difference', 'Total sales', 'Opened by', 'Closed by', 'Status'];
  const exportRows = (rows ?? []).map((s) => ({
    Session: s.number,
    'Business date': s.businessDate,
    Branch: branchName(s.branchId),
    Opened: s.openedAt,
    Closed: s.closedAt ?? '',
    Opening: (s.openingBalanceH / 100).toFixed(2),
    Expected: s.expectedClosingH !== undefined ? (s.expectedClosingH / 100).toFixed(2) : '',
    Actual: s.actualClosingH !== undefined ? (s.actualClosingH / 100).toFixed(2) : '',
    Difference: s.differenceH !== undefined ? (s.differenceH / 100).toFixed(2) : '',
    'Total sales': s.summary ? (s.summary.totalH / 100).toFixed(2) : '',
    'Opened by': s.openedBy,
    'Closed by': s.closedBy ?? '',
    Status: s.status,
  }));

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={r('nav.group')} title={r('history.title')} description={r('history.description')} />
      <RestaurantTabs />
      {!allowed ? (
        <NoPermission what={r('perm.history')} />
      ) : (
        <>
          <Panel>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={r('history.search')} />
              <DatePicker value={from} onChange={setFrom} max={to || undefined} aria-label={r('history.from')} />
              <DatePicker value={to} onChange={setTo} min={from || undefined} aria-label={r('history.to')} />
              <Select
                value={branchId}
                onChange={setBranchId}
                isClearable
                placeholder={r('history.allBranches')}
                options={branches.map((b) => ({ value: b.id, label: b.nameEn || b.nameAr }))}
              />
              <Select
                value={status ?? 'all'}
                onChange={(v) => setStatus((v || 'all') as HistoryFilter['status'])}
                options={[
                  { value: 'all', label: r('history.anyStatus') },
                  { value: 'open', label: r('status.open') },
                  { value: 'closed', label: r('status.closed') },
                ]}
              />
              <Select
                value={difference ?? 'all'}
                onChange={(v) => setDifference((v || 'all') as HistoryFilter['difference'])}
                options={[
                  { value: 'all', label: r('history.anyDifference') },
                  { value: 'shortage', label: r('diff.shortage') },
                  { value: 'surplus', label: r('diff.surplus') },
                  { value: 'balanced', label: r('diff.balanced') },
                ]}
              />
              <SearchInput value={user} onChange={(e) => setUser(e.target.value)} placeholder={r('history.user')} />
            </div>
          </Panel>

          {rows && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Panel><div className="text-xs text-ink-500">{r('history.totalSales', { n: rows.length })}</div><div className="text-lg font-semibold tabular-nums">{money(totals.sales)}</div></Panel>
              <Panel><div className="text-xs text-ink-500">{r('history.shortages')}</div><div className="text-lg font-semibold tabular-nums text-danger-700">{money(totals.short)}</div></Panel>
              <Panel><div className="text-xs text-ink-500">{r('history.surpluses')}</div><div className="text-lg font-semibold tabular-nums text-warning-700">{money(totals.over)}</div></Panel>
            </div>
          )}

          <Panel
            title={
              <Tabs
                variant="pill"
                value={view}
                onChange={(v) => setView(v as 'days' | 'sessions')}
                items={[
                  { value: 'days', label: r('days.byDay') },
                  { value: 'sessions', label: r('days.allSessions'), count: rows?.length },
                ]}
              />
            }
            action={<DataTools rows={exportRows} columns={exportColumns} filename="restaurant-sessions" />}
          >
            {!rows ? (
              <LoadingState />
            ) : view === 'days' ? (
              <DayHistoryGrid rows={rows} branchName={branchName} />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>{r('fields.sessionId')}</TableHeaderCell>
                      <TableHeaderCell>{r('fields.businessDate')}</TableHeaderCell>
                      <TableHeaderCell>{r('fields.branch')}</TableHeaderCell>
                      <TableHeaderCell>{r('fields.openedAt')}</TableHeaderCell>
                      <TableHeaderCell>{r('fields.closedAt')}</TableHeaderCell>
                      <TableHeaderCell>{r('fields.duration')}</TableHeaderCell>
                      <TableHeaderCell className="text-end">{r('fields.openingBalance')}</TableHeaderCell>
                      <TableHeaderCell className="text-end">{r('fields.expectedCash')}</TableHeaderCell>
                      <TableHeaderCell className="text-end">{r('fields.actualClosing')}</TableHeaderCell>
                      <TableHeaderCell>{r('fields.difference')}</TableHeaderCell>
                      <TableHeaderCell className="text-end">{r('fields.totalSales')}</TableHeaderCell>
                      <TableHeaderCell>{r('fields.openedBy')}</TableHeaderCell>
                      <TableHeaderCell>{r('fields.closedBy')}</TableHeaderCell>
                      <TableHeaderCell>{r('cols.status')}</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.length === 0 && <TableEmptyRow colSpan={14}>{r('history.empty')}</TableEmptyRow>}
                    {rows.map((s) => (
                      <TableRow
                        key={s.id}
                        data-testid="history-row"
                        className={cn('cursor-pointer hover:bg-ink-50', s.status === 'open' && 'bg-success-50/40')}
                        onClick={() => navigate(`${ROUTES.restaurantHistory}/${s.id}`)}
                      >
                        <TableCell className="font-medium">{s.number}</TableCell>
                        <TableCell className="whitespace-nowrap">{longDate(s.businessDate, true)}</TableCell>
                        <TableCell className="whitespace-nowrap">{branchName(s.branchId)}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{dateTime(s.openedAt)}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{dateTime(s.closedAt)}</TableCell>
                        <TableCell className="whitespace-nowrap">{durationText(s.openedAt, s.closedAt, r)}</TableCell>
                        <TableCell className="text-end tabular-nums">{money(s.openingBalanceH)}</TableCell>
                        <TableCell className="text-end tabular-nums">{money(s.expectedClosingH)}</TableCell>
                        <TableCell className="text-end tabular-nums">{money(s.actualClosingH)}</TableCell>
                        <TableCell><DifferencePill diffH={s.differenceH} /></TableCell>
                        <TableCell className="text-end tabular-nums">{money(s.summary?.totalH)}</TableCell>
                        <TableCell className="whitespace-nowrap">{s.openedBy}</TableCell>
                        <TableCell className="whitespace-nowrap">{s.closedBy ?? '—'}</TableCell>
                        <TableCell><StatusPill open={s.status === 'open'} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
