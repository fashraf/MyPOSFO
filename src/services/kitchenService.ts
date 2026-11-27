import { SAMPLE_ACTIVITY, SERVER_CORE } from '@/config/env';
import { newestOrderFirst } from '@/lib/orderSort';
import { hybridKitchen } from './hybrid/wrappers';
import { USE_MOCKS } from '@/config/env';
import { kitchenApi } from './api';
import { invalidate } from './dataVersion';
import type { KitchenOrder, KitchenOrderStatus } from '@/types/kitchen';
import type { CatalogItem } from '@/types/catalog';
import { isFullyPrepared } from '@/types/kitchen';
import { delay, nextId, notFound, timestamp } from './mock/store';
import { seedFor } from './mock/seed';
import { registerSlice, schedulePersist } from './mock/db';

let orders: KitchenOrder[] = [];

registerSlice('kitchen', {
  capture: () => ({ orders }),
  restore: (s: { orders: KitchenOrder[] }) => {
    if (!Array.isArray(s.orders)) throw new Error('kitchen snapshot is malformed');
    orders = s.orders;
  },
  seed: (tenantId) => {
    /* Tickets are aged relative to now when seeded, so the board always opens
       with a fresh, a warning and a late card. */
    const seed = seedFor(tenantId);
    orders = SAMPLE_ACTIVITY ? [...seed.kitchenOrders, ...todaysHistory(seed.catalog, tenantId)] : [];
  },
});

/* Fired when an order is finished (handed over, served or dispatched) — the
   moment a dine-in bill prints when the branch prints bills on completion. */
const completedListeners = new Set<(order: KitchenOrder) => void>();
export function onKitchenOrderCompleted(listener: (order: KitchenOrder) => void): () => void {
  completedListeners.add(listener);
  return () => completedListeners.delete(listener);
}

