/**
 * Tax, for any country the business sells in.
 *
 * One model covers single-rate VAT (Saudi Arabia 15 %, UAE 5 %, UK 20 %…),
 * split GST (India: CGST + SGST inside a state, IGST across states) and a plain
 * "no tax" setup. A rate is made of one or more components; the components are
 * what a receipt prints and what the books post.
 *
 * Money stays in integer minor units (halalas, paise, fils). Tax is worked out
 * per rate on the discounted taxable amount, then split into components, with
 * any rounding cent given to the last component so the parts always add up to
 * the whole.
 */

export type TaxCountry = 'SA' | 'AE' | 'BH' | 'OM' | 'QA' | 'KW' | 'EG' | 'IN' | 'GB' | 'custom';
export type TaxRegime = 'vat' | 'gst' | 'sales_tax';
export type TaxKind = 'standard' | 'reduced' | 'zero' | 'exempt';
/** India: where the supply happens decides CGST+SGST or IGST. */
export type GstSupply = 'intra' | 'inter';

export interface TaxComponent {
  /** Printed label: "VAT", "CGST", "SGST", "IGST". */
  name: string;
  percent: number;
}

export interface TaxRate {
  id: string;
  name: string;
  kind: TaxKind;
  /** Total percentage. Components must add up to this. */
  percent: number;
  /** For GST: how it splits inside a state. Empty means a single component named after the tax. */
  components: TaxComponent[];
  /** HSN/SAC or local code, printed on GST invoices. */
  code?: string;
}

