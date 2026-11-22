import { useMemo, useState } from 'react';
import { SearchInput, Table, TableBody, TableCell, TableEmptyRow, TableHead, TableHeaderCell, TableRow } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { CashMovement, RestaurantSession, SessionAuditEntry, SessionSummary } from '@/types/restaurantSession';
import { durationText, Figure, Panel, StatusPill, useRs } from './shared';

export function SessionInfo({ session }: { session: RestaurantSession }) {
  const { r, money, dateTime, longDate } = useRs();
  return (
    <Panel title={r('blocks.info')} action={<StatusPill open={session.status === 'open'} />} testId="session-info">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Figure label={r('fields.sessionId')} value={session.number} />
        <Figure label={r('fields.businessDate')} value={longDate(session.businessDate, true)} />
        <Figure label={r('fields.openedBy')} value={session.openedBy} />
        <Figure label={r('fields.openedAt')} value={dateTime(session.openedAt)} />
        <Figure label={session.status === 'open' ? r('fields.openFor') : r('fields.duration')} value={durationText(session.openedAt, session.closedAt, r)} />
        <Figure label={r('fields.openingBalance')} value={money(session.openingBalanceH)} />
      </div>
    </Panel>
  );
}

export function SalesSummaryBlock({ summary, title }: { summary: SessionSummary; title?: string }) {
  const { r, money } = useRs();
  return (
    <Panel title={title ?? r('blocks.sales')} testId="sales-summary">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <Figure label={r('fields.orders')} value={summary.orders} testId="sum-orders" />
        <Figure label={r('fields.completed')} value={summary.completed} testId="sum-completed" />
        <Figure label={r('fields.cancelled')} value={summary.cancelled} testId="sum-cancelled" />
        <Figure label={r('fields.refunded')} value={summary.refunded} />
        <Figure label={r('fields.pendingOrders')} value={summary.pendingOrders} tone={summary.pendingOrders > 0 ? 'warning' : undefined} />
        <Figure label={r('fields.avgOrder')} value={money(summary.completed ? Math.round(summary.totalH / summary.completed) : 0)} />
        <Figure label={r('fields.gross')} value={money(summary.grossH)} testId="sum-gross" />
        <Figure label={r('fields.discounts')} value={money(summary.discountsH)} />
        <Figure label={r('fields.net')} value={money(summary.netH)} testId="sum-net" />
        <Figure label={r('fields.vat')} value={money(summary.vatH)} testId="sum-vat" />
        <Figure label={r('fields.totalSales')} value={money(summary.totalH)} testId="sum-total" />
        <Figure label={r('fields.received')} value={money(summary.collectedH)} hint={r('blocks.receivedHint')} />
      </div>
    </Panel>
  );
}

