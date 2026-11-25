import { api } from '@/services/apiClient';
import type { CatalogItem, Category } from '@/types/catalog';
import type { RestaurantSession, CashMovement } from '@/types/restaurantSession';
import type { Sale } from '@/types/sales';
import {
  saveCatalogItem,
  saveCategory,
  serverBacked,
  stockMoves,
  syncCatalog,
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
      );
    },

    async voidSale(id: string, reason: string, actor: string, code?: string): Promise<Sale> {
      await syncSales(true);
      return serverBacked(
        () => base.voidSale(id, reason, actor, code) as Promise<Sale>,
        () => api.post<Sale>(`/api/sales/${encodeURIComponent(id)}/void`, { reason, code, voidedBy: actor }),
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
    async adjustStock(...args: unknown[]) {
      await syncCatalog();
      return serverBacked(
        () => base.adjustStock(...args) as Promise<CatalogItem>,
        (local) => saveCatalogItem({ ...local, setStock: true } as unknown as CatalogItem),
        () => syncCatalog(true),
      );
    },
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
