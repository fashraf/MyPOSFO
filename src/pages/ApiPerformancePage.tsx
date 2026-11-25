import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Clock3, Database, Gauge, Repeat, X } from 'lucide-react';
import { Badge, KpiCard, PageHeader, RefreshButton, Tabs } from '@/components/ui';
import { SERVER_CORE, USE_MOCKS } from '@/config/env';
import { useToast } from '@/contexts/ToastContext';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { exactTime, relativeTime, useNow } from '@/lib/relativeTime';
import { auditApi as serverAudit, type EndpointPerformance, type QueryRun, type RequestRun } from '@/services/api';
import { auditService as auditApi } from '@/services/auditService';

/**
 * API performance and query monitor.
 *
 * Every figure comes from what actually ran, recorded per request on the server: the request, when it ran, how long
 * it took, how much of that was the database, and every SQL statement it executed (text and parameter names; values
 * are never stored). Averages sit next to the worst case because an average hides the tail.
 */

type Tab = 'recent' | 'endpoints' | 'slow' | 'nplusone';

const RATING_TONE = { Excellent: 'success', Good: 'success', Acceptable: 'info', Slow: 'warning', Critical: 'danger' } as const;
const METHOD_TONE: Record<string, string> = {
  GET: 'bg-sky-50 text-sky-700 ring-sky-200',
  POST: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  PUT: 'bg-amber-50 text-amber-700 ring-amber-200',
  PATCH: 'bg-amber-50 text-amber-700 ring-amber-200',
  DELETE: 'bg-rose-50 text-rose-700 ring-rose-200',
};
const serverReadable = !USE_MOCKS || SERVER_CORE;

