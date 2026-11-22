import { USE_MOCKS } from '@/config/env';
import { invalidate } from './dataVersion';
import { delay, nextId, notFound, timestamp, validationFailed } from './mock/store';
import { registerSlice, schedulePersist } from './mock/db';
import { seedFor } from './mock/seed';
import { ingredientUsage } from '@/lib/recipes';
import type { CatalogItem } from '@/types/catalog';
import type { Ingredient, IngredientInput, IngredientMovement, MovementReason } from '@/types/ingredients';
import type { SaleLine } from '@/types/sales';

let ingredients: Ingredient[] = [];
let movements: IngredientMovement[] = [];

registerSlice('ingredients', {
  capture: () => ({ ingredients, movements }),
  restore: (s: { ingredients: Ingredient[]; movements: IngredientMovement[] }) => {
    if (!Array.isArray(s.ingredients)) throw new Error('ingredients snapshot is malformed');
    ingredients = s.ingredients;
    movements = s.movements ?? [];
  },
  seed: (tenantId) => {
    ingredients = seedFor(tenantId).ingredients ?? [];
    movements = [];
  },
});

function validate(input: IngredientInput, currentId?: string) {
  const errors: Record<string, string[]> = {};
  if (!input.nameEn.trim() && !input.nameAr.trim()) errors.nameEn = ['Give the ingredient a name.'];
  const name = input.nameEn.trim().toLowerCase();
  if (name && ingredients.some((i) => i.nameEn.toLowerCase() === name && i.id !== currentId)) {
    errors.nameEn = ['There is already an ingredient with this name.'];
  }
  if (input.costPerUnitH < 0) errors.costPerUnitH = ['Cost cannot be negative.'];
  if (input.minStock < 0) errors.minStock = ['Cannot be negative.'];
  if (Object.keys(errors).length) throw validationFailed(errors);
}

function record(ingredientId: string, branchId: string, change: number, reason: MovementReason, reference: string, by: string) {
  if (!change) return;
  ingredients = ingredients.map((i) =>
    i.id === ingredientId
      ? { ...i, stock: { ...i.stock, [branchId]: Math.round(((i.stock[branchId] ?? 0) + change) * 1000) / 1000 }, updatedAt: timestamp() }
      : i,
  );
  movements = [
    { id: nextId('igm'), ingredientId, branchId, change: Math.round(change * 1000) / 1000, reason, reference, at: timestamp(), by },
    ...movements,
  ].slice(0, 2000);
}

export const ingredientService = {
  async list(): Promise<Ingredient[]> {
    if (!USE_MOCKS) return [];
    await delay(150);
    return [...ingredients].sort((a, b) => a.nameEn.localeCompare(b.nameEn));
  },

  async get(id: string): Promise<Ingredient> {
    await delay(80);
    const found = ingredients.find((i) => i.id === id);
    if (!found) throw notFound('Ingredient', id);
    return found;
  },

  async create(input: IngredientInput, branchId: string | null, actor: string): Promise<Ingredient> {
    await delay(250);
    validate(input);
    const now = timestamp();
    const { openingStock, ...rest } = input;
    const created: Ingredient = {
      ...rest,
      nameAr: rest.nameAr.trim() || rest.nameEn.trim(),
      nameEn: rest.nameEn.trim() || rest.nameAr.trim(),
      id: nextId('ing'),
      stock: {},
      createdAt: now,
      updatedAt: now,
    };
    ingredients = [created, ...ingredients];
    if (branchId && openingStock) record(created.id, branchId, openingStock, 'opening', 'Opening stock', actor);
    invalidate('inventory');
    return ingredients.find((i) => i.id === created.id)!;
  },

  async update(id: string, input: IngredientInput): Promise<Ingredient> {
    await delay(250);
    const existing = ingredients.find((i) => i.id === id);
    if (!existing) throw notFound('Ingredient', id);
    validate(input, id);
    const { openingStock: _ignored, ...rest } = input;
    void _ignored;
    const updated: Ingredient = { ...existing, ...rest, updatedAt: timestamp() };
    ingredients = ingredients.map((i) => (i.id === id ? updated : i));
    invalidate('inventory');
    return updated;
  },

  /** Receive, waste or a stock count. A count sets the quantity; the others add or remove. */
  async adjust(id: string, branchId: string, reason: 'receive' | 'waste' | 'count', quantity: number, note: string, actor: string): Promise<Ingredient> {
    await delay(200);
    const existing = ingredients.find((i) => i.id === id);
    if (!existing) throw notFound('Ingredient', id);
    if (!(quantity >= 0)) throw validationFailed({ quantity: ['Enter a quantity of zero or more.'] });
    const current = existing.stock[branchId] ?? 0;
    const change = reason === 'count' ? quantity - current : reason === 'waste' ? -quantity : quantity;
    record(id, branchId, change, reason, note.trim() || reason, actor);
    invalidate('inventory');
    return ingredients.find((i) => i.id === id)!;
  },

  async movements(id: string): Promise<IngredientMovement[]> {
    await delay(80);
    return movements.filter((m) => m.ingredientId === id).slice(0, 50);
  },

  /** Called when a sale commits (sign -1) or is cancelled (sign +1). */
  consume(lines: SaleLine[], catalog: CatalogItem[], branchId: string | null, reference: string, actor: string, sign: -1 | 1): void {
    if (!USE_MOCKS || !branchId) return;
    const usage = ingredientUsage(lines, catalog, ingredients);
    for (const [ingredientId, qty] of usage) {
      if (!ingredients.some((i) => i.id === ingredientId)) continue;
      record(ingredientId, branchId, sign * qty, sign < 0 ? 'sale' : 'cancel', reference, actor);
    }
    schedulePersist();
  },
};
