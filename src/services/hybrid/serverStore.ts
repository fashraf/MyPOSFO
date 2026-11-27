import { api } from '@/services/apiClient';
import { HttpError } from '@/services/http';
import { captureSlice, onFlush, patchSlice, restoreSlice } from '@/services/mock/db';

/**
 * Hybrid mode: every module that does not have its own server tables yet (discounts, inventory, expenses, payroll,
 * settings, users, printers, cash, ledger, customers, credit notes…) is kept on the server as one document per module.
 *
 * - After every local save the changed modules are sent with the revision this device last saw.
 * - Every few seconds the device asks for the revisions and loads whatever another device changed.
 * - If two devices save the same module at the same moment, the first one wins and the second reloads the server copy
 *   (it is told so), so nothing is silently overwritten.
 *
 * Sales, restaurant days, the catalog and kitchen tickets are not here: they already live in their own server tables.
 */

/** Whole slices kept in the store. */
const WHOLE = [
  'access', 'cash', 'company', 'devices', 'discounts', 'expenses', 'ingredients', 'inventory', 'ledger',
  'notifications', 'payroll', 'periods', 'printGroups', 'printers', 'recurring', 'settings', 'tax', 'currencySymbol',
] as const;

/** Parts of the sales slice that are not in the server's sales tables (customers, credit notes, payments). */
/* Credit notes are in the server's own tables now (returns), so they are not here. */
const SALES_EXTRAS = ['customers', 'paymentsStore', 'receiptSequence'] as const;

type Name = (typeof WHOLE)[number] | 'salesExtras';
const NAMES: Name[] = [...WHOLE, 'salesExtras'];
const POLL_MS = 4_000;

interface StoredSlice {
  name: string;
  revision: number;
  data: unknown;
}

const revision = new Map<Name, number>();
const lastJson = new Map<Name, string>();
let started = false;
let applying = false;
let pushing: Promise<void> | null = null;
let pushAgain = false;
let timer: ReturnType<typeof setInterval> | null = null;
let stopFlush: (() => void) | null = null;
let conflictListener: ((name: string) => void) | null = null;

function read(name: Name): unknown {
  if (name !== 'salesExtras') return captureSlice(name);
  const sales = captureSlice('sales') as Record<string, unknown> | undefined;
  if (!sales) return undefined;
  return Object.fromEntries(SALES_EXTRAS.map((k) => [k, sales[k]]));
}

function write(name: Name, data: unknown): void {
  applying = true;
  try {
    if (name !== 'salesExtras') restoreSlice(name, data);
    else patchSlice<Record<string, unknown>>('sales', (current) => ({ ...current, ...(data as Record<string, unknown>) }));
  } finally {
    applying = false;
  }
  lastJson.set(name, JSON.stringify(read(name)));
}

function apply(rows: StoredSlice[]): void {
  for (const row of rows) {
    const name = row.name as Name;
    if (!NAMES.includes(name)) continue;
    if ((revision.get(name) ?? 0) >= row.revision) continue;
    revision.set(name, row.revision);
    if (row.data !== null && row.data !== undefined) write(name, row.data);
  }
}

async function pull(names?: Name[]): Promise<void> {
  const rows = await api.get<StoredSlice[]>('/api/store/slices', names ? { query: { names: names.join(',') } } : {});
  apply(rows);
}

async function check(): Promise<void> {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  const server = await api.get<Record<string, number>>('/api/store/revisions');
  const changed = NAMES.filter((n) => (server[n] ?? 0) > (revision.get(n) ?? 0));
  if (changed.length > 0) await pull(changed);
}

async function pushChanged(): Promise<void> {
  for (const name of NAMES) {
    const data = read(name);
    if (data === undefined) continue;
    const json = JSON.stringify(data);
    if (lastJson.get(name) === json) continue;
    try {
      const saved = await api.put<StoredSlice>(`/api/store/slices/${name}`, {
        baseRevision: revision.get(name) ?? 0,
        data,
      });
      revision.set(name, saved.revision);
      lastJson.set(name, json);
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        /* Another device saved first: take its copy. */
        await pull([name]);
        conflictListener?.(name);
      } else {
        /* Offline or server error: keep the change and try again on the next save or check. */
        return;
      }
    }
  }
}

function schedulePush(): void {
  if (!started || applying) return;
  if (pushing) {
    pushAgain = true;
    return;
  }
  pushing = pushChanged()
    .catch(() => undefined)
    .finally(() => {
      pushing = null;
      if (pushAgain) {
        pushAgain = false;
        schedulePush();
      }
    });
}

/**
 * Start after sign-in. Loads the server copy of every module first; a module the server does not have yet is
 * uploaded from this device (the first device to sign in after the update brings its data along).
 */
export async function startServerStore(): Promise<void> {
  if (started) return;
  started = true;
  try {
    await pull();
  } catch {
    /* The server is unreachable: keep working locally and catch up on the next check. */
  }
  stopFlush = onFlush(schedulePush);
  schedulePush();
  timer = setInterval(() => {
    void check()
      .then(() => schedulePush())
      .catch(() => undefined);
  }, POLL_MS);
}

export function stopServerStore(): void {
  started = false;
  if (timer) clearInterval(timer);
  timer = null;
  stopFlush?.();
  stopFlush = null;
  revision.clear();
  lastJson.clear();
}

/** Check the server now (the Refresh buttons). */
export function refreshServerStore(): Promise<void> {
  return started ? check() : Promise.resolve();
}

export function onStoreConflict(listener: ((name: string) => void) | null): void {
  conflictListener = listener;
}
