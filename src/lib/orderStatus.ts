import type { BadgeTone } from '@/components/ui';
import type { KitchenOrder } from '@/types/kitchen';
import type { Sale } from '@/types/sales';

/**
 * One status for an order, the same on every screen (Sales, Dashboard, order detail, Kitchen, Collection).
 * It combines what happened to the invoice (cancelled, edited, returned) with where the kitchen is.
 */
export type OrderStatus =
  | 'new' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'edited' | 'returned' | 'partially_returned';

export const ORDER_STATUSES: OrderStatus[] =
  ['new', 'preparing', 'ready', 'completed', 'cancelled', 'edited', 'partially_returned', 'returned'];

export const ORDER_STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  new: 'info',
  preparing: 'warning',
  ready: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  edited: 'warning',
  returned: 'warning',
  partially_returned: 'warning',
};

type SaleLike = Pick<Sale, 'status' | 'invoiceNumber'> & Partial<Pick<Sale, 'cancelReasonCode' | 'replacedByInvoice'>>;

export function orderStatus(sale: SaleLike, ticket?: Pick<KitchenOrder, 'status'> | null): OrderStatus {
  if (sale.status === 'voided') return sale.replacedByInvoice || sale.cancelReasonCode === 'edited' ? 'edited' : 'cancelled';
  if (sale.status === 'returned' || sale.status === 'partially_returned') return sale.status;
  switch (ticket?.status) {
    case 'open': return 'new';
    case 'preparing': return 'preparing';
    case 'ready': return 'ready';
    case 'cancelled': return 'cancelled';
    default: return 'completed'; // collected, or nothing to prepare
  }
}

/** Tickets by order (invoice) number, latest first wins. */
export function ticketsByOrder<T extends Pick<KitchenOrder, 'orderNumber'>>(tickets: T[]): Map<string, T> {
  return new Map(tickets.map((ticket) => [ticket.orderNumber, ticket]));
}
