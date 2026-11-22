import type { Allergen, Ingredient, IngredientCategory, IngredientUnit, RecipeLine } from '@/types/ingredients';

/*
 * Demo ingredients and recipes per tenant. Stock is per branch, with a few
 * deliberately low or out so the alerts have something to show.
 */

const T = '2026-09-01T08:00:00.000Z';

type Spec = [id: string, ar: string, en: string, cat: IngredientCategory, unit: IngredientUnit, costSar: number, min: number, stock: number[], allergens?: Allergen[], vendor?: string];

function build(specs: Spec[], branches: string[]): Ingredient[] {
  return specs.map(([id, ar, en, category, unit, cost, min, stock, allergens = [], vendor]) => ({
    id, nameAr: ar, nameEn: en, category, unit,
    costPerUnitH: Math.round(cost * 100 * 1000) / 1000,
    minStock: min,
    stock: Object.fromEntries(branches.map((b, i) => [b, stock[i] ?? stock[0]])),
    vendorId: vendor ?? null,
    allergens,
    status: 'active',
    createdAt: T,
    updatedAt: T,
  }));
}

const LAZEEZ: Spec[] = [
  ['ing_bun', 'خبز برجر', 'Burger bun', 'bakery', 'piece', 0.6, 60, [240, 180, 90], ['gluten', 'sesame']],
  ['ing_patty', 'قطعة لحم ١٢٠ج', 'Beef patty 120g', 'meat', 'piece', 3.5, 50, [180, 120, 40], [], 'ven_001'],
  ['ing_smash', 'قطعة سماش ٨٠ج', 'Smash patty 80g', 'meat', 'piece', 2.5, 60, [160, 90, 70], [], 'ven_001'],
  ['ing_chicken', 'فيليه دجاج مقرمش', 'Crispy chicken fillet', 'poultry', 'piece', 4, 40, [110, 70, 35], ['gluten', 'egg'], 'ven_001'],
  ['ing_cheese', 'شريحة شيدر', 'Cheddar slice', 'dairy', 'slice', 0.5, 80, [400, 260, 150], ['dairy']],
  ['ing_swiss', 'شريحة جبنة سويسرية', 'Swiss cheese slice', 'dairy', 'slice', 0.7, 30, [60, 0, 25], ['dairy']],
  ['ing_mushroom', 'مشروم سوتيه', 'Sautéed mushrooms', 'vegetables', 'g', 0.04, 800, [3000, 1500, 900]],
  ['ing_lettuce', 'خس', 'Lettuce', 'vegetables', 'g', 0.015, 1500, [5000, 3500, 2000]],
  ['ing_tomato', 'طماطم', 'Tomato', 'vegetables', 'g', 0.01, 2000, [6000, 4000, 2500]],
  ['ing_onion', 'بصل', 'Onion', 'vegetables', 'g', 0.006, 1500, [4000, 3000, 1800]],
  ['ing_pickle', 'مخلل', 'Pickles', 'vegetables', 'g', 0.02, 1000, [3000, 2200, 1200]],
  ['ing_sauce', 'صوص لذيذ', 'Lazeez sauce', 'sauces', 'ml', 0.02, 2000, [8000, 5000, 3000], ['egg', 'mustard']],
  ['ing_jalap', 'هالبينو', 'Jalapeños', 'vegetables', 'g', 0.03, 500, [420, 900, 300]],
  ['ing_fries', 'بطاطس مجمدة', 'Frozen fries', 'frozen', 'g', 0.012, 10000, [40000, 25000, 15000], [], 'ven_003'],
  ['ing_curly', 'بطاطس حلزونية مجمدة', 'Frozen curly fries', 'frozen', 'g', 0.016, 5000, [12000, 8000, 6000], [], 'ven_003'],
  ['ing_rings', 'حلقات بصل مجمدة', 'Frozen onion rings', 'frozen', 'piece', 0.35, 100, [400, 260, 140], ['gluten'], 'ven_003'],
  ['ing_nuggets', 'ناجتس مجمد', 'Frozen nuggets', 'poultry', 'piece', 0.45, 150, [600, 400, 260], ['gluten'], 'ven_001'],
  ['ing_wings', 'أجنحة دجاج', 'Chicken wings', 'poultry', 'piece', 0.9, 120, [480, 300, 200], [], 'ven_001'],
  ['ing_slaw', 'خلطة كول سلو', 'Coleslaw mix', 'vegetables', 'g', 0.012, 1500, [4000, 2500, 1500], ['egg']],
  ['ing_icecream', 'آيس كريم فانيلا', 'Vanilla soft serve', 'dairy', 'ml', 0.01, 3000, [12000, 8000, 5000], ['dairy']],
  ['ing_choc', 'صوص شوكولاتة', 'Chocolate sauce', 'sauces', 'ml', 0.02, 800, [2500, 1500, 1000], ['dairy', 'soy']],
  ['ing_milk', 'حليب كامل الدسم', 'Full cream milk', 'dairy', 'ml', 0.006, 4000, [15000, 9000, 6000], ['dairy']],
  ['ing_orange', 'برتقال طازج', 'Fresh oranges', 'vegetables', 'piece', 0.8, 60, [200, 120, 50]],
  ['ing_box', 'علبة برجر', 'Burger box', 'packaging', 'piece', 0.3, 200, [900, 600, 300]],
  ['ing_bag', 'كيس بطاطس', 'Fries bag', 'packaging', 'piece', 0.1, 200, [1000, 700, 400]],
  ['ing_cup', 'كوب بارد ١٦ أونصة', 'Cold cup 16oz', 'packaging', 'piece', 0.25, 150, [140, 400, 220]],
];

