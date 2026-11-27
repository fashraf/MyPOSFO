import { useEffect, useState } from 'react';
import { invalidate } from './dataVersion';

/**
 * "This session" scope.
 *
 * When on (the default), the Dashboard, Sales, Kitchen, Collection and every Finance page show only the current
 * restaurant session: a new session starts from zero, and nothing from the last one (sales, cash differences, card
 * money, credit) carries over. When the restaurant is closed they show the session that was just closed. Switched off,
 * they show all history as before.
 *
 * Membership is decided by the session number the server stamped on each record (sale, cancel, credit note), never by
 * comparing clocks. Records without a stamp (expenses, payroll) fall inside the session's time window.
 */

export interface ScopeWindow {
  sessionId: string;
  number: string;
  status: 'open' | 'closed';
  /** ISO times; `end` is far in the future while the session is open. */
  start: string;
  end: string;
}

type Provider = (branchId: string | null | undefined) => ScopeWindow | null;

const KEY = 'pos.scope';
let provider: Provider | null = null;
let enabled = readEnabled();
const listeners = new Set<() => void>();

function readEnabled(): boolean {
  try {
    return typeof window === 'undefined' || window.localStorage.getItem(KEY) !== 'all';
  } catch {
    return true;
  }
}

type ReferenceProvider = (sessionId: string) => Set<string>;
let references: ReferenceProvider | null = null;

/** Set by the sales service: invoice and credit-note numbers that belong to a session (for ledger entries). */
export function setReferenceProvider(next: ReferenceProvider): void {
  references = next;
}

/** A ledger entry is in scope when its document belongs to the session, or (no document) its time does. */
export function entryInScope(sourceReference: string | undefined, postedAt: string, window: ScopeWindow | null): boolean {
  if (!window) return true;
  const refs = references?.(window.sessionId);
  if (sourceReference && refs?.has(sourceReference)) return true;
  if (sourceReference && /^\d+$/.test(sourceReference)) return false; // a numbered document of another session
  return inScopeTime(postedAt, window);
}

/** Set once by the restaurant session service, which owns the sessions. */
export function setScopeProvider(next: Provider): void {
  provider = next;
}

export function scopeEnabled(): boolean {
  return enabled;
}

export function setScopeEnabled(on: boolean): void {
  if (on === enabled) return;
  enabled = on;
  try {
    window.localStorage.setItem(KEY, on ? 'session' : 'all');
  } catch {
    /* Private mode: the choice lasts for this visit only. */
  }
  listeners.forEach((listener) => listener());
  invalidate('sales', 'expenses', 'ledger', 'customers');
}

/** The window to filter by, or null for "all history" (scope off, or no session yet). */
export function scopeWindow(branchId?: string | null): ScopeWindow | null {
  if (!enabled || !provider) return null;
  return provider(branchId);
}

/** Records stamped with a session, e.g. a sale (sessionId) or a credit note. */
export function inScope(sessionId: string | undefined | null, window: ScopeWindow | null): boolean {
  return !window || sessionId === window.sessionId;
}

/** Records with only a time (expenses, ledger lines without a stamped document). */
export function inScopeTime(at: string | undefined | null, window: ScopeWindow | null): boolean {
  if (!window) return true;
  if (!at) return false;
  const t = Date.parse(at);
  return t >= Date.parse(window.start) && t <= Date.parse(window.end);
}

/** React: re-render when the scope is switched. */
export function useScopeEnabled(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(enabled);
  useEffect(() => {
    const listener = () => setOn(enabled);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return [on, setScopeEnabled];
}

/**
 * Kitchen tickets: in scope when their order (invoice) belongs to the session. Tickets for an order this device has
 * not seen yet fall back to time.
 */
export function ticketInScope(
  ticket: { orderNumber: string; createdAt: string },
  window: ScopeWindow | null,
  sessionInvoices: Set<string>,
  knownInvoices: Set<string>,
): boolean {
  if (!window) return true;
  if (sessionInvoices.has(ticket.orderNumber)) return true;
  if (knownInvoices.has(ticket.orderNumber)) return false;
  return inScopeTime(ticket.createdAt, window);
}
