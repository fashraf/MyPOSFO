import type { ID, Timestamped } from './common';
import { activeTax, computeTax, type TaxLine, type TaxSettings } from './tax';
import type { CatalogItemKind } from './catalog';
import type { ZatcaInvoiceMeta } from './zatca';

/** Saudi standard rate. Lives here until settings are configurable. */
export const VAT_RATE = 0.15;

export type SaleOrderType = 'dine_in' | 'takeaway' | 'delivery' | 'drive_thru' | 'other';

export interface SaleTaxSnapshot {
  enabled: boolean;
  inclusive: boolean;
  name: string;
  registrationLabel: string;
  lines: TaxLine[];
}

export type PaymentMethod = 'cash' | 'card' | 'credit';

export type SaleStatus = 'completed' | 'returned' | 'partially_returned' | 'voided';

/**
 * A line on a sale.
 *
 * Prices are captured at the moment of sale and never re-read from the catalog.
 * If an item's price changes tomorrow, yesterday's receipt must not change with
 * it — so the line owns its own copy.
 */
export interface SaleLine {
  id: ID;
  itemId: ID;
  kind: CatalogItemKind;
  nameAr: string;
  nameEn: string;
  quantity: number;
  /** VAT-inclusive unit price at time of sale, in halalas. */
  unitPriceH: number;
  /** Unit cost at time of sale, for margin reporting. */
  unitCostH: number;
  /** Line-level discount in halalas, already applied to the totals. */
  discountH: number;
  /** Modifiers chosen at the till, already folded into `unitPriceH`. */
  modifiers?: SaleLineModifier[];
  /** For a combo: what went into it, as chosen. Prices already folded in. */
  components?: SaleLineComponent[];
  /** Tax rate for this line; the default rate when absent. */
  taxRateId?: string | null;
}

/** One item inside a combo line. Quantities are per one combo. */
export interface SaleLineComponent {
  slotId: ID;
  slotNameAr: string;
  slotNameEn: string;
  itemId: ID;
  nameAr: string;
  nameEn: string;
  quantity: number;
  /** Swap charge plus any modifier charges, per one combo. */
  priceDeltaH: number;
  unitCostH: number;
  modifiers?: SaleLineModifier[];
  /** Whether the kitchen makes it (the burger) or it is handed over (the can). */
  requiresPreparation: boolean;
}

export interface SaleLineModifier {
  groupId: ID;
  optionId: ID;
  nameAr: string;
  nameEn: string;
  priceDeltaH: number;
  /* Carried for options that are not on the item itself (a meal's size or
     extras), so stock can still be worked out from the sale alone. */
  ingredientId?: string;
  quantity?: number;
  scale?: number;
}

export interface SalePayment {
  method: PaymentMethod;
  /** Amount tendered against this method, in halalas. */
  amountH: number;
}

export interface Sale extends Timestamped {
  /**
   * The branch this sale happened at.
   *
   * Null only for records created before branches existed. Every read path
   * treats null as "belongs to whichever branch is asking", so legacy data
   * stays visible rather than disappearing.
   */
  branchId: ID | null;
  id: ID;
  /** Human-readable invoice number, e.g. INV-1042. */
  invoiceNumber: string;
  lines: SaleLine[];
  payments: SalePayment[];
  customerId: ID | null;
  cashierName: string;
  /** Invoice-level discount in halalas. */
  discountH: number;
  /** Net of VAT. */
  subtotalH: number;
  taxH: number;
  totalH: number;
  /** Cash handed over, for the change calculation. Null for non-cash sales. */
  tenderedH: number | null;
  changeH: number;
  status: SaleStatus;
  soldAt: string;
  /** Set only when the sale is voided — who, when, and why. */
  voidReason?: string;
  voidedBy?: string;
  voidedAt?: string;
  /** How tax was worked out when this order was taken. Kept so history never changes with settings. */
  tax?: SaleTaxSnapshot;
  /** Dine-in, takeaway, delivery… decides whether it goes to the kitchen. */
  orderType?: SaleOrderType;
  /** Order number within the business session: 1, 2, 3 … restarts each session. */
  orderNo?: number;
  /** The restaurant business session this order was taken in. */
  sessionId?: ID;
  /** The session that was open when the order was cancelled — where any refund lands. */
  voidSessionId?: ID;
  /** Client-generated key; a retried commit with the same key returns the original sale. */
  idempotencyKey?: string;
  /** ZATCA Phase 2 stamp: UUID, ICV, hash chain and the QR payload. */
  zatca?: ZatcaInvoiceMeta;
  /** Why it was cancelled, as a code from the reason list, alongside the free text. */
  cancelReasonCode?: CancelReasonCode;
  /** Set on an order created by editing another one. */
  replacesInvoice?: string;
  /** Set on an order that was replaced by an edit. */
  replacedByInvoice?: string;
  /** Edit that lowered the total: what was handed back to the customer. */
  refundH?: number;
}

