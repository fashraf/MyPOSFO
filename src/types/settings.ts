import type { ID, Timestamped } from './common';
import type { SaleOrderType } from './sales';

/** Where an order type's items go after payment. */
export type KitchenRoute = 'kitchen' | 'collection' | 'none';

/**
 * When the customer bill prints for an order type:
 *  - on_payment     when the order is placed and paid (counter service, takeaway)
 *  - on_completion  when the order is finished — handed over, served or
 *                   dispatched (dine-in: the bill comes with the food or when
 *                   the table is cleared)
 *  - never          no customer bill (e.g. aggregator deliveries carry their own)
 */
export type ReceiptTiming = 'on_payment' | 'on_completion' | 'never';

export const ORDER_TYPES: SaleOrderType[] = ['dine_in', 'takeaway', 'delivery', 'drive_thru', 'other'];

/** Which tab the checkout customer panel opens on. */
export type DefaultCustomerMode = 'walkin' | 'customer';

/** Whether the cashier must record who performed the work. */
export type ServedByRequirement = 'off' | 'optional' | 'required';

/**
 * Settings are per branch, not per business.
 *
 * A salon branch may need "served by" on every ticket for commission, while
 * the shop next door does not care. One global switch would force the stricter
 * rule on everyone.
 */
export interface BranchSettings extends Timestamped {
  branchId: ID;

  /* Checkout */
  defaultCustomerMode: DefaultCustomerMode;
  servedBy: ServedByRequirement;
  /** Let a cashier sell a tracked product that has run out. */
  allowNegativeStock: boolean;

  /* Receipts */
  defaultBillTemplateId: ID | null;
  autoPrintCustomerBill: boolean;
  autoPrintGroupTickets: boolean;

  /* Money */
  vatRatePercent: number;
  /** Prices as entered already include VAT. Saudi retail convention. */
  pricesIncludeVat: boolean;

  /* Orders and the kitchen */
  /** Order types the cashier can pick. */
  enabledOrderTypes: SaleOrderType[];
  defaultOrderType: SaleOrderType;
  /**
   * Per order type: send to the kitchen screen, put straight on the
   * collection & dispatch board as ready, or send nowhere.
   */
  kitchenRouting: Record<SaleOrderType, KitchenRoute>;
  /** When the customer bill prints, per order type. */
  receiptTiming: Record<SaleOrderType, ReceiptTiming>;
}

export const DEFAULT_BRANCH_SETTINGS: Omit<
  BranchSettings,
  'branchId' | 'createdAt' | 'updatedAt'
> = {
  defaultCustomerMode: 'walkin',
  servedBy: 'optional',
  allowNegativeStock: false,
  defaultBillTemplateId: null,
  autoPrintCustomerBill: true,
  autoPrintGroupTickets: true,
  vatRatePercent: 15,
  pricesIncludeVat: true,
  enabledOrderTypes: ['dine_in', 'takeaway', 'delivery'],
  defaultOrderType: 'takeaway',
  kitchenRouting: { dine_in: 'kitchen', takeaway: 'kitchen', delivery: 'kitchen', drive_thru: 'kitchen', other: 'kitchen' },
  receiptTiming: { dine_in: 'on_completion', takeaway: 'on_payment', delivery: 'on_payment', drive_thru: 'on_payment', other: 'on_payment' },
};
