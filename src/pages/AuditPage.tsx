import { createPortal } from 'react-dom';
import { useCallback, useEffect, useState } from 'react';
import { Database, Eye, GitCompare, Hash, MapPin, ShieldAlert, ShieldCheck, ShieldX, Table2, UserRound, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { exactTime, relativeTime } from '@/lib/relativeTime';
import {
  Badge,
  Button,
  DatePicker,
  PageHeader,
  RefreshButton,
  Pagination,
  SearchInput,
  Select,
} from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useToast } from '@/contexts/ToastContext';
import { auditApi as serverAudit, type AuditRow } from '@/services/api';
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
        actions={<RefreshButton onRefresh={load} />}
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

      {detail && <AuditDetailModal detail={detail as unknown as AuditDetail} onClose={() => setDetail(null)} />}
    </div>
  );
}

type AuditDetail = Awaited<ReturnType<typeof serverAudit.detail>>;

/** One audit entry, laid out as cards: what happened, who, where, timing, tables, changes and the queries run. */
function AuditDetailModal({ detail, onClose }: { detail: AuditDetail; onClose: () => void }) {
  const { language } = useI18n();
  const e = detail.entry as Record<string, unknown>;
  const ok = String(e.result) === 'success';
  const text = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
  return createPortal(
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/40 p-3 sm:p-6" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-ink-50 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 border-b border-ink-200 bg-surface px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-ink-900 px-2 py-0.5 text-xs font-semibold text-white">{text(e.action)}</span>
              <span className="text-sm text-ink-600">{text(e.module)}</span>
              <Badge tone={ok ? 'success' : 'danger'}>{ok ? 'Success' : text(e.result)}</Badge>
            </div>
            <p className="mt-1 text-xs text-ink-500">
              {exactTime(String(e.occurredAtUtc), language)} · {relativeTime(String(e.occurredAtUtc), language)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100"><X className="h-4 w-4" /></button>
        </header>

        <div className="space-y-4 overflow-y-auto p-4 sm:p-5">
          {detail.timing && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Total time" value={`${detail.timing.totalMs} ms`} />
              <Tile label="Database" value={`${detail.timing.databaseMs} ms`} />
              <Tile label="Queries" value={String(detail.timing.queryCount)} />
              <Tile label="Status" value={text(e.statusCode)} tone={ok ? undefined : 'bad'} />
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <Card title="Who" icon={<UserRound className="h-4 w-4" />}>
              <Row label="User" value={text(e.username)} />
              <Row label="Role" value={text(e.roleId)} />
              <Row label="Branch" value={text(e.branchId)} />
              <Row label="From" value={text(e.ipAddress)} mono />
            </Card>
            <Card title="Where" icon={<MapPin className="h-4 w-4" />}>
              <Row label="API" value={`${text(e.httpMethod)} ${text(e.apiPath)}`} mono />
              <Row label="Page" value={text(e.currentPage)} mono />
              <Row label="Came from" value={text(e.previousPage)} mono />
            </Card>
            <Card title="Record" icon={<Hash className="h-4 w-4" />}>
              <Row label="Type" value={text(e.entityType)} />
              <Row label="Id" value={text(e.entityId)} mono />
              <Row label="Reference" value={text(e.correlationId)} mono />
              {e.errorMessage ? <p className="mt-1 rounded bg-danger-50 px-2 py-1 text-xs text-danger-700">{String(e.errorMessage)}</p> : null}
            </Card>
          </div>

          <Card title={`Tables touched (${detail.tables.length})`} icon={<Table2 className="h-4 w-4" />}>
            {detail.tables.length === 0 ? (
              <p className="text-sm text-ink-500">None: this call only read data.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {detail.tables.map((t) => (
                  <span key={`${t.fullName}-${t.operation}`} className="inline-flex items-center gap-2 rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs">
                    <span className="font-mono">{t.fullName}</span>
                    <Badge tone={t.operation === 'INSERT' ? 'success' : t.operation === 'DELETE' ? 'danger' : 'info'}>
                      {t.operation}{t.rowsAffected ? ` ×${t.rowsAffected}` : ''}
                    </Badge>
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card title={`Changes (${detail.changes.length})`} icon={<GitCompare className="h-4 w-4" />}>
            {detail.changes.length === 0 ? (
              <p className="text-sm text-ink-500">Nothing recorded: the call changed nothing, or this screen does not report its changes yet.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {detail.changes.map((c) => (
                  <div key={c.changeId} className="rounded-lg border border-ink-200 p-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono text-ink-700">{c.schemaName}.{c.tableName}{c.primaryKey ? ` #${c.primaryKey}` : ''}</span>
                      <Badge tone="info">{c.columnName ?? c.operation}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded bg-danger-50/60 px-2 py-1"><p className="text-2xs uppercase text-ink-500">Was</p><p className="break-all text-ink-700">{c.oldValue ?? '—'}</p></div>
                      <div className="rounded bg-success-50/60 px-2 py-1"><p className="text-2xs uppercase text-ink-500">Became</p><p className="break-all font-medium text-ink-900">{c.newValue ?? '—'}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title={`Queries run (${detail.queries?.length ?? 0})`} icon={<Database className="h-4 w-4" />}>
            {!detail.queries || detail.queries.length === 0 ? (
              <p className="text-sm text-ink-500">No database statements recorded for this request.</p>
            ) : (
              <ol className="space-y-2">
                {detail.queries.map((q) => (
                  <li key={q.seq}>
                    <div className="mb-1 flex items-center justify-between text-xs text-ink-500">
                      <span className="font-semibold text-ink-700">#{q.seq}</span>
                      <span>{q.rowsAffected >= 0 ? `${q.rowsAffected} rows · ` : ''}{q.durationMs} ms</span>
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-ink-900 px-3 py-2 font-mono text-2xs leading-relaxed text-ink-50">{q.commandText}</pre>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-ink-200 bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
        <span className="text-ink-400">{icon}</span>{title}
      </h3>
      <div className="space-y-1.5 text-sm">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-ink-500">{label}</span>
      <span className={mono ? 'truncate font-mono text-xs text-ink-900' : 'truncate text-ink-900'} title={value}>{value}</span>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-surface px-4 py-3">
      <p className="text-2xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className={tone === 'bad' ? 'mt-0.5 text-xl font-semibold text-danger-700' : 'mt-0.5 text-xl font-semibold tabular-nums text-ink-900'}>{value}</p>
    </div>
  );
}
