import { api } from '../apiClient';

/** Branches — the picker list, the maintenance list, and the writes. */

export interface BranchRow {
  branchId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  phone: string | null;
  addressAr: string | null;
  addressEn: string | null;
  isActive: boolean;
  vatRatePercent: number | null;
  pricesIncludeVat: boolean | null;
  allowNegativeStock: boolean | null;
  /** Who can work here. Zero means the branch exists only on paper. */
  staffCount: number;
  deviceCount: number;
  createdAtUtc: string;
  updatedAtUtc: string | null;
}

export interface SaveBranchBody {
  code: string;
  nameAr: string;
  nameEn: string;
  phone?: string | null;
  addressAr?: string | null;
  addressEn?: string | null;
  isActive?: boolean;
  vatRatePercent?: number;
  pricesIncludeVat?: boolean;
  allowNegativeStock?: boolean;
}

export const branchApi = {
  /** What a picker needs. Every branch selector in the app reads this. */
  list() {
    return api.get<Record<string, unknown>[]>('/api/branches');
  },

  /** The full record, with settings and staff counts, for maintenance. */
  manage() {
    return api.get<BranchRow[]>('/api/branches/manage');
  },

  create(body: SaveBranchBody) {
    return api.post<{ branchId: string }>('/api/branches', body);
  },

  update(branchId: string, body: SaveBranchBody) {
    return api.put<{ branchId: string }>(`/api/branches/${branchId}`, body);
  },
};
