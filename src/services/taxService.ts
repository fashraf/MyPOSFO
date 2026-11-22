import { USE_MOCKS } from '@/config/env';
import { api } from './apiClient';
import { HttpError } from './http';
import { clone, delay, timestamp } from './mock/store';
import { registerSlice } from './mock/db';
import { seedFor } from './mock/seed';
import { invalidate } from './dataVersion';
import { DEFAULT_TAX, setActiveTax, validateTax, type TaxSettings } from '@/types/tax';

/**
 * Tax settings — one per business (tenant), because tax registration is per
 * legal entity, not per branch.
 *
 * Saving changes how NEW orders are taxed. Every sale stores its own tax
 * snapshot, so past invoices, receipts and reports never move.
 */

let settings: TaxSettings = clone(DEFAULT_TAX);
let history: { at: string; by: string; summary: string }[] = [];

registerSlice('tax', {
  capture: () => ({ settings, history }),
  restore: (snap: { settings: TaxSettings; history: typeof history }) => {
    if (!snap?.settings?.rates) throw new Error('tax snapshot is malformed');
    settings = { ...clone(DEFAULT_TAX), ...snap.settings };
    history = snap.history ?? [];
    setActiveTax(settings);
  },
  seed: (tenantId) => {
    const company = seedFor(tenantId).company as { vatNumber?: string };
    settings = { ...clone(DEFAULT_TAX), registrationNumber: company.vatNumber ?? '' };
    history = [];
    setActiveTax(settings);
  },
});

export function describeTax(s: TaxSettings): string {
  if (!s.enabled) return 'Tax off';
  const rate = s.rates.find((r) => r.id === s.defaultRateId);
  return `${s.taxName} ${rate?.percent ?? 0}% · ${s.pricesIncludeTax ? 'prices include tax' : 'tax added on top'}${s.regime === 'gst' ? ` · ${s.gstSupply === 'inter' ? 'IGST' : 'CGST + SGST'}` : ''}`;
}

export const taxService = {
  async get(): Promise<TaxSettings> {
    if (!USE_MOCKS) {
      const remote = await api.get<TaxSettings>('/api/settings/tax');
      setActiveTax(remote);
      return remote;
    }
    await delay(80);
    return clone(settings);
  },

  async history(): Promise<typeof history> {
    await delay(40);
    return clone(history).reverse();
  },

  async update(next: TaxSettings, actor: string): Promise<TaxSettings> {
    const errors = validateTax(next);
    if (Object.keys(errors).length) {
      throw new HttpError({ status: 422, code: 'validation_failed', message: Object.values(errors)[0], fieldErrors: Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [v]])) });
    }
    if (!USE_MOCKS) {
      const saved = await api.put<TaxSettings>('/api/settings/tax', next);
      setActiveTax(saved);
      invalidate('sales');
      return saved;
    }
    await delay(260);
    const before = describeTax(settings);
    settings = { ...clone(next), registrationNumber: next.registrationNumber.trim().toUpperCase(), updatedAt: timestamp(), updatedBy: actor };
    history.push({ at: settings.updatedAt!, by: actor, summary: `${before} → ${describeTax(settings)}` });
    setActiveTax(settings);
    invalidate('sales', 'catalog');
    return clone(settings);
  },
};
