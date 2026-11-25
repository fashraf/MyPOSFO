/**
 * The mock database: one isolated, persistent store per tenant.
 *
 * Production runs database-per-tenant on SQL Server. The mock mirrors that
 * rather than faking it with a `tenantId` column: each tenant's data lives
 * under its own versioned localStorage key, and only the active tenant is ever
 * loaded into memory. A query cannot leak across tenants because the other
 * tenant's rows are simply not in the process.
 *
 * How the services plug in
 * ------------------------
 * Each mock service keeps its collections in module-level variables (that is
 * how they were written, and rewriting fifteen services to a new storage API
 * would be churn with no user value). Instead each registers a *slice*:
 *
 *   registerSlice('catalog', {
 *     capture: () => ({ items, categories }),
 *     restore: (s) => { items = s.items; categories = s.categories; },
 *     seed:    (tenantId) => { items = …; categories = …; },
 *   });
 *
 * The database owns *when*: on tenant switch it captures the outgoing tenant,
 * then restores (or seeds) every slice for the incoming one. Every mock call
 * passes through `delay()`, which schedules a debounced flush — so every write
 * in every service is persisted without each one having to remember to.
 *
 * Resilience
 * ----------
 * Storage can be full, blocked (private mode), or hold JSON from an older build.
 * A blob with the wrong schema version, or one that fails to parse, is dropped
 * and that tenant is reseeded. A slice whose restore throws is reseeded on its
 * own, so one bad collection does not take the rest with it.
 */

/** Bump when a seed or a stored shape changes incompatibly. Old data is discarded. */
export const MOCK_SCHEMA_VERSION = 11;

const PREFIX = 'poscomplete.mockdb';
const keyFor = (tenantId: string) => `${PREFIX}.v${MOCK_SCHEMA_VERSION}.${tenantId}`;

export interface SliceAdapter<T = unknown> {
  /** A JSON-serialisable snapshot of the slice's current state. */
  capture: () => T;
  /** Put a snapshot back. Throw if it is unusable; the slice is then reseeded. */
  restore: (snapshot: T) => void;
  /** Reset to pristine data for this tenant. Must be deterministic. */
  seed: (tenantId: string) => void;
}

interface StoredTenant {
  schema: number;
  tenantId: string;
  savedAt: string;
  slices: Record<string, unknown>;
}

const slices = new Map<string, SliceAdapter>();
let activeTenant: string | null = null;
/** Snapshots loaded from storage for slices that register after activation. */
let pending: Record<string, unknown> = {};

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let suspended = false;

const listeners = new Set<(tenantId: string | null) => void>();

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read(tenantId: string): StoredTenant | null {
  const store = storage();
  if (!store) return null;

  try {
    const raw = store.getItem(keyFor(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTenant;
    if (parsed?.schema !== MOCK_SCHEMA_VERSION || parsed.tenantId !== tenantId) return null;
    if (!parsed.slices || typeof parsed.slices !== 'object') return null;
    return parsed;
  } catch {
    /* Corrupt JSON: discard it, and the tenant reseeds below. */
    store.removeItem(keyFor(tenantId));
    return null;
  }
}

function applySlice(name: string, adapter: SliceAdapter, tenantId: string, snapshot: unknown): void {
  if (snapshot !== undefined) {
    try {
      adapter.restore(snapshot);
      return;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`[mockdb] Slice "${name}" could not be restored and was reseeded.`, error);
    }
  }
  adapter.seed(tenantId);
}

/**
 * Register a slice. Safe to call at module load.
 *
 * Services loaded lazily (after a tenant is already active) are hydrated
 * immediately from what was read at activation, so a code-split page sees the
 * same persisted data as everything else.
 */
export function registerSlice<T>(name: string, adapter: SliceAdapter<T>): void {
  slices.set(name, adapter as SliceAdapter);
  if (activeTenant) {
    applySlice(name, adapter as SliceAdapter, activeTenant, pending[name]);
    delete pending[name];
  }
}

/** Write the active tenant's slices to storage now. */
export function flush(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!activeTenant || suspended) return;

  const store = storage();
  if (!store) return;

  const snapshot: StoredTenant = {
    schema: MOCK_SCHEMA_VERSION,
    tenantId: activeTenant,
    savedAt: new Date().toISOString(),
    /* Slices not yet registered keep their stored snapshot, so loading a page
       that never imports a service does not erase that service's data. */
    slices: { ...pending },
  };

  for (const [name, adapter] of slices) {
    try {
      snapshot.slices[name] = adapter.capture();
    } catch {
      /* Skip a slice that cannot serialise rather than losing the others. */
    }
  }

  try {
    store.setItem(keyFor(activeTenant), JSON.stringify(snapshot));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[mockdb] Could not persist demo data (storage full or blocked).', error);
  }
}