/** Reasons offered when cancelling an order. "other" requires a note. */
export const CANCEL_REASONS = [
  'customer_changed_mind',
  'wrong_items',
  'duplicate_order',
  'payment_problem',
  'item_unavailable',
  'long_wait',
  'test_order',
  'edited',
  'other',
] as const;

export type CancelReasonCode = (typeof CANCEL_REASONS)[number];

export interface Customer extends Timestamped {
  id: ID;
  nameAr: string;
  nameEn: string;
  phone: string;
  email: string;
  /** Outstanding balance in halalas. Positive means the customer owes money. */
  balanceH: number;
  /** Credit ceiling in halalas. Zero means no credit allowed. */
  creditLimitH: number;
  status: 'active' | 'inactive';
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

/**
 * Displayed prices are VAT-inclusive, which is how Saudi retail quotes them.
 * The tax component is therefore extracted from the gross rather than added to
 * a net, and every intermediate result stays an integer.
 */
export function taxFromGross(grossH: number, rate: number = VAT_RATE): number {
  return Math.round((grossH * rate) / (1 + rate));
}

export function lineGrossH(line: SaleLine): number {
  return Math.max(0, line.unitPriceH * line.quantity - line.discountH);
}

export interface CartTotals {
  /** Sum of line amounts as entered (incl. or excl. tax per settings), before the invoice discount. */
  grossH: number;
  discountH: number;
  /** Excluding tax, after discount. */
  subtotalH: number;
  taxH: number;
  /** What the customer pays. */
  totalH: number;
  itemCount: number;
  lineCount: number;
  /** Per component: "VAT 15%", or "CGST 2.5%" + "SGST 2.5%". Empty when tax is off. */
  taxLines: TaxLine[];
  taxEnabled: boolean;
  pricesIncludeTax: boolean;
}

/**
 * The single place cart totals are computed.
 *
 * Both the cart panel and the payment modal call this, so the number the
 * cashier sees is by construction the number that gets posted — there is no
 * second implementation to drift out of step.
 *
 * The invoice discount is spread across lines in proportion to their value
 * (remainder to the largest), so each line is taxed at its own rate on what was
 * actually charged.
 */
export function computeTotals(lines: SaleLine[], invoiceDiscountH = 0, settings: TaxSettings = activeTax()): CartTotals {
  const amounts = lines.map((line) => lineGrossH(line));
  const grossH = amounts.reduce((sum, a) => sum + a, 0);
  const discountH = Math.min(Math.max(0, invoiceDiscountH), grossH);

  const shares = amounts.map((a) => (grossH > 0 ? Math.floor((discountH * a) / grossH) : 0));
  let rest = discountH - shares.reduce((s, x) => s + x, 0);
  if (rest > 0 && amounts.length > 0) {
    const biggest = amounts.indexOf(Math.max(...amounts));
    shares[biggest] += rest;
    rest = 0;
  }

  const tax = computeTax(
    lines.map((line, i) => ({ amountH: amounts[i] - shares[i], rateId: line.taxRateId })),
    settings,
  );

  return {
    grossH,
    discountH,
    subtotalH: tax.netH,
    taxH: tax.taxH,
    totalH: tax.totalH,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    lineCount: lines.length,
    taxLines: tax.lines,
    taxEnabled: settings.enabled,
    pricesIncludeTax: settings.pricesIncludeTax,
  };
}

/** Freeze how an order was taxed, for receipts and history. */
export function taxSnapshot(totals: CartTotals, settings: TaxSettings = activeTax()): SaleTaxSnapshot {
  return {
    enabled: totals.taxEnabled,
    inclusive: totals.pricesIncludeTax,
    name: settings.taxName,
    registrationLabel: settings.registrationLabel,
    lines: totals.taxLines,
  };
}

/* ------------------------------------------------------------------ */
/* Returns and voids                                                   */
/* ------------------------------------------------------------------ */

/**
 * A void and a return are different events, not two words for the same thing.
 *
 *  - A **void** cancels a sale that should never have been recorded. The whole
 *    invoice is reversed and nothing of it survives into revenue.
 *  - A **return** is a real, later transaction: the customer keeps the history
 *    of having bought, and a credit note offsets part or all of it.
 *
 * Keeping them apart matters because they post differently, and collapsing them
 * now would be expensive to unpick once there is a ledger behind this.
 */
export type ReturnReason =
  | 'damaged'
  | 'not_as_described'
  | 'changed_mind'
  | 'wrong_item'
  | 'other';

export interface CreditNoteLine {
  saleLineId: ID;
  itemId: ID;
  nameAr: string;
  nameEn: string;
  quantity: number;
  unitPriceH: number;
}

export interface CreditNote extends Timestamped {
  id: ID;
  /** Human-readable credit note number, e.g. CN-204. */
  noteNumber: string;
  saleId: ID;
  saleInvoiceNumber: string;
  lines: CreditNoteLine[];
  reason: ReturnReason;
  /** Free text the cashier adds. Required when the reason is "other". */
  note: string;
  subtotalH: number;
  taxH: number;
  totalH: number;
  refundMethod: PaymentMethod;
  /** The restaurant session the refund was paid out in. */
  sessionId?: ID;
  issuedBy: string;
  issuedAt: string;
}

/**
 * How many of each line remain returnable, given everything already credited.
 * Derived, never stored — a stored counter drifts the moment anything fails
 * halfway.
 */
export function remainingQuantities(sale: Sale, notes: CreditNote[]): Record<string, number> {
  const returned = notes
    .filter((note) => note.saleId === sale.id)
    .flatMap((note) => note.lines)
    .reduce<Record<string, number>>((totals, line) => {
      totals[line.saleLineId] = (totals[line.saleLineId] ?? 0) + line.quantity;
      return totals;
    }, {});

  return sale.lines.reduce<Record<string, number>>((remaining, line) => {
    remaining[line.id] = Math.max(0, line.quantity - (returned[line.id] ?? 0));
    return remaining;
  }, {});
}

/**
 * Totals for a proposed return.
 *
 * Refunds follow the original order, not today's settings: the share of the
 * original line value being returned, applied to what was actually charged.
 * Pass the sale when you have it; without it the current settings are used.
 */
export function computeReturnTotals(lines: CreditNoteLine[], sale?: Pick<Sale, 'lines' | 'totalH' | 'taxH' | 'discountH'>): {
  subtotalH: number;
  taxH: number;
  totalH: number;
} {
  const amountH = lines.reduce((sum, line) => sum + line.unitPriceH * line.quantity, 0);
  if (sale) {
    const saleGrossH = sale.lines.reduce((sum, line) => sum + lineGrossH(line), 0);
    if (saleGrossH <= 0) return { subtotalH: 0, taxH: 0, totalH: 0 };
    const totalH = Math.min(sale.totalH, Math.round((amountH * sale.totalH) / saleGrossH));
    const taxH = sale.totalH > 0 ? Math.round((totalH * sale.taxH) / sale.totalH) : 0;
    return { subtotalH: totalH - taxH, taxH, totalH };
  }
  const tax = computeTax([{ amountH }]);
  return { subtotalH: tax.netH, taxH: tax.taxH, totalH: tax.totalH };
}

/* ------------------------------------------------------------------ */
/* Customer statements                                                 */
/* ------------------------------------------------------------------ */

/** A payment received against a customer's outstanding balance. */
export interface CustomerPayment extends Timestamped {
  id: ID;
  receiptNumber: string;
  customerId: ID;
  amountH: number;
  method: Exclude<PaymentMethod, 'credit'>;
  note: string;
  receivedBy: string;
  receivedAt: string;
}

export type StatementEntryKind = 'credit_sale' | 'payment' | 'credit_note';

/**
 * One line of a customer statement.
 *
 * `amountH` is signed from the customer's point of view: positive increases
 * what they owe, negative reduces it. A running balance is then just a
 * cumulative sum, with no per-type branching to get wrong.
 */
export interface StatementEntry {
  id: ID;
  kind: StatementEntryKind;
  reference: string;
  date: string;
  amountH: number;
  balanceH: number;
}

/** Build a statement in chronological order, carrying a running balance. */
export function buildStatement(
  entries: Omit<StatementEntry, 'balanceH'>[],
  openingBalanceH = 0,
): StatementEntry[] {
  const ordered = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  let running = openingBalanceH;
  return ordered.map((entry) => {
    running += entry.amountH;
    return { ...entry, balanceH: running };
  });
}

/** How much credit the customer has left before hitting their ceiling. */
export function availableCreditH(customer: Customer): number {
  return Math.max(0, customer.creditLimitH - customer.balanceH);
}

/** Share of the limit already used, as a ratio, for the utilisation bar. */
export function creditUtilisation(customer: Customer): number {
  if (customer.creditLimitH <= 0) return customer.balanceH > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, customer.balanceH / customer.creditLimitH));
}
