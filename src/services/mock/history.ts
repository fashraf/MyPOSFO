import type { CatalogItem } from '@/types/catalog';
import { isCombo } from '@/types/catalog';
import { buildComponents, comboUnitPriceH, componentsCostH, defaultSelection, requiredDefaults } from '@/lib/combo';
import type { Sale, SaleLine, SalePayment } from '@/types/sales';
import { computeTotals } from '@/types/sales';
import type { ZatcaInvoiceMeta } from '@/types/zatca';
import { GENESIS_PIH, stampInvoice, uuidV4 } from '@/lib/zatca';
import type { TenantSeed } from './seed';
import { seededRandom } from './store';

/**
 * Three weeks of realistic trading, generated deterministically.
 *
 * Without history the dashboard opens on zeros and the first impression is
 * "broken", not "new". These sales are shaped like the business they belong
 * to — a café peaks at 8am and 4pm with small baskets; a supermarket builds to
 * an evening peak with bigger ones — and every one carries a real ZATCA stamp
 * in an unbroken hash chain, so the e-invoice trail can be audited end to end.
 *
 * The generator is seeded per tenant: a reset reproduces the same sales,
 * invoice numbers and hashes on every machine.
 */

export interface ZatcaChain {
  icv: number;
  lastHash: string;
}

export interface GeneratedHistory {
  sales: Sale[];
  invoiceSequence: number;
  chain: ZatcaChain;
}

interface Profile {
  days: number;
  /** Mean sales per day for each branch. */
  perDay: Record<string, number>;
  /** Hour weights, 0–23, Riyadh time. */
  hours: number[];
  maxLines: number;
  maxQuantity: number;
  /** Share of payments by card (Mada/Visa) vs cash. */
  cardShare: number;
  seed: number;
}

const CAFE: Profile = {
  days: 21,
  perDay: { brn_001: 11, brn_002: 7, brn_003: 5 },
  hours: [0, 0, 0, 0, 0, 0, 1, 6, 9, 7, 5, 4, 4, 5, 6, 8, 9, 7, 5, 4, 4, 3, 1, 0],
  maxLines: 3,
  maxQuantity: 2,
  cardShare: 0.74,
  seed: 0xa11c0ffe,
};

const MARKET: Profile = {
  days: 21,
  perDay: { brn_001: 13, brn_002: 9, brn_003: 6 },
  hours: [1, 1, 0, 0, 0, 0, 1, 2, 3, 4, 4, 5, 5, 4, 4, 5, 6, 7, 9, 10, 9, 7, 4, 2],
  maxLines: 5,
  maxQuantity: 4,
  cardShare: 0.62,
  seed: 0x9a1d5e3,
};

/* Lunch and late-evening peaks; most baskets are a meal or two. */
const QSR: Profile = {
  days: 21,
  perDay: { brn_001: 14, brn_002: 9, brn_003: 8 },
  hours: [2, 1, 0, 0, 0, 0, 0, 0, 1, 2, 3, 6, 10, 9, 5, 4, 5, 7, 9, 10, 9, 8, 6, 4],
  maxLines: 3,
  maxQuantity: 2,
  cardShare: 0.7,
  seed: 0xb0b6e2,
};

const RIYADH_OFFSET_HOURS = 3;

function pickWeighted(weights: number[], random: () => number): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = random() * total;
  for (let index = 0; index < weights.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return index;
  }
  return weights.length - 1;
}

