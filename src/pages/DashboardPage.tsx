import { CREDIT_SALES } from '@/config/features';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Banknote, CircleDollarSign, CreditCard, PackageOpen, Percent, Receipt, ShoppingBag, TrendingUp, Users, Wallet, Download } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Alert,
  Badge,
  Button,
  ChartCard,
  CurrencyDisplay,
  EmptyState,
  InfoHint,
  KpiCard,
  PageHeader,
  RefreshButton,
  SkeletonCards,
  Tabs, toCsv } from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { StaffDocumentsAlert } from '@/features/access/StaffFile';
import { TodayPanel } from '@/features/dashboard/TodayPanel';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { ROUTES } from '@/routes/paths';
import { catalogService, customerService, safeCall, salesService } from '@/services';
import type { Product } from '@/types/catalog';
import type { Sale } from '@/types/sales';

type Period = 'today' | 'week' | 'month';

const PERIOD_DAYS: Record<Period, number> = { today: 1, week: 7, month: 30 };

const METHOD_COLOURS: Record<string, string> = {
  cash: '#18181B',
  card: '#71717A',
  credit: '#A1A1AA',
};

/**
 * What the dashboard renders.
 *
 * Derived from the service rather than restated. A hand-written copy drifts the
 * moment the service gains a field — which is how three charts came to reference
 * data this type said did not exist.
 */
type Analytics = Awaited<ReturnType<typeof salesService.analytics>>;

