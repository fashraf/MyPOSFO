import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Link2, QrCode, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Drawer,
  KpiCard,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  SkeletonTable,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
  type BadgeTone,
} from '@/components/ui';
import { ZatcaQr } from '@/components/ui/ZatcaQr';
import { useSession } from '@/contexts/SessionContext';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTranslation } from '@/i18n';
import { decodeQrTlv } from '@/lib/zatca';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { zatcaService } from '@/services/salesService';
import { useDataVersion } from '@/services/dataVersion';
import type { ZatcaLogEntry, ZatcaReportingStatus } from '@/types/zatca';

const PAGE_SIZE = 12;

const TONES: Record<ZatcaReportingStatus, BadgeTone> = {
  reported: 'success',
  pending: 'info',
  warning: 'warning',
  rejected: 'danger',
};

const TAG_LABELS: Record<number, string> = {
  1: 'Seller name',
  2: 'VAT registration number',
  3: 'Timestamp',
  4: 'Invoice total (incl. VAT)',
  5: 'VAT total',
  6: 'Invoice hash',
};

/**
 * The e-invoice trail.
 *
 * What an auditor or the Finance Controller needs from ZATCA Phase 2: every
 * invoice's UUID, its counter value, the hash chain linking it to the previous
 * invoice, the QR the customer received, and whether it has been reported
 * inside the 24-hour window. "Verify chain" walks the whole sequence and names
 * any invoice whose predecessor hash does not match — the tamper check.
 */