const baseKitchenService = {
  async list(): Promise<KitchenOrder[]> {
    if (!USE_MOCKS) {
      /* The service takes no branch; the endpoint scopes by the token's
         branch claims, which is the stricter of the two. */
      const rows = await kitchenApi.orders({});
      return rows as never;
    }

    await delay(160);
    return [...orders].sort(newestOrderFirst);
  },

  async setStatus(id: string, status: KitchenOrderStatus): Promise<KitchenOrder> {
    if (!USE_MOCKS) {
      await kitchenApi.setStatus(id, status);
      invalidate('sales');

      /* Read it back rather than assuming. The board shows the order after the
         change, and the server may have adjusted more than the status. */
      const rows = await kitchenApi.orders({});
      const updated = (rows as unknown as KitchenOrder[]).find((o) => o.id === id);
      if (!updated) throw new Error('The order was updated but could not be read back.');
      return updated;
    }

    await delay(220);

    const existing = orders.find((order) => order.id === id);
    if (!existing) throw notFound('Order', id);

    /* Completing from the board marks every line done, so the progress bar
       never disagrees with the status badge. */
    const items =
      status === 'completed' || status === 'ready'
        ? existing.items.map((item) => ({ ...item, completedQuantity: item.quantity }))
        : existing.items;

    const now = timestamp();
    /* Stamp each step so the analytics can measure it; moving back clears the later stamps. */
    const stamps: Partial<KitchenOrder> =
      status === 'open' ? { startedAt: undefined, readyAt: undefined, collectedAt: undefined }
      : status === 'preparing' ? { startedAt: existing.startedAt ?? now, readyAt: undefined, collectedAt: undefined }
      : status === 'ready' ? { startedAt: existing.startedAt ?? now, readyAt: now, collectedAt: undefined }
      : status === 'completed' ? { readyAt: existing.readyAt ?? now, collectedAt: now }
      : {};
    const updated: KitchenOrder = { ...existing, ...stamps, status, items, updatedAt: now };
    orders = orders.map((order) => (order.id === id ? updated : order));
    if (status === 'completed' && existing.status !== 'completed') {
      for (const listener of [...completedListeners]) listener(updated);
    }
    return updated;
  },

  /** Put a ticket back exactly as it was — the kitchen screen's Undo. */
  async restore(snapshot: KitchenOrder): Promise<KitchenOrder> {
    if (!USE_MOCKS) return kitchenService.setStatus(snapshot.id, snapshot.status);
    await delay(80);
    const restored = { ...snapshot, updatedAt: timestamp() };
    orders = orders.map((order) => (order.id === snapshot.id ? restored : order));
    return restored;
  },

  /** Tick one line's completed count up or down. */
  async setItemProgress(
    orderId: string,
    itemId: string,
    completedQuantity: number,
  ): Promise<KitchenOrder> {
    await delay(140);

    const existing = orders.find((order) => order.id === orderId);
    if (!existing) throw notFound('Order', orderId);

    const items = existing.items.map((item) =>
      item.id === itemId
        ? { ...item, completedQuantity: Math.max(0, Math.min(item.quantity, completedQuantity)) }
        : item,
    );

    const candidate: KitchenOrder = { ...existing, items, updatedAt: timestamp() };

    /* Finishing the last line moves the order to ready by itself — nobody
       should have to tick every item and then press a button as well. */
    const status: KitchenOrderStatus =
      isFullyPrepared(candidate) && candidate.status === 'preparing'
        ? 'ready'
        : candidate.status === 'open' && items.some((item) => item.completedQuantity > 0)
          ? 'preparing'
          : candidate.status;

    const now = timestamp();
    const updated: KitchenOrder = {
      ...candidate,
      status,
      ...(status === 'preparing' && !candidate.startedAt ? { startedAt: now } : {}),
      ...(status === 'ready' && candidate.status !== 'ready' ? { readyAt: now } : {}),
    };
    orders = orders.map((order) => (order.id === orderId ? updated : order));
    return updated;
  },

  /** The ticket for an order, if it reached the kitchen. */
  async forOrder(orderNumber: string): Promise<KitchenOrder | null> {
    if (!USE_MOCKS) {
      const payload = (await kitchenApi.orders({ includeCompleted: true })) as unknown;
      const rows = (Array.isArray(payload) ? payload : (payload as { orders?: KitchenOrder[] }).orders ?? []) as KitchenOrder[];
      return rows.find((order) => order.orderNumber === orderNumber) ?? null;
    }
    await delay(80);
    return orders.find((order) => order.orderNumber === orderNumber && order.status !== 'cancelled')
      ?? orders.find((order) => order.orderNumber === orderNumber) ?? null;
  },

  /**
   * Has the kitchen touched this order? Once a cook has started, the order can
   * no longer be edited from the till — only cancelled, with the waste noted.
   */
  async hasStarted(orderNumber: string): Promise<boolean> {
    const order = await kitchenService.forOrder(orderNumber);
    if (!order) return false;
    return order.status !== 'open' || order.items.some((item) => item.completedQuantity > 0);
  },

  /** Take a cancelled or replaced order off the board. */
  /** Mark the ticket cancelled. Kept on record so the kitchen sees why it stopped. */
  async cancelForOrder(orderNumber: string, reason = ''): Promise<void> {
    if (!USE_MOCKS) return;
    const now = timestamp();
    orders = orders.map((order) =>
      order.orderNumber === orderNumber && order.status !== 'cancelled' && order.status !== 'completed'
        ? { ...order, status: 'cancelled', cancelledAt: now, cancelReason: reason, updatedAt: now }
        : order,
    );
    schedulePersist();
  },

  /** Called by the POS when a sale contains anything needing preparation. */
  async createFromSale(input: {
    orderNumber: string;
    customerName: string | null;
    totalH: number;
    items: { productId: string; nameAr: string; nameEn: string; quantity: number; note?: string;
      baseAr?: string; baseEn?: string; mods?: { ar: string; en: string }[]; mealAr?: string; mealEn?: string }[];
    orderType?: KitchenOrder['orderType'];
    /** 'ready' puts it straight on the collection board (nothing to cook). */
    startAs?: 'open' | 'ready';
    ticketNo?: number;
    replacesOrder?: string;
    replacesTicketNo?: number;
  }): Promise<KitchenOrder | null> {
    if (input.items.length === 0) return null;

    const now = timestamp();
    const order: KitchenOrder = {
      id: nextId('kor'),
      orderNumber: input.orderNumber,
      createdAt: now,
      status: input.startAs ?? 'open',
      ...(input.startAs === 'ready' ? { readyAt: now } : {}),
      customerName: input.customerName,
      orderType: input.orderType ?? 'takeaway',
      ticketNo: input.ticketNo,
      ...(input.replacesOrder ? { replacesOrder: input.replacesOrder, replacesTicketNo: input.replacesTicketNo } : {}),
      totalH: input.totalH,
      items: input.items.map((item) => ({
        id: nextId('koi'),
        productId: item.productId,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        quantity: item.quantity,
        completedQuantity: 0,
        note: item.note ?? '',
        baseAr: item.baseAr,
        baseEn: item.baseEn,
        mods: item.mods,
        mealAr: item.mealAr,
        mealEn: item.mealEn,
      })),
      updatedAt: now,
    };

    orders = [...orders, order];
    /* No simulated latency here (it rides on the sale), so persist explicitly. */
    schedulePersist();
    return order;
  },
};


