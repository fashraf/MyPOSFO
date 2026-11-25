import { SAMPLE_ACTIVITY } from '@/config/env';
import { USE_MOCKS } from '@/config/env';
import { commissionRuleApi, financeApi, payrollApi } from './api';
import { invalidate } from './dataVersion';
import { num, str } from './mappers/saleMappers';
import type {
  CommissionEntry,
  CommissionRule,
  OpeningBalances,
  PayrollLine,
  PayrollRun,
} from '@/types/finance';
import {
  commissionForH,
  netPayH,
  openingEquityH,
  ruleApplies,
  ruleSpecificity,
} from '@/types/finance';
import { credit, debit, ledgerService } from './ledgerService';
import { HttpError } from './http';
import { delay, nextId, timestamp, validationFailed, clone } from './mock/store';
import { registerSlice } from './mock/db';

/* ------------------------------------------------------------------ */
/* Opening balances                                                    */
/* ------------------------------------------------------------------ */

let posted: (OpeningBalances & { postedAt: string; actor: string }) | null = null;

export const openingBalanceService = {
  async get(): Promise<(OpeningBalances & { postedAt: string; actor: string }) | null> {
    await delay(120);
    return posted;
  },

  /**
   * Post the starting position.
   *
   * Once only: opening balances are the line before which nothing is recorded,
   * and posting a second set would double every asset. Correcting one means
   * reversing the entry in the ledger, like any other mistake.
   */
  async post(input: OpeningBalances & { actor: string }): Promise<OpeningBalances> {
    await delay(420);

    if (posted) {
      throw new HttpError({
        status: 409,
        code: 'already_posted',
        message:
          'Opening balances have already been posted. Reverse the entry in the ledger to correct them.',
      });
    }

    const negative = Object.entries(input).find(
      ([key, value]) => typeof value === 'number' && value < 0 && key !== 'vatH',
    );
    if (negative) {
      throw validationFailed({ [negative[0]]: ['Opening balances cannot be negative.'] });
    }

    const { equityH } = openingEquityH(input);

    /* Whatever does not net out lands in suspense, so the entry balances and
       an accountant can reclassify it later. */
    await ledgerService.post({
      kind: 'opening_balance',
      sourceReference: 'OPENING',
      description: 'Opening balances',
      postedAt: new Date(`${input.asOf}T00:00:00.000Z`).toISOString(),
      actor: input.actor,
      lines: [
        debit('1000', input.cashH, 'Opening cash'),
        debit('1100', input.bankH, 'Opening bank'),
        debit('1200', input.inventoryH, 'Opening inventory'),
        debit('1400', input.receivablesH, 'Opening receivables'),
        credit('2000', input.payablesH, 'Opening payables'),
        credit('2100', Math.max(0, input.vatH), 'Opening VAT'),
        debit('1300', Math.max(0, -input.vatH), 'Opening input VAT'),
        equityH >= 0
          ? credit('3900', equityH, 'Opening equity')
          : debit('3900', Math.abs(equityH), 'Opening equity'),
      ],
    });

    posted = { ...input, postedAt: timestamp(), actor: input.actor };
    return input;
  },
};

/* ------------------------------------------------------------------ */
/* Commission                                                          */
/* ------------------------------------------------------------------ */

