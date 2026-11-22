import { credit, debit, ledgerService } from '../ledgerService';
import { currentTenantId } from './db';
import { seedFor } from './seed';

/**
 * Six months of trading history.
 *
 * Without this every chart renders an empty frame and the finance module looks
 * broken rather than new. The figures are shaped to be realistic — a slow
 * summer, a strong September, one branch outperforming the other — so the
 * comparison views actually have something to show.
 */

/* The flagship trades well ahead of the others, and the third branch has a
   weak month, so the branch comparison has a real story in it rather than noise. */
const MONTHLY: { salesH: number; share: [number, number, number] }[] = [
  { salesH: 6_820_000, share: [0.52, 0.28, 0.20] },
  { salesH: 7_140_000, share: [0.50, 0.29, 0.21] },
  { salesH: 6_450_000, share: [0.55, 0.30, 0.15] },
  { salesH: 7_960_000, share: [0.49, 0.30, 0.21] },
  { salesH: 8_540_000, share: [0.47, 0.31, 0.22] },
  { salesH: 9_120_000, share: [0.48, 0.30, 0.22] },
];

/* A supermarket turns over more than a café, on thinner margins. */
const TENANT_SCALE: Record<string, { volume: number; cogs: number }> = {
  ten_alnoor: { volume: 1, cogs: 0.32 },
  ten_najd: { volume: 1.85, cogs: 0.71 },
  ten_lazeez: { volume: 1.35, cogs: 0.36 },
};

const VAT_RATE = 0.15;

/** Split a gross figure into net and VAT the way the rest of the app does. */
function split(grossH: number) {
  const taxH = Math.round((grossH * VAT_RATE) / (1 + VAT_RATE));
  return { netH: grossH - taxH, taxH };
}

function monthStart(monthsAgo: number): string {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - monthsAgo);
  return date.toISOString().slice(0, 10);
}

/**
 * Post the history for the active tenant.
 *
 * The ledger guards against running this twice for the same tenant (a second
 * run would double every figure); it is called again only after a reset.
 */
export async function seedFinanceHistory(): Promise<void> {
  const tenantId = currentTenantId() ?? 'ten_alnoor';
  const BRANCHES = seedFor(tenantId).branches.map((branch) => branch.id).slice(0, 3);
  const scale = TENANT_SCALE[tenantId] ?? TENANT_SCALE.ten_alnoor;

  for (let index = 0; index < MONTHLY.length; index += 1) {
    const monthsAgo = MONTHLY.length - 1 - index;
    const month = monthStart(monthsAgo);
    const plan = MONTHLY[index];

    for (let branchIndex = 0; branchIndex < BRANCHES.length; branchIndex += 1) {
      const branchId = BRANCHES[branchIndex];
      const grossH = Math.round(plan.salesH * scale.volume * (plan.share[branchIndex] ?? 0.2));
      const { netH, taxH } = split(grossH);

      /* Payment mix: mostly card, a solid cash share, a little on credit. */
      const cardH = Math.round(grossH * 0.54);
      const cashH = Math.round(grossH * 0.38);
      const creditH = grossH - cardH - cashH;

      const cogsH = Math.round(netH * scale.cogs);

      await ledgerService.post({
        kind: 'sale',
        sourceReference: `HIST-${month}-${branchId}`,
        description: `Sales ${month.slice(0, 7)}`,
        postedAt: `${month}T12:00:00.000Z`,
        actor: 'System',
        branchId,
        lines: [
          debit('1000', cashH, 'Cash'),
          debit('1150', cardH, 'Card clearing'),
          debit('1400', creditH, 'Customer credit'),
          credit('4100', netH, 'Sales'),
          credit('2100', taxH, 'Output VAT'),
          debit('5100', cogsH, 'Cost of goods sold'),
          credit('1200', cogsH, 'Inventory'),
        ],
      });

      /* Operating costs, weighted so Jeddah's margin is visibly thinner. */
      const rentH = [800_000, 620_000, 480_000][branchIndex] ?? 500_000;
      const salariesH = [1_240_000, 1_180_000, 760_000][branchIndex] ?? 800_000;
      const utilitiesH = [215_000, 268_000, 150_000][branchIndex] ?? 180_000;

      await ledgerService.post({
        kind: 'expense_recognition',
        sourceReference: `HIST-RENT-${month}-${branchId}`,
        description: `Rent — ${month.slice(0, 7)}`,
        postedAt: `${month}T12:00:00.000Z`,
        actor: 'System',
        branchId,
        lines: [debit('6000', rentH, 'Rent'), credit('1000', rentH, 'Cash')],
      });

      await ledgerService.post({
        kind: 'expense_recognition',
        sourceReference: `HIST-SAL-${month}-${branchId}`,
        description: `Salaries — ${month.slice(0, 7)}`,
        postedAt: `${month}T12:00:00.000Z`,
        actor: 'System',
        branchId,
        lines: [debit('6200', salariesH, 'Salaries'), credit('1100', salariesH, 'Bank')],
      });

      await ledgerService.post({
        kind: 'expense_recognition',
        sourceReference: `HIST-UTIL-${month}-${branchId}`,
        description: `Utilities — ${month.slice(0, 7)}`,
        postedAt: `${month}T12:00:00.000Z`,
        actor: 'System',
        branchId,
        lines: [debit('6000', utilitiesH, 'Utilities'), credit('1000', utilitiesH, 'Cash')],
      });

      /* The bank settles card takings, less a fee. */
      const feeH = Math.round(cardH * 0.015);
      await ledgerService.post({
        kind: 'card_settlement',
        sourceReference: `HIST-SET-${month}-${branchId}`,
        description: 'Card settlement',
        postedAt: `${month}T18:00:00.000Z`,
        actor: 'System',
        branchId,
        lines: [
          debit('1100', cardH - feeH, 'Bank deposit'),
          debit('6100', feeH, 'Card fees'),
          credit('1150', cardH, 'Card clearing'),
        ],
      });
    }
  }
}
