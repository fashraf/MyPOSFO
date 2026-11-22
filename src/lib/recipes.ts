import type { CatalogItem, ModifierGroup, ModifierOption } from '@/types/catalog';
import type { Ingredient, RecipeLine } from '@/types/ingredients';
import type { SaleLine, SaleLineModifier } from '@/types/sales';

/**
 * How much of each ingredient a set of sale lines uses.
 *
 * Starts from the item's recipe, then applies what was chosen at the till:
 * a size scales the whole recipe, "No onion" drops the onion, "Extra cheese"
 * adds a slice, and "Oat milk" swaps the milk. Combos are worked out per part.
 */
export function ingredientUsage(lines: SaleLine[], catalog: CatalogItem[], ingredients: Ingredient[] = []): Map<string, number> {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  /* A Large uses more fries, not more bags: packaging never scales with size. */
  const fixed = new Set(ingredients.filter((i) => i.category === 'packaging').map((i) => i.id));
  const usage = new Map<string, number>();
  const add = (id: string, qty: number) => usage.set(id, (usage.get(id) ?? 0) + qty);

  const apply = (itemId: string, modifiers: SaleLineModifier[] | undefined, count: number) => {
    const item = byId.get(itemId);
    if (!item) return;
    const groups = item.modifierGroups ?? [];
    const chosen: { group: ModifierGroup | undefined; option: ModifierOption | undefined }[] = (modifiers ?? []).map((m) => {
      const group = groups.find((g) => g.id === m.groupId);
      if (group) return { group, option: group.options.find((o) => o.id === m.optionId) };
      /* A meal's own size or extra for this part: the sale line carries what it needs. */
      const kind = m.groupId.startsWith('slotsize:') ? 'size' : m.groupId.startsWith('slotextra:') ? 'extra' : undefined;
      if (!kind) return { group: undefined, option: undefined };
      return {
        group: { id: m.groupId, nameAr: '', nameEn: '', required: false, multiple: kind === 'extra', options: [], kind },
        option: { id: m.optionId, nameAr: m.nameAr, nameEn: m.nameEn, priceDeltaH: m.priceDeltaH, ingredientId: m.ingredientId, quantity: m.quantity, scale: m.scale },
      };
    });
    const scale = chosen.reduce((s, c) => (c.group?.kind === 'size' && c.option?.scale ? s * c.option.scale : s), 1);
    const removed = new Set(chosen.filter((c) => c.group?.kind === 'remove' && c.option?.ingredientId).map((c) => c.option!.ingredientId!));
    const replaced = new Map<string, string>();
    for (const c of chosen) {
      if (c.option?.replacesIngredientId && c.option.ingredientId) replaced.set(c.option.replacesIngredientId, c.option.ingredientId);
    }
    for (const line of item.recipe ?? []) {
      if (removed.has(line.ingredientId)) continue;
      add(replaced.get(line.ingredientId) ?? line.ingredientId, line.quantity * (fixed.has(line.ingredientId) ? 1 : scale) * count);
    }
    for (const c of chosen) {
      const o = c.option;
      if (!o?.ingredientId || o.replacesIngredientId || c.group?.kind === 'remove') continue;
      add(o.ingredientId, (o.quantity ?? 1) * count);
    }
  };

  for (const line of lines) {
    if (line.components?.length) {
      for (const component of line.components) apply(component.itemId, component.modifiers, component.quantity * line.quantity);
    } else {
      apply(line.itemId, line.modifiers, line.quantity);
    }
  }
  return usage;
}

/** Cost of one unit of an item from its recipe, in halalas. */
export function recipeCostH(recipe: RecipeLine[] | undefined, ingredients: Ingredient[]): number {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  return Math.round((recipe ?? []).reduce((sum, line) => sum + (byId.get(line.ingredientId)?.costPerUnitH ?? 0) * line.quantity, 0));
}

/** "150 g", "1 slice", "1.5 kg" — numbers shown the way a kitchen writes them. */
export function formatQty(qty: number, unit: string, language: string): string {
  const n = Math.round(qty * 100) / 100;
  const text = n.toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US', { maximumFractionDigits: 2 });
  return `${text} ${unit}`;
}

/** Unit costs can be fractions of a halala (a gram of onion), so show up to 3 decimals. */
export function formatUnitCost(costH: number, language: string): string {
  const sar = costH / 100;
  const n = sar.toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  return language === 'ar' ? `${n} ر.س` : `SAR ${n}`;
}
