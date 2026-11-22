import { USE_MOCKS } from '@/config/env';
import { financeApi } from './api';
import { num, toJournalEntry } from './mappers/saleMappers';
import type { JournalEntry, JournalLine, TransactionKind } from '@/types/finance';
import { ACCOUNTS, accountBalanceH, reverseLines, validateEntry } from '@/types/finance';
import { HttpError } from './http';
import { delay, inBranch, nextId, notFound, timestamp } from './mock/store';
import { registerSlice } from './mock/db';

/**
 * The ledger.
 *
 * Every financial event in the application posts through `post()`. Nothing
 * else writes entries, which is why the balance rule can be enforced in one
 * place rather than trusted to each caller.
 */

let entries: JournalEntry[] = [];
let sequence = 1000;

/* History is posted lazily on first read, so the seed itself can use `post()`
   and go through the same balance checks as everything else. */
let historyReady: Promise<void> | null = null;
/** True once this tenant's six months of history have been posted. */
let historyPosted = false;

async function ensureHistory(): Promise<void> {
  if (!historyReady) {
    historyReady = import('./mock/financeSeed')
      .then((module) => module.seedFinanceHistory())
      .then(() => {
        historyPosted = true;
      });
  }
  await historyReady;
}

registerSlice('ledger', {
  capture: () => ({ entries, sequence, historyPosted }),
  restore: (s: { entries: JournalEntry[]; sequence: number; historyPosted: boolean }) => {
    if (!Array.isArray(s.entries)) throw new Error('ledger snapshot is malformed');
    entries = s.entries;
    sequence = s.sequence ?? 1000;
    historyPosted = Boolean(s.historyPosted);
    historyReady = historyPosted ? Promise.resolve() : null;
  },
  seed: () => {
    entries = [];
    sequence = 1000;
    historyPosted = false;
    historyReady = null;
  },
});

export interface PostInput {
  kind: TransactionKind;
  sourceReference: string;
  description: string;
  lines: JournalLine[];
  actor: string;
  branchId?: string | null;
  /** Defaults to now. Set it to backdate an opening balance. */
  postedAt?: string;
}

/** Shorthand so callers read like an accountant would write it. */
export function debit(accountCode: string, amountH: number, memo = ''): JournalLine {
  return { accountCode, debitH: amountH, creditH: 0, memo };
}

export function credit(accountCode: string, amountH: number, memo = ''): JournalLine {
  return { accountCode, debitH: 0, creditH: amountH, memo };
}

export interface LedgerQuery {
  from?: string;
  to?: string;
  accountCode?: string;
  kind?: TransactionKind;
  search?: string;
  branchId?: string | null;
}

