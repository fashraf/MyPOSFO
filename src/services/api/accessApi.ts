import { api } from '../apiClient';

/** Branch access, permission overrides, commission rules and bill templates. */

export interface UserAccess {
  branches: { branchId: string; code: string; nameAr: string; nameEn: string }[];
  overrides: { permissionKey: string; effect: 'grant' | 'deny' }[];
  /**
   * What the role and the overrides add up to.
   *
   * Returned alongside the overrides because the two answer different
   * questions: what was chosen, and what it produced. A screen showing only
   * overrides cannot reveal that a denial has removed something the role still
   * appears to grant.
   */
  effective: string[];
}

export const accessApi = {
  get(userId: string) {
    return api.get<UserAccess>(`/api/users/${userId}/access`);
  },

  /** Replaces the set. Partial updates leave access nobody chose. */
  setBranches(userId: string, branchIds: string[]) {
    return api.put<{ userId: string; branches: number }>(
      `/api/users/${userId}/branches`, { branchIds });
  },

  setOverrides(userId: string, grants: string[], denies: string[]) {
    return api.put<{ userId: string }>(
      `/api/users/${userId}/overrides`, { grants, denies });
  },
};

export const commissionRuleApi = {
  list() {
    return api.get<Record<string, unknown>[]>('/api/finance/commission-rules');
  },
  create(body: { basis: string; value: number; isActive?: boolean }) {
    return api.post<{ ruleId: string }>('/api/finance/commission-rules', body);
  },
  update(ruleId: string, body: { basis: string; value: number; isActive?: boolean }) {
    return api.put<{ ruleId: string }>(`/api/finance/commission-rules/${ruleId}`, body);
  },
};

export const billTemplateApi = {
  list() {
    return api.get<Record<string, unknown>[]>('/api/bill-templates');
  },
  create(body: Record<string, unknown>) {
    return api.post<{ billId: string }>('/api/bill-templates', body);
  },
  update(billId: string, body: Record<string, unknown>) {
    return api.put<{ billId: string }>(`/api/bill-templates/${billId}`, body);
  },
};
