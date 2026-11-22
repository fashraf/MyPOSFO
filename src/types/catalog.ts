import type { RecipeLine } from './ingredients';
import type { ID, RecordStatus, Timestamped } from './common';

/**
 * The central modelling decision of the whole platform.
 *
 * A product and a service share one catalog so the POS, sales, and reporting
 * code never branches on business type. They differ only in the fields each one
 * carries, which is what `kind` discriminates.
 */
export type CatalogItemKind = 'product' | 'service';

export type UnitOfMeasure = 'piece' | 'kg' | 'gram' | 'litre' | 'ml' | 'metre' | 'box' | 'pack';

/** One choice inside a modifier group: "Oat milk", "Large", "Extra shot". */
export interface ModifierOption {
  id: ID;
  nameAr: string;
  nameEn: string;
  /** Added to the VAT-inclusive unit price, in halalas. May be zero. */
  priceDeltaH: number;
  /* What the option is made of, so names are never typed by hand and stock
     moves correctly. All optional: older options are plain labels. */
  /** remove: the recipe ingredient left out. extra/choice: the ingredient added. */
  ingredientId?: ID;
  /** choice: an item served instead (e.g. a drink). */
  itemId?: ID;
  /** extra/choice: how much of the ingredient is added. */
  quantity?: number;
  /** size: recipe multiplier, e.g. 1.5 for Large. */
  scale?: number;
  /** choice/extra: swaps this recipe ingredient out (oat milk replaces full-cream milk). */
  replacesIngredientId?: ID;
}

/** How a group behaves; decides which picker the editor shows. */
export type ModifierKind = 'size' | 'remove' | 'extra' | 'choice';

/**
 * A set of choices offered when the item is added to a cart.
 *
 * `required` groups must have a selection before the line is added (size);
 * `multiple` groups allow several (extras). The chosen options are copied onto
 * the sale line, so a later menu change never rewrites an old receipt.
 */
export interface ModifierGroup {
  id: ID;
  nameAr: string;
  nameEn: string;
  required: boolean;
  multiple: boolean;
  options: ModifierOption[];
  kind?: ModifierKind;
}

/**
 * One place in a combo: "Main", "Side", "Drink".
 *
 * The slot comes with a default item and the items the customer may swap in,
 * each with its own extra charge (zero for a like-for-like swap). Upsizing is
 * not modelled here: it comes from the chosen item's own modifier groups, so
 * "Large fries +3" is defined once on Fries and works in and out of a combo.
 */
export interface ComboSlot {
  id: ID;
  nameAr: string;
  nameEn: string;
  quantity: number;
  defaultItemId: ID;
  /** Alternatives, excluding the default. */
  choices: { itemId: ID; priceDeltaH: number }[];
  /** Sizes offered for this part of the meal (S/M/L/XL), each with its extra charge. */
  sizes?: ComboSlotSize[];
  /** Extras the customer may add to this part, e.g. extra cheese +2. */
  extras?: ComboSlotExtra[];
}

export interface ComboSlotSize {
  key: string;
  nameAr: string;
  nameEn: string;
  priceDeltaH: number;
  /** Recipe multiplier: 1.5 means half as much again. */
  scale: number;
}

export interface ComboSlotExtra {
  id: ID;
  ingredientId: ID;
  nameAr: string;
  nameEn: string;
  /** How much of the ingredient one extra adds, in its unit. */
  quantity: number;
  priceDeltaH: number;
}

export interface ComboDefinition {
  slots: ComboSlot[];
}

/** Fields every catalog entry has, regardless of kind. */
export interface CatalogItemBase extends Timestamped {
  id: ID;
  kind: CatalogItemKind;
  nameAr: string;
  nameEn: string;
  categoryId: ID | null;
  description: string;
  imageUrl: string | null;
  /** Selling price in minor units (halalas). */
  priceH: number;
  /** Cost in minor units. Zero is legitimate for a service. */
  costH: number;
  /** Whether the item appears in the POS sell grid. */
  showOnPos: boolean;
  /**
   * Whether this item has to be made before it can be handed over.
   *
   * Drives the kitchen screen. A burger is true; a bottle of cola and a haircut
   * are both false. Keeping it a per-item flag rather than a business-type
   * switch is what lets one POS serve a café and a barber without either
   * inheriting the other's workflow.
   */
  requiresPreparation: boolean;
  /**
   * Which print group this item's ticket goes to, if any. Null means the item
   * appears on the customer bill only.
   */
  printGroupId: ID | null;
  status: RecordStatus;
  /** Tax rate id from Settings & Tax. Absent means the default rate. */
  taxRateId?: string | null;
  /** Size, milk, extras… Absent or empty means the item is added in one tap. */
  modifierGroups?: ModifierGroup[];
  /** What one unit is made of. Drives ingredient stock and food cost. */
  recipe?: RecipeLine[];
  /**
   * Present when this item is a combo (meal). Its price is the bundle price;
   * stock is taken from the components, never from the combo itself.
   */
  combo?: ComboDefinition;
}

