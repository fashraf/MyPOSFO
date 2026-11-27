import { api } from '@/services/apiClient';
import type { CatalogItem, Category } from '@/types/catalog';
import type { RestaurantSession, CashMovement } from '@/types/restaurantSession';
import type { Sale } from '@/types/sales';
import {
  pushChangedTickets,
  saveCatalogItem,
  saveCategory,
  serverBacked,
  stockMoves,
  syncCatalog,
  syncKitchen,
  syncSales,
  syncSessions,
} from './serverCore';

/* The service types are taken from the objects passed in, so this file never imports the services themselves. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyService = Record<string, any>;

function refreshingReads<T extends AnyService>(base: T, names: (keyof T)[], refresh: () => Promise<unknown>): Partial<T> {
  const out: Partial<T> = {};
  for (const name of names) {
    const original = base[name];
    if (typeof original !== 'function') continue;
    out[name] = (async (...args: unknown[]) => {
      await refresh();
      return original.apply(base, args);
    }) as T[keyof T];
  }
  return out;
}

/* ------------------------------------------------------- restaurant sessions */

export function hybridSessions<T extends AnyService>(base: T): T {
  const both = () => Promise.all([syncSessions(), syncSales()]);
  return {
    ...base,
    ...refreshingReads(base, ['status', 'current', 'latest', 'get', 'summary', 'movements', 'auditLog', 'closingPreview', 'history'], both),

    async open(input: any, actor: any): Promise<RestaurantSession> {
      await syncSessions(true);
      return serverBacked(
        () => base.open(input, actor),
        () => api.post<RestaurantSession>('/api/restaurant-sessions/open', {
          branchId: input.branchId, registerId: input.registerId, openingBalanceH: input.openingBalanceH,
          openingNotes: input.notes ?? '', businessDate: input.businessDate, openedBy: actor?.name, idempotencyKey: input.idempotencyKey,
        }),
        () => syncSessions(true),
      );
    },

    async addMovement(input: any, actor: any): Promise<CashMovement> {
      await syncSessions(true);
      return serverBacked(
        () => base.addMovement(input, actor),
        () => api.post<CashMovement>(`/api/restaurant-sessions/${encodeURIComponent(input.sessionId)}/cash-movements`, {
          type: input.type, amountH: input.amountH, description: input.description, createdBy: actor?.name,
        }),
        () => syncSessions(true),
      );
    },

    /* One source of truth for the drawer: the server's own expected cash (sales, returns, cancels, movements). */
    async summary(id: string): Promise<any> {
      await both();
      const local: any = await base.summary(id);
      if (!local || local.cash === undefined || !/^\d+$/.test(String(id))) return local;
      try {
        const server = await api.get<Record<string, number>>(`/api/restaurant-sessions/${encodeURIComponent(id)}/closing-preview`);
        return { ...local, cash: { ...local.cash, ...server } };
      } catch {
        return local;
      }
    },

    async closingPreview(id: string): Promise<any> {
      await both();
      const local: any = await base.closingPreview(id);
      if (!local?.summary?.cash || !/^\d+$/.test(String(id))) return local;
      try {
        const server = await api.get<Record<string, number>>(`/api/restaurant-sessions/${encodeURIComponent(id)}/closing-preview`);
        return { ...local, summary: { ...local.summary, cash: { ...local.summary.cash, ...server } } };
      } catch {
        return local;
      }
    },

    async close(input: any, actor: any): Promise<RestaurantSession> {
      await Promise.all([syncSessions(true), syncSales(true)]);
      return serverBacked(
        () => base.close(input, actor) as Promise<RestaurantSession>,
        (closed) => api.post<RestaurantSession>(`/api/restaurant-sessions/${encodeURIComponent(input.sessionId)}/close`, {
          actualClosingH: input.actualClosingH, closingNotes: input.closingNotes, discrepancyReason: input.discrepancyReason,
          closedBy: actor?.name, summary: closed.summary ?? null,
        }),
        () => syncSessions(true),
      );
    },

    async reopen(id: string, reason: string, actor: any): Promise<RestaurantSession> {
      await syncSessions(true);
      return serverBacked(
        () => base.reopen(id, reason, actor),
        () => api.post<RestaurantSession>(`/api/restaurant-sessions/${encodeURIComponent(id)}/reopen`, { reason, reopenedBy: actor?.name }),
        () => syncSessions(true),
      );
    },
  } as T;
}

/* ------------------------------------------------------------------- sales */

