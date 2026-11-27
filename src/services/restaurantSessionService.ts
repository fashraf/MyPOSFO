import { SERVER_CORE } from '@/config/env';
import { hybridSessions } from './hybrid/wrappers';
import { SAMPLE_ACTIVITY } from '@/config/env';
import { USE_MOCKS } from '@/config/env';
import { api } from './apiClient';
import { HttpError } from './http';
import { delay, nextId, timestamp, clone } from './mock/store';
import { registerSlice } from './mock/db';
import { seedFor } from './mock/seed';
import { invalidate } from './dataVersion';
import { kitchenService } from './kitchenService';
import { salesSnapshot } from './salesService';
import type { PermissionKey } from '@/types/permissions';
import type { CreditNote, Sale } from '@/types/sales';
import {
  businessDateOf,
  expectedCash,
  type CashBreakdown,
  type CashMovement,
  type CashMovementType,
  type MethodTotal,
  type RestaurantSession,
  type SessionAuditEntry,
  type SessionSettings,
  type SessionSummary,
} from '@/types/restaurantSession';

/**
 * Restaurant business sessions.
 *
 * Rules this file enforces (the backend enforces the same — see
 * docs/restaurant-sessions-api.md and db-migrations/28-restaurant-sessions.sql):
 *
 *  - One open session per branch register. Opening a second is refused.
 *  - No order is written without an open session. The check runs right
 *    before the write, so an order racing a close cannot slip in after it.
 *  - Totals are never stored while a session is open: they are derived from
 *    the sales and credit notes themselves, so nothing can drift. Closing
 *    freezes a copy as the permanent record.
 *  - A session's business date is set when it opens and never moves, so an
 *    order at 01:30 belongs to the day the restaurant opened.
 */

export interface SessionActor {
  id: string | null;
  name: string;
  permissions: PermissionKey[];
}