/**
 * Throttled flush. Called after every mock operation via `delay()`.
 *
 * Deliberately not a debounce: screens that poll (kitchen board, alerts) call
 * `delay()` more often than the window, and a debounce that keeps restarting
 * would never write — a sale could vanish on refresh. At most one write is
 * pending; it runs 150 ms after the first change and captures everything since.
 */
export function schedulePersist(): void {
  if (!activeTenant || suspended || flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, 150);
}

/**
 * Load a tenant into memory.
 *
 * Idempotent: activating the tenant that is already active does nothing, so it
 * is safe to call on every sign-in and every page load.
 */
export function activateTenant(tenantId: string): void {
  if (activeTenant === tenantId) return;

  if (activeTenant) flush();

  const stored = read(tenantId);
  activeTenant = tenantId;
  pending = { ...(stored?.slices ?? {}) };

  for (const [name, adapter] of slices) {
    applySlice(name, adapter, tenantId, pending[name]);
    delete pending[name];
  }

  /* Persist straight away, so a fresh seed survives a reload even if the
     person changes nothing. */
  flush();

  for (const listener of [...listeners]) listener(tenantId);
}

export function currentTenantId(): string | null {
  return activeTenant;
}

export function onTenantChange(listener: (tenantId: string | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every tenant database that exists in this browser, with its size. */
export function storedTenants(): { tenantId: string; bytes: number; savedAt: string | null }[] {
  const store = storage();
  if (!store) return [];

  const result: { tenantId: string; bytes: number; savedAt: string | null }[] = [];
  const prefix = `${PREFIX}.v${MOCK_SCHEMA_VERSION}.`;

  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (!key?.startsWith(prefix)) continue;
    const raw = store.getItem(key) ?? '';
    let savedAt: string | null = null;
    try {
      savedAt = (JSON.parse(raw) as StoredTenant).savedAt ?? null;
    } catch {
      /* ignore */
    }
    result.push({ tenantId: key.slice(prefix.length), bytes: raw.length, savedAt });
  }

  return result;
}

/**
 * Wipe every mock tenant database (all versions) back to factory seed.
 *
 * The page reloads afterwards: module-level caches in screens and contexts are
 * simplest to clear by starting again, and it is what a tester expects.
 */
export function resetAllDemoData(options: { reload?: boolean; keepSession?: boolean } = {}): void {
  suspended = true;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;

  const store = storage();
  if (store) {
    const doomed: string[] = [];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (!key) continue;
      if (key.startsWith(PREFIX)) doomed.push(key);
      if (!options.keepSession && key === 'auth.session') doomed.push(key);
    }
    doomed.forEach((key) => store.removeItem(key));
  }

  if (options.reload !== false && typeof window !== 'undefined') {
    window.location.reload();
    return;
  }

  /* Without a reload, reseed in place. */
  suspended = false;
  const tenant = activeTenant;
  activeTenant = null;
  if (tenant) activateTenant(tenant);
}

if (typeof window !== 'undefined') {
  /* A write in the last 150ms before the tab closes still lands. */
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
}