export const ledgerService = {
  /** Post a balanced entry. Refuses anything that does not balance. */
  async post(input: PostInput): Promise<JournalEntry> {
    /* Zero-amount lines are dropped rather than rejected: a sale with no
       discount legitimately produces one, and forcing every caller to filter
       first just moves the same code around. */
    const lines = input.lines.filter((line) => line.debitH > 0 || line.creditH > 0);

    const problem = validateEntry(lines);
    if (problem) {
      throw new HttpError({
        status: 422,
        code: 'unbalanced_entry',
        message: problem,
      });
    }

    sequence += 1;
    const now = timestamp();

    const entry: JournalEntry = {
      id: nextId('jrn'),
      reference: `JE-${sequence}`,
      kind: input.kind,
      sourceReference: input.sourceReference,
      description: input.description,
      postedAt: input.postedAt ?? now,
      lines,
      actor: input.actor,
      branchId: input.branchId ?? null,
      reversesEntryId: null,
      reversedByEntryId: null,
      createdAt: now,
      updatedAt: now,
    };

    entries = [entry, ...entries];
    return entry;
  },

  /**
   * Reverse an entry.
   *
   * Corrections are made by posting the opposite, never by editing or removing
   * the original — an audit trail with a hole in it is not an audit trail.
   */
  async reverse(entryId: string, reason: string, actor: string): Promise<JournalEntry> {
    await delay(300);

    const original = entries.find((entry) => entry.id === entryId);
    if (!original) throw notFound('Journal entry', entryId);

    if (original.reversedByEntryId) {
      throw new HttpError({
        status: 409,
        code: 'already_reversed',
        message: 'This entry has already been reversed.',
      });
    }

    if (!reason.trim()) {
      throw new HttpError({
        status: 422,
        code: 'reason_required',
        message: 'A reversal needs a reason on the record.',
        fieldErrors: { reason: ['Explain why this entry is being reversed.'] },
      });
    }

    sequence += 1;
    const now = timestamp();

    const reversal: JournalEntry = {
      id: nextId('jrn'),
      reference: `JE-${sequence}`,
      kind: original.kind,
      sourceReference: original.sourceReference,
      description: `Reversal of ${original.reference} — ${reason.trim()}`,
      postedAt: now,
      lines: reverseLines(original.lines),
      actor,
      branchId: original.branchId,
      reversesEntryId: original.id,
      reversedByEntryId: null,
      createdAt: now,
      updatedAt: now,
    };

    entries = [
      reversal,
      ...entries.map((entry) =>
        entry.id === entryId ? { ...entry, reversedByEntryId: reversal.id, updatedAt: now } : entry,
      ),
    ];

    return reversal;
  },

  async list(query: LedgerQuery = {}): Promise<JournalEntry[]> {
    if (!USE_MOCKS) {
      /* Filtering happens in SQL, where the indexes are. Pulling everything
         and filtering here would work at seed scale and fall over at a year
         of real trading. */
      const page = await financeApi.ledger({
        branchId: query.branchId ?? undefined,
        kind: query.kind ?? undefined,
        from: query.from,
        to: query.to,
        pageSize: 200,
      });

      return page.items.map(toJournalEntry);
    }

    await delay(200);
    await ensureHistory();

    return entries.filter((entry) => {
      if (query.from && entry.postedAt < query.from) return false;
      if (query.to && entry.postedAt > `${query.to}T23:59:59.999Z`) return false;
      if (query.kind && entry.kind !== query.kind) return false;
      if (!inBranch(entry.branchId, query.branchId)) return false;

      if (query.accountCode) {
        if (!entry.lines.some((line) => line.accountCode === query.accountCode)) return false;
      }

      if (query.search) {
        const needle = query.search.trim().toLocaleLowerCase();
        const haystack =
          `${entry.reference} ${entry.sourceReference} ${entry.description}`.toLocaleLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      return true;
    });
  },

  async get(id: string): Promise<JournalEntry> {
    if (!USE_MOCKS) {
      const page = await financeApi.ledger({ pageSize: 200 });
      const found = page.items.map(toJournalEntry).find((e) => e.id === id);
      if (!found) throw notFound('Journal entry', id);
      return found;
    }

    await delay(120);
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry) throw notFound('Journal entry', id);
    return entry;
  },

  /** Balance of one account, in its natural direction. */
  async balance(accountCode: string): Promise<number> {
    if (!USE_MOCKS) {
      const accounts = await financeApi.accounts();
      const row = accounts.find((a) => String(a.accountCode ?? a.AccountCode) === accountCode);
      return num(row?.balanceH ?? row?.BalanceH);
    }

    await delay(100);
    await ensureHistory();
    return accountBalanceH(entries, accountCode);
  },

  /** Balances for every account that has movement. */
  async trialBalance(): Promise<{ code: string; debitH: number; creditH: number }[]> {
    if (!USE_MOCKS) {
      /* Summed in SQL from the journal lines — the ledger's own view of itself,
         not a second calculation in the browser that could disagree with it. */
      const accounts = await financeApi.accounts();
      return accounts.map((a) => ({
        code: String(a.accountCode ?? a.AccountCode ?? ''),
        debitH: num(a.debitH ?? a.DebitH),
        creditH: num(a.creditH ?? a.CreditH),
      }));
    }

    await delay(200);
    await ensureHistory();

    const totals = new Map<string, { debitH: number; creditH: number }>();

    for (const entry of entries) {
      for (const line of entry.lines) {
        const current = totals.get(line.accountCode) ?? { debitH: 0, creditH: 0 };
        current.debitH += line.debitH;
        current.creditH += line.creditH;
        totals.set(line.accountCode, current);
      }
    }

    return Array.from(totals.entries())
      .map(([code, value]) => ({ code, ...value }))
      .sort((a, b) => a.code.localeCompare(b.code));
  },

  /** Every account balance at once, for the money screens. */
  async balances(): Promise<Record<string, number>> {
    if (!USE_MOCKS) {
      const accounts = await financeApi.accounts();
      return Object.fromEntries(accounts.map((a) => [
        String(a.accountCode ?? a.AccountCode ?? ''),
        num(a.balanceH ?? a.BalanceH),
      ]));
    }

    await delay(160);
    await ensureHistory();

    return Object.fromEntries(
      Object.keys(ACCOUNTS).map((code) => [code, accountBalanceH(entries, code)]),
    );
  },

  /** Movement on an account within a window, for cash reconciliation. */
  async movement(accountCode: string, from: string, to: string): Promise<number> {
    if (!USE_MOCKS) {
      /* Movement over a window comes from the entries; the accounts endpoint
         gives a balance as at now, which is a different question. */
      const page = await financeApi.ledger({ from, to, pageSize: 500 });
      return page.items.reduce((sum, entry) => {
        const lines = (entry.lines as Record<string, unknown>[] | undefined) ?? [];
        return sum + lines
          .filter((l) => String(l.accountCode ?? l.AccountCode) === accountCode)
          .reduce((n, l) => n + num(l.debitH ?? l.DebitH) - num(l.creditH ?? l.CreditH), 0);
      }, 0);
    }

    const window = entries.filter(
      (entry) => entry.postedAt >= from && entry.postedAt <= `${to}T23:59:59.999Z`,
    );
    return accountBalanceH(window, accountCode);
  },

  /** Everything posted, optionally scoped to one branch. */
  async all(branchId?: string | null): Promise<JournalEntry[]> {
    if (!USE_MOCKS) {
      const page = await financeApi.ledger({ branchId: branchId ?? undefined, pageSize: 500 });
      return page.items.map(toJournalEntry);
    }

    await delay(160);
    await ensureHistory();
    return entries.filter((entry) => inBranch(entry.branchId, branchId));
  },
};