export interface OpenSessionInput {
  branchId: string;
  registerId?: string;
  openingBalanceH: number;
  /** Defaults to now. */
  openedAt?: string;
  /** Defaults to the opening time's date in Asia/Riyadh. */
  businessDate?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface CloseSessionInput {
  sessionId: string;
  actualClosingH: number;
  closingNotes?: string;
  discrepancyReason?: string;
  /** Required, with approval rights, when kitchen orders are still open. */
  pendingOverrideReason?: string;
  idempotencyKey?: string;
}

export interface CashMovementInput {
  sessionId: string;
  type: CashMovementType;
  amountH: number;
  description: string;
}

export interface HistoryFilter {
  branchId?: string | null;
  from?: string;
  to?: string;
  status?: 'open' | 'closed' | 'all';
  difference?: 'all' | 'shortage' | 'surplus' | 'balanced';
  user?: string;
  search?: string;
}

const DEFAULT_SETTINGS: SessionSettings = { longSessionHours: 18, discrepancyThresholdH: 10_000 };

let sessions: RestaurantSession[] = [];
let movements: CashMovement[] = [];
let audit: SessionAuditEntry[] = [];
let settings: SessionSettings = { ...DEFAULT_SETTINGS };
let sequence = 1;

/* ------------------------------------------------------------------ seed */

/** 05:30 Riyadh on a business date, as an ISO instant. */
function riyadhAt(date: string, hour: number, minute = 0): string {
  return new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+03:00`).toISOString();
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today's business date: before 05:00 Riyadh the night still belongs to yesterday. */
function currentBusinessDate(): string {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', hour12: false }).format(now));
  const today = businessDateOf(now);
  return hour < 5 ? shiftDate(today, -1) : today;
}

function seed(tenantId: string): void {
  const data = seedFor(tenantId);
  const manager = data.users.find((u) => u.roleId === 'rol_manager') ?? data.users[0];
  const owner = data.users.find((u) => u.roleId === 'rol_owner') ?? data.users[0];
  const managerName = manager ? `${manager.firstName} ${manager.lastName}`.trim() : 'Manager';
  const ownerName = owner ? `${owner.firstName} ${owner.lastName}`.trim() : 'Owner';

  sessions = [];
  movements = [];
  audit = [];
  settings = { ...DEFAULT_SETTINGS };
  sequence = 1;
  /* Without sample activity the day starts closed: the manager opens the restaurant, which becomes session 1001. */
  if (!SAMPLE_ACTIVITY) return;

  const today = currentBusinessDate();
  /* 20 closed days per branch, then today's open session. Seeded closing
     figures are filled in from the actual sales the first time they are read
     (the sales slice may seed after this one). */
  for (let back = 20; back >= 1; back -= 1) {
    const date = shiftDate(today, -back);
    for (const branch of data.branches) {
      const id = `rss_${branch.id}_${date}`;
      sessions.push({
        id,
        number: String(1000 + sequence++),
        branchId: branch.id,
        registerId: 'reg_main',
        businessDate: date,
        status: 'closed',
        openedAt: riyadhAt(date, 5, 30),
        openedBy: managerName,
        openedById: manager?.id ?? null,
        openingBalanceH: 50_000,
        openingNotes: '',
        closedAt: riyadhAt(shiftDate(date, 1), 3, 0),
        closedBy: back % 4 === 0 ? ownerName : managerName,
        closedById: (back % 4 === 0 ? owner : manager)?.id ?? null,
        seeded: true,
        createdAt: riyadhAt(date, 5, 30),
        updatedAt: riyadhAt(shiftDate(date, 1), 3, 0),
      });
    }
  }
  for (const branch of data.branches) {
    const openedAt = riyadhAt(today, 5, 30);
    const id = `rss_${branch.id}_${today}`;
    sessions.push({
      id,
      number: String(1000 + sequence++),
      branchId: branch.id,
      registerId: 'reg_main',
      businessDate: today,
      status: 'open',
      openedAt,
      openedBy: managerName,
      openedById: manager?.id ?? null,
      openingBalanceH: 50_000,
      openingNotes: '',
      createdAt: openedAt,
      updatedAt: openedAt,
    });
    audit.push({
      id: nextId('rsa'), sessionId: id, action: 'opened',
      description: 'Restaurant opened with SAR 500.00 float', newValue: '50000', userName: managerName, at: openedAt,
    });
  }
}

registerSlice('restaurantSessions', {
  capture: () => ({ sessions, movements, audit, settings, sequence }),
  restore: (snap: { sessions: RestaurantSession[]; movements: CashMovement[]; audit: SessionAuditEntry[]; settings: SessionSettings; sequence: number }) => {
    if (!Array.isArray(snap.sessions)) throw new Error('restaurantSessions snapshot is malformed');
    sessions = snap.sessions;
    movements = snap.movements ?? [];
    audit = snap.audit ?? [];
    settings = { ...DEFAULT_SETTINGS, ...(snap.settings ?? {}) };
    sequence = snap.sequence ?? sessions.length + 1;
  },
  seed,
});

/* ------------------------------------------------------------- helpers */

function fail(status: number, code: string, message: string): never {
  throw new HttpError({ status, code, message });
}

function requirePermission(actor: SessionActor, key: PermissionKey): void {
  if (!actor.permissions.includes(key)) {
    fail(403, 'FORBIDDEN', 'You do not have permission to do this. Ask a manager.');
  }
}

function logAudit(entry: Omit<SessionAuditEntry, 'id' | 'at'> & { at?: string }): void {
  audit.push({ id: nextId('rsa'), at: entry.at ?? timestamp(), ...entry });
}

function windowEnd(s: RestaurantSession): string {
  /* An open day has no end yet. Not "now": records are stamped by the server's clock, which may be ahead of this device's. */
  return s.closedAt ?? '9999-12-31T23:59:59.999Z';
}

function inWindow(at: string | undefined, s: RestaurantSession): boolean {
  return !!at && at >= s.openedAt && at <= windowEnd(s);
}

function sameBranch(branchId: string | null | undefined, s: RestaurantSession): boolean {
  return branchId === s.branchId || branchId === null || branchId === undefined;
}

/**
 * For records from before sessions existed (no stamp), the session whose time
 * window holds them — and only the earliest such session, so an unstamped
 * record can never be counted twice.
 */
function owns(branchId: string | null | undefined, at: string | undefined, s: RestaurantSession): boolean {
  if (!sameBranch(branchId, s) || !inWindow(at, s)) return false;
  const first = sessions
    .filter((x) => x.branchId === s.branchId && inWindow(at, x))
    .sort((a, b) => a.openedAt.localeCompare(b.openedAt))[0];
  return first?.id === s.id;
}

/** Which session an order belongs to. Stamped orders say so; older ones fall back to the time window. */
function saleInSession(sale: Sale, s: RestaurantSession): boolean {
  if (sale.sessionId) return sale.sessionId === s.id;
  return owns(sale.branchId, sale.soldAt, s);
}

function noteInSession(note: CreditNote, sale: Sale | undefined, s: RestaurantSession): boolean {
  if (note.sessionId) return note.sessionId === s.id;
  return owns(sale?.branchId, note.issuedAt, s);
}

/** Was this order cancelled during the session itself (rather than later)? */
function voidedWithin(sale: Sale, s: RestaurantSession): boolean {
  if (sale.status !== 'voided' || !sale.voidedAt) return false;
  /* The server records which day a cancel happened in; times from two clocks (server, this device) cannot decide it. */
  if (sale.voidSessionId) return sale.voidSessionId === s.id;
  if (s.status === 'open') return true;
  return sale.voidedAt <= windowEnd(s);
}

function voidLandsIn(sale: Sale, s: RestaurantSession): boolean {
  if (sale.status !== 'voided' || !sale.voidedAt) return false;
  if (sale.voidSessionId) return sale.voidSessionId === s.id;
  return owns(sale.branchId, sale.voidedAt, s);
}

const METHOD_ORDER = ['cash', 'card', 'credit', 'bank'];

/**
 * The whole financial picture of one session, from source records.
 *
 * - An order cancelled inside the session counts for nothing (the money went
 *   straight back). One cancelled in a LATER session stays a sale here and
 *   becomes a refund there.
 * - A split order adds each part to its own method; the order is counted once
 *   per method it used, and the amounts never overlap.
 * - Card and on-account money is listed but never enters the cash formula.
 */
async function computeSummary(s: RestaurantSession): Promise<SessionSummary> {
  const { sales, creditNotes } = salesSnapshot();
  const byId = new Map(sales.map((sale) => [sale.id, sale]));
  const mine = sales.filter((sale) => saleInSession(sale, s));

  const counted = mine.filter((sale) => !voidedWithin(sale, s));
  const cancelledHere = mine.filter((sale) => voidedWithin(sale, s) && sale.cancelReasonCode !== 'edited');
  /* Cancelled now, sold in an earlier session: that money is handed back from this drawer. */
  const lateVoids = sales.filter((sale) => voidLandsIn(sale, s) && !saleInSession(sale, s) && sale.cancelReasonCode !== 'edited');
  const notes = creditNotes.filter((note) => noteInSession(note, byId.get(note.saleId), s));

  const methods = new Map<string, MethodTotal>();
  const bucket = (method: string) => {
    let row = methods.get(method);
    if (!row) {
      row = { method, count: 0, amountH: 0, refundsH: 0, netH: 0, affectsDrawer: method === 'cash' };
      methods.set(method, row);
    }
    return row;
  };
  for (const sale of counted) {
    const seen = new Set<string>();
    for (const payment of sale.payments) {
      const row = bucket(payment.method);
      row.amountH += payment.amountH;
      if (!seen.has(payment.method)) {
        row.count += 1;
        seen.add(payment.method);
      }
    }
  }
  for (const note of notes) bucket(note.refundMethod).refundsH += note.totalH;
  for (const sale of lateVoids) {
    for (const payment of sale.payments) bucket(payment.method).refundsH += payment.amountH;
  }
  bucket('cash');
  bucket('card');
  const byMethod = [...methods.values()]
    .map((row) => ({ ...row, netH: row.amountH - row.refundsH }))
    .sort((a, b) => METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method));

  const sum = (list: Sale[], pick: (sale: Sale) => number) => list.reduce((acc, sale) => acc + pick(sale), 0);
  /* subtotalH is already after the discount and excludes tax. */
  const discountsH = sum(counted, (sale) => sale.discountH);
  const vatH = sum(counted, (sale) => sale.taxH);
  const totalH = sum(counted, (sale) => sale.totalH);
  const netExTaxH = totalH - vatH;
  const grossH = netExTaxH + discountsH;
  const refundsH = byMethod.reduce((acc, row) => acc + row.refundsH, 0);
  const collectedH = byMethod.filter((row) => row.method !== 'credit').reduce((acc, row) => acc + row.amountH, 0);

  const mv = movements.filter((m) => m.sessionId === s.id);
  const mvSum = (type: CashMovementType) => mv.filter((m) => m.type === type).reduce((acc, m) => acc + m.amountH, 0);
  const cashRow = byMethod.find((row) => row.method === 'cash')!;
  const base: Omit<CashBreakdown, 'expectedH'> = {
    openingH: s.openingBalanceH,
    salesH: cashRow.amountH,
    additionsH: mvSum('addition'),
    refundsH: cashRow.refundsH,
    expensesH: mvSum('expense'),
    withdrawalsH: mvSum('withdrawal'),
    transfersH: mvSum('transfer'),
  };

  let pendingOrders = 0;
  if (s.status === 'open') {
    const tickets = await kitchenService.list();
    const invoices = new Set(counted.map((sale) => sale.invoiceNumber));
    pendingOrders = tickets.filter(
      (t) => ['open', 'preparing', 'ready'].includes(t.status) && (invoices.has(t.orderNumber) || inWindow(t.createdAt, s)),
    ).length;
  }

  return {
    orders: counted.length + cancelledHere.length,
    completed: counted.length,
    cancelled: cancelledHere.length,
    refunded: notes.length + lateVoids.length,
    grossH,
    discountsH,
    netH: netExTaxH,
    vatH,
    totalH,
    refundsH,
    collectedH,
    byMethod,
    cash: { ...base, expectedH: expectedCash(base) },
    pendingOrders,
    transactions: mine
      .slice()
      .sort((a, b) => b.soldAt.localeCompare(a.soldAt))
      .map((sale) => ({
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        at: sale.soldAt,
        methods: [...new Set(sale.payments.map((p) => p.method))],
        totalH: sale.totalH,
        taxH: sale.taxH,
        status: voidedWithin(sale, s) ? sale.status : sale.status === 'voided' ? 'completed' : sale.status,
        cashier: sale.cashierName,
      })),
  };
}

/** Fill in demo closing figures the first time a seeded session is read. */
async function finaliseSeeded(): Promise<void> {
  const pending = sessions.filter((s) => s.seeded && !s.summary);
  if (pending.length === 0) return;
  for (const s of pending) {
    const summary = await computeSummary(s);
    const n = Number(s.businessDate.replace(/-/g, '')) + s.branchId.length * 7;
    const variance = n % 9 === 0 ? -5_000 : n % 13 === 0 ? 2_000 : n % 7 === 0 ? -1_250 : 0;
    s.summary = { ...summary, transactions: summary.transactions.slice(0, 200) };
    s.expectedClosingH = summary.cash.expectedH;
    s.actualClosingH = summary.cash.expectedH + variance;
    s.differenceH = variance;
    if (variance !== 0) {
      s.discrepancyReason = variance < 0 ? 'Change given twice to one table during the rush' : 'Tip left in the drawer';
    }
    s.closingNotes = '';
    s.seeded = false;
  }
}

/* --------------------------------------------------------- order guard */

/**
 * The guard every write path calls. Synchronous on purpose: callers run it
 * immediately before writing, with no await in between, so an order cannot
 * be committed against a session that closed a moment earlier.
 */
export function requireOpenSession(branchId: string | null | undefined): RestaurantSession {
  const open = sessions.find((s) => s.status === 'open' && (branchId ? s.branchId === branchId : true));
  if (!open) {
    fail(409, 'RESTAURANT_CLOSED', 'Restaurant is currently closed. Open a business session before creating orders.');
  }
  return open;
}

/** The open session at a branch, if any, without throwing. */
/** The next order number in a session (1, 2, 3 …). Call right before writing the order. */
export function takeOrderNumber(sessionId: string): number {
  const s = sessions.find((x) => x.id === sessionId);
  if (!s) return 0;
  s.lastOrderNo = (s.lastOrderNo ?? 0) + 1;
  return s.lastOrderNo;
}

export function openSessionSync(branchId: string | null | undefined): RestaurantSession | null {
  return sessions.find((s) => s.status === 'open' && (branchId ? s.branchId === branchId : true)) ?? null;
}

/* -------------------------------------------------------------- service */

const baseRestaurantSessionService = {
  async status(branchId: string | null): Promise<{ open: boolean; session: RestaurantSession | null }> {
    if (!USE_MOCKS) return api.get('/api/restaurant-sessions/status', { query: { branchId: branchId ?? undefined } });
    await delay(60);
    const session = openSessionSync(branchId);
    return { open: !!session, session: session ? clone(session) : null };
  },

  async current(branchId: string | null): Promise<RestaurantSession | null> {
    if (!USE_MOCKS) return api.get('/api/restaurant-sessions/current', { query: { branchId: branchId ?? undefined } });
    await delay(80);
    const s = openSessionSync(branchId);
    return s ? clone(s) : null;
  },

  /** The latest session at a branch, open or not — what the dashboard shows. */
  async latest(branchId: string): Promise<RestaurantSession | null> {
    if (!USE_MOCKS) return api.get('/api/restaurant-sessions/current', { query: { branchId, includeClosed: true } });
    await delay(80);
    await finaliseSeeded();
    const list = sessions.filter((s) => s.branchId === branchId).sort((a, b) => b.openedAt.localeCompare(a.openedAt));
    return list[0] ? clone(list[0]) : null;
  },

  async get(id: string): Promise<RestaurantSession> {
    if (!USE_MOCKS) return api.get(`/api/restaurant-sessions/${id}`);
    await delay(80);
    await finaliseSeeded();
    const s = sessions.find((x) => x.id === id);
    if (!s) fail(404, 'SESSION_NOT_FOUND', 'That session does not exist.');
    return clone(s);
  },

  /** Live while open; the frozen record once closed. */
  async summary(id: string): Promise<SessionSummary> {
    if (!USE_MOCKS) return api.get(`/api/restaurant-sessions/${id}/sales-summary`);
    await delay(100);
    await finaliseSeeded();
    const s = sessions.find((x) => x.id === id);
    if (!s) fail(404, 'SESSION_NOT_FOUND', 'That session does not exist.');
    if (s.status === 'closed' && s.summary) return clone(s.summary);
    return computeSummary(s);
  },

  async movements(id: string): Promise<CashMovement[]> {
    if (!USE_MOCKS) return api.get(`/api/restaurant-sessions/${id}/cash-movements`);
    await delay(60);
    return clone(movements.filter((m) => m.sessionId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },

  async auditLog(id: string): Promise<SessionAuditEntry[]> {
    if (!USE_MOCKS) return api.get(`/api/restaurant-sessions/${id}/audit-log`);
    await delay(60);
    return clone(audit.filter((a) => a.sessionId === id).sort((a, b) => a.at.localeCompare(b.at)));
  },

  async settings(): Promise<SessionSettings> {
    if (!USE_MOCKS) return api.get('/api/restaurant-sessions/settings');
    await delay(40);
    return { ...settings };
  },

  async saveSettings(next: SessionSettings, actor: SessionActor): Promise<SessionSettings> {
    if (!USE_MOCKS) return api.put('/api/restaurant-sessions/settings', next);
    requirePermission(actor, 'restaurant.session.approve_discrepancy');
    await delay(120);
    if (!(next.longSessionHours > 0) || !(next.discrepancyThresholdH >= 0)) {
      fail(422, 'INVALID_SETTINGS', 'Thresholds must be positive numbers.');
    }
    const before = JSON.stringify(settings);
    settings = { longSessionHours: Math.round(next.longSessionHours), discrepancyThresholdH: Math.round(next.discrepancyThresholdH) };
    const open = sessions.find((s) => s.status === 'open');
    logAudit({
      sessionId: open?.id ?? '-', action: 'settings_changed', description: 'Alert thresholds changed',
      previousValue: before, newValue: JSON.stringify(settings), userName: actor.name,
    });
    return { ...settings };
  },

  async open(input: OpenSessionInput, actor: SessionActor): Promise<RestaurantSession> {
    if (!USE_MOCKS) return api.post('/api/restaurant-sessions/open', input);
    requirePermission(actor, 'restaurant.session.open');
    await delay(260);

    if (input.idempotencyKey) {
      const replay = sessions.find((s) => s.idempotencyKeys?.includes(input.idempotencyKey!));
      if (replay) return clone(replay);
    }
    if (!Number.isInteger(input.openingBalanceH) || input.openingBalanceH < 0) {
      fail(422, 'INVALID_OPENING_BALANCE', 'Opening cash must be zero or more.');
    }
    let openedAt = input.openedAt ?? timestamp();
    if (Number.isNaN(Date.parse(openedAt))) fail(422, 'INVALID_OPENED_AT', 'Opening time is not a valid date.');
    if (Date.parse(openedAt) > Date.now() + 5 * 60_000) fail(422, 'OPENED_IN_FUTURE', 'Opening time cannot be in the future.');
    const registerId = input.registerId ?? 'reg_main';
    const previous = sessions
      .filter((x) => x.branchId === input.branchId && x.registerId === registerId && x.closedAt)
      .sort((a, b) => b.closedAt!.localeCompare(a.closedAt!))[0];
    if (previous && Date.parse(openedAt) < Date.parse(previous.closedAt!)) {
      /* "Now" on this device can be behind the clock that stamped the close (the server, or another device), so
         reopening right after closing looked like an overlap. Only an opening time the person deliberately moved
         back (more than 5 minutes before this device's now) is refused; anything else starts when the last closed. */
      const deliberate = Date.parse(openedAt) < Date.now() - 5 * 60_000;
      if (!deliberate || previous.closedAt!.slice(0, 16) <= openedAt.slice(0, 16)) {
        openedAt = previous.closedAt!;
      } else {
        fail(422, 'OVERLAPS_PREVIOUS', `Opening time must be after the previous session (${previous.number}) closed.`);
      }
    }

    /* Checked last, with no await after it: the unique rule. */
    const existing = sessions.find((s) => s.status === 'open' && s.branchId === input.branchId && s.registerId === registerId);
    if (existing) {
      fail(409, 'SESSION_ALREADY_OPEN', `This restaurant already has an open business session (${existing.number}). Close it before opening a new one.`);
    }

    const now = timestamp();
    const session: RestaurantSession = {
      id: nextId('rss'),
      number: String(1000 + sequence++),
      branchId: input.branchId,
      registerId,
      businessDate: input.businessDate || businessDateOf(openedAt),
      status: 'open',
      openedAt,
      openedBy: actor.name,
      openedById: actor.id,
      openingBalanceH: input.openingBalanceH,
      openingNotes: (input.notes ?? '').trim(),
      idempotencyKeys: input.idempotencyKey ? [input.idempotencyKey] : [],
      createdAt: now,
      updatedAt: now,
    };
    sessions.push(session);
    logAudit({
      sessionId: session.id, action: 'opened',
      description: `Restaurant opened for business date ${session.businessDate}`,
      newValue: String(session.openingBalanceH), userName: actor.name,
    });
    invalidate('sales');
    return clone(session);
  },

  async addMovement(input: CashMovementInput, actor: SessionActor): Promise<CashMovement> {
    if (!USE_MOCKS) return api.post(`/api/restaurant-sessions/${input.sessionId}/cash-movements`, input);
    requirePermission(actor, 'restaurant.cash_movement.create');
    await delay(180);
    const s = sessions.find((x) => x.id === input.sessionId);
    if (!s) fail(404, 'SESSION_NOT_FOUND', 'That session does not exist.');
    if (s.status !== 'open') fail(409, 'SESSION_CLOSED', 'This session is closed. Cash movements can only be recorded while it is open.');
    if (!Number.isInteger(input.amountH) || input.amountH <= 0) fail(422, 'INVALID_AMOUNT', 'Enter an amount greater than zero.');
    if (!input.description.trim()) fail(422, 'DESCRIPTION_REQUIRED', 'Say what the cash was for.');
    if (input.type !== 'addition') {
      const summary = await computeSummary(s);
      if (input.amountH > summary.cash.expectedH) {
        fail(422, 'INSUFFICIENT_CASH', 'There is not that much cash expected in the drawer.');
      }
    }
    const movement: CashMovement = {
      id: nextId('rcm'), sessionId: s.id, type: input.type, amountH: input.amountH,
      description: input.description.trim(), createdBy: actor.name, createdAt: timestamp(),
    };
    movements.push(movement);
    logAudit({
      sessionId: s.id, action: 'cash_movement',
      description: `${input.type}: ${input.description.trim()}`, newValue: String(input.amountH), userName: actor.name,
    });
    return clone(movement);
  },

  /** Everything the closing screen shows, computed fresh. */
  async closingPreview(id: string): Promise<{ session: RestaurantSession; summary: SessionSummary; settings: SessionSettings }> {
    if (!USE_MOCKS) return api.get(`/api/restaurant-sessions/${id}/closing-preview`);
    await delay(120);
    const s = sessions.find((x) => x.id === id);
    if (!s) fail(404, 'SESSION_NOT_FOUND', 'That session does not exist.');
    return { session: clone(s), summary: await computeSummary(s), settings: { ...settings } };
  },

  async close(input: CloseSessionInput, actor: SessionActor): Promise<RestaurantSession> {
    if (!USE_MOCKS) return api.post(`/api/restaurant-sessions/${input.sessionId}/close`, input);
    requirePermission(actor, 'restaurant.session.close');
    await delay(300);

    const s = sessions.find((x) => x.id === input.sessionId);
    if (!s) fail(404, 'SESSION_NOT_FOUND', 'That session does not exist.');
    if (input.idempotencyKey && s.idempotencyKeys?.includes(input.idempotencyKey) && s.status === 'closed') {
      return clone(s);
    }
    if (s.status !== 'open') fail(409, 'SESSION_ALREADY_CLOSED', `Session ${s.number} was already closed by ${s.closedBy ?? 'someone else'}.`);
    if (!Number.isInteger(input.actualClosingH) || input.actualClosingH < 0) {
      fail(422, 'INVALID_ACTUAL_CASH', 'Enter the cash you counted (zero or more).');
    }

    const summary = await computeSummary(s);
    /* Re-check after the await: another close may have finished meanwhile. */
    if (s.status !== 'open') fail(409, 'SESSION_ALREADY_CLOSED', `Session ${s.number} was already closed by ${s.closedBy ?? 'someone else'}.`);

    const canApprove = actor.permissions.includes('restaurant.session.approve_discrepancy');
    /* Open kitchen orders do not block closing — the person closing says why,
       and the reason goes on the record. */
    if (summary.pendingOrders > 0 && !input.pendingOverrideReason?.trim()) {
      fail(422, 'OVERRIDE_REASON_REQUIRED', 'Give a reason for closing with orders still open.');
    }

    const expected = summary.cash.expectedH;
    const difference = input.actualClosingH - expected;
    if (difference !== 0 && !input.discrepancyReason?.trim()) {
      fail(422, 'DISCREPANCY_REASON_REQUIRED', 'Explain the cash difference before closing.');
    }
    if (Math.abs(difference) > settings.discrepancyThresholdH && !canApprove) {
      fail(403, 'APPROVAL_REQUIRED', 'The difference is above the limit you can sign off. A manager must close this session.');
    }

    const now = timestamp();
    s.status = 'closed';
    s.closedAt = now;
    s.closedBy = actor.name;
    s.closedById = actor.id;
    s.expectedClosingH = expected;
    s.actualClosingH = input.actualClosingH;
    s.differenceH = difference;
    s.closingNotes = (input.closingNotes ?? '').trim();
    s.discrepancyReason = difference !== 0 ? input.discrepancyReason!.trim() : undefined;
    s.discrepancyApprovedBy = difference !== 0 && Math.abs(difference) > settings.discrepancyThresholdH ? actor.name : undefined;
    s.pendingOverride = summary.pendingOrders > 0
      ? { by: actor.name, reason: input.pendingOverrideReason!.trim(), count: summary.pendingOrders }
      : undefined;
    s.summary = summary;
    s.updatedAt = now;
    if (input.idempotencyKey) s.idempotencyKeys = [...(s.idempotencyKeys ?? []), input.idempotencyKey];

    if (s.pendingOverride) {
      logAudit({ sessionId: s.id, action: 'override_pending', description: `Closed with ${s.pendingOverride.count} open kitchen order(s): ${s.pendingOverride.reason}`, userName: actor.name, at: now });
    }
    if (s.discrepancyApprovedBy) {
      logAudit({ sessionId: s.id, action: 'discrepancy_approved', description: `Difference above limit approved: ${s.discrepancyReason}`, newValue: String(difference), userName: actor.name, at: now });
    }
    logAudit({
      sessionId: s.id, action: 'closed',
      description: `Closed. Expected ${expected}, counted ${input.actualClosingH}, difference ${difference}.`,
      previousValue: String(expected), newValue: String(input.actualClosingH), userName: actor.name, at: now,
    });
    invalidate('sales');
    return clone(s);
  },

  /** Reopen the latest closed session. Rare, permissioned, and always explained. */
  async reopen(id: string, reason: string, actor: SessionActor): Promise<RestaurantSession> {
    if (!USE_MOCKS) return api.post(`/api/restaurant-sessions/${id}/reopen`, { reason });
    requirePermission(actor, 'restaurant.session.reopen');
    await delay(220);
    const s = sessions.find((x) => x.id === id);
    if (!s) fail(404, 'SESSION_NOT_FOUND', 'That session does not exist.');
    if (s.status !== 'closed') fail(409, 'SESSION_NOT_CLOSED', 'Only a closed session can be reopened.');
    if (!reason.trim()) fail(422, 'REASON_REQUIRED', 'Say why the session is being reopened.');
    const latest = sessions.filter((x) => x.branchId === s.branchId).sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0];
    if (latest.id !== s.id) fail(409, 'NOT_LATEST', 'Only the most recent session at a branch can be reopened.');
    if (sessions.some((x) => x.status === 'open' && x.branchId === s.branchId)) {
      fail(409, 'SESSION_ALREADY_OPEN', 'Another session is already open at this branch.');
    }
    const previous = JSON.stringify({ closedAt: s.closedAt, closedBy: s.closedBy, actual: s.actualClosingH, difference: s.differenceH });
    s.status = 'open';
    s.closedAt = undefined;
    s.closedBy = undefined;
    s.closedById = undefined;
    s.expectedClosingH = undefined;
    s.actualClosingH = undefined;
    s.differenceH = undefined;
    s.discrepancyReason = undefined;
    s.discrepancyApprovedBy = undefined;
    s.pendingOverride = undefined;
    s.summary = undefined;
    s.reopenCount = (s.reopenCount ?? 0) + 1;
    s.updatedAt = timestamp();
    logAudit({ sessionId: s.id, action: 'reopened', description: `Reopened: ${reason.trim()}`, previousValue: previous, userName: actor.name });
    invalidate('sales');
    return clone(s);
  },

  async history(filter: HistoryFilter = {}): Promise<RestaurantSession[]> {
    if (!USE_MOCKS) return api.get('/api/restaurant-sessions/history', { query: { ...filter } as Record<string, string> });
    await delay(140);
    await finaliseSeeded();
    const q = (filter.search ?? '').trim().toLowerCase();
    const user = (filter.user ?? '').trim().toLowerCase();
    return clone(
      sessions
        .filter((s) => !filter.branchId || s.branchId === filter.branchId)
        .filter((s) => !filter.from || s.businessDate >= filter.from)
        .filter((s) => !filter.to || s.businessDate <= filter.to)
        .filter((s) => !filter.status || filter.status === 'all' || s.status === filter.status)
        .filter((s) => {
          const d = s.differenceH;
          switch (filter.difference) {
            case 'shortage': return d !== undefined && d < 0;
            case 'surplus': return d !== undefined && d > 0;
            case 'balanced': return d === 0;
            default: return true;
          }
        })
        .filter((s) => !user || s.openedBy.toLowerCase().includes(user) || (s.closedBy ?? '').toLowerCase().includes(user))
        .filter((s) => !q || s.number.toLowerCase().includes(q) || s.businessDate.includes(q))
        .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
        .map(({ summary, ...rest }) => ({ ...rest, summary: summary ? { ...summary, transactions: [] } : undefined })),
    );
  },
};

/** Hybrid mode: the server holds the trading day; see services/hybrid/serverCore.ts. */
export const restaurantSessionService = SERVER_CORE ? hybridSessions(baseRestaurantSessionService) : baseRestaurantSessionService;
