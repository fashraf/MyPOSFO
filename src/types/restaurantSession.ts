import type { ID, Timestamped } from './common';

/**
 * Restaurant business sessions — the "day" a restaurant is open for.
 *
 * A session starts when someone opens the restaurant with a counted float
 * and ends when the drawer is counted and the day is closed. Every order
 * belongs to exactly one session, and the session's business date — not the
 * calendar date of the order — is what reports group by. A session opened on
 * 20 November at 10:00 and closed on 21 November at 02:00 is the 20 November
 * business day, start to finish.
 *
 * Money is integer halalas throughout: never floating-point SAR.
 */

export type SessionStatus = 'open' | 'closed';

export interface RestaurantSession extends Timestamped {
  id: ID;
  /** Human-readable, per tenant: S-0042. */
  number: string;
  branchId: ID;
  /** One register per branch today; the model allows more. */
  registerId: ID;
  /** yyyy-mm-dd in the restaurant's time zone, set at opening and never moved. */
  businessDate: string;
  status: SessionStatus;

  openedAt: string;
  openedBy: string;
  openedById: ID | null;
  openingBalanceH: number;
  openingNotes: string;

  closedAt?: string;
  closedBy?: string;
  closedById?: ID | null;
  /** Frozen at closing. */
  expectedClosingH?: number;
  actualClosingH?: number;
  /** actual − expected: negative is a shortage, positive a surplus. */
  differenceH?: number;
  closingNotes?: string;
  discrepancyReason?: string;
  /** Who approved a difference above the threshold, if anyone. */
  discrepancyApprovedBy?: string;
  /** Recorded when the session was closed with orders still in the kitchen. */
  pendingOverride?: { by: string; reason: string; count: number };
  /** The full financial picture at the moment of closing. */
  summary?: SessionSummary;
  reopenCount?: number;
  /** Last order number handed out in this session. */
  lastOrderNo?: number;
  /** Demo data only: the closing figures are filled in from sales on first read. */
  seeded?: boolean;
  idempotencyKeys?: string[];
}

export type CashMovementType = 'addition' | 'expense' | 'withdrawal' | 'transfer';

export interface CashMovement {
  id: ID;
  sessionId: ID;
  type: CashMovementType;
  /** Always positive; the type says which way it goes. */
  amountH: number;
  description: string;
  createdBy: string;
  createdAt: string;
}

export interface SessionAuditEntry {
  id: ID;
  sessionId: ID;
  action: 'opened' | 'cash_movement' | 'closed' | 'reopened' | 'override_pending' | 'discrepancy_approved' | 'settings_changed';
  description: string;
  previousValue?: string;
  newValue?: string;
  userName: string;
  at: string;
}

export interface MethodTotal {
  method: string;
  /** Orders that used this method; a split order counts once under each method it used. */
  count: number;
  amountH: number;
  /** Refunds handed back through this method during the session. */
  refundsH: number;
  netH: number;
  /** Whether this method puts money in the drawer. Card and on-account never do. */
  affectsDrawer: boolean;
}

export interface CashBreakdown {
  openingH: number;
  salesH: number;
  additionsH: number;
  refundsH: number;
  expensesH: number;
  withdrawalsH: number;
  /** Cash moved out to the safe or another register. */
  transfersH: number;
  expectedH: number;
}

export interface SessionTransaction {
  saleId: ID;
  invoiceNumber: string;
  at: string;
  methods: string[];
  totalH: number;
  taxH: number;
  status: string;
  cashier: string;
}

export interface SessionSummary {
  orders: number;
  completed: number;
  cancelled: number;
  refunded: number;
  grossH: number;
  discountsH: number;
  netH: number;
  vatH: number;
  /** Net + VAT: what customers were charged. */
  totalH: number;
  refundsH: number;
  /** Cash + card actually received. On-account sales are listed but not "received". */
  collectedH: number;
  byMethod: MethodTotal[];
  cash: CashBreakdown;
  /** Kitchen tickets still open, preparing or waiting at the pass. */
  pendingOrders: number;
  transactions: SessionTransaction[];
}

export interface SessionSettings {
  /** Warn when a session has been open longer than this. */
  longSessionHours: number;
  /** Differences above this need someone with approval rights to close. */
  discrepancyThresholdH: number;
}

export type DifferenceState = 'pending' | 'balanced' | 'shortage' | 'surplus';

export function differenceState(diffH: number | undefined | null): DifferenceState {
  if (diffH === undefined || diffH === null) return 'pending';
  if (diffH === 0) return 'balanced';
  return diffH < 0 ? 'shortage' : 'surplus';
}

export function expectedCash(c: Omit<CashBreakdown, 'expectedH'>): number {
  return c.openingH + c.salesH + c.additionsH - c.refundsH - c.expensesH - c.withdrawalsH - c.transfersH;
}

/** The restaurant's clock. Saudi restaurants run on Asia/Riyadh. */
export const RESTAURANT_TZ = 'Asia/Riyadh';

/** yyyy-mm-dd for an instant, in the restaurant's time zone. */
export function businessDateOf(at: Date | string, timeZone = RESTAURANT_TZ): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Picked from a list (with "other" + note) so reports can group them. */
export const DIFFERENCE_REASONS = [
  'counting_error',
  'wrong_change',
  'unrecorded_expense',
  'unrecorded_refund',
  'tip_in_drawer',
  'float_wrong',
  'card_entered_as_cash',
  'suspected_theft',
  'other',
] as const;

export const PENDING_REASONS = [
  'collected_after_close',
  'customer_no_show',
  'kitchen_will_finish',
  'test_or_duplicate',
  'delivery_with_driver',
  'other',
] as const;

export type DifferenceReason = (typeof DIFFERENCE_REASONS)[number];
export type PendingReason = (typeof PENDING_REASONS)[number];