export default function ZatcaPage() {
  const { t, language } = useTranslation();
  const { scopeBranchId, branches } = useSession();
  const version = useDataVersion('sales');

  const [rows, setRows] = useState<ZatcaLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ZatcaLogEntry | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [chain, setChain] = useState<{ checked: number; breaks: { invoiceNumber: string; icv: number }[] } | null>(null);

  const debounced = useDebouncedValue(search, 250);

  const load = useCallback(async () => {
    setLoading(true);
    setRows(await zatcaService.list({ branchId: scopeBranchId, status, search: debounced }));
    setLoading(false);
  }, [scopeBranchId, status, debounced]);

  useEffect(() => {
    void load();
  }, [load, version]);

  useEffect(() => setPage(1), [status, debounced, scopeBranchId]);

  const counts = useMemo(() => {
    const by = (s: ZatcaReportingStatus) => rows.filter((row) => row.zatca.reportingStatus === s).length;
    return { total: rows.length, reported: by('reported'), pending: by('pending'), warning: by('warning') + by('rejected') };
  }, [rows]);

  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const money = (h: number) => formatCurrency(h, { language });
  const branchName = (id: string | null) => {
    const branch = branches.find((candidate) => candidate.id === id);
    return branch ? (language === 'ar' ? branch.nameAr : branch.nameEn) : '—';
  };

  async function verify() {
    setVerifying(true);
    setChain(await zatcaService.verifyChain());
    setVerifying(false);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t('zatcaPage.eyebrow')}
        title={t('zatcaPage.title')}
        description={t('zatcaPage.description')}
        actions={
          <Button variant="outline" onClick={() => void verify()} loading={verifying} leadingIcon={<Link2 />}>
            {t('zatcaPage.verify')}
          </Button>
        }
      />

      {chain && (
        <Alert tone={chain.breaks.length === 0 ? 'success' : 'danger'}>
          {chain.breaks.length === 0
            ? t('zatcaPage.chainIntact', { count: formatNumber(chain.checked, { language }) })
            : t('zatcaPage.chainBroken', { count: chain.breaks.length })}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t('zatcaPage.kpiStamped')} value={formatNumber(counts.total, { language })} icon={<QrCode />} />
        <KpiCard label={t('zatcaPage.kpiReported')} value={formatNumber(counts.reported, { language })} icon={<CheckCircle2 />} />
        <KpiCard label={t('zatcaPage.kpiPending')} value={formatNumber(counts.pending, { language })} icon={<ShieldCheck />} />
        <KpiCard label={t('zatcaPage.kpiWarnings')} value={formatNumber(counts.warning, { language })} icon={<ShieldAlert />} />
      </div>

      <div className="surface overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-ink-200 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="eyebrow px-1">{t('zatcaPage.tableTitle')}</p>
          <div className="flex gap-2">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('zatcaPage.search')}
              className="w-full sm:w-64"
            />
            <Select
              value={status}
              onChange={setStatus}
              className="w-40"
              aria-label={t('zatcaPage.col.status')}
              options={[
                { value: 'all', label: t('common.all') },
                { value: 'reported', label: t('zatcaPage.status.reported') },
                { value: 'pending', label: t('zatcaPage.status.pending') },
                { value: 'warning', label: t('zatcaPage.status.warning') },
              ]}
            />
          </div>
        </div>

        {loading ? (
          <div className="p-4">
            <SkeletonTable rows={6} />
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('zatcaPage.col.invoice')}</TableHeaderCell>
                <TableHeaderCell>ICV</TableHeaderCell>
                <TableHeaderCell className="hidden md:table-cell">UUID</TableHeaderCell>
                <TableHeaderCell className="hidden lg:table-cell">{t('zatcaPage.col.branch')}</TableHeaderCell>
                <TableHeaderCell>{t('zatcaPage.col.issued')}</TableHeaderCell>
                <TableHeaderCell className="text-end">{t('zatcaPage.col.total')}</TableHeaderCell>
                <TableHeaderCell className="hidden text-end sm:table-cell">{t('zatcaPage.col.vat')}</TableHeaderCell>
                <TableHeaderCell>{t('zatcaPage.col.status')}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paged.length === 0 && <TableEmptyRow colSpan={8}>{t('zatcaPage.empty')}</TableEmptyRow>}
              {paged.map((row) => (
                <TableRow key={row.saleId} interactive onClick={() => setSelected(row)}>
                  <TableCell className="numeric font-medium text-ink-900">{row.invoiceNumber}</TableCell>
                  <TableCell className="numeric text-ink-600">{row.zatca.icv}</TableCell>
                  <TableCell className="hidden font-mono text-xs text-ink-500 md:table-cell">
                    {row.zatca.uuid.slice(0, 8)}…
                  </TableCell>
                  <TableCell className="hidden text-ink-600 lg:table-cell">{branchName(row.branchId)}</TableCell>
                  <TableCell className="text-ink-600">{formatDate(row.issuedAt, { language, withTime: true })}</TableCell>
                  <TableCell className="numeric text-end font-medium">{money(row.totalH)}</TableCell>
                  <TableCell className="numeric hidden text-end text-ink-600 sm:table-cell">{money(row.taxH)}</TableCell>
                  <TableCell>
                    <Badge tone={TONES[row.zatca.reportingStatus]} dot>
                      {t(`zatcaPage.status.${row.zatca.reportingStatus}`)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {rows.length > PAGE_SIZE && (
          <div className="border-t border-ink-200 p-3">
            <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPageChange={setPage} />
          </div>
        )}
      </div>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.invoiceNumber}
        description={t('zatcaPage.drawerSubtitle')}
        size="md"
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-lg border border-ink-200 bg-ink-50 p-4">
              <ZatcaQr payload={selected.zatca.qrBase64} size={128} />
              <div className="min-w-0 space-y-1 text-sm">
                <Badge tone={TONES[selected.zatca.reportingStatus]} dot>
                  {t(`zatcaPage.status.${selected.zatca.reportingStatus}`)}
                </Badge>
                <p className="text-ink-500">
                  {selected.zatca.invoiceType === 'simplified' ? t('zatcaPage.simplified') : t('zatcaPage.standard')}
                </p>
                <p className="numeric text-lg font-semibold text-ink-900">{money(selected.totalH)}</p>
                <p className="font-mono text-2xs text-ink-500">{selected.zatca.egsUnitId}</p>
              </div>
            </div>

            {selected.zatca.messages.length > 0 && (
              <Alert tone="warning" compact>{selected.zatca.messages[0]}</Alert>
            )}

            <dl className="divide-y divide-ink-200 rounded-lg border border-ink-200 text-sm">
              {[
                ['UUID', selected.zatca.uuid],
                ['ICV', String(selected.zatca.icv)],
                [t('zatcaPage.hash'), selected.zatca.invoiceHash],
                ['PIH', selected.zatca.previousInvoiceHash],
                [t('zatcaPage.reportedAt'), selected.zatca.reportedAt ? formatDate(selected.zatca.reportedAt, { language, withTime: true }) : '—'],
              ].map(([label, value]) => (
                <div key={label} className="grid grid-cols-[7rem_1fr] gap-3 px-3 py-2">
                  <dt className="text-ink-500">{label}</dt>
                  <dd className="break-all font-mono text-xs text-ink-900" dir="ltr">{value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <p className="eyebrow mb-2">{t('zatcaPage.decoded')}</p>
              <dl className="divide-y divide-ink-200 rounded-lg border border-ink-200 text-sm">
                {Object.entries(decodeQrTlv(selected.zatca.qrBase64)).map(([tag, value]) => (
                  <div key={tag} className="grid grid-cols-[7rem_1fr] gap-3 px-3 py-2">
                    <dt className="text-ink-500">
                      <span className="numeric me-1 text-ink-400">{tag}</span>
                      {TAG_LABELS[Number(tag)] ?? 'Tag'}
                    </dt>
                    <dd className="break-all text-ink-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