let rules: CommissionRule[] = [
  {
    id: 'crl_default',
    userIds: [],
    basis: 'percentage',
    value: 2000,
    itemIds: [],
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
];

let entries: CommissionEntry[] = [];

export const commissionService = {
  async rules(): Promise<CommissionRule[]> {
    if (!USE_MOCKS) {
      const rows = await commissionRuleApi.list();
      return rows.map(toRule);
    }

    await delay(120);
    return rules;
  },

  async saveRule(input: Omit<CommissionRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<CommissionRule> {
    if (!USE_MOCKS) {
      const saved = await commissionRuleApi.create({
        basis: String((input as unknown as Record<string, unknown>).basis ?? 'percent_of_sale'),
        value: Number((input as unknown as Record<string, unknown>).value ?? 0),
        isActive: true,
      });

      const rows = await commissionRuleApi.list();
      const found = rows.map(toRule).find((r) => r.id === saved.ruleId);
      if (!found) throw new Error('The rule was saved but could not be read back.');
      return found;
    }

    await delay(280);

    if (input.value <= 0) {
      throw validationFailed({ value: ['Enter a value above zero.'] });
    }
    if (input.basis === 'percentage' && input.value > 100 * 100) {
      throw validationFailed({ value: ['A commission cannot exceed 100%.'] });
    }

    const now = timestamp();
    const created: CommissionRule = {
      ...input,
      id: nextId('crl'),
      createdAt: now,
      updatedAt: now,
    };

    rules = [...rules, created];
    return created;
  },

  /** The most specific rule covering this person and service. */
  resolveRule(userId: string, itemId: string): CommissionRule | null {
    const candidates = rules
      .filter((rule) => ruleApplies(rule, userId, itemId))
      .sort((a, b) => ruleSpecificity(b) - ruleSpecificity(a));

    return candidates[0] ?? null;
  },

  async updateRule(
    id: string,
    input: Omit<CommissionRule, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<CommissionRule> {
    await delay(280);

    const existing = rules.find((rule) => rule.id === id);
    if (!existing) {
      throw new HttpError({ status: 404, code: 'not_found', message: 'Rule not found.' });
    }

    if (input.value <= 0) {
      throw validationFailed({ value: ['Enter a value above zero.'] });
    }
    if (input.basis === 'percentage' && input.value > 100 * 100) {
      throw validationFailed({ value: ['A commission cannot exceed 100%.'] });
    }

    /* Editing a rule changes future sales only. Commission already earned was
       frozen at the moment of sale and is deliberately left alone. */
    const updated: CommissionRule = { ...existing, ...input, updatedAt: timestamp() };
    rules = rules.map((rule) => (rule.id === id ? updated : rule));
    return updated;
  },

  async removeRule(id: string): Promise<void> {
    await delay(240);
    rules = rules.filter((rule) => rule.id !== id);
  },

  /**
   * Freeze commission for a sale.
   *
   * Called at the moment of sale with the figure computed from the rules as
   * they stand then. Nothing recomputes it afterwards.
   */
  async recordForSale(input: {
    saleId: string;
    invoiceNumber: string;
    userId: string;
    lines: { itemId: string; nameAr: string; nameEn: string; grossH: number }[];
  }): Promise<CommissionEntry[]> {
    const now = timestamp();
    const created: CommissionEntry[] = [];

    for (const line of input.lines) {
      const rule = commissionService.resolveRule(input.userId, line.itemId);
      if (!rule) continue;

      const amountH = commissionForH(rule, line.grossH);
      if (amountH <= 0) continue;

      created.push({
        id: nextId('cme'),
        saleId: input.saleId,
        invoiceNumber: input.invoiceNumber,
        userId: input.userId,
        itemId: line.itemId,
        itemNameAr: line.nameAr,
        itemNameEn: line.nameEn,
        lineGrossH: line.grossH,
        amountH,
        basis: rule.basis,
        rateAtSale: rule.value,
        earnedAt: now,
        payrollRunId: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    entries = [...created, ...entries];
    return created;
  },

  async list(userId?: string, period?: string): Promise<CommissionEntry[]> {
    if (!USE_MOCKS) {
      const rows = await financeApi.commission({ userId, month: period });
      return rows.map((row) => ({
        id: str(row.entryId),
        userId: str(row.userId),
        saleId: str(row.saleId),
        ruleId: str(row.ruleId),
        amountH: num(row.amountH),
        period: str(row.period),
        /* Claimed means it has been paid through a payroll run. Absent is
           unclaimed, not zero. */
        isPaid: Boolean(row.claimedAtUtc),
        createdAt: str(row.createdAtUtc),
        updatedAt: str(row.createdAtUtc),
      })) as unknown as CommissionEntry[];
    }

    await delay(160);

    return entries.filter((entry) => {
      if (userId && entry.userId !== userId) return false;
      if (period && entry.earnedAt.slice(0, 7) !== period) return false;
      return true;
    });
  },

  /** Unpaid commission per employee for a period. */
  async unpaidFor(period: string): Promise<Record<string, number>> {
    await delay(140);

    return entries
      .filter((entry) => entry.payrollRunId === null && entry.earnedAt.slice(0, 7) === period)
      .reduce<Record<string, number>>((totals, entry) => {
        totals[entry.userId] = (totals[entry.userId] ?? 0) + entry.amountH;
        return totals;
      }, {});
  },

  /** Mark commission as settled by a payroll run. */
  async markPaid(period: string, runId: string): Promise<void> {
    const now = timestamp();
    entries = entries.map((entry) =>
      entry.payrollRunId === null && entry.earnedAt.slice(0, 7) === period
        ? { ...entry, payrollRunId: runId, updatedAt: now }
        : entry,
    );
  },
};

/* ------------------------------------------------------------------ */
/* Payroll                                                             */
/* ------------------------------------------------------------------ */

let runs: PayrollRun[] = [];
let runSequence = 100;
/* Tenant state, owned by the mock database (see mock/db.ts). The values above
   are this module's factory defaults; each tenant starts from a copy. */
type PostedOpening = (OpeningBalances & { postedAt: string; actor: string }) | null;
const INITIAL_PAYROLL = clone({ posted: posted as PostedOpening, rules, entries, runs, runSequence });

registerSlice('payroll', {
  capture: () => ({ posted, rules, entries, runs, runSequence }),
  restore: (s: typeof INITIAL_PAYROLL) => {
    if (!s || typeof s !== 'object') throw new Error('payroll snapshot is malformed');
    posted = s.posted ?? INITIAL_PAYROLL.posted;
    rules = s.rules ?? INITIAL_PAYROLL.rules;
    entries = s.entries ?? INITIAL_PAYROLL.entries;
    runs = s.runs ?? INITIAL_PAYROLL.runs;
    runSequence = s.runSequence ?? INITIAL_PAYROLL.runSequence;
  },
  seed: (tenantId) => {
    void tenantId;
    const initial = clone(INITIAL_PAYROLL);
    posted = SAMPLE_ACTIVITY ? initial.posted : null;
    rules = initial.rules;
    entries = SAMPLE_ACTIVITY ? initial.entries : [];
    runs = SAMPLE_ACTIVITY ? initial.runs : [];
    runSequence = initial.runSequence;
  },
});


export const payrollService = {
  async list(): Promise<PayrollRun[]> {
    if (!USE_MOCKS) {
      const rows = await payrollApi.runs(null);
      return rows.map((row) => ({
        id: str(row.runId),
        reference: str(row.reference),
        periodMonth: str(row.periodMonth),
        branchId: (row.branchId as string | null) ?? null,
        status: str(row.status, 'draft'),
        totalH: num(row.totalH),
        paidOn: row.paidOn ? str(row.paidOn).slice(0, 10) : null,
        employeeCount: num(row.employeeCount),
        salariesH: num(row.salariesH),
        commissionH: num(row.commissionH),
        deductionsH: num(row.deductionsH),
        createdAt: str(row.createdAtUtc),
        updatedAt: str(row.updatedAtUtc),
      })) as unknown as PayrollRun[];
    }

    await delay(160);
    return [...runs].sort((a, b) => b.period.localeCompare(a.period));
  },

  /**
   * Build a draft for a period.
   *
   * Commission is pulled from what was actually frozen at each sale, not
   * recalculated — which is the whole reason it was frozen.
   */
  async draft(input: {
    period: string;
    staff: { userId: string; nameAr: string; nameEn: string; baseSalaryH: number }[];
  }): Promise<PayrollLine[]> {
    if (!USE_MOCKS) {
      /* The procedure builds the lines from salaries and unclaimed commission,
         replacing any earlier draft for the month. Drafting twice is normal —
         a manager reruns it after a salary change. */
      const drafted = await payrollApi.draft(input.period, null);
      const run = await payrollApi.run(drafted.runId);

      return ((run.lines as Record<string, unknown>[] | undefined) ?? []).map((line) => ({
        userId: str(line.userId),
        nameAr: str(line.nameAr),
        nameEn: str(line.nameEn),
        baseSalaryH: num(line.baseSalaryH),
        commissionH: num(line.commissionH),
        allowancesH: num(line.allowancesH),
        deductionsH: num(line.deductionsH),
        /* Derived, never stored: a net column would disagree with its own
           parts the first time one of them was edited. */
        netH: num(line.baseSalaryH) + num(line.commissionH)
            + num(line.allowancesH) - num(line.deductionsH),
        note: str(line.note),
      })) as unknown as PayrollLine[];
    }

    await delay(240);

    const commissions = await commissionService.unpaidFor(input.period);

    return input.staff.map((member) => {
      const line = {
        userId: member.userId,
        nameAr: member.nameAr,
        nameEn: member.nameEn,
        baseSalaryH: member.baseSalaryH,
        commissionH: commissions[member.userId] ?? 0,
        deductionsH: 0,
      };
      return { ...line, netPayH: netPayH(line) };
    });
  },

  /** Post the run: salaries and commission become an expense, cash goes out. */
  async pay(input: {
    period: string;
    lines: PayrollLine[];
    paidOn: string;
    actor: string;
  }): Promise<PayrollRun> {
    if (!USE_MOCKS) {
      /* Marks the commission claimed and posts the entry. Irreversible by
         design: paid wages are not un-paid, they are corrected by an
         adjustment. */
      const runs = await payrollApi.runs(null);
      const draft = (runs as Record<string, unknown>[])
        .find((r) => str(r.periodMonth) === input.period && str(r.status) === 'draft');

      if (!draft) {
        throw new Error('No draft payroll exists for that month. Draft it first.');
      }

      await payrollApi.pay(str(draft.runId), input.paidOn);
      invalidate('ledger');

      return toRun(await payrollApi.run(str(draft.runId)));
    }

    await delay(460);

    if (runs.some((run) => run.period === input.period && run.status === 'paid')) {
      throw new HttpError({
        status: 409,
        code: 'already_paid',
        message: 'Payroll for this period has already been paid.',
      });
    }

    const salariesH = input.lines.reduce((sum, line) => sum + line.baseSalaryH, 0);
    const commissionH = input.lines.reduce((sum, line) => sum + line.commissionH, 0);
    const deductionsH = input.lines.reduce((sum, line) => sum + line.deductionsH, 0);
    const totalH = input.lines.reduce((sum, line) => sum + line.netPayH, 0);

    if (totalH <= 0) {
      throw validationFailed({ lines: ['There is nothing to pay for this period.'] });
    }

    runSequence += 1;
    const now = timestamp();

    const run: PayrollRun = {
      id: nextId('pay'),
      reference: `PR-${runSequence}`,
      period: input.period,
      lines: input.lines,
      totalH,
      status: 'paid',
      paidOn: input.paidOn,
      actor: input.actor,
      createdAt: now,
      updatedAt: now,
    };

    /* Deductions reduce what is paid out but not what was earned, so they
       credit the expense back rather than being netted off the salary line. */
    await ledgerService.post({
      kind: 'payroll',
      sourceReference: run.reference,
      description: `Payroll ${input.period}`,
      postedAt: new Date(`${input.paidOn}T00:00:00.000Z`).toISOString(),
      actor: input.actor,
      lines: [
        debit('6200', salariesH, 'Salaries'),
        debit('6300', commissionH, 'Commission'),
        credit('6200', deductionsH, 'Deductions'),
        credit('1100', totalH, 'Paid from bank'),
      ],
    });

    await commissionService.markPaid(input.period, run.id);

    runs = [run, ...runs];
    return run;
  },
};


/** One payroll run, with its lines. */
function toRun(row: Record<string, unknown>): PayrollRun {
  const lines = (row.lines as Record<string, unknown>[] | undefined) ?? [];

  return {
    id: str(row.runId),
    reference: str(row.reference),
    periodMonth: str(row.periodMonth),
    branchId: (row.branchId as string | null) ?? null,
    status: str(row.status, 'draft'),
    paidOn: row.paidOn ? str(row.paidOn).slice(0, 10) : null,
    lines: lines.map((line) => ({
      userId: str(line.userId),
      nameAr: str(line.nameAr),
      nameEn: str(line.nameEn),
      baseSalaryH: num(line.baseSalaryH),
      commissionH: num(line.commissionH),
      allowancesH: num(line.allowancesH),
      deductionsH: num(line.deductionsH),
      /* Derived, never stored: a net column would disagree with its own parts
         the first time one of them was edited. */
      netH: num(line.baseSalaryH) + num(line.commissionH)
          + num(line.allowancesH) - num(line.deductionsH),
      note: str(line.note),
    })),
    totalH: num(row.totalH),
    createdAt: str(row.createdAtUtc),
    updatedAt: str(row.updatedAtUtc),
  } as unknown as PayrollRun;
}


/**
 * A commission rule row.
 *
 * The rule holds the rate; `fin.CommissionEntry` holds what was actually earned
 * at each sale. Editing a rule never changes past entries — that would rewrite
 * what someone was told they had earned.
 */
function toRule(row: Record<string, unknown>): CommissionRule {
  const pick = (k: string) => row[k] ?? row[k.charAt(0).toUpperCase() + k.slice(1)];

  return {
    id: str(pick('ruleId')),
    basis: str(pick('basis'), 'percent_of_sale'),
    value: num(pick('value')),
    status: pick('isActive') === false ? 'inactive' : 'active',
    createdAt: str(pick('createdAtUtc')),
    updatedAt: str(pick('updatedAtUtc')),
  } as unknown as CommissionRule;
}