export default function ApiPerformancePage() {
  const { error: showError } = useToast();
  const { language } = useI18n();
  const now = useNow(5000);

  const [tab, setTab] = useState<Tab>('recent');
  const [loading, setLoading] = useState(true);
  const [endpoints, setEndpoints] = useState<EndpointPerformance[]>([]);
  const [summary, setSummary] = useState<{ totalCalls: number; avgMs: number; worstMs: number; failures: number; criticalCalls: number } | null>(null);
  const [recent, setRecent] = useState<RequestRun[]>([]);
  const [slowQueries, setSlowQueries] = useState<Record<string, unknown>[]>([]);
  const [nPlusOne, setNPlusOne] = useState<Record<string, unknown>[]>([]);
  const [open, setOpen] = useState<{ request: RequestRun; queries: QueryRun[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [perf, slow, repeated, latest] = await Promise.all([
        auditApi.performance(),
        auditApi.slow(0, 50),
        auditApi.nPlusOne(),
        serverReadable ? serverAudit.recent(150) : Promise.resolve([] as RequestRun[]),
      ]);
      setEndpoints(perf.endpoints);
      setSummary(perf.summary);
      setSlowQueries(slow.queries);
      setNPlusOne(repeated);
      setRecent(latest);
    } catch (caught) {
      showError('Could not load performance data', (caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openRequest(correlationId: string) {
    try {
      setOpen(await serverAudit.request(correlationId));
    } catch (caught) {
      showError('Could not open that request', (caught as Error).message);
    }
  }

  const failurePct = useMemo(
    () => (summary && summary.totalCalls > 0 ? Math.round((summary.failures / summary.totalCalls) * 1000) / 10 : 0),
    [summary],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="API performance"
        description="Measured from real requests: when they ran, how long they took, and the queries behind them."
        actions={<RefreshButton onRefresh={load} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Calls recorded" value={(summary?.totalCalls ?? 0).toLocaleString()} icon={<Activity />} />
        <KpiCard label="Average" value={`${Math.round(summary?.avgMs ?? 0)} ms`} icon={<Gauge />} />
        <KpiCard label="Worst" value={`${summary?.worstMs ?? 0} ms`} icon={<AlertTriangle />} />
        <KpiCard label="Failures" value={`${summary?.failures ?? 0}`} hint={`${failurePct}% of calls`} icon={<AlertTriangle />} />
      </div>

      <Tabs
        value={tab}
        onChange={(value) => setTab(value as Tab)}
        items={[
          { value: 'recent', label: 'Recent requests' },
          { value: 'endpoints', label: 'By endpoint' },
          { value: 'slow', label: 'Slowest queries' },
          { value: 'nplusone', label: 'Repeated queries' },
        ]}
      />

      {tab === 'recent' && (
        <Panel empty={!loading && recent.length === 0} emptyText="No requests recorded yet.">
          <ul className="divide-y divide-ink-100">
            {recent.map((r) => (
              <li key={r.correlationId}>
                <button
                  type="button"
                  onClick={() => void openRequest(r.correlationId)}
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-ink-50 sm:grid-cols-[7.5rem_auto_minmax(0,1fr)_auto_auto]"
                >
                  <span className="hidden text-xs text-ink-500 sm:block" title={exactTime(r.occurredAtUtc, language)}>
                    <Clock3 aria-hidden className="me-1 inline h-3.5 w-3.5 align-[-2px]" />
                    {relativeTime(r.occurredAtUtc, language, now)}
                  </span>
                  <Method method={r.httpMethod} />
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs text-ink-900">{r.apiPath}</span>
                    <span className="block truncate text-2xs text-ink-500">
                      <span className="sm:hidden">{relativeTime(r.occurredAtUtc, language, now)} · </span>
                      {r.username ?? 'anonymous'}{r.currentPage ? ` · ${r.currentPage}` : ''}
                    </span>
                  </span>
                  <span className="hidden text-end text-xs text-ink-600 sm:block">
                    <Database aria-hidden className="me-1 inline h-3.5 w-3.5 align-[-2px] text-ink-400" />
                    {r.queryCount} {r.queryCount === 1 ? 'query' : 'queries'} · {r.databaseMs} ms
                  </span>
                  <span className="flex items-center gap-2">
                    <Ms value={r.totalMs} />
                    <Status code={r.statusCode} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {tab === 'endpoints' && (
        <Panel empty={!loading && endpoints.length === 0} emptyText="No calls recorded yet.">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-2xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2.5 text-start">Endpoint</th>
                <th className="px-4 py-2.5 text-end">Calls</th>
                <th className="px-4 py-2.5 text-end">Average</th>
                <th className="px-4 py-2.5 text-end">Worst</th>
                <th className="px-4 py-2.5 text-end">Database</th>
                <th className="px-4 py-2.5 text-end">Failures</th>
                <th className="px-4 py-2.5 text-start">Last called</th>
                <th className="px-4 py-2.5 text-start">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {endpoints.map((e) => (
                <tr key={`${e.httpMethod} ${e.apiPath}`} className="hover:bg-ink-50">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2"><Method method={e.httpMethod} /><span className="font-mono text-xs">{e.apiPath}</span></span>
                  </td>
                  <td className="px-4 py-2.5 text-end tabular-nums">{e.calls}</td>
                  <td className="px-4 py-2.5 text-end"><Ms value={e.avgMs} /></td>
                  <td className="px-4 py-2.5 text-end tabular-nums text-ink-600">{e.maxMs} ms</td>
                  <td className="px-4 py-2.5 text-end tabular-nums text-ink-600">{e.avgDatabaseMs} ms</td>
                  <td className="px-4 py-2.5 text-end tabular-nums">
                    {e.failures ? <span className="text-danger-700">{e.failures} ({e.failurePercent}%)</span> : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink-600" title={exactTime(e.lastCalledAtUtc, language)}>
                    {relativeTime(e.lastCalledAtUtc, language, now)}
                  </td>
                  <td className="px-4 py-2.5"><Badge tone={RATING_TONE[e.rating]}>{e.rating}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {tab === 'slow' && (
        <Panel empty={!loading && slowQueries.length === 0} emptyText="No queries recorded yet.">
          <ul className="divide-y divide-ink-100">
            {slowQueries.map((q, index) => (
              <li key={index} className="space-y-1.5 px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-xs text-ink-500">
                  <span title={exactTime(String(q.occurredAtUtc), language)}>{relativeTime(String(q.occurredAtUtc), language, now)}</span>
                  <span className="flex items-center gap-2">
                    <span>{String(q.rowsAffected ?? 0) === '-1' ? '' : `${q.rowsAffected} rows · `}</span>
                    <Ms value={Number(q.durationMs)} />
                    <button type="button" className="text-brand-700 hover:underline" onClick={() => void openRequest(String(q.correlationId))}>
                      Open request
                    </button>
                  </span>
                </div>
                <Sql text={String(q.commandText)} />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {tab === 'nplusone' && (
        <Panel empty={!loading && nPlusOne.length === 0} emptyText="No statement ran 5 or more times in one request. Good.">
          <ul className="divide-y divide-ink-100">
            {nPlusOne.map((row, index) => (
              <li key={index} className="space-y-1.5 px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex items-center gap-2"><Method method={String(row.httpMethod)} /><span className="font-mono">{String(row.apiPath)}</span></span>
                  <span className="flex items-center gap-2 text-ink-600">
                    <Repeat aria-hidden className="h-3.5 w-3.5" />×{String(row.executions)} · {Number(row.totalMs).toFixed(1)} ms
                  </span>
                </div>
                <Sql text={String(row.statement)} />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {open && <RequestModal data={open} language={language} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function Panel({ children, empty, emptyText }: { children: React.ReactNode; empty: boolean; emptyText: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200 bg-surface">
      {empty ? <p className="px-4 py-10 text-center text-sm text-ink-500">{emptyText}</p> : children}
    </div>
  );
}

function Method({ method }: { method: string }) {
  return (
    <span className={cn('inline-flex w-14 justify-center rounded px-1.5 py-0.5 font-mono text-2xs font-semibold ring-1 ring-inset', METHOD_TONE[method] ?? 'bg-ink-50 text-ink-700 ring-ink-200')}>
      {method}
    </span>
  );
}

function Ms({ value }: { value: number }) {
  const tone = value >= 2000 ? 'text-danger-700' : value >= 1000 ? 'text-warning-700' : value >= 300 ? 'text-ink-900' : 'text-success-700';
  return <span className={cn('tabular-nums text-xs font-semibold', tone)}>{Math.round(value * 10) / 10} ms</span>;
}

function Status({ code }: { code: number }) {
  return <Badge tone={code >= 500 ? 'danger' : code >= 400 ? 'warning' : 'success'}>{code}</Badge>;
}

function Sql({ text }: { text: string }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-ink-900 px-3 py-2 font-mono text-2xs leading-relaxed text-ink-50">
      {text}
    </pre>
  );
}

function RequestModal({ data, language, onClose }: { data: { request: RequestRun; queries: QueryRun[] }; language: string; onClose: () => void }) {
  const r = data.request;
  const dbShare = r.totalMs > 0 ? Math.min(100, Math.round((r.databaseMs / r.totalMs) * 100)) : 0;
  return createPortal(
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/40 p-3 sm:p-6" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 border-b border-ink-200 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><Method method={r.httpMethod} /><span className="truncate font-mono text-sm text-ink-900">{r.apiPath}</span></div>
            <p className="mt-1 text-xs text-ink-500">
              {exactTime(r.occurredAtUtc, language)} · {relativeTime(r.occurredAtUtc, language)} · {r.username ?? 'anonymous'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100"><X className="h-4 w-4" /></button>
        </header>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total" value={`${r.totalMs} ms`} />
            <Stat label="Database" value={`${r.databaseMs} ms`} hint={`${dbShare}% of the request`} />
            <Stat label="Queries" value={String(r.queryCount)} />
            <Stat label="Result" value={String(r.statusCode)} hint={r.succeeded ? 'Succeeded' : r.errorMessage ?? 'Failed'} tone={r.succeeded ? 'ok' : 'bad'} />
          </div>
          {(r.currentPage || r.previousPage) && (
            <div className="rounded-lg border border-ink-200 px-4 py-3 text-xs text-ink-600">
              Page <span className="font-mono text-ink-900">{r.currentPage ?? '—'}</span>
              {r.previousPage && <> · came from <span className="font-mono text-ink-900">{r.previousPage}</span></>}
            </div>
          )}

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Queries run ({data.queries.length})</h3>
            {data.queries.length === 0 ? (
              <p className="rounded-lg border border-dashed border-ink-300 px-4 py-6 text-center text-sm text-ink-500">This request did not touch the database.</p>
            ) : (
              <ol className="space-y-2">
                {data.queries.map((q) => (
                  <li key={q.seq} className="rounded-lg border border-ink-200 p-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-ink-700">#{q.seq}</span>
                      <span className="flex items-center gap-3 text-ink-500">
                        {q.rowsAffected >= 0 && <span>{q.rowsAffected} rows</span>}
                        {q.parameterNames && <span className="hidden font-mono sm:inline">{q.parameterNames}</span>}
                        <Ms value={q.durationMs} />
                      </span>
                    </div>
                    <Sql text={q.commandText} />
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2.5">
      <p className="text-2xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className={cn('mt-0.5 text-lg font-semibold tabular-nums', tone === 'bad' ? 'text-danger-700' : 'text-ink-900')}>{value}</p>
      {hint && <p className="truncate text-2xs text-ink-500">{hint}</p>}
    </div>
  );
}
