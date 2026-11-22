import { useCallback, useEffect, useState } from 'react';
import { Eye, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import {
  Badge,
  Button,
  DatePicker,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
} from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useToast } from '@/contexts/ToastContext';
import { type AuditRow } from '@/services/api';
import { auditService as auditApi } from '@/services/auditService';

/**
 * The audit trail.
 *
 * Read-only by design. Entries are written by middleware from what actually
 * happened, and there is no endpoint to create or edit one — a trail a user can
 * write to is worth nothing as evidence of what that user did.
 */
export default function AuditPage() {
  const { error: showError } = useToast();

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [module, setModule] = useState('');
  const [result, setResult] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [filters, setFilters] = useState<{
    actions: string[];
    modules: string[];
    users: { userId: string; username: string }[];
  }>({ actions: [], modules: [], users: [] });

  const [detail, setDetail] = useState<Awaited<ReturnType<typeof auditApi.detail>> | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const pageSize = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await auditApi.list({
        search: debouncedSearch || undefined,
        action: action || undefined,
        module: module || undefined,
        result: result || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        pageSize,
      });
      setRows(response.items);
      setTotal(response.totalCount);
    } catch (error) {
      showError('Could not load the audit trail', (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, action, module, result, from, to, page, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    auditApi.filters().then(setFilters).catch(() => {
      /* The page still works with free-text search if the lists fail. */
    });
  }, []);

  /* Any filter change returns to the first page: staying on page 7 of a
     narrower result set shows an empty table and reads as "no results". */
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, action, module, result, from, to]);

  const openDetail = async (auditId: number) => {
    try {
      setDetail(await auditApi.detail(auditId));
    } catch (error) {
      showError('Could not load that entry', (error as Error).message);
    }
  };

  const resultBadge = (value: AuditRow['result']) => {
    if (value === 'success') {
      return <Badge tone="success"><ShieldCheck className="h-3 w-3" /> Success</Badge>;
    }
    if (value === 'denied') {
      return <Badge tone="warning"><ShieldX className="h-3 w-3" /> Denied</Badge>;
    }
    return <Badge tone="danger"><ShieldAlert className="h-3 w-3" /> Failed</Badge>;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit trail"
        description="Every change, who made it, and where they made it from."
      />

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch('')}
          placeholder="User, path, record or page"
          className="min-w-64 flex-1"
        />

        <Select
          value={action}
          onChange={setAction}
          placeholder="All actions"
          isClearable
          options={filters.actions.map((value) => ({ value, label: value }))}
        />

        <Select
          value={module}
          onChange={setModule}
          placeholder="All modules"
          isClearable
          options={filters.modules.map((value) => ({ value, label: value }))}
        />

        <Select
          value={result}
          onChange={setResult}
          placeholder="Any result"
          isClearable
          options={[
            { value: 'success', label: 'Success' },
            { value: 'failure', label: 'Failed' },
            { value: 'denied', label: 'Denied' },
          ]}
        />

        {/* The picker has no placeholder, so the label carries the meaning. */}
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          From
          <DatePicker value={from} onChange={setFrom} max={to || undefined} />
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-500">
          To
          {/* min = from, so an end date before the start cannot be chosen. */}
          <DatePicker value={to} onChange={setTo} min={from || undefined} />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-start text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-start">When</th>
              <th className="px-3 py-2 text-start">User</th>
              <th className="px-3 py-2 text-start">Action</th>
              <th className="px-3 py-2 text-start">Module</th>
              <th className="px-3 py-2 text-start">Record</th>
              <th className="px-3 py-2 text-start">Page</th>
              <th className="px-3 py-2 text-start">Came from</th>
              <th className="px-3 py-2 text-start">Result</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                  Nothing matches those filters.
                </td>
              </tr>
            )}

            {rows.map((row) => (
              <tr key={row.auditId} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                  {new Date(row.occurredAtUtc).toLocaleString()}
                </td>
                <td className="px-3 py-2">{row.username ?? '—'}</td>
                <td className="px-3 py-2"><Badge>{row.action}</Badge></td>
                <td className="px-3 py-2">{row.module}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.entityId ?? '—'}</td>
                <td className="px-3 py-2 text-slate-500">{row.currentPage ?? '—'}</td>
                <td className="px-3 py-2 text-slate-400">{row.previousPage ?? '—'}</td>
                <td className="px-3 py-2">{resultBadge(row.result)}</td>
                <td className="px-3 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void openDetail(row.auditId)}
                    aria-label="View details"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
      />

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
             onClick={() => setDetail(null)}>
          {/* Four fifths of the viewport. */}
          <div className="flex h-[80vh] w-[80vw] flex-col rounded-lg bg-white p-6"
               onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-ink-200 pb-3">
              <div>
                <h2 className="text-lg font-semibold text-ink-900">
                  {String(detail.entry.action)} · {String(detail.entry.module)}
                </h2>
                <p className="text-sm text-ink-500">
                  {String(detail.entry.username ?? 'unknown')} ·{' '}
                  {new Date(String(detail.entry.occurredAtUtc)).toLocaleString()}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>Close</Button>
            </div>

            <div className="grid min-h-0 flex-1 gap-6 overflow-auto pt-4 lg:grid-cols-[300px_minmax(0,1fr)]">
              <div className="space-y-5">
                <Section title="Request">
                  <Pair label="API" value={`${detail.entry.httpMethod} ${detail.entry.apiPath}`} mono />
                  <Pair label="Page" value={String(detail.entry.currentPage ?? '—')} />
                  <Pair label="Came from" value={String(detail.entry.previousPage ?? '—')} />
                  <Pair label="Result" value={String(detail.entry.result)} />
                  <Pair label="Record" value={String(detail.entry.entityId ?? '—')} mono />
                  <Pair label="Role" value={String(detail.entry.roleId ?? '—')} />
                  <Pair label="From" value={String(detail.entry.ipAddress ?? '—')} mono />
                  <Pair label="Correlation" value={String(detail.entry.correlationId ?? '—')} mono />
                </Section>

                {detail.timing && (
                  <Section title="Timing">
                    <Pair label="Total" value={`${detail.timing.totalMs} ms`} />
                    <Pair label="Database" value={`${detail.timing.databaseMs} ms`} />
                    <Pair label="Queries" value={String(detail.timing.queryCount)} />
                  </Section>
                )}

                <Section title="Tables touched">
                  {detail.tables.length === 0 ? (
                    <p className="text-sm text-ink-400">None — this call only read.</p>
                  ) : detail.tables.map((t) => (
                    <div key={`${t.fullName}-${t.operation}`} className="flex justify-between gap-2">
                      <span className="font-mono text-xs">{t.fullName}</span>
                      <Badge tone={t.operation === 'INSERT' ? 'success' : 'info'}>
                        {t.operation}{t.rowsAffected ? ` ×${t.rowsAffected}` : ''}
                      </Badge>
                    </div>
                  ))}
                </Section>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Changes</h3>
                {detail.changes.length === 0 ? (
                  <p className="text-sm text-ink-400">
                    Nothing recorded. Either the call changed nothing, or this
                    handler does not yet report its changes.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-ink-200">
                    <table className="w-full text-sm">
                      <thead className="bg-ink-50 text-2xs uppercase text-ink-500">
                        <tr>
                          <th className="px-3 py-2 text-start">Table</th>
                          <th className="px-3 py-2 text-start">Row (PK)</th>
                          <th className="px-3 py-2 text-start">Field</th>
                          <th className="px-3 py-2 text-start">Was</th>
                          <th className="px-3 py-2 text-start">Became</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {detail.changes.map((c) => (
                          <tr key={c.changeId}>
                            <td className="px-3 py-2 font-mono text-xs">
                              {c.schemaName}.{c.tableName}
                              {c.foreignTable && (
                                <span className="block text-2xs text-ink-400">
                                  FK → {c.foreignTable} {c.foreignKey}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">{c.primaryKey ?? '—'}</td>
                            <td className="px-3 py-2">{c.columnName ?? c.operation}</td>
                            <td className="px-3 py-2 text-ink-500">{c.oldValue ?? '—'}</td>
                            <td className="px-3 py-2 font-medium text-ink-900">{c.newValue ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{title}</h3>
      <div className="space-y-1 text-sm">{children}</div>
    </section>
  );
}

function Pair({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink-500">{label}</span>
      <span className={mono ? 'truncate font-mono text-xs' : 'truncate'}>{value}</span>
    </div>
  );
}
