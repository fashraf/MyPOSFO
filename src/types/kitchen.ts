import type { ID, Timestamped } from './common';

/**
 * Kitchen orders.
 *
 * Only items flagged `requiresPreparation` reach this screen, so a grocery
 * that sells nothing prepared never sees it populate. The board is a view of
 * work in progress, not a second sales ledger.
 */
/**
 * open = ordered, preparing = being cooked, ready = the kitchen is done and it
 * waits at the pass, completed = handed to the customer or the driver,
 * cancelled = the order was cancelled (kept, so the kitchen sees why food
 * stopped and the waste can be counted).
 */
export type KitchenOrderStatus = 'open' | 'preparing' | 'ready' | 'completed' | 'cancelled';

export type OrderType = 'dine_in' | 'takeaway' | 'delivery' | 'drive_thru' | 'other';

export interface KitchenOrderItem {
  id: ID;
  productId: ID;
  nameAr: string;
  nameEn: string;
  quantity: number;
  /** How many of this line have been made. Drives the progress bar. */
  completedQuantity: number;
  note: string;
  /* Structured detail for the kitchen screen. Optional: older tickets only
     have the flattened name and note, and the screen falls back to those. */
  baseAr?: string;
  baseEn?: string;
  mods?: { ar: string; en: string }[];
  /** The meal this item came in, e.g. "Classic Burger Meal". */
  mealAr?: string;
  mealEn?: string;
}

export interface KitchenOrder extends Timestamped {
  id: ID;
  orderNumber: string;
  createdAt: string;
  status: KitchenOrderStatus;
  customerName: string | null;
  orderType: OrderType;
  /** Today's order number within the business session (#1, #2 …). */
  ticketNo?: number;
  items: KitchenOrderItem[];
  totalH: number;
  /* When each step happened. Optional: older tickets do not have them. */
  startedAt?: string;
  readyAt?: string;
  collectedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
}

/** Minutes from order to ready, or null if not ready yet. */
export function prepMinutes(order: KitchenOrder): number | null {
  if (!order.readyAt) return null;
  return Math.max(0, (new Date(order.readyAt).getTime() - new Date(order.createdAt).getTime()) / 60000);
}

/** Elapsed seconds since the order was raised. */
export function elapsedSeconds(order: KitchenOrder, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 1000));
}

export function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

/**
 * Urgency band, computed from elapsed time rather than stored.
 *
 * Storing it would mean something has to tick it over; deriving it means a
 * card that has been sitting for eleven minutes is red the moment anyone
 * looks, with no background job involved.
 */
export type UrgencyBand = 'normal' | 'warning' | 'late';

export const WARNING_AFTER_SECONDS = 5 * 60;
export const LATE_AFTER_SECONDS = 10 * 60;

export function urgencyOf(seconds: number): UrgencyBand {
  if (seconds >= LATE_AFTER_SECONDS) return 'late';
  if (seconds >= WARNING_AFTER_SECONDS) return 'warning';
  return 'normal';
}

/** Share of units completed, 0–1. */
export function progressOf(order: KitchenOrder): number {
  const total = order.items.reduce((sum, item) => sum + item.quantity, 0);
  if (total === 0) return 0;
  const done = order.items.reduce((sum, item) => sum + item.completedQuantity, 0);
  return Math.min(1, done / total);
}

export function isFullyPrepared(order: KitchenOrder): boolean {
  return order.items.every((item) => item.completedQuantity >= item.quantity);
}

/** The action that moves an order forward, or null when it is finished. */
export function nextStatus(status: KitchenOrderStatus): KitchenOrderStatus | null {
  switch (status) {
    case 'open':
      return 'preparing';
    case 'preparing':
      return 'ready';
    case 'ready':
      return 'completed';
    case 'cancelled':
      return null;
    default:
      return null;
  }
}

/**
 * Where an order is, in words a customer would use.
 *
 * Derived from the kitchen ticket: a ticket waiting is "received", one being
 * worked on is "preparing", done is "ready", handed over is "collected". An
 * order with nothing to prepare is "completed" the moment it is paid.
 */
export type FulfilmentStage = 'received' | 'preparing' | 'ready' | 'collected' | 'completed' | 'cancelled';

export function stageOf(order: KitchenOrder | null, cancelled: boolean): FulfilmentStage {
  if (cancelled || order?.status === 'cancelled') return 'cancelled';
  if (!order) return 'completed';
  switch (order.status) {
    case 'open':
      return order.items.some((item) => item.completedQuantity > 0) ? 'preparing' : 'received';
    case 'preparing':
      return 'preparing';
    case 'ready':
      return 'ready';
    default:
      return 'collected';
  }
}
