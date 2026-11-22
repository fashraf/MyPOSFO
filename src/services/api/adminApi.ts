import { api } from '../apiClient';

/**
 * The write paths that were missing.
 *
 * Catalogue items and categories, discounts, users and the company profile.
 * Each screen previously saved into memory and lost the change on reload.
 */

export interface SaveItemBody {
  kind?: 'product' | 'service';
  nameAr: string;
  nameEn: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  sku?: string | null;
  barcode?: string | null;
  categoryId?: string | null;
  vendorId?: string | null;
  printGroupId?: string | null;
  priceH: number;
  /* Cost is ignored on update: it is a weighted average maintained by
     receiving, and an edit form overwriting it would make past margins wrong. */
  costH?: number;
  tracksStock?: boolean;
  reorderLevel?: number;
  requiresPreparation?: boolean;
  isActive?: boolean;
}

export const catalogWriteApi = {
  createItem(body: SaveItemBody) {
    return api.post<{ itemId: string }>('/api/catalog/items', body);
  },
  updateItem(itemId: string, body: SaveItemBody) {
    return api.put<{ itemId: string }>(`/api/catalog/items/${itemId}`, body);
  },
  createCategory(body: { nameAr: string; nameEn: string; sortOrder?: number; isActive?: boolean }) {
    return api.post<{ categoryId: string }>('/api/catalog/categories', body);
  },
  updateCategory(
    categoryId: string,
    body: { nameAr: string; nameEn: string; sortOrder?: number; isActive?: boolean },
  ) {
    return api.put<{ categoryId: string }>(`/api/catalog/categories/${categoryId}`, body);
  },
};

export interface SaveDiscountBody {
  nameAr: string;
  nameEn: string;
  discountType: 'percent' | 'amount';
  value: number;
  maxDiscountH?: number | null;
  minSubtotalH?: number;
  approvalAboveH?: number | null;
  appliesTo?: string;
  isAutomatic?: boolean;
  allowStacking?: boolean;
  activeDays?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  isActive?: boolean;
}

export const discountWriteApi = {
  create(body: SaveDiscountBody) {
    return api.post<{ discountId: string }>('/api/discounts', body);
  },
  update(discountId: string, body: SaveDiscountBody) {
    return api.put<{ discountId: string }>(`/api/discounts/${discountId}`, body);
  },
};

export interface SaveUserBody {
  username: string;
  nameAr: string;
  nameEn: string;
  email?: string | null;
  phone?: string | null;
  roleId: string;
  status?: string;
  isExternal?: boolean;
  accessExpiresOn?: string | null;
  baseSalaryH?: number;
}

export const userWriteApi = {
  /* No password here. It arrives through the sign-in flow, so it never passes
     through an admin form or an audit row. */
  create(body: SaveUserBody) {
    return api.post<{ userId: string }>('/api/users', body);
  },
  update(userId: string, body: SaveUserBody) {
    return api.put<{ userId: string }>(`/api/users/${userId}`, body);
  },
};

export const companyApi = {
  get() {
    return api.get<Record<string, unknown>>('/api/company');
  },
  save(body: Record<string, unknown>) {
    return api.put<{ saved: boolean }>('/api/company', body);
  },
};
