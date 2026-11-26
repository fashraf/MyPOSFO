import { HYBRID_TENANT } from '@/config/env';
import { api } from '@/services/apiClient';
import { HttpError } from '@/services/http';
import { activateTenant, patchSlice, restoreSlices, snapshotSlices } from '@/services/mock/db';
import type { CatalogItem, Category } from '@/types/catalog';
import type { CashMovement, RestaurantSession, SessionAuditEntry } from '@/types/restaurantSession';
import type { Sale, SaleLine } from '@/types/sales';

/**
 * Hybrid mode: the server is the source of truth for the catalog, restaurant sessions and sales.
 *
 * Each of these keeps its full business logic in the front end (totals, combos, options, rule checks). An operation
 * runs locally first as a pre-check, is then committed by the server (which applies its own rules, assigns the real
 * numbers and the ZATCA stamp inside one transaction), and the local copy is replaced with what the server holds. If
 * the server refuses, the local change is rolled back. Reads refresh from the server first, so every device (web,
 * phone, a second till) sees the same day, the same orders and the same numbers.
 */

const FRESH_MS = { catalog: 30_000, sessions: 2_000, sales: 3_000, kitchen: 2_000 } as const;
const lastSync: Record<keyof typeof FRESH_MS, number> = { catalog: 0, sessions: 0, sales: 0, kitchen: 0 };
const inFlight: Partial<Record<keyof typeof FRESH_MS, Promise<void>>> = {};

function fresh(kind: keyof typeof FRESH_MS, force: boolean): boolean {
  return !force && Date.now() - lastSync[kind] < FRESH_MS[kind];
}

/** The next read of every area goes to the server, whatever the cache age (the Refresh button). */
export function forceNextSync(): void {
  lastSync.catalog = 0;
  lastSync.sessions = 0;
  lastSync.sales = 0;
  lastSync.kitchen = 0;
}

/** One request at a time per area; concurrent callers share it. */
function once(kind: keyof typeof FRESH_MS, work: () => Promise<void>): Promise<void> {
  const running = inFlight[kind];
  if (running) return running;
  const next = work()
    .then(() => {
      lastSync[kind] = Date.now();
    })
    .finally(() => {
      delete inFlight[kind];
    });
  inFlight[kind] = next;
  return next;
}

/** Make sure the browser database of the hybrid business is the one loaded. */
export function ensureHybridTenant(): void {
  activateTenant(HYBRID_TENANT);
}

/* -------------------------------------------------------------------- catalog */

interface Page<T> {
  items: T[];
  totalCount: number;
}

export function syncCatalog(force = false): Promise<void> {
  if (fresh('catalog', force)) return Promise.resolve();
  return once('catalog', async () => {
    const [items, categories] = await Promise.all([
      api.get<Page<CatalogItem>>('/api/catalog/items', { query: { pageSize: 2000, activeOnly: false } }),
      api.get<Category[]>('/api/catalog/categories', { query: { activeOnly: false } }),
    ]);
    patchSlice<{ items: CatalogItem[]; categories: Category[]; branchStock: Record<string, Record<string, number>> }>(
      'catalog',
      (current) => ({
        ...current,
        items: items.items,
        categories: categories.length > 0 ? categories : current.categories,
        /* Stock now comes from the server, as one figure per item. */
        branchStock: {},
      }),
    );
  });
}

export async function saveCatalogItem(item: CatalogItem): Promise<CatalogItem> {
  const saved = await api.put<CatalogItem>(`/api/catalog/items/${encodeURIComponent(item.id)}`, item);
  await syncCatalog(true);
  return saved;
}

export async function saveCategory(category: Category): Promise<void> {
  await api.put(`/api/catalog/categories/${encodeURIComponent(category.id)}`, category);
  await syncCatalog(true);
}

/* -------------------------------------------------------------- sessions */

interface SessionState {
  sessions: RestaurantSession[];
  movements: CashMovement[];
  audit: SessionAuditEntry[];
}