const LAZEEZ_RECIPES: Record<string, RecipeLine[]> = {
  itm_001: [['ing_bun', 1], ['ing_patty', 1], ['ing_cheese', 1], ['ing_lettuce', 15], ['ing_tomato', 20], ['ing_onion', 10], ['ing_pickle', 10], ['ing_sauce', 20], ['ing_box', 1]].map(line),
  itm_002: [['ing_bun', 1], ['ing_smash', 2], ['ing_cheese', 2], ['ing_onion', 10], ['ing_pickle', 10], ['ing_sauce', 20], ['ing_box', 1]].map(line),
  itm_003: [['ing_bun', 1], ['ing_chicken', 1], ['ing_lettuce', 15], ['ing_sauce', 20], ['ing_box', 1]].map(line),
  itm_004: [['ing_bun', 1], ['ing_patty', 1], ['ing_swiss', 1], ['ing_mushroom', 40], ['ing_sauce', 15], ['ing_box', 1]].map(line),
  itm_005: [['ing_nuggets', 6]].map(line),
  itm_006: [['ing_wings', 6]].map(line),
  itm_007: [['ing_fries', 150], ['ing_bag', 1]].map(line),
  itm_008: [['ing_curly', 150], ['ing_bag', 1]].map(line),
  itm_009: [['ing_rings', 8]].map(line),
  itm_010: [['ing_slaw', 120]].map(line),
  itm_016: [['ing_orange', 3], ['ing_cup', 1]].map(line),
  itm_017: [['ing_icecream', 200], ['ing_milk', 150], ['ing_cup', 1]].map(line),
  itm_018: [['ing_icecream', 180], ['ing_choc', 30]].map(line),
};