export function PaymentTable({ summary, title }: { summary: SessionSummary; title?: string }) {
  const { r, money } = useRs();
  const totals = summary.byMethod.reduce(
    (acc, m) => ({ count: acc.count + m.count, amountH: acc.amountH + m.amountH, refundsH: acc.refundsH + m.refundsH, netH: acc.netH + m.netH }),
    { count: 0, amountH: 0, refundsH: 0, netH: 0 },
  );
  return (
    <Panel title={title ?? r('blocks.payments')} testId="payment-table">
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>{r('cols.method')}</TableHeaderCell>
            <TableHeaderCell className="text-end">{r('cols.transactions')}</TableHeaderCell>
            <TableHeaderCell className="text-end">{r('cols.amount')}</TableHeaderCell>
            <TableHeaderCell className="text-end">{r('cols.refunds')}</TableHeaderCell>
            <TableHeaderCell className="text-end">{r('cols.net')}</TableHeaderCell>
            <TableHeaderCell>{r('cols.drawer')}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {summary.byMethod.map((m) => (
            <TableRow key={m.method} data-testid={`method-${m.method}`}>
              <TableCell className="font-medium">{r(`method.${m.method}`)}</TableCell>
              <TableCell className="text-end tabular-nums">{m.count}</TableCell>
              <TableCell className="text-end tabular-nums" data-testid={`method-${m.method}-amount`}>{money(m.amountH)}</TableCell>
              <TableCell className="text-end tabular-nums text-danger-700">{m.refundsH ? `−${money(m.refundsH)}` : '—'}</TableCell>
              <TableCell className="text-end font-semibold tabular-nums">{money(m.netH)}</TableCell>
              <TableCell className="text-xs text-ink-500">{m.affectsDrawer ? r('blocks.inDrawer') : r('blocks.notInDrawer')}</TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-ink-50 font-semibold">
            <TableCell>{r('cols.total')}</TableCell>
            <TableCell className="text-end tabular-nums">{totals.count}</TableCell>
            <TableCell className="text-end tabular-nums" data-testid="methods-total">{money(totals.amountH)}</TableCell>
            <TableCell className="text-end tabular-nums text-danger-700">{totals.refundsH ? `−${money(totals.refundsH)}` : '—'}</TableCell>
            <TableCell className="text-end tabular-nums">{money(totals.netH)}</TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
      <p className="mt-2 text-xs text-ink-500">{r('blocks.splitNote')}</p>
    </Panel>
  );
}

/** The cash formula, one line per term, so a manager can follow the arithmetic. */
export function CashFormula({ summary, title }: { summary: SessionSummary; title?: string }) {
  const { r, money } = useRs();
  const c = summary.cash;
  const rows: { key: string; sign: '' | '+' | '−'; value: number; testId: string }[] = [
    { key: 'cash.opening', sign: '', value: c.openingH, testId: 'cash-opening' },
    { key: 'cash.sales', sign: '+', value: c.salesH, testId: 'cash-sales' },
    { key: 'cash.additions', sign: '+', value: c.additionsH, testId: 'cash-additions' },
    { key: 'cash.refunds', sign: '−', value: c.refundsH, testId: 'cash-refunds' },
    { key: 'cash.expenses', sign: '−', value: c.expensesH, testId: 'cash-expenses' },
    { key: 'cash.withdrawals', sign: '−', value: c.withdrawalsH, testId: 'cash-withdrawals' },
    { key: 'cash.transfers', sign: '−', value: c.transfersH, testId: 'cash-transfers' },
  ];
  return (
    <Panel title={title ?? r('blocks.cash')} testId="cash-formula">
      <dl className="divide-y divide-ink-100 text-sm">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between py-1.5">
            <dt className="text-ink-600">{r(row.key)}</dt>
            <dd className={cn('tabular-nums', row.sign === '−' && row.value > 0 && 'text-danger-700', row.sign === '+' && row.value > 0 && 'text-success-700')} data-testid={row.testId}>
              {row.sign && row.value > 0 ? `${row.sign} ` : ''}{money(row.value)}
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between pt-2 text-base font-semibold">
          <dt>{r('fields.expectedCash')}</dt>
          <dd className="tabular-nums" data-testid="formula-expected">{money(c.expectedH)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-ink-500">{r('formula.full')}</p>
    </Panel>
  );
}

export function TransactionsTable({ summary, limit = 50 }: { summary: SessionSummary; limit?: number }) {
  const { r, money, time } = useRs();
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return summary.transactions.filter(
      (t) => !needle || t.invoiceNumber.toLowerCase().includes(needle) || t.cashier.toLowerCase().includes(needle),
    );
  }, [q, summary.transactions]);
  return (
    <Panel
      title={r('blocks.transactions', { n: summary.transactions.length })}
      action={<SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={r('blocks.searchTx')} className="w-56" />}
      testId="transactions"
    >
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>{r('cols.order')}</TableHeaderCell>
            <TableHeaderCell>{r('cols.time')}</TableHeaderCell>
            <TableHeaderCell>{r('cols.payment')}</TableHeaderCell>
            <TableHeaderCell className="text-end">{r('cols.amount')}</TableHeaderCell>
            <TableHeaderCell className="text-end">{r('cols.vat')}</TableHeaderCell>
            <TableHeaderCell>{r('cols.status')}</TableHeaderCell>
            <TableHeaderCell>{r('cols.cashier')}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 && <TableEmptyRow colSpan={7}>{r('blocks.noTx')}</TableEmptyRow>}
          {rows.slice(0, limit).map((t) => (
            <TableRow key={t.saleId}>
              <TableCell className="font-medium">{t.invoiceNumber}</TableCell>
              <TableCell className="tabular-nums">{time(t.at)}</TableCell>
              <TableCell>{t.methods.map((m) => r(`method.${m}`)).join(' + ')}</TableCell>
              <TableCell className={cn('text-end tabular-nums', t.status === 'voided' && 'text-ink-400 line-through')}>{money(t.totalH)}</TableCell>
              <TableCell className="text-end tabular-nums text-ink-500">{money(t.taxH)}</TableCell>
              <TableCell>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium',
                  t.status === 'completed' && 'bg-success-50 text-success-700',
                  t.status === 'voided' && 'bg-ink-100 text-ink-500',
                  (t.status === 'returned' || t.status === 'partially_returned') && 'bg-warning-50 text-warning-800')}
                >{r(`txStatus.${t.status}`)}</span>
              </TableCell>
              <TableCell className="text-ink-600">{t.cashier}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > limit && <p className="mt-2 text-xs text-ink-500">{r('blocks.moreTx', { n: rows.length - limit })}</p>}
    </Panel>
  );
}

export function MovementsList({ movements }: { movements: CashMovement[] }) {
  const { r, money, dateTime } = useRs();
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>{r('cols.time')}</TableHeaderCell>
          <TableHeaderCell>{r('cols.type')}</TableHeaderCell>
          <TableHeaderCell>{r('cols.description')}</TableHeaderCell>
          <TableHeaderCell className="text-end">{r('cols.amount')}</TableHeaderCell>
          <TableHeaderCell>{r('cols.by')}</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {movements.length === 0 && <TableEmptyRow colSpan={5}>{r('cashPage.none')}</TableEmptyRow>}
        {movements.map((m) => (
          <TableRow key={m.id}>
            <TableCell className="tabular-nums">{dateTime(m.createdAt)}</TableCell>
            <TableCell>{r(`movement.${m.type}`)}</TableCell>
            <TableCell>{m.description}</TableCell>
            <TableCell className={cn('text-end tabular-nums', m.type === 'addition' ? 'text-success-700' : 'text-danger-700')}>
              {m.type === 'addition' ? '+' : '−'} {money(m.amountH)}
            </TableCell>
            <TableCell className="text-ink-600">{m.createdBy}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function AuditTrail({ entries }: { entries: SessionAuditEntry[] }) {
  const { r, dateTime } = useRs();
  return (
    <ol className="space-y-2" data-testid="audit-trail">
      {entries.length === 0 && <li className="text-sm text-ink-500">—</li>}
      {entries.map((e) => (
        <li key={e.id} className="flex gap-3 text-sm">
          <span className="w-28 shrink-0 tabular-nums text-ink-500">{dateTime(e.at)}</span>
          <span className="w-36 shrink-0 font-medium">{r(`auditAction.${e.action}`)}</span>
          <span className="min-w-0 flex-1 text-ink-700">{e.description}</span>
          <span className="shrink-0 text-ink-500">{e.userName}</span>
        </li>
      ))}
    </ol>
  );
}