export interface TaxSettings {
  /** Master switch. Off means no tax is charged, shown or reported on new orders. */
  enabled: boolean;
  country: TaxCountry;
  regime: TaxRegime;
  /** "VAT", "GST", "Sales tax". */
  taxName: string;
  /** "VAT number", "TRN", "GSTIN". */
  registrationLabel: string;
  registrationNumber: string;
  /** Menu prices already include tax (Gulf convention) or tax is added on top (India, US). */
  pricesIncludeTax: boolean;
  rates: TaxRate[];
  defaultRateId: string;
  /** India only. */
  gstSupply: GstSupply;
  /** India only: the state the outlet is registered in. */
  gstState: string;
  /** Print the per-component breakdown (CGST 2.5 % / SGST 2.5 %) on receipts. */
  showBreakdown: boolean;
  /** Saudi Arabia: stamp and QR invoices for ZATCA Phase 2. */
  zatca: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface TaxLine {
  /** Component label with its rate: "CGST 2.5%". */
  label: string;
  name: string;
  percent: number;
  taxableH: number;
  taxH: number;
}

/* ---------------------------------------------------------------- presets */

const vat = (id: string, name: string, kind: TaxKind, percent: number): TaxRate => ({ id, name, kind, percent, components: [] });
const gst = (percent: number, kind: TaxKind = 'standard', name = `GST ${percent}%`): TaxRate => ({
  id: `gst_${String(percent).replace('.', '_')}`,
  name,
  kind,
  percent,
  components: percent > 0 ? [{ name: 'CGST', percent: percent / 2 }, { name: 'SGST', percent: percent / 2 }] : [],
});

export interface TaxPreset {
  country: TaxCountry;
  label: string;
  flag: string;
  settings: Omit<TaxSettings, 'registrationNumber' | 'updatedAt' | 'updatedBy'>;
}

function vatPreset(country: TaxCountry, label: string, flag: string, percent: number, regLabel: string, extra: Partial<TaxSettings> = {}, more: TaxRate[] = []): TaxPreset {
  const rates = [
    ...(percent > 0 ? [vat('std', `Standard ${percent}%`, 'standard', percent)] : []),
    ...more,
    vat('zero', 'Zero-rated 0%', 'zero', 0),
    vat('exempt', 'Exempt', 'exempt', 0),
  ];
  return {
    country, label, flag,
    settings: {
      enabled: percent > 0, country, regime: 'vat', taxName: 'VAT', registrationLabel: regLabel,
      pricesIncludeTax: true, rates, defaultRateId: rates[0].id, gstSupply: 'intra', gstState: '',
      showBreakdown: false, zatca: false, ...extra,
    },
  };
}

export const TAX_PRESETS: TaxPreset[] = [
  vatPreset('SA', 'Saudi Arabia — VAT 15%', '🇸🇦', 15, 'VAT number', { zatca: true }),
  vatPreset('AE', 'United Arab Emirates — VAT 5%', '🇦🇪', 5, 'TRN'),
  vatPreset('BH', 'Bahrain — VAT 10%', '🇧🇭', 10, 'VAT account number'),
  vatPreset('OM', 'Oman — VAT 5%', '🇴🇲', 5, 'VATIN'),
  vatPreset('EG', 'Egypt — VAT 14%', '🇪🇬', 14, 'Tax registration number'),
  vatPreset('GB', 'United Kingdom — VAT 20%', '🇬🇧', 20, 'VAT registration number', {}, [vat('reduced', 'Reduced 5%', 'reduced', 5)]),
  vatPreset('QA', 'Qatar — no VAT', '🇶🇦', 0, 'Tax card number'),
  vatPreset('KW', 'Kuwait — no VAT', '🇰🇼', 0, 'Tax number'),
  {
    country: 'IN', label: 'India — GST (CGST + SGST / IGST)', flag: '🇮🇳',
    settings: {
      enabled: true, country: 'IN', regime: 'gst', taxName: 'GST', registrationLabel: 'GSTIN',
      /* Indian menus quote prices before GST ("+ taxes"). */
      pricesIncludeTax: false,
      rates: [
        gst(5, 'standard', 'Restaurant service 5%'),
        gst(12), gst(18, 'standard', 'GST 18% (packaged / hotel restaurant)'), gst(28),
        { ...gst(0, 'zero', 'Nil-rated 0%'), id: 'gst_0' },
        { id: 'exempt', name: 'Exempt', kind: 'exempt', percent: 0, components: [] },
      ],
      defaultRateId: 'gst_5', gstSupply: 'intra', gstState: 'Karnataka', showBreakdown: true, zatca: false,
    },
  },
  {
    country: 'custom', label: 'Custom / other country', flag: '🌍',
    settings: {
      enabled: true, country: 'custom', regime: 'sales_tax', taxName: 'Tax', registrationLabel: 'Tax number',
      pricesIncludeTax: false, rates: [vat('std', 'Standard 10%', 'standard', 10), vat('zero', 'Zero 0%', 'zero', 0)],
      defaultRateId: 'std', gstSupply: 'intra', gstState: '', showBreakdown: false, zatca: false,
    },
  },
];

export function presetFor(country: TaxCountry): TaxPreset {
  return TAX_PRESETS.find((p) => p.country === country) ?? TAX_PRESETS[0];
}

export const DEFAULT_TAX: TaxSettings = { ...presetFor('SA').settings, registrationNumber: '' };

/* ------------------------------------------------------- active settings */

let active: TaxSettings = DEFAULT_TAX;
const listeners = new Set<() => void>();

/** The settings every total is computed with. Set by the tax service on load and save. */
export function setActiveTax(next: TaxSettings): void {
  active = next;
  for (const fn of [...listeners]) fn();
}

export function activeTax(): TaxSettings {
  return active;
}

export function onTaxChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ------------------------------------------------------------ arithmetic */

export function rateById(settings: TaxSettings, id: string | null | undefined): TaxRate | undefined {
  return settings.rates.find((r) => r.id === (id ?? settings.defaultRateId)) ?? settings.rates.find((r) => r.id === settings.defaultRateId);
}

/** The components a rate charges under the current supply rules. */
export function componentsOf(settings: TaxSettings, rate: TaxRate): TaxComponent[] {
  if (rate.percent <= 0) return [];
  if (settings.regime === 'gst' && settings.gstSupply === 'inter') return [{ name: 'IGST', percent: rate.percent }];
  if (rate.components.length > 0) return rate.components;
  return [{ name: settings.taxName, percent: rate.percent }];
}

export interface TaxableAmount {
  /** What the customer is charged for this part, as entered (incl. or excl. tax per settings), after discounts. */
  amountH: number;
  rateId?: string | null;
}

export interface TaxResult {
  /** Excluding tax, after discounts. */
  netH: number;
  taxH: number;
  /** What the customer pays. */
  totalH: number;
  lines: TaxLine[];
}

/**
 * Tax on a set of discounted amounts.
 *
 * Inclusive: tax is extracted — tax = round(amount × r / (100 + r)).
 * Exclusive: tax is added — tax = round(amount × r / 100).
 * Grouped per rate first, so rounding happens once per rate, not per line.
 */
export function computeTax(parts: TaxableAmount[], settings: TaxSettings = active): TaxResult {
  const amountH = parts.reduce((s, p) => s + p.amountH, 0);
  if (!settings.enabled) return { netH: amountH, taxH: 0, totalH: amountH, lines: [] };

  const byRate = new Map<string, number>();
  for (const part of parts) {
    const rate = rateById(settings, part.rateId);
    const key = rate?.id ?? '__none';
    byRate.set(key, (byRate.get(key) ?? 0) + part.amountH);
  }

  const lines: TaxLine[] = [];
  let taxH = 0;
  for (const [rateId, sumH] of byRate) {
    const rate = settings.rates.find((r) => r.id === rateId);
    if (!rate || rate.percent <= 0 || sumH <= 0) continue;
    const p = rate.percent;
    const rateTaxH = settings.pricesIncludeTax ? Math.round((sumH * p) / (100 + p)) : Math.round((sumH * p) / 100);
    const taxableH = settings.pricesIncludeTax ? sumH - rateTaxH : sumH;
    const comps = componentsOf(settings, rate);
    let left = rateTaxH;
    comps.forEach((c, i) => {
      const part = i === comps.length - 1 ? left : Math.round((rateTaxH * c.percent) / p);
      left -= part;
      const label = `${c.name} ${trimPercent(c.percent)}%`;
      const existing = lines.find((l) => l.label === label);
      if (existing) {
        existing.taxH += part;
        existing.taxableH += taxableH;
      } else {
        lines.push({ label, name: c.name, percent: c.percent, taxableH, taxH: part });
      }
    });
    taxH += rateTaxH;
  }

  return settings.pricesIncludeTax
    ? { netH: amountH - taxH, taxH, totalH: amountH, lines }
    : { netH: amountH, taxH, totalH: amountH + taxH, lines };
}

export function trimPercent(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

/** "VAT 15%", "GST 5%", or "" when tax is off — for the cart and receipts. */
export function taxHeadline(settings: TaxSettings = active, rateId?: string | null): string {
  if (!settings.enabled) return '';
  const rate = rateById(settings, rateId);
  return rate ? `${settings.taxName} ${trimPercent(rate.percent)}%` : settings.taxName;
}

export function validateTax(s: TaxSettings): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!s.taxName.trim()) errors.taxName = 'Give the tax a name, e.g. VAT or GST.';
  if (s.rates.length === 0) errors.rates = 'Add at least one rate.';
  if (!s.rates.some((r) => r.id === s.defaultRateId)) errors.defaultRateId = 'Pick the default rate.';
  s.rates.forEach((r, i) => {
    if (!(r.percent >= 0 && r.percent <= 100)) errors[`rate_${i}`] = 'A rate must be between 0 and 100.';
    if (r.components.length > 0) {
      const sum = r.components.reduce((a, c) => a + c.percent, 0);
      if (Math.abs(sum - r.percent) > 0.0001) errors[`rate_${i}`] = `Components add up to ${trimPercent(sum)}%, not ${trimPercent(r.percent)}%.`;
    }
    if (!r.name.trim()) errors[`rate_${i}`] = 'Every rate needs a name.';
  });
  if (s.regime === 'gst' && s.registrationNumber && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s.registrationNumber.trim().toUpperCase())) {
    errors.registrationNumber = 'A GSTIN is 15 characters, e.g. 29ABCDE1234F1Z5.';
  }
  if (s.country === 'SA' && s.registrationNumber && !/^3\d{13}3$/.test(s.registrationNumber.trim())) {
    errors.registrationNumber = 'A Saudi VAT number is 15 digits, starting and ending with 3.';
  }
  return errors;
}