export function hybridSales<T extends AnyService>(base: T): T {
  return {
    ...base,
    ...refreshingReads(base, ['list', 'get', 'recent', 'todaySummary', 'analytics'], () => syncSales()),

    async commit(input: any): Promise<Sale> {
      await syncSessions(true);
      const key = input.idempotencyKey ?? globalThis.crypto?.randomUUID?.() ?? `sal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return serverBacked(
        () => base.commit({ ...input, idempotencyKey: key }) as Promise<Sale>,
        (local) => api.post<Sale>('/api/sales', { sale: local, idempotencyKey: key, stockMovements: stockMoves(local.lines) }),
        async () => {
          await Promise.all([syncSales(true), syncSessions(true)]);
          void syncCatalog(true).catch(() => undefined);
        },
        /* The sale is committed: show the done screen now, lists catch up in the background. */
        false,
      );
    },

    async voidSale(id: string, reason: string, actor: string, code?: string, replacedByInvoice?: string): Promise<Sale> {
      await syncSales(true);
      return serverBacked(
        () => base.voidSale(id, reason, actor, code, replacedByInvoice) as Promise<Sale>,
        () => api.post<Sale>(`/api/sales/${encodeURIComponent(id)}/void`, { reason, code, voidedBy: actor, replacedByInvoice }),
        async () => {
          await syncSales(true);
          void syncCatalog(true).catch(() => undefined);
        },
      );
    },

  } as T;
}

/* ----------------------------------------------------------------- returns */

/** Returns (credit notes) are committed by the server: number 500001+, cash refund in the open day, stock back. */
export function hybridReturns<T extends AnyService>(base: T): T {
  return {
    ...base,
    ...refreshingReads(base, ['notesFor', 'remaining'], () => syncSales()),
    async issue(input: any): Promise<any> {
      await syncSales(true);
      const key = globalThis.crypto?.randomUUID?.() ?? `crn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return serverBacked(
        () => base.issue(input),
        (local: any) => api.post(`/api/sales/${encodeURIComponent(input.saleId)}/returns`, { note: local, idempotencyKey: key }),
        async () => {
          await syncSales(true);
          void syncCatalog(true).catch(() => undefined);
        },
      );
    },
  } as T;
}

/* ----------------------------------------------------------------- catalog */

export function hybridCatalog<T extends AnyService>(base: T): T {
  const pushItem = (local: CatalogItem) => saveCatalogItem(local);
  const write = (name: string) => async (...args: unknown[]) => {
    await syncCatalog();
    return serverBacked(() => base[name](...args) as Promise<CatalogItem>, pushItem, () => syncCatalog(true));
  };
  return {
    ...base,
    ...refreshingReads(base, ['list', 'get', 'posItems', 'lowStock', 'summary'], () => syncCatalog()),
    create: write('create'),
    update: write('update'),
    activate: write('activate'),
    deactivate: write('deactivate'),
    setCost: write('setCost'),
    /* adjustStock is NOT pushed: during a sale the local inventory step calls it, and pushing that local figure
       overwrote the server's stock (60 became -1). Sales move stock on the server, inside the sale transaction; the
       next catalog sync shows the server's figure. Stock-screen adjustments move to the server with the inventory slice. */
  } as T;
}

export function hybridCategories<T extends AnyService>(base: T): T {
  return {
    ...base,
    ...refreshingReads(base, ['list', 'usage'], () => syncCatalog()),
    async create(input: unknown): Promise<Category> {
      await syncCatalog();
      return serverBacked(() => base.create(input) as Promise<Category>, async (local) => {
        await saveCategory(local);
        return local;
      }, () => syncCatalog(true));
    },
  } as T;
}

/* ----------------------------------------------------------------- kitchen */

/** Kitchen and collection boards shared through the server; the ticket logic itself stays here. */
export function hybridKitchen<T extends AnyService>(base: T, tickets: () => { orderNumber: string; id: string; status: string }[]): T {
  /* A new ticket needs no fresh download first, and nobody needs to wait for the board to refresh after it. */
  const write = (name: string, fresh = true) => async (...args: unknown[]) => {
    if (fresh) await syncKitchen(true);
    const before = structuredClone(tickets());
    return serverBacked(
      () => base[name](...args),
      async (result) => {
        await pushChangedTickets(before, tickets());
        return result;
      },
      () => syncKitchen(true),
      fresh,
    );
  };
  return {
    ...base,
    ...refreshingReads(base, ['list', 'forOrder', 'hasStarted'], () => syncKitchen()),
    setStatus: write('setStatus'),
    restore: write('restore'),
    setItemProgress: write('setItemProgress'),
    cancelForOrder: write('cancelForOrder'),
    createFromSale: write('createFromSale', false),
  } as T;
}
