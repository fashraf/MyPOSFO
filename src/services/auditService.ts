import { SAMPLE_ACTIVITY } from '@/config/env';
import { SERVER_CORE, USE_MOCKS } from '@/config/env';
import { auditApi, type AuditRow, type EndpointPerformance } from './api';
import type { ApiPage } from './api/catalogApi';
import { currentTenantId } from './mock/db';
import { seedFor } from './mock/seed';
import { delay, matches, seededRandom } from './mock/store';

/**
 * Audit trail and API performance, behind the same switch as every service.
 *
 * The two screens used to import `auditApi` directly, which is why they hit
 * the network (and retried in a loop) even in mock mode. In mock mode the trail
 * is synthesised from the tenant's own users and the endpoints the app really
 * calls, deterministically, so it reads like the business it belongs to.
 */

type AuditQuery = Parameters<typeof auditApi.list>[0];

const ACTIONS: { action: string; module: string; entity: string; path: string; method: string }[] = [
  { action: 'sale.commit', module: 'sales', entity: 'Sale', path: '/api/sales', method: 'POST' },
  { action: 'auth.login', module: 'auth', entity: 'Session', path: '/api/auth/login', method: 'POST' },
  { action: 'item.update', module: 'products', entity: 'CatalogItem', path: '/api/catalog/items/{id}', method: 'PUT' },
  { action: 'stock.receive', module: 'inventory', entity: 'StockLevel', path: '/api/inventory/receive', method: 'POST' },
  { action: 'drawer.open', module: 'finance', entity: 'DrawerSession', path: '/api/drawer/open', method: 'POST' },
  { action: 'drawer.close', module: 'finance', entity: 'DrawerSession', path: '/api/drawer/close', method: 'POST' },
  { action: 'expense.record', module: 'finance', entity: 'Expense', path: '/api/expenses', method: 'POST' },
  { action: 'discount.update', module: 'discounts', entity: 'Discount', path: '/api/discounts/{id}', method: 'PUT' },
  { action: 'user.update', module: 'users', entity: 'AppUser', path: '/api/users/{id}', method: 'PUT' },
  { action: 'sale.void', module: 'sales', entity: 'Sale', path: '/api/sales/{id}/void', method: 'POST' },
  { action: 'kitchen.bump', module: 'kitchen', entity: 'Preparation', path: '/api/kitchen/{id}/status', method: 'POST' },
];

const PAGES = ['/pos', '/dashboard', '/catalog', '/inventory', '/finance/cash', '/kitchen', '/users'];

function buildTrail(): AuditRow[] {
  if (!SAMPLE_ACTIVITY) return [];
  const tenantId = currentTenantId() ?? 'ten_alnoor';
  const users = seedFor(tenantId).users.filter((user) => user.status === 'active');
  const random = seededRandom(tenantId === 'ten_najd' ? 77 : 41);
  const now = Date.now();

  return Array.from({ length: 140 }, (_, index) => {
    const spec = ACTIONS[Math.floor(random() * ACTIONS.length)];
    const user = users[Math.floor(random() * users.length)];
    const roll = random();
    const result: AuditRow['result'] = roll < 0.04 ? 'denied' : roll < 0.08 ? 'failure' : 'success';
    return {
      auditId: 90_000 - index,
      userId: user?.id ?? null,
      username: user?.username ?? null,
      action: spec.action,
      module: spec.module,
      entityType: spec.entity,
      entityId: `${spec.entity.slice(0, 3).toUpperCase()}-${1000 + Math.floor(random() * 900)}`,
      apiPath: spec.path,
      httpMethod: spec.method,
      currentPage: PAGES[Math.floor(random() * PAGES.length)],
      previousPage: PAGES[Math.floor(random() * PAGES.length)],
      result,
      statusCode: result === 'success' ? 200 : result === 'denied' ? 403 : 422,
      errorMessage:
        result === 'denied'
          ? 'Permission denied for this role.'
          : result === 'failure'
            ? 'Validation failed: quantity exceeds stock on hand.'
            : null,
      ipAddress: `10.0.${Math.floor(random() * 4)}.${20 + Math.floor(random() * 60)}`,
      correlationId: `c${(index * 7919).toString(16).padStart(8, '0')}`,
      occurredAtUtc: new Date(now - index * (8 + random() * 40) * 60_000).toISOString(),
      hasOldValue: spec.method === 'PUT',
      hasNewValue: spec.method !== 'GET',
    };
  });
}