/** Signed change ratio, or undefined when there is no baseline to compare to. */
function changeRatio(current: number, previous: number): number | undefined {
  if (previous === 0) return undefined;
  return (current - previous) / previous;
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { activeBranch, user } = useSession();
  const firstName = user ? (language === 'ar' ? user.nameAr.split(' ')[0] : user.firstName) : '';
  const hour = new Date().getHours();
  const greetingKey = hour < 12 ? 'dashboard.greeting.morning' : hour < 17 ? 'dashboard.greeting.afternoon' : 'dashboard.greeting.evening';
  const navigate = useNavigate();

  const [period, setPeriod] = useState<Period>('week');
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [recent, setRecent] = useState<Sale[]>([]);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [receivables, setReceivables] = useState({ outstandingH: 0, overLimit: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const [analyticsResult, recentResult, lowStockResult, receivablesResult] = await Promise.all([
      safeCall(() => salesService.analytics(PERIOD_DAYS[period], activeBranch?.id ?? null)),
      safeCall(() => salesService.recent(5, activeBranch?.id ?? null)),
      safeCall(() => catalogService.lowStock(5)),
      safeCall(() => customerService.receivablesSummary()),
    ]);

    if (analyticsResult.ok) setAnalytics(analyticsResult.data);
    if (recentResult.ok) setRecent(recentResult.data);
    if (lowStockResult.ok) setLowStock(lowStockResult.data);
    if (receivablesResult.ok) {
      setReceivables({
        outstandingH: receivablesResult.data.outstandingH,
        overLimit: receivablesResult.data.overLimit,
      });
    }

    setLoading(false);
  }, [period, activeBranch]);

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const hasSales = (analytics?.transactions ?? 0) > 0;

  /* One line summarising what, if anything, wants attention. Reading it should
     be enough to know whether the rest of the page needs a look. */
  const insight = useMemo(() => {
    if (lowStock.length > 0) {
      return {
        tone: 'warning' as const,
        text: t('dashboard.insight.lowStockCount', { count: lowStock.length }),
      };
    }
    if (receivables.overLimit > 0) {
      return {
        tone: 'warning' as const,
        text: t('dashboard.insight.overLimitCount', { count: receivables.overLimit }),
      };
    }
    if (!hasSales) {
      return { tone: 'tip' as const, text: t('dashboard.insight.noSalesToday') };
    }
    return { tone: 'success' as const, text: t('dashboard.insight.allGood') };
  }, [lowStock.length, receivables.overLimit, hasSales, t]);

  const chartData = useMemo(
    () =>
      (analytics?.daily ?? []).map((entry) => ({
        label: new Date(entry.date).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-GB', {
          day: '2-digit',
          month: 'short',
          numberingSystem: 'latn',
        }),
        value: entry.salesH / 100,
      })),
    [analytics, language],
  );

  const methodData = useMemo(
    () =>
      (analytics?.byMethod ?? []).map((entry) => ({
        name: t(`pos.payment.${entry.method as 'cash' | 'card' | 'credit'}`),
        value: entry.amountH / 100,
        method: entry.method,
      })),
    [analytics, t],
  );

  /* Daily takings as the KPI sparkline — the reference's bar glyph. */
  const spark = (analytics?.daily ?? []).map((entry) => entry.salesH);

  function downloadReport() {
    const rows = (analytics?.daily ?? []).map((entry) => ({ date: entry.date, sales_sar: (entry.salesH / 100).toFixed(2) }));
    const csv = toCsv(rows, ['date', 'sales_sar']);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sales-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading && !analytics) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('dashboard.title')} description={t('dashboard.description')} />
        <SkeletonCards />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={firstName ? t(greetingKey, { name: firstName }) : t('dashboard.title')}
        description={t('dashboard.greeting.subtitle')}
        actions={
          <div className="flex w-full items-center gap-2 sm:w-auto">
          <RefreshButton onRefresh={load} />
          <Tabs
            className="min-w-0 flex-1 sm:flex-none"
            variant="pill"
            value={period}
            onChange={(value) => setPeriod(value as Period)}
            aria-label={t('dashboard.title')}
            items={[
              { value: 'today', label: t('dashboard.period.today') },
              { value: 'week', label: t('dashboard.period.week') },
              { value: 'month', label: t('dashboard.period.month') },
            ]}
          />
          <Button onClick={downloadReport} leadingIcon={<Download />} disabled={!hasSales} aria-label={t('dashboard.download')} className="shrink-0">
            <span className="hidden sm:inline">{t('dashboard.download')}</span>
          </Button>
          </div>
        }
      />

      <TodayPanel />

      <Alert tone={insight.tone} compact>
        {insight.text}
      </Alert>

      <StaffDocumentsAlert />

      {/* KPIs. Each carries a tooltip explaining exactly what it counts, because
          "gross profit" means different things to different people. */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('dashboard.kpi.sales')}
              <InfoHint content={t('dashboard.kpi.salesHelp')} />
            </span>
          }
          value={<CurrencyDisplay amount={analytics?.salesH ?? 0} />}
          change={changeRatio(analytics?.salesH ?? 0, analytics?.previous.salesH ?? 0)}
          changeLabel={t('dashboard.kpi.vsPrevious')}
          spark={spark}
          icon={<CircleDollarSign />}
        />

        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('dashboard.kpi.transactions')}
              <InfoHint content={t('dashboard.kpi.transactionsHelp')} />
            </span>
          }
          value={
            <span className="numeric">{formatNumber(analytics?.transactions ?? 0, { language })}</span>
          }
          change={changeRatio(analytics?.transactions ?? 0, analytics?.previous.transactions ?? 0)}
          changeLabel={t('dashboard.kpi.vsPrevious')}
          spark={spark.map((value, index) => (value * (index % 3 === 0 ? 0.9 : 1.05)) | 0)}
          icon={<Receipt />}
        />

        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('dashboard.kpi.average')}
              <InfoHint content={t('dashboard.kpi.averageHelp')} />
            </span>
          }
          value={<CurrencyDisplay amount={analytics?.averageH ?? 0} />}
          change={changeRatio(analytics?.averageH ?? 0, analytics?.previous.averageH ?? 0)}
          changeLabel={t('dashboard.kpi.vsPrevious')}
          icon={<ShoppingBag />}
        />

        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('dashboard.kpi.grossProfit')}
              <InfoHint content={t('dashboard.kpi.grossProfitHelp')} />
            </span>
          }
          value={<CurrencyDisplay amount={analytics?.grossProfitH ?? 0} />}
          change={changeRatio(analytics?.grossProfitH ?? 0, analytics?.previous.grossProfitH ?? 0)}
          changeLabel={t('dashboard.kpi.vsPrevious')}
          icon={<TrendingUp />}
        />
      </div>

      {/*
        Money that is not yet money.

        Turnover counts a credit sale and a card payment the moment they happen,
        but neither is in the account. Kept apart from the takings above so the
        two are never read as the same thing — an owner looking at a healthy
        sales figure can still be short of cash this week.
      */}
      <div className={cn("grid grid-cols-2 gap-2 sm:gap-4", CREDIT_SALES ? "lg:grid-cols-4" : "lg:grid-cols-2")}>
        {/* Customer credit is switched off (config/features.ts). */}
        {CREDIT_SALES && (
        <>
        <KpiCard
          onClick={() => navigate(ROUTES.customers)}
          label={t('dashboard.money.owed')}
          value={formatCurrency(
            (analytics?.receivables ?? []).reduce((sum, b) => sum + b.amountH, 0),
            { language },
          )}
          hint={t('dashboard.money.accounts', { count: (analytics?.receivables ?? []).reduce((n, b) => n + b.customers, 0) })}
          icon={<Users />}
        />

        <KpiCard
          /* The tile that needs a decision leads to where the decision is made.
             Showing a number with nowhere to go is how it stays unactioned. */
          onClick={() => navigate(`${ROUTES.customers}?filter=overdue`)}
          label={t('dashboard.money.overdue')}
          value={formatCurrency(
            (analytics?.receivables ?? []).find((b) => b.bucket === 'Over 90 days')?.amountH ?? 0,
            { language },
          )}
          /* Surfaced on its own because it is the figure that needs a decision,
             and inside a total it never gets one. */
          hint={t('dashboard.money.overdueHint')}
          icon={<AlertTriangle />}
        />

        </>
        )}

        <KpiCard
          onClick={() => navigate(ROUTES.finance)}
          label={t('dashboard.money.cardWaiting')}
          value={formatCurrency(analytics?.cardPosition.pendingH ?? 0, { language })}
          hint={t('dashboard.money.cardWaitingHint')}
          icon={<CreditCard />}
        />

        <KpiCard
          label={t('dashboard.money.cardFees')}
          value={formatCurrency(analytics?.cardPosition.feesH ?? 0, { language })}
          hint={t('dashboard.money.cardFeesHint')}
          icon={<Percent />}
        />
      </div>

      {!hasSales ? (
        <div className="rounded-lg border border-dashed border-ink-300 bg-surface">
          <EmptyState
            icon={<Banknote />}
            title={t('dashboard.empty.title')}
            description={t('dashboard.empty.description')}
            action={
              <Button onClick={() => navigate(ROUTES.pos)}>{t('dashboard.empty.action')}</Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard
              className="lg:col-span-2"
              title={
                <span className="flex items-center gap-1.5">
                  {t('dashboard.charts.trend')}
                  <InfoHint content={t('dashboard.charts.trendHelp')} />
                </span>
              }
              description={t('dashboard.charts.trendHelp')}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#71717A' }}
                    axisLine={{ stroke: '#E7E7E9' }}
                    tickLine={false}
                    reversed={language === 'ar'}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#71717A' }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                    orientation={language === 'ar' ? 'right' : 'left'}
                  />
                  <RechartsTooltip
                    cursor={{ fill: '#F4F4F5' }}
                    formatter={(value: number) => formatCurrency(value, { language, fromMinorUnits: false })}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #E7E7E9',
                      fontSize: 12,
                      boxShadow: '0 6px 16px -4px rgb(20 24 29 / 0.09)',
                    }}
                  />
                  <Bar dataKey="value" fill="#18181B" radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title={
                <span className="flex items-center gap-1.5">
                  {t('dashboard.charts.byMethod')}
                  <InfoHint content={t('dashboard.charts.byMethodHelp')} />
                </span>
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={methodData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {methodData.map((entry) => (
                      <Cell key={entry.method} fill={METHOD_COLOURS[entry.method] ?? '#D4D4D8'} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: number) => formatCurrency(value, { language, fromMinorUnits: false })}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #E7E7E9',
                      fontSize: 12,
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value: string) => (
                      <span style={{ fontSize: 12, color: '#52525B' }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Four more, each answering a question the two above cannot. */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="When the shop is busy"
              description="Transactions by hour, across the period. Staffing and opening hours are decided on this — a daily total cannot answer it."
              height={260}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics?.byHour ?? []}>
                  <XAxis
                    dataKey="hour"
                    tickFormatter={(h: number) => `${String(h).padStart(2, '0')}:00`}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <RechartsTooltip
                    formatter={(value: number, name: string) =>
                      name === 'salesH'
                        ? [formatCurrency(value, { language }), 'Sales']
                        : [value, 'Transactions']}
                    labelFormatter={(h: number) => `${String(h).padStart(2, '0')}:00`}
                  />
                  <Bar dataKey="transactions" fill="#18181B" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Margin by category"
              description="Revenue beside the margin it actually produced. A category can carry the turnover and still lose money."
              height={260}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics?.byCategory ?? []} layout="vertical">
                  <XAxis
                    type="number"
                    tickFormatter={(v: number) => formatCurrency(v, { language, withSymbol: false })}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={110}
                    tick={{ fontSize: 11 }}
                  />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(value, { language }),
                      name === 'revenueH' ? 'Revenue' : 'Margin',
                    ]}
                  />
                  <Legend
                    formatter={(value: string) => (
                      <span style={{ fontSize: 12, color: '#52525B' }}>
                        {value === 'revenueH' ? 'Revenue' : 'Margin'}
                      </span>
                    )}
                  />
                  <Bar dataKey="revenueH" fill="#D4D4D8" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="marginH" fill="#18181B" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Where the money went"
              description="Expenses from the ledger. Profit measured from sales alone is turnover wearing a better name."
              height={260}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics?.expenses ?? []} layout="vertical">
                  <XAxis
                    type="number"
                    tickFormatter={(v: number) => formatCurrency(v, { language, withSymbol: false })}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis type="category" dataKey="category" width={110} tick={{ fontSize: 11 }} />
                  <RechartsTooltip
                    formatter={(value: number) => [formatCurrency(value, { language }), 'Spent']}
                  />
                  <Bar dataKey="amountH" fill="#71717A" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {CREDIT_SALES && (
            <ChartCard
              title="Money owed, by age"
              description="Unpaid credit sales grouped by how long they have been outstanding. A single total hides the four-month debt behind yesterday's."
              height={260}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics?.receivables ?? []}>
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(v: number) => formatCurrency(v, { language, withSymbol: false })}
                    tick={{ fontSize: 11 }}
                  />
                  <RechartsTooltip
                    formatter={(value: number, _n: string, entry: { payload?: { customers?: number } }) => [
                      `${formatCurrency(value, { language })} · ${entry.payload?.customers ?? 0} customers`,
                      'Outstanding',
                    ]}
                  />
                  <Bar dataKey="amountH" radius={[3, 3, 0, 0]}>
                    {(analytics?.receivables ?? []).map((bucket) => (
                      /* Older money is redder. The colour carries the urgency
                         so the shape does not have to be read twice. */
                      <Cell
                        key={bucket.bucket}
                        fill={
                          bucket.bucket === 'Current' ? '#18181B'
                            : bucket.bucket === '31-60 days' ? '#A1A1AA'
                              : bucket.bucket === '61-90 days' ? '#52525B'
                                : '#D92D20'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            )}

            <ChartCard
              title="Card money, settled and waiting"
              description="Card takings are not in the account until the bank settles. What is still with them, and what the fees have taken."
              height={260}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { stage: 'Taken', amountH: analytics?.cardPosition.takenH ?? 0 },
                    { stage: 'Settled', amountH: analytics?.cardPosition.settledH ?? 0 },
                    { stage: 'Fees', amountH: analytics?.cardPosition.feesH ?? 0 },
                    { stage: 'Waiting', amountH: analytics?.cardPosition.pendingH ?? 0 },
                  ]}
                >
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(v: number) => formatCurrency(v, { language, withSymbol: false })}
                    tick={{ fontSize: 11 }}
                  />
                  <RechartsTooltip
                    formatter={(value: number) => [formatCurrency(value, { language }), 'Amount']}
                  />
                  <Bar dataKey="amountH" radius={[3, 3, 0, 0]}>
                    <Cell fill="#D4D4D8" />
                    <Cell fill="#18181B" />
                    <Cell fill="#71717A" />
                    <Cell fill="#3F3F46" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Recent sales */}
            <section className="rounded-lg border border-ink-200 bg-surface lg:col-span-2">
              <header className="flex items-center justify-between border-b border-ink-200 px-5 py-3.5">
                <h2 className="text-md font-semibold text-ink-900">
                  {t('dashboard.lists.recentSales')}
                </h2>
                <Link
                  to={ROUTES.sales}
                  className="flex items-center gap-1 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
                >
                  {t('dashboard.lists.viewAll')}
                  <ArrowRight aria-hidden className="h-3.5 w-3.5 flip-rtl" />
                </Link>
              </header>

              {recent.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon={<Receipt />}
                  title={t('dashboard.lists.noSales')}
                  description={t('dashboard.lists.noSalesHint')}
                />
              ) : (
                <ul className="divide-y divide-ink-200">
                  {recent.map((sale) => (
                    <li key={sale.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="numeric truncate text-base font-medium text-ink-900">
                          {sale.invoiceNumber}
                        </p>
                        <p className="text-xs text-ink-400">
                          {formatDate(sale.soldAt, { language, withTime: true })} ·{' '}
                          {t(`pos.payment.${sale.payments[0]?.method ?? 'cash'}`)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2.5">
                        {sale.status !== 'completed' && (
                          <Badge tone={sale.status === 'voided' ? 'danger' : 'warning'}>
                            {t(`sales.status.${sale.status}`)}
                          </Badge>
                        )}
                        <CurrencyDisplay
                          amount={sale.totalH}
                          className={cn(
                            'font-semibold',
                            sale.status === 'voided'
                              ? 'text-ink-400 line-through'
                              : 'text-ink-900',
                          )}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Attention column */}
            <div className="space-y-4">
              <section className="rounded-lg border border-ink-200 bg-surface">
                <header className="flex items-center justify-between border-b border-ink-200 px-5 py-3.5">
                  <h2 className="flex items-center gap-1.5 text-md font-semibold text-ink-900">
                    <PackageOpen aria-hidden className="h-4 w-4 text-ink-400" />
                    {t('dashboard.lists.lowStock')}
                    <InfoHint content={t('dashboard.lists.lowStockHelp')} />
                  </h2>
                </header>

                {lowStock.length === 0 ? (
                  <p className="px-5 py-6 text-center text-sm text-ink-400">
                    {t('dashboard.lists.allStocked')}
                  </p>
                ) : (
                  <ul className="divide-y divide-ink-200">
                    {lowStock.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 px-5 py-2.5"
                      >
                        <span className="min-w-0 truncate text-base text-ink-800">
                          {nameOf(item)}
                        </span>
                        <Badge tone={item.stockQuantity === 0 ? 'danger' : 'warning'} dot>
                          {formatNumber(item.stockQuantity, { language })}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="border-t border-ink-200 px-5 py-2.5">
                  <Link
                    to={ROUTES.catalog}
                    className="flex items-center gap-1 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
                  >
                    {t('dashboard.lists.viewAll')}
                    <ArrowRight aria-hidden className="h-3.5 w-3.5 flip-rtl" />
                  </Link>
                </div>
              </section>

              {CREDIT_SALES && (
              <section className="rounded-lg border border-ink-200 bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-ink-500">{t('dashboard.lists.receivables')}</p>
                    <CurrencyDisplay
                      amount={receivables.outstandingH}
                      className="mt-0.5 block text-xl font-semibold text-ink-900"
                    />
                  </div>
                  <span
                    aria-hidden
                    className="flex h-8 w-8 items-center justify-center rounded-md bg-ink-100 text-ink-400"
                  >
                    <Wallet className="h-4 w-4" />
                  </span>
                </div>

                {receivables.outstandingH === 0 ? (
                  <p className="mt-2 text-sm text-ink-400">
                    {t('dashboard.lists.noReceivables')}
                  </p>
                ) : (
                  <Link
                    to={ROUTES.customers}
                    className="mt-3 flex items-center gap-1 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
                  >
                    {t('dashboard.lists.viewAll')}
                    <ArrowRight aria-hidden className="h-3.5 w-3.5 flip-rtl" />
                  </Link>
                )}
              </section>
              )}
            </div>
          </div>

          {/* Top items */}
          {(analytics?.topItems.length ?? 0) > 0 && (
            <section className="rounded-lg border border-ink-200 bg-surface">
              <header className="border-b border-ink-200 px-5 py-3.5">
                <h2 className="flex items-center gap-1.5 text-md font-semibold text-ink-900">
                  {t('dashboard.charts.topItems')}
                  <InfoHint content={t('dashboard.charts.topItemsHelp')} />
                </h2>
              </header>

              <ul className="divide-y divide-ink-200">
                {analytics?.topItems.map((item, index) => (
                  <li key={item.itemId} className="flex items-center gap-3 px-5 py-3">
                    <span
                      aria-hidden
                      className="numeric flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-2xs font-semibold text-ink-500"
                    >
                      {index + 1}
                    </span>

                    <span className="min-w-0 flex-1 truncate text-base text-ink-800">
                      {nameOf(item)}
                    </span>

                    <span className="numeric shrink-0 text-sm text-ink-400">
                      ×{formatNumber(item.quantity, { language })}
                    </span>

                    <CurrencyDisplay
                      amount={item.revenueH}
                      className="shrink-0 font-medium text-ink-900"
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