export function generateHistory(tenantId: string, seed: TenantSeed): GeneratedHistory {
  const profile = tenantId === 'ten_najd' ? MARKET : tenantId === 'ten_lazeez' ? QSR : CAFE;
  const random = seededRandom(profile.seed);

  const sellable = seed.catalog.filter((item: CatalogItem) => item.status === 'active' && item.showOnPos);
  /* Popular items sell more: weight by position so the "top products" chart has a shape. */
  const itemWeights = sellable.map((_, index) => Math.max(1, sellable.length - index) ** 1.4);

  const sellers = seed.users.filter((user) => ['rol_cashier', 'rol_manager'].includes(user.roleId));
  const sellerFor = (branchId: string) => {
    const local = sellers.filter((user) => user.branchIds.includes(branchId));
    return (local.length > 0 ? local : sellers)[0]?.nameEn ?? 'Cashier';
  };

  const now = Date.now();
  const drafts: { at: number; branchId: string; lines: SaleLine[]; cashier: string }[] = [];

  for (let daysAgo = profile.days - 1; daysAgo >= 0; daysAgo -= 1) {
    /* Weekends (Thu–Sat in KSA) trade harder. */
    const day = new Date(now - daysAgo * 86_400_000);
    const weekday = day.getUTCDay();
    const weekendBoost = weekday === 4 || weekday === 5 ? 1.25 : weekday === 6 ? 1.1 : 1;
    /* A gentle upward trend, so "vs last period" is positive but not absurd. */
    const trend = 0.88 + ((profile.days - daysAgo) / profile.days) * 0.2;

    for (const branch of seed.branches) {
      const mean = (profile.perDay[branch.id] ?? 4) * weekendBoost * trend;
      const count = Math.max(1, Math.round(mean * (0.8 + random() * 0.4)));

      for (let n = 0; n < count; n += 1) {
        const hour = pickWeighted(profile.hours, random);
        const minute = Math.floor(random() * 60);
        const startOfDayUtc = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
        const at = startOfDayUtc + ((hour - RIYADH_OFFSET_HOURS) * 60 + minute) * 60_000;

        /* Nothing from the future: today only fills up to the current time. */
        if (at > now - 5 * 60_000) continue;

        const lineCount = 1 + Math.floor(random() * profile.maxLines);
        const lines: SaleLine[] = [];
        for (let l = 0; l < lineCount; l += 1) {
          const item = sellable[pickWeighted(itemWeights, random)];
          if (lines.some((line) => line.itemId === item.id)) continue;
          /* A combo in history carries its default contents, so the sale detail
             and the kitchen view read the same as a combo sold today. */
          const components = isCombo(item)
            ? buildComponents(item, defaultSelection(item, seed.catalog), seed.catalog)
            : undefined;
          const modifiers = isCombo(item) ? [] : requiredDefaults(item);
          lines.push({
            id: `ln_h${drafts.length}_${l}`,
            itemId: item.id,
            kind: item.kind,
            nameAr: item.nameAr,
            nameEn: item.nameEn,
            quantity: 1 + Math.floor(random() * profile.maxQuantity),
            unitPriceH: components
              ? comboUnitPriceH(item, components)
              : item.priceH + modifiers.reduce((sum, m) => sum + m.priceDeltaH, 0),
            unitCostH: components ? componentsCostH(components) : item.costH,
            discountH: 0,
            ...(components ? { components } : {}),
            ...(modifiers.length > 0 ? { modifiers } : {}),
          });
        }

        drafts.push({ at, branchId: branch.id, lines, cashier: sellerFor(branch.id) });
      }
    }
  }

  drafts.sort((a, b) => a.at - b.at);

  let sequence = 100000;
  const chain: ZatcaChain = { icv: 0, lastHash: GENESIS_PIH };
  const sales: Sale[] = [];
  const uuidRandom = seededRandom(profile.seed ^ 0x5eed);

  for (const draft of drafts) {
    sequence += 1;
    const totals = computeTotals(draft.lines, 0);
    const byCard = random() < profile.cardShare;
    const payments: SalePayment[] = [{ method: byCard ? 'card' : 'cash', amountH: totals.totalH }];
    const tenderedH = byCard ? null : Math.ceil(totals.totalH / 1000) * 1000;
    const issuedAt = new Date(draft.at).toISOString();
    const invoiceNumber = String(sequence);

    chain.icv += 1;
    const uuid = uuidV4(uuidRandom);
    const { invoiceHash, qrBase64 } = stampInvoice({
      sellerName: seed.company.nameAr,
      vatNumber: seed.company.vatNumber,
      invoiceNumber,
      issuedAt,
      totalH: totals.totalH,
      vatH: totals.taxH,
      lines: draft.lines.map((line) => ({
        itemId: line.itemId, quantity: line.quantity, unitPriceH: line.unitPriceH, discountH: line.discountH,
      })),
      previousInvoiceHash: chain.lastHash,
      icv: chain.icv,
      egsUnitId: `EGS-${draft.branchId.toUpperCase()}-01`,
      uuid,
    });

    /* Most invoices reported within minutes; a few carry warnings; the last
       handful are still in the 24-hour reporting window. */
    const ageHours = (now - draft.at) / 3_600_000;
    const roll = random();
    const reportingStatus: ZatcaInvoiceMeta['reportingStatus'] =
      ageHours < 0.75 ? 'pending' : roll < 0.035 ? 'warning' : 'reported';

    const zatca: ZatcaInvoiceMeta = {
      uuid,
      icv: chain.icv,
      invoiceHash,
      previousInvoiceHash: chain.lastHash,
      qrBase64,
      invoiceType: 'simplified',
      egsUnitId: `EGS-${draft.branchId.toUpperCase()}-01`,
      reportingStatus,
      reportedAt: reportingStatus === 'pending' ? null : new Date(draft.at + 4 * 60_000).toISOString(),
      messages:
        reportingStatus === 'warning'
          ? ['BR-KSA-08: Buyer identification is recommended for invoices above SAR 1,000.']
          : [],
    };
    chain.lastHash = invoiceHash;

    sales.push({
      id: `sal_h${sequence}`,
      invoiceNumber,
      lines: draft.lines,
      payments,
      customerId: null,
      cashierName: draft.cashier,
      branchId: draft.branchId,
      discountH: totals.discountH,
      subtotalH: totals.subtotalH,
      taxH: totals.taxH,
      totalH: totals.totalH,
      tenderedH,
      changeH: tenderedH === null ? 0 : tenderedH - totals.totalH,
      status: 'completed',
      soldAt: issuedAt,
      createdAt: issuedAt,
      updatedAt: issuedAt,
      zatca,
    });
  }

  /* Newest first, as the service stores them. */
  sales.reverse();

  return { sales, invoiceSequence: sequence, chain };
}
