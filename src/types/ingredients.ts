import type { ID, Timestamped } from './common';

/**
 * Ingredients: what dishes are made from.
 *
 * Kept apart from sellable items. A bun is never rung up at the till, but
 * every burger uses one, so its stock has to move when a burger sells.
 */
export type IngredientUnit = 'g' | 'kg' | 'ml' | 'l' | 'piece' | 'slice' | 'pack';

export const INGREDIENT_UNITS: IngredientUnit[] = ['piece', 'slice', 'g', 'kg', 'ml', 'l', 'pack'];

export type IngredientCategory =
  | 'meat' | 'poultry' | 'bakery' | 'dairy' | 'vegetables' | 'sauces' | 'frozen'
  | 'coffee' | 'syrups' | 'dry' | 'packaging' | 'other';

export const INGREDIENT_CATEGORIES: IngredientCategory[] = [
  'meat', 'poultry', 'bakery', 'dairy', 'vegetables', 'sauces', 'frozen', 'coffee', 'syrups', 'dry', 'packaging', 'other',
];

export type Allergen = 'gluten' | 'dairy' | 'egg' | 'nuts' | 'soy' | 'sesame' | 'fish' | 'mustard';
export const ALLERGENS: Allergen[] = ['gluten', 'dairy', 'egg', 'nuts', 'soy', 'sesame', 'fish', 'mustard'];

export interface Ingredient extends Timestamped {
  id: ID;
  nameAr: string;
  nameEn: string;
  category: IngredientCategory;
  unit: IngredientUnit;
  /** Cost of one unit, in halalas. May be fractional (a gram of beef). */
  costPerUnitH: number;
  /** Quantity on hand, per branch. */
  stock: Record<ID, number>;
  /** Warn when a branch falls to or below this. */
  minStock: number;
  vendorId: ID | null;
  allergens: Allergen[];
  status: 'active' | 'inactive';
}

export type IngredientInput = Omit<Ingredient, 'id' | 'createdAt' | 'updatedAt' | 'stock'> & {
  /** Opening stock for the current branch, on create only. */
  openingStock?: number;
};

/** One line of a recipe: how much of an ingredient one unit of the item uses. */
export interface RecipeLine {
  ingredientId: ID;
  quantity: number;
}

export type MovementReason = 'sale' | 'cancel' | 'receive' | 'waste' | 'count' | 'opening';

export interface IngredientMovement {
  id: ID;
  ingredientId: ID;
  branchId: ID;
  /** Positive in, negative out. */
  change: number;
  reason: MovementReason;
  reference: string;
  at: string;
  by: string;
}

export type IngredientStockLevel = 'ok' | 'low' | 'out';

export function levelOf(ingredient: Ingredient, branchId: string | null): IngredientStockLevel {
  const qty = branchId ? ingredient.stock[branchId] ?? 0 : Object.values(ingredient.stock).reduce((a, b) => a + b, 0);
  if (qty <= 0) return 'out';
  const min = branchId ? ingredient.minStock : ingredient.minStock * Math.max(1, Object.keys(ingredient.stock).length);
  return qty <= min ? 'low' : 'ok';
}

export function stockAt(ingredient: Ingredient, branchId: string | null): number {
  return branchId ? ingredient.stock[branchId] ?? 0 : Object.values(ingredient.stock).reduce((a, b) => a + b, 0);
}