const ALNOOR: Spec[] = [
  ['ing_beans', 'بن إسبريسو', 'Espresso beans', 'coffee', 'g', 0.18, 2000, [8000, 5000, 1500], [], 'ven_001'],
  ['ing_decaf', 'بن منزوع الكافيين', 'Decaf beans', 'coffee', 'g', 0.2, 500, [1500, 800, 400], [], 'ven_001'],
  ['ing_saudi', 'قهوة سعودية مطحونة', 'Saudi coffee (ground)', 'coffee', 'g', 0.15, 1000, [3000, 2000, 1200]],
  ['ing_cardamom', 'هيل', 'Cardamom', 'dry', 'g', 0.08, 200, [800, 500, 150]],
  ['ing_milk', 'حليب كامل الدسم', 'Full cream milk', 'dairy', 'ml', 0.006, 8000, [30000, 18000, 9000], ['dairy']],
  ['ing_oat', 'حليب الشوفان', 'Oat milk', 'dairy', 'ml', 0.015, 2000, [6000, 1500, 2500], ['gluten']],
  ['ing_almond', 'حليب اللوز', 'Almond milk', 'dairy', 'ml', 0.018, 2000, [4000, 3000, 0], ['nuts']],
  ['ing_lactose', 'حليب خالي من اللاكتوز', 'Lactose-free milk', 'dairy', 'ml', 0.01, 1500, [3000, 2000, 1500], ['dairy']],
  ['ing_condensed', 'حليب مكثف', 'Condensed milk', 'dairy', 'ml', 0.012, 1000, [4000, 2500, 1500], ['dairy']],
  ['ing_vanilla', 'سيروب فانيلا', 'Vanilla syrup', 'syrups', 'ml', 0.02, 500, [2000, 1200, 800]],
  ['ing_caramel', 'سيروب كراميل', 'Caramel syrup', 'syrups', 'ml', 0.02, 500, [1800, 400, 900], ['dairy']],
  ['ing_matcha', 'مسحوق ماتشا', 'Matcha powder', 'dry', 'g', 0.25, 200, [600, 300, 150]],
  ['ing_tea', 'شاي كرك', 'Karak tea leaves', 'dry', 'g', 0.03, 500, [2000, 1500, 900]],
  ['ing_sugar', 'سكر', 'Sugar', 'dry', 'g', 0.005, 2000, [10000, 6000, 4000]],
  ['ing_ice', 'ثلج', 'Ice', 'other', 'g', 0.001, 5000, [20000, 15000, 10000]],
  ['ing_croissant', 'عجينة كرواسون', 'Croissant dough', 'bakery', 'piece', 1.5, 30, [90, 60, 20], ['gluten', 'dairy', 'egg']],
  ['ing_zaatar', 'زعتر', 'Zaatar mix', 'dry', 'g', 0.05, 300, [1200, 800, 500], ['sesame']],
  ['ing_cookie', 'عجينة كوكيز', 'Cookie dough', 'bakery', 'piece', 1.2, 30, [80, 50, 30], ['gluten', 'dairy', 'egg']],
  ['ing_datecake', 'كيكة التمر (شريحة)', 'Date cake slice', 'bakery', 'slice', 3, 12, [40, 24, 10], ['gluten', 'egg']],
  ['ing_cheesecake', 'تشيزكيك (شريحة)', 'Cheesecake slice', 'bakery', 'slice', 4.5, 10, [30, 16, 8], ['dairy', 'egg']],
  ['ing_cup8', 'كوب ٨ أونصة', 'Hot cup 8oz', 'packaging', 'piece', 0.3, 200, [800, 500, 180]],
  ['ing_cup12', 'كوب ١٢ أونصة', 'Cup 12oz', 'packaging', 'piece', 0.35, 200, [700, 450, 300]],
];

const ALNOOR_RECIPES: Record<string, RecipeLine[]> = {
  itm_001: [['ing_beans', 18], ['ing_cup8', 1]].map(line),
  itm_002: [['ing_beans', 18], ['ing_cup12', 1]].map(line),
  itm_003: [['ing_beans', 18], ['ing_milk', 150], ['ing_cup8', 1]].map(line),
  itm_004: [['ing_beans', 18], ['ing_milk', 120], ['ing_cup8', 1]].map(line),
  itm_005: [['ing_beans', 18], ['ing_milk', 180], ['ing_condensed', 30], ['ing_cup12', 1]].map(line),
  itm_006: [['ing_saudi', 30], ['ing_cardamom', 3]].map(line),
  itm_007: [['ing_beans', 20]].map(line),
  itm_008: [['ing_beans', 18], ['ing_milk', 200], ['ing_ice', 150], ['ing_cup12', 1]].map(line),
  itm_009: [['ing_beans', 30], ['ing_ice', 150], ['ing_cup12', 1]].map(line),
  itm_010: [['ing_beans', 18], ['ing_milk', 180], ['ing_condensed', 30], ['ing_ice', 150], ['ing_cup12', 1]].map(line),
  itm_011: [['ing_matcha', 5], ['ing_milk', 200], ['ing_cup12', 1]].map(line),
  itm_012: [['ing_tea', 8], ['ing_milk', 150], ['ing_sugar', 15], ['ing_cardamom', 1], ['ing_cup8', 1]].map(line),
  itm_013: [['ing_croissant', 1]].map(line),
  itm_014: [['ing_croissant', 1], ['ing_zaatar', 10]].map(line),
  itm_015: [['ing_cookie', 1]].map(line),
  itm_016: [['ing_datecake', 1]].map(line),
  itm_017: [['ing_cheesecake', 1]].map(line),
};

function line([ingredientId, quantity]: (string | number)[]): RecipeLine {
  return { ingredientId: String(ingredientId), quantity: Number(quantity) };
}

export function ingredientsFor(tenantId: string, branches: string[]): Ingredient[] {
  if (tenantId === 'ten_lazeez') return build(LAZEEZ, branches);
  if (tenantId === 'ten_alnoor') return build(ALNOOR, branches);
  return [];
}

export function recipesFor(tenantId: string): Record<string, RecipeLine[]> {
  if (tenantId === 'ten_lazeez') return LAZEEZ_RECIPES;
  if (tenantId === 'ten_alnoor') return ALNOOR_RECIPES;
  return {};
}