/**
 * Earlier today's finished tickets, so the analytics panel has something real
 * to show on a fresh demo. Deterministic per tenant; times are relative to now.
 */
function todaysHistory(catalog: CatalogItem[], tenantId: string): KitchenOrder[] {
  const prep = catalog.filter((item) => item.requiresPreparation && !item.combo && item.status === 'active');
  if (prep.length === 0) return [];
  let seed = [...tenantId].reduce((a, c) => a + c.charCodeAt(0), 7);
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(7, 0, 0, 0);
  const span = Math.max(60 * 60 * 1000, now - 40 * 60 * 1000 - startOfDay.getTime());
  const types: KitchenOrder['orderType'][] = ['takeaway', 'takeaway', 'dine_in', 'delivery', 'dine_in', 'delivery'];
  const out: KitchenOrder[] = [];
  const count = 26;
  for (let n = 0; n < count; n += 1) {
    const created = startOfDay.getTime() + (span * n) / count + rand() * 6 * 60000;
    const prepMin = 3 + rand() * 8.5;
    const waitMin = 1 + rand() * 4;
    const cancelled = n % 13 === 7;
    const lines = 1 + Math.floor(rand() * 3);
    const items = Array.from({ length: lines }, (_, i) => {
      const item = prep[Math.floor(rand() * prep.length)];
      const qty = 1 + Math.floor(rand() * 2);
      return {
        id: `koh_${n}_${i}`, productId: item.id, nameAr: item.nameAr, nameEn: item.nameEn,
        quantity: qty, completedQuantity: cancelled ? 0 : qty, note: '', baseAr: item.nameAr, baseEn: item.nameEn, mods: [],
      };
    });
    const iso = (t: number) => new Date(t).toISOString();
    out.push({
      id: `kor_h${n}`,
      orderNumber: `H-${String(100 + n)}`,
      createdAt: iso(created),
      updatedAt: iso(created + (prepMin + waitMin) * 60000),
      status: cancelled ? 'cancelled' : 'completed',
      customerName: null,
      orderType: types[n % types.length],
      items,
      totalH: 0,
      ...(cancelled
        ? { cancelledAt: iso(created + 2 * 60000), cancelReason: 'customer_changed_mind' }
        : { startedAt: iso(created + 40000), readyAt: iso(created + prepMin * 60000), collectedAt: iso(created + (prepMin + waitMin) * 60000) }),
    });
  }
  return out;
}

/** Hybrid mode: tickets live on the server so every device shows the same board. */
export const kitchenService = SERVER_CORE ? hybridKitchen(baseKitchenService, () => orders) : baseKitchenService;