export const isCombo = (item: Pick<CatalogItemBase, 'combo'>): boolean =>
  Boolean(item.combo && item.combo.slots.length > 0);

export const isCustomisable = (item: Pick<CatalogItemBase, 'combo' | 'modifierGroups'>): boolean =>
  isCombo(item) || (item.modifierGroups?.length ?? 0) > 0;

/** A physical good. Carries identifiers, a supplier, and stock. */
export interface Product extends CatalogItemBase {
  kind: 'product';
  sku: string;
  barcode: string;
  vendorId: ID | null;
  unit: UnitOfMeasure;
  /** When false the item sells without touching stock (e.g. a made-to-order good). */
  trackInventory: boolean;
  /** Quantity on hand. Meaningless when `trackInventory` is false. */
  stockQuantity: number;
  /** Reorder threshold that drives the low-stock alert. */
  minStockLevel: number;
}

/** A non-inventory offering. Never depletes stock. */
export interface Service extends CatalogItemBase {
  kind: 'service';
  /** Minutes. Null when duration is not meaningful for this service. */
  durationMinutes: number | null;
  /** Staff member who normally performs it. */
  providerId: ID | null;
}

export type CatalogItem = Product | Service;

/** Narrowing helpers — use these instead of comparing `kind` inline. */
export const isProduct = (item: CatalogItem): item is Product => item.kind === 'product';
export const isService = (item: CatalogItem): item is Service => item.kind === 'service';

/** Stock position derived from quantity and threshold, never stored. */
export type StockLevel = 'in_stock' | 'low_stock' | 'out_of_stock' | 'not_tracked';

export function stockLevelOf(item: CatalogItem): StockLevel {
  if (!isProduct(item) || !item.trackInventory) return 'not_tracked';
  if (item.stockQuantity <= 0) return 'out_of_stock';
  if (item.stockQuantity <= item.minStockLevel) return 'low_stock';
  return 'in_stock';
}

/** Gross margin as a ratio, or null when there is no cost to compare against. */
export function marginOf(item: CatalogItem): number | null {
  if (item.priceH <= 0) return null;
  if (item.costH <= 0) return null;
  return (item.priceH - item.costH) / item.priceH;
}

export interface Category extends Timestamped {
  id: ID;
  nameAr: string;
  nameEn: string;
  /** Which kinds of item may belong to this category. */
  appliesTo: CatalogItemKind | 'both';
  /** Display order in the POS category rail. */
  sortOrder: number;
  status: RecordStatus;
}

export interface Vendor extends Timestamped {
  id: ID;
  nameAr: string;
  nameEn: string;
  contactPerson: string;
  phone: string;
  email: string;
  vatNumber: string;
  city: string;
  status: RecordStatus;
}

/** Staff member who can be assigned as a service provider. */
export interface StaffMember extends Timestamped {
  id: ID;
  nameAr: string;
  nameEn: string;
  role: string;
  status: RecordStatus;
}

/**
 * Write model. Kind-specific fields are optional here because the form only
 * sends the ones relevant to the selected kind; the service validates them.
 */
export interface CatalogItemInput {
  kind: CatalogItemKind;
  nameAr: string;
  nameEn: string;
  categoryId: ID | null;
  description: string;
  priceH: number;
  costH: number;
  showOnPos: boolean;
  requiresPreparation?: boolean;
  printGroupId?: ID | null;
  status: RecordStatus;
  taxRateId?: string | null;

  /* Product only */
  sku?: string;
  barcode?: string;
  vendorId?: ID | null;
  unit?: UnitOfMeasure;
  trackInventory?: boolean;
  stockQuantity?: number;
  minStockLevel?: number;

  /* Service only */
  durationMinutes?: number | null;
  providerId?: ID | null;

  /* Options and combos (both kinds) */
  modifierGroups?: ModifierGroup[];
  /** What one unit is made of. Drives ingredient stock and food cost. */
  recipe?: RecipeLine[];
  combo?: ComboDefinition;
}

/** Filters accepted by the catalog list endpoint. */
export interface CatalogFilters {
  kind?: CatalogItemKind | 'all';
  categoryId?: ID | 'all';
  status?: RecordStatus | 'all';
  stockLevel?: StockLevel | 'all';
  /** combo, has options, has a recipe, or no recipe yet. */
  feature?: 'all' | 'combo' | 'options' | 'recipe' | 'norecipe';
}
