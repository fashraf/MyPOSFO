import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, RotateCcw, TrendingUp } from 'lucide-react';
import {
  Button,
  CurrencyDisplay,
  EmptyState,
  ErrorState,
  KpiCard,
  PageHeader,
  RefreshButton,
  Pagination,
  SearchInput,
  SkeletonTable,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
  Select,
} from '@/components/ui';
import { SaleDetail } from '@/features/sales/SaleDetail';
import { OrderStatusBadge } from '@/components/ui/OrderStatusBadge';
import { useKitchenTickets } from '@/hooks/useKitchenTickets';
import { ORDER_STATUSES, orderStatus, type OrderStatus } from '@/lib/orderStatus';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useDisclosure } from '@/hooks/useDisclosure';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { formatDate, formatNumber } from '@/lib/format';
import { ROUTES } from '@/routes/paths';
import { customerService, returnsService, safeCall, salesService } from '@/services';
import { useDataVersion } from '@/services/dataVersion';
import type {
  CreditNote,
  Customer,
  PaymentMethod,
  ReturnReason,
  Sale,
  CancelReasonCode,
} from '@/types/sales';

const PAGE_SIZE = 10;


export default function SalesPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();
  const { activeBranch, can, user } = useSession();
  const actorName = user ? (language === 'ar' ? user.nameAr : user.nameEn) : '—';
  const navigate = useNavigate();

  const detail = useDisclosure();

  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  /* Reloads when a save elsewhere changes what this page shows.
     Search, filters and paging are separate state, so the user keeps
     their place. */
  const dataVersion = useDataVersion('sales');
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '');
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  /* Kitchen progress, so the status here is the same one the kitchen and collection screens show. */
  const tickets = useKitchenTickets();
  const statusOf = useCallback((sale: Sale) => orderStatus(sale, tickets.get(sale.invoiceNumber)), [tickets]);
  const [method, setMethod] = useState<PaymentMethod | 'all'>('all');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  const [selected, setSelected] = useState<Sale | null>(null);
  const [notes, setNotes] = useState<CreditNote[]>([]);
  const [remaining, setRemaining] = useState<Record<string, number>>({});

  const isFiltered = debouncedSearch.trim() !== '' || status !== 'all' || method !== 'all';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [saleResult, customerResult] = await Promise.all([
      safeCall(() => salesService.list({
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch,
        branchId: activeBranch?.id ?? null,
      })),
      safeCall(() => customerService.list()),
    ]);

    if (saleResult.ok) {
      setSales(saleResult.data.items);
      setTotal(saleResult.data.total);
    } else {
      setError(saleResult.error.message);
      setSales([]);
      setTotal(0);
    }

    if (customerResult.ok) setCustomers(customerResult.data);
    setLoading(false);
  }, [page, debouncedSearch, activeBranch]);

  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, method]);

  /* `?open=<saleId>` opens one order straight away (used by the global search). */
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('open');
    if (!id) return;
    void safeCall(() => salesService.get(id)).then((result) => {
      if (result.ok) void openSale(result.data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Status and method are narrowed here rather than in the service because the
     mock list endpoint only supports a text search; the real API will filter
     server-side and this block goes away. */
  const visible = useMemo(
    () =>
      sales.filter((sale) => {
        if (status !== 'all' && statusOf(sale) !== status) return false;
        if (method !== 'all' && !sale.payments.some((payment) => payment.method === method)) {
          return false;
        }
        return true;
      }),
    [sales, status, method, statusOf],
  );

  const summary = useMemo(() => {
    const live = sales.filter((sale) => sale.status !== 'voided');
    const netH = live.reduce((sum, sale) => sum + sale.totalH, 0);
    const returned = sales.filter(
      (sale) => sale.status === 'returned' || sale.status === 'partially_returned',
    ).length;

    return {
      netH,
      invoices: live.length,
      averageH: live.length === 0 ? 0 : Math.round(netH / live.length),
      returned,
    };
  }, [sales]);

  const customerName = (id: string | null) => {
    if (!id) return t('pos.cart.walkIn');
    const customer = customers.find((candidate) => candidate.id === id);
    if (!customer) return '—';
    return language === 'ar' ? customer.nameAr : customer.nameEn;
  };

  async function openSale(sale: Sale) {
    setSelected(sale);
    detail.open();

    const [noteResult, remainingResult] = await Promise.all([
      safeCall(() => returnsService.notesFor(sale.id)),
      safeCall(() => returnsService.remaining(sale.id)),
    ]);

    setNotes(noteResult.ok ? noteResult.data : []);
    setRemaining(remainingResult.ok ? remainingResult.data : {});
  }

  async function handleReturn(input: {
    lines: { saleLineId: string; quantity: number }[];
    reason: ReturnReason;
    note: string;
    refundMethod: PaymentMethod;
  }): Promise<boolean> {
    if (!selected) return false;

    const result = await safeCall(() =>
      returnsService.issue({ ...input, saleId: selected.id, issuedBy: actorName }),
    );

    if (!result.ok) {
      toast.error(t('sales.toast.failed'), result.error.message);
      return false;
    }

    toast.success(t('sales.toast.returned', { note: result.data.noteNumber }));
    await load();

    const refreshed = await safeCall(() => salesService.get(selected.id));
    if (refreshed.ok) setSelected(refreshed.data);

    const [noteResult, remainingResult] = await Promise.all([
      safeCall(() => returnsService.notesFor(selected.id)),
      safeCall(() => returnsService.remaining(selected.id)),
    ]);
    setNotes(noteResult.ok ? noteResult.data : []);
    setRemaining(remainingResult.ok ? remainingResult.data : {});

    return true;
  }

  async function handleVoid(reason: string, code: CancelReasonCode): Promise<boolean> {
    if (!selected) return false;

    const result = await safeCall(() => salesService.voidSale(selected.id, reason, actorName, code));

    if (!result.ok) {
      toast.error(t('sales.toast.failed'), result.error.message);
      return false;
    }

    toast.success(t('sales.toast.voided'));
    setSelected(result.data);
    await load();
    return true;
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('sales.title')} description={t('sales.description')} actions={<RefreshButton onRefresh={load} />} />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard
          compact
          label={t('sales.summary.netSales')}
          value={<CurrencyDisplay amount={summary.netH} />}
          icon={<TrendingUp />}
        />
        <KpiCard
          compact
          label={t('sales.summary.invoices')}
          value={<span className="numeric">{formatNumber(summary.invoices, { language })}</span>}
          icon={<Receipt />}
        />
        <KpiCard
          compact
          label={t('sales.summary.averageSale')}
          value={<CurrencyDisplay amount={summary.averageH} />}
        />
        <KpiCard
          compact
          label={t('sales.summary.returned')}
          value={<span className="numeric">{formatNumber(summary.returned, { language })}</span>}
          icon={<RotateCcw />}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          className="sm:max-w-xs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch('')}
          placeholder={t('sales.filters.searchPlaceholder')}
        />

        <div className="flex flex-1 items-center gap-3">
          <Select
            className="sm:max-w-[12rem]"
            value={status}
            onChange={(value) => setStatus(value as OrderStatus | 'all')}
            options={[
              { value: 'all', label: t('sales.filters.allStatuses') },
              ...ORDER_STATUSES.map((value) => ({ value, label: t(`orderStatus.${value}`) })),
            ]}
          />

          <Select
            className="sm:max-w-[11rem]"
            value={method}
            onChange={(value) => setMethod(value as PaymentMethod | 'all')}
            options={[
              { value: 'all', label: t('sales.filters.allMethods') },
              { value: 'cash', label: t('pos.payment.cash') },
              { value: 'card', label: t('pos.payment.card') },
              { value: 'credit', label: t('pos.payment.credit') },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <SkeletonTable rows={6} columns={6} />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-ink-200 bg-surface">
          <ErrorState description={error} onRetry={() => void load()} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          {/* Phones: one tappable card per invoice instead of an eight-column
              table scrolled sideways. The table returns from 640px. */}
          <ul className="divide-y divide-ink-200 sm:hidden" aria-label={t('sales.title')}>
            {visible.length === 0 ? (
              <li className="px-4 py-10">
                <EmptyState
                  icon={<Receipt />}
                  title={isFiltered ? t('sales.empty.filteredTitle') : t('sales.empty.title')}
                  description={
                    isFiltered ? t('sales.empty.filteredDescription') : t('sales.empty.description')
                  }
                  action={
                    isFiltered ? undefined : (
                      <Button onClick={() => navigate(ROUTES.pos)}>{t('sales.empty.goToPos')}</Button>
                    )
                  }
                />
              </li>
            ) : (
              visible.map((sale) => {
                const itemCount = sale.lines.reduce((sum, line) => sum + line.quantity, 0);
                return (
                  <li key={sale.id}>
                    <button
                      type="button"
                      onClick={() => void openSale(sale)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-start transition-colors active:bg-ink-50"
                    >
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex items-center gap-2">
                          <span className="numeric truncate text-md font-semibold text-ink-900">
                            {sale.invoiceNumber}
                          </span>
                          <OrderStatusBadge status={statusOf(sale)} />
                        </span>
                        <span className="block truncate text-sm text-ink-600">
                          {customerName(sale.customerId)}
                        </span>
                        <span className="block truncate text-xs text-ink-500">
                          {formatDate(sale.soldAt, { language, withTime: true })}
                          {' · '}
                          {t(`pos.payment.${sale.payments[0]?.method ?? 'cash'}`)}
                          {' · '}
                          <span className="numeric">×{formatNumber(itemCount, { language })}</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-end">
                        <CurrencyDisplay amount={sale.totalH} className="block text-md font-semibold text-ink-900" />
                        <span className="block text-2xs text-ink-400">
                          {t('sales.columns.tax')} <CurrencyDisplay amount={sale.taxH} />
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <Table className="max-sm:hidden">
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('sales.columns.invoice')}</TableHeaderCell>
                <TableHeaderCell>{t('sales.columns.date')}</TableHeaderCell>
                <TableHeaderCell>{t('sales.columns.customer')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('sales.columns.items')}</TableHeaderCell>
                <TableHeaderCell>{t('sales.columns.method')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('sales.columns.tax')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('sales.columns.total')}</TableHeaderCell>
                <TableHeaderCell>{t('sales.columns.status')}</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {visible.length === 0 ? (
                <TableEmptyRow colSpan={8}>
                  <EmptyState
                    icon={<Receipt />}
                    title={isFiltered ? t('sales.empty.filteredTitle') : t('sales.empty.title')}
                    description={
                      isFiltered
                        ? t('sales.empty.filteredDescription')
                        : t('sales.empty.description')
                    }
                    action={
                      isFiltered ? undefined : (
                        <Button onClick={() => navigate(ROUTES.pos)}>
                          {t('sales.empty.goToPos')}
                        </Button>
                      )
                    }
                  />
                </TableEmptyRow>
              ) : (
                visible.map((sale) => (
                  <TableRow key={sale.id} interactive onClick={() => void openSale(sale)}>
                    <TableCell className="numeric font-medium text-ink-900">
                      {sale.invoiceNumber}
                    </TableCell>
                    <TableCell className="text-ink-600">
                      {formatDate(sale.soldAt, { language, withTime: true })}
                    </TableCell>
                    <TableCell className="text-ink-600">{customerName(sale.customerId)}</TableCell>
                    <TableCell numeric className="text-ink-600">
                      {formatNumber(
                        sale.lines.reduce((sum, line) => sum + line.quantity, 0),
                        { language },
                      )}
                    </TableCell>
                    <TableCell className="text-ink-600">
                      {t(`pos.payment.${sale.payments[0]?.method ?? 'cash'}`)}
                    </TableCell>
                    <TableCell numeric className="text-ink-500">
                      <CurrencyDisplay amount={sale.taxH} />
                    </TableCell>
                    <TableCell numeric className="font-semibold text-ink-900">
                      <CurrencyDisplay amount={sale.totalH} />
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={statusOf(sale)} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {total > PAGE_SIZE && (
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          )}
        </div>
      )}

      <SaleDetail
        sale={selected}
        open={detail.isOpen}
        onClose={detail.close}
        notes={notes}
        remaining={remaining}
        canReturn={can('sales.return')}
        canVoid={can('sales.void') || can('pos.void_sale')}
        canEdit={can('pos.create_sale') && (can('sales.void') || can('pos.void_sale'))}
        onEdit={() => {
          if (!selected) return;
          detail.close();
          navigate(ROUTES.pos, { state: { editSaleId: selected.id } });
        }}
        onReturn={handleReturn}
        onVoid={handleVoid}
      />
    </div>
  );
}