export function syncSessions(force = false): Promise<void> {
  if (fresh('sessions', force)) return Promise.resolve();
  return once('sessions', async () => {
    const state = await api.get<SessionState>('/api/restaurant-sessions/state', { query: { days: 60 } });
    patchSlice<SessionState & { sequence: number }>('restaurantSessions', (current) => ({
      ...current,
      sessions: state.sessions,
      movements: state.movements,
      audit: state.audit,
    }));
  });
}

/* ------------------------------------------------------------------ sales */

export function syncSales(force = false): Promise<void> {
  if (fresh('sales', force)) return Promise.resolve();
  return once('sales', async () => {
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    const page = await api.get<Page<Sale>>('/api/sales', { query: { pageSize: 2000, from: since } });
    patchSlice<{ sales: Sale[] }>('sales', (current) => ({ ...current, sales: page.items }));
  });
}

/** What each line takes from stock: a combo takes its parts, a plain item takes itself. */
export function stockMoves(lines: SaleLine[]): { itemId: string; quantity: number }[] {
  const moves: { itemId: string; quantity: number }[] = [];
  for (const line of lines) {
    if (line.components && line.components.length > 0) {
      for (const part of line.components) moves.push({ itemId: part.itemId, quantity: part.quantity * line.quantity });
    } else {
      moves.push({ itemId: line.itemId, quantity: line.quantity });
    }
  }
  return moves;
}

/* --------------------------------------------------------- server-backed op */

/** Server error codes as the screens know them. */
const CODE_MAP: Record<string, string> = {
  restaurant_closed: 'RESTAURANT_CLOSED',
  already_open: 'SESSION_ALREADY_OPEN',
  session_closed: 'SESSION_CLOSED',
  reason_required: 'DISCREPANCY_REASON_REQUIRED',
  another_open: 'SESSION_ALREADY_OPEN',
};

function translate(error: unknown): unknown {
  if (error instanceof HttpError && CODE_MAP[error.code]) {
    return new HttpError({ status: error.status, code: CODE_MAP[error.code], message: error.message, fieldErrors: error.fieldErrors });
  }
  return error;
}

/**
 * Run the local operation as a pre-check, commit it on the server, then refresh from the server.
 * Any failure after the local step rolls the browser database back to how it was.
 */
export async function serverBacked<L, S>(
  local: () => Promise<L>,
  server: (localResult: L) => Promise<S>,
  refresh: () => Promise<void>,
): Promise<S> {
  const before = snapshotSlices();
  let localResult: L;
  try {
    localResult = await local();
  } catch (error) {
    restoreSlices(before);
    throw error;
  }
  try {
    const result = await server(localResult);
    await refresh();
    return result;
  } catch (error) {
    restoreSlices(before);
    /* The server may know something this device did not (another till opened the day): show the truth. */
    void refresh().catch(() => undefined);
    throw translate(error);
  }
}

/* ---------------------------------------------------------------- kitchen */

interface Ticket {
  id: string;
  orderNumber: string;
  status: string;
}

/** Kitchen tickets from the server: the same board on the kitchen screen, the collection screen and every phone. */
export function syncKitchen(force = false): Promise<void> {
  if (fresh('kitchen', force)) return Promise.resolve();
  return once('kitchen', async () => {
    const tickets = await api.get<Ticket[]>('/api/kitchen/tickets', { query: { hours: 48 } });
    patchSlice<{ orders: Ticket[] }>('kitchen', (current) => ({ ...current, orders: tickets }));
  });
}

/** Send every ticket the local operation created or changed. */
export async function pushChangedTickets(before: Ticket[], after: Ticket[]): Promise<void> {
  const old = new Map(before.map((t) => [t.orderNumber, JSON.stringify(t)]));
  const changed = after.filter((t) => old.get(t.orderNumber) !== JSON.stringify(t));
  for (const ticket of changed) {
    if (!/^\d+$/.test(ticket.orderNumber)) continue; // only orders the server numbered
    await api.put(`/api/kitchen/tickets/${ticket.orderNumber}`, ticket);
  }
}
