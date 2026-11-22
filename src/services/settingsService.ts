import { USE_MOCKS } from '@/config/env';
import { referenceApi } from './api';
import type { BranchSettings } from '@/types/settings';
import { DEFAULT_BRANCH_SETTINGS } from '@/types/settings';
import { delay, timestamp, validationFailed, clone } from './mock/store';
import { registerSlice } from './mock/db';

/**
 * Branch settings.
 *
 * Keyed by branch so switching branches switches the rules with it. A branch
 * that has never been configured falls back to the defaults rather than
 * erroring — a new branch should work on day one.
 */
let settings: Record<string, BranchSettings> = {};
/* Tenant state, owned by the mock database (see mock/db.ts). The values above
   are this module's factory defaults; each tenant starts from a copy. */
const INITIAL_SETTINGS = clone({ settings });

registerSlice('settings', {
  capture: () => ({ settings }),
  restore: (s: typeof INITIAL_SETTINGS) => {
    if (!s || typeof s !== 'object') throw new Error('settings snapshot is malformed');
    settings = s.settings ?? INITIAL_SETTINGS.settings;
  },
  seed: (tenantId) => {
    void tenantId;
    const initial = clone(INITIAL_SETTINGS);
    settings = initial.settings;
  },
});


function ensure(branchId: string): BranchSettings {
  if (!settings[branchId]) {
    const now = timestamp();
    settings[branchId] = {
      ...DEFAULT_BRANCH_SETTINGS,
      branchId,
      createdAt: now,
      updatedAt: now,
    };
  }
  return settings[branchId];
}

export const settingsService = {
  async get(branchId: string): Promise<BranchSettings> {
    if (!USE_MOCKS) {
      const row = await referenceApi.branchSettings(branchId);
      return row as never;
    }

    await delay(120);
    /* Older stored settings predate order types: fill the gaps from defaults. */
    const current = ensure(branchId);
    return {
      ...DEFAULT_BRANCH_SETTINGS,
      ...current,
      kitchenRouting: { ...DEFAULT_BRANCH_SETTINGS.kitchenRouting, ...(current.kitchenRouting ?? {}) },
      receiptTiming: { ...DEFAULT_BRANCH_SETTINGS.receiptTiming, ...(current.receiptTiming ?? {}) },
    };
  },

  async update(
    branchId: string,
    input: Omit<BranchSettings, 'branchId' | 'createdAt' | 'updatedAt'>,
  ): Promise<BranchSettings> {
    await delay(320);

    const errors: Record<string, string[]> = {};
    if (input.vatRatePercent < 0 || input.vatRatePercent > 100) {
      errors.vatRatePercent = ['Enter a VAT rate between 0 and 100.'];
    }
    if (input.enabledOrderTypes && input.enabledOrderTypes.length === 0) {
      errors.enabledOrderTypes = ['Keep at least one order type.'];
    }
    if (input.enabledOrderTypes && !input.enabledOrderTypes.includes(input.defaultOrderType)) {
      errors.defaultOrderType = ['The default order type must be one of the enabled ones.'];
    }
    if (Object.keys(errors).length > 0) throw validationFailed(errors);

    const existing = ensure(branchId);
    const updated: BranchSettings = { ...existing, ...input, updatedAt: timestamp() };
    settings = { ...settings, [branchId]: updated };
    return updated;
  },

  /** Copy one branch's configuration onto another. */
  async copyFrom(sourceBranchId: string, targetBranchId: string): Promise<BranchSettings> {
    await delay(280);

    const source = ensure(sourceBranchId);
    const target = ensure(targetBranchId);

    const updated: BranchSettings = {
      ...source,
      branchId: targetBranchId,
      createdAt: target.createdAt,
      updatedAt: timestamp(),
    };

    settings = { ...settings, [targetBranchId]: updated };
    return updated;
  },
};