const mockAudit = {
  async list(query: AuditQuery = {}): Promise<ApiPage<AuditRow>> {
    await delay(200);
    let rows = buildTrail();
    if (query.userId) rows = rows.filter((row) => row.userId === query.userId);
    if (query.action) rows = rows.filter((row) => row.action === query.action);
    if (query.module) rows = rows.filter((row) => row.module === query.module);
    if (query.result) rows = rows.filter((row) => row.result === query.result);
    if (query.search) rows = rows.filter((row) => matches(`${row.action} ${row.username} ${row.entityId}`, query.search!));
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    return {
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      totalCount: rows.length,
    };
  },

  async get(auditId: number) {
    await delay(120);
    return (buildTrail().find((row) => row.auditId === auditId) ?? {}) as unknown as Record<string, unknown>;
  },

  async detail(auditId: number) {
    await delay(160);
    const row = buildTrail().find((candidate) => candidate.auditId === auditId);
    const table = row ? `dbo.${row.entityType}` : 'dbo.Unknown';
    return {
      entry: (row ?? {}) as unknown as Record<string, unknown>,
      changes: row?.hasOldValue
        ? [
            { changeId: 1, schemaName: 'dbo', tableName: row.entityType ?? '', operation: 'UPDATE', primaryKey: row.entityId,
              foreignKey: null, foreignTable: null, columnName: 'UpdatedAtUtc', oldValue: '2026-11-14T08:00:00Z',
              newValue: row.occurredAtUtc, rowsAffected: 1 },
          ]
        : [],
      tables: [{ fullName: table, operation: row?.httpMethod === 'PUT' ? 'UPDATE' : 'INSERT', changes: 1, rowsAffected: 1 }],
      timing: { totalMs: 38, databaseMs: 21, queryCount: 3 },
    };
  },

  async filters() {
    await delay(100);
    const rows = buildTrail();
    const users = new Map(rows.filter((row) => row.userId).map((row) => [row.userId!, row.username ?? '']));
    return {
      actions: [...new Set(rows.map((row) => row.action))].sort(),
      modules: [...new Set(rows.map((row) => row.module))].sort(),
      users: [...users].map(([userId, username]) => ({ userId, username })),
    };
  },

  async performance(_query: { from?: string; to?: string } = {}) {
    await delay(220);
    if (!SAMPLE_ACTIVITY) {
      return { endpoints: [] as EndpointPerformance[], summary: { totalCalls: 0, avgMs: 0, worstMs: 0, failures: 0, criticalCalls: 0, slowCalls: 0 } };
    }
    const random = seededRandom(9);
    const endpoints: EndpointPerformance[] = ACTIONS.map((spec) => {
      const avg = Math.round(18 + random() * (spec.action === 'sale.commit' ? 260 : 90));
      const calls = Math.round(80 + random() * 2400);
      const failures = Math.round(calls * random() * 0.02);
      const rating: EndpointPerformance['rating'] =
        avg < 50 ? 'Excellent' : avg < 100 ? 'Good' : avg < 200 ? 'Acceptable' : avg < 400 ? 'Slow' : 'Critical';
      return {
        apiPath: spec.path, httpMethod: spec.method, calls, avgMs: avg, minMs: Math.max(4, Math.round(avg * 0.3)),
        maxMs: Math.round(avg * (2 + random() * 5)), avgDatabaseMs: Math.round(avg * 0.55), failures,
        failurePercent: Number(((failures / calls) * 100).toFixed(2)), rating,
      };
    });
    const totalCalls = endpoints.reduce((sum, row) => sum + row.calls, 0);
    return {
      endpoints,
      summary: {
        totalCalls,
        avgMs: Math.round(endpoints.reduce((sum, row) => sum + row.avgMs * row.calls, 0) / totalCalls),
        worstMs: Math.max(...endpoints.map((row) => row.maxMs)),
        failures: endpoints.reduce((sum, row) => sum + row.failures, 0),
        criticalCalls: endpoints.filter((row) => row.rating === 'Critical').reduce((sum, row) => sum + row.calls, 0),
        slowCalls: endpoints.filter((row) => row.rating === 'Slow').reduce((sum, row) => sum + row.calls, 0),
      },
    };
  },

  async slow(_thresholdMs = 300, _take = 50) {
    await delay(160);
    if (!SAMPLE_ACTIVITY) return { requests: [] as Record<string, unknown>[], queries: [] as Record<string, unknown>[] };
    return {
      requests: [
        { apiPath: '/api/sales', httpMethod: 'POST', durationMs: 612, occurredAtUtc: new Date(Date.now() - 3_600_000).toISOString(), username: 'yousef' },
        { apiPath: '/api/reports/profit-loss', httpMethod: 'GET', durationMs: 488, occurredAtUtc: new Date(Date.now() - 7_200_000).toISOString(), username: 'huda' },
      ] as Record<string, unknown>[],
      queries: [
        { procedureName: 'sales.usp_CommitSale', durationMs: 341, rowsRead: 1820, occurredAtUtc: new Date(Date.now() - 3_600_000).toISOString() },
      ] as Record<string, unknown>[],
    };
  },

  async nPlusOne() {
    await delay(120);
    if (!SAMPLE_ACTIVITY) return [] as Record<string, unknown>[];
    return [
      { apiPath: '/api/inventory/levels', queryText: 'SELECT … FROM inv.StockMovement WHERE ItemId = @p0', repeats: 24, occurrences: 6 },
    ] as Record<string, unknown>[];
  },
};

export const auditService: typeof mockAudit = USE_MOCKS && !SERVER_CORE
  ? mockAudit
  : (auditApi as unknown as typeof mockAudit);
