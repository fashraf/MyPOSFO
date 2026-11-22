import type { CatalogItem, ComboSlot, ModifierGroup } from '@/types/catalog';
import { isCombo } from '@/types/catalog';
import type { SaleLineComponent, SaleLineModifier } from '@/types/sales';

/**
 * Combo (meal) arithmetic, shared by the till, the history seed and the wizard.
 *
 * Price of one combo = bundle price
 *                    + each slot's swap charge (zero for the default)
 *                    + modifier charges on the chosen items (Large fries +3)
 *   … all multiplied by the slot quantity where the slot holds several.
 */

export interface SlotChoice {
  itemId: string;
  modifiers: SaleLineModifier[];
}

export type ComboSelection = Record<string, SlotChoice>;

export function swapChargeH(slot: ComboSlot, itemId: string): number {
  if (itemId === slot.defaultItemId) return 0;
  return slot.choices.find((choice) => choice.itemId === itemId)?.priceDeltaH ?? 0;
}

/** Every item a slot may hold, default first. */
export function slotOptions(slot: ComboSlot): { itemId: string; priceDeltaH: number }[] {
  return [{ itemId: slot.defaultItemId, priceDeltaH: 0 }, ...slot.choices.filter((c) => c.itemId !== slot.defaultItemId)];
}

/**
 * The option groups shown for one part of a meal: the meal's own size and
 * extras for that part (when set), plus the chosen item's options. When the
 * meal sets sizes, the item's own size group is hidden so there is one size
 * question, not two.
 */
export function slotGroups(slot: ComboSlot, item: CatalogItem | undefined): ModifierGroup[] {
  const groups: ModifierGroup[] = [];
  if (slot.sizes?.length) {
    groups.push({
      id: `slotsize:${slot.id}`, nameEn: 'Size', nameAr: 'الحجم', required: true, multiple: false, kind: 'size',
      options: slot.sizes.map((s) => ({ id: s.key, nameEn: s.nameEn, nameAr: s.nameAr, priceDeltaH: s.priceDeltaH, scale: s.scale })),
    });
  }
  for (const group of item?.modifierGroups ?? []) {
    if (slot.sizes?.length && group.kind === 'size') continue;
    groups.push(group);
  }
  /* Meal extras, minus any the item already offers, so "Extra cheese" never shows twice. */
  const itemHas = new Set(groups.flatMap((g) => g.options.map((o) => o.ingredientId)).filter(Boolean));
  const extras = (slot.extras ?? []).filter((e) => !itemHas.has(e.ingredientId));
  if (extras.length) {
    groups.push({
      id: `slotextra:${slot.id}`, nameEn: 'Meal extras', nameAr: 'إضافات الوجبة', required: false, multiple: true, kind: 'extra',
      options: extras.map((e) => ({ id: e.id, nameEn: e.nameEn, nameAr: e.nameAr, priceDeltaH: e.priceDeltaH, ingredientId: e.ingredientId, quantity: e.quantity })),
    });
  }
  return groups;
}

export function toModifier(group: ModifierGroup, option: ModifierGroup['options'][number]): SaleLineModifier {
  return {
    groupId: group.id, optionId: option.id, nameAr: option.nameAr, nameEn: option.nameEn, priceDeltaH: option.priceDeltaH,
    ...(option.ingredientId ? { ingredientId: option.ingredientId } : {}),
    ...(option.quantity ? { quantity: option.quantity } : {}),
    ...(option.scale ? { scale: option.scale } : {}),
  };
}

/** First option of every required group for a part: the no-thought default. */
export function slotDefaults(slot: ComboSlot, item: CatalogItem | undefined): SaleLineModifier[] {
  return slotGroups(slot, item).filter((g) => g.required && g.options[0]).map((g) => toModifier(g, g.options[0]));
}

/** The selection a combo starts with: defaults, and first option of any required group. */
export function defaultSelection(combo: CatalogItem, catalog: CatalogItem[]): ComboSelection {
  const selection: ComboSelection = {};
  for (const slot of combo.combo?.slots ?? []) {
    selection[slot.id] = { itemId: slot.defaultItemId, modifiers: slotDefaults(slot, catalog.find((i) => i.id === slot.defaultItemId)) };
  }
  return selection;
}

/** First option of every required modifier group: the no-thought default. */
export function requiredDefaults(item: CatalogItem | undefined): SaleLineModifier[] {
  return (item?.modifierGroups ?? [])
    .filter((group) => group.required && group.options[0])
    .map((group) => ({
      groupId: group.id,
      optionId: group.options[0].id,
      nameAr: group.options[0].nameAr,
      nameEn: group.options[0].nameEn,
      priceDeltaH: group.options[0].priceDeltaH,
    }));
}

export function buildComponents(
  combo: CatalogItem,
  selection: ComboSelection,
  catalog: CatalogItem[],
): SaleLineComponent[] {
  return (combo.combo?.slots ?? []).map((slot) => {
    const choice = selection[slot.id] ?? { itemId: slot.defaultItemId, modifiers: [] };
    const item = catalog.find((candidate) => candidate.id === choice.itemId);
    const modifierCharge = choice.modifiers.reduce((sum, modifier) => sum + modifier.priceDeltaH, 0);
    return {
      slotId: slot.id,
      slotNameAr: slot.nameAr,
      slotNameEn: slot.nameEn,
      itemId: choice.itemId,
      nameAr: item?.nameAr ?? choice.itemId,
      nameEn: item?.nameEn ?? choice.itemId,
      quantity: slot.quantity,
      priceDeltaH: (swapChargeH(slot, choice.itemId) + modifierCharge) * slot.quantity,
      unitCostH: item?.costH ?? 0,
      requiresPreparation: item?.requiresPreparation ?? false,
      ...(choice.modifiers.length > 0 ? { modifiers: choice.modifiers } : {}),
    };
  });
}

export function comboUnitPriceH(combo: CatalogItem, components: SaleLineComponent[]): number {
  return combo.priceH + components.reduce((sum, component) => sum + component.priceDeltaH, 0);
}

/** What the default contents would cost bought one by one. */
export function separatePriceH(combo: CatalogItem, catalog: CatalogItem[]): number {
  return (combo.combo?.slots ?? []).reduce((sum, slot) => {
    const item = catalog.find((candidate) => candidate.id === slot.defaultItemId);
    return sum + (item?.priceH ?? 0) * slot.quantity;
  }, 0);
}

export function comboSavingH(combo: CatalogItem, catalog: CatalogItem[]): number {
  return Math.max(0, separatePriceH(combo, catalog) - combo.priceH);
}

/** Cost of one combo with these contents, for margin reporting. */
export function componentsCostH(components: SaleLineComponent[]): number {
  return components.reduce((sum, component) => sum + component.unitCostH * component.quantity, 0);
}

/** Combos this item is the main of — for the "make it a meal" offer. */
export function mealsFor(item: CatalogItem, catalog: CatalogItem[]): CatalogItem[] {
  return catalog.filter(
    (candidate) =>
      isCombo(candidate) &&
      candidate.status === 'active' &&
      candidate.combo!.slots[0]?.defaultItemId === item.id,
  );
}

/** A stable key for "the same combo, the same way" — so a second tap bumps the quantity. */
export function componentsSignature(components: SaleLineComponent[] | undefined): string {
  return (components ?? [])
    .map((c) => `${c.slotId}:${c.itemId}:${(c.modifiers ?? []).map((m) => m.optionId).sort().join('+')}`)
    .join('|');
}
