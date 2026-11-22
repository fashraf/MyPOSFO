/**
 * Fixed vocabularies for options and combos.
 *
 * Every name a customer sees on a receipt or the kitchen sees on a ticket
 * comes from here, an ingredient, or an item. Nothing is typed by hand, so
 * "Large", "large" and "LARGE " can never become three different things in a
 * report, and every name already has its Arabic.
 */
export interface Preset {
  key: string;
  en: string;
  ar: string;
}

export const SIZE_PRESETS: (Preset & { scale: number })[] = [
  { key: 'small', en: 'Small', ar: 'صغير', scale: 0.75 },
  { key: 'regular', en: 'Regular', ar: 'عادي', scale: 1 },
  { key: 'medium', en: 'Medium', ar: 'وسط', scale: 1.25 },
  { key: 'large', en: 'Large', ar: 'كبير', scale: 1.5 },
  { key: 'xl', en: 'Extra large', ar: 'كبير جدًا', scale: 2 },
  { key: 'kids', en: 'Kids', ar: 'أطفال', scale: 0.6 },
  { key: 'family', en: 'Family', ar: 'عائلي', scale: 3 },
];

export const SCALES = [0.5, 0.6, 0.75, 1, 1.25, 1.5, 2, 3];

/** Names for an option group. */
export const GROUP_PRESETS: Preset[] = [
  { key: 'size', en: 'Size', ar: 'الحجم' },
  { key: 'remove', en: 'Remove', ar: 'بدون' },
  { key: 'extras', en: 'Add extra', ar: 'إضافات' },
  { key: 'milk', en: 'Milk', ar: 'نوع الحليب' },
  { key: 'sugar', en: 'Sugar', ar: 'السكر' },
  { key: 'spice', en: 'Spice level', ar: 'درجة الحرارة' },
  { key: 'sauce', en: 'Sauce', ar: 'الصوص' },
  { key: 'bread', en: 'Bread', ar: 'الخبز' },
  { key: 'cheese', en: 'Cheese', ar: 'الجبن' },
  { key: 'cooking', en: 'Cooking', ar: 'درجة الطهي' },
  { key: 'serve', en: 'Serve', ar: 'التقديم' },
  { key: 'coffee', en: 'Coffee beans', ar: 'نوع البن' },
  { key: 'syrup', en: 'Syrup', ar: 'السيروب' },
  { key: 'choose', en: 'Choose', ar: 'اختر' },
];

/** Choices that are a preference, not an ingredient. */
export const PREFERENCE_PRESETS: Preset[] = [
  { key: 'mild', en: 'Mild', ar: 'خفيف' },
  { key: 'regular_spice', en: 'Regular', ar: 'عادي' },
  { key: 'spicy', en: 'Spicy', ar: 'حار' },
  { key: 'extra_spicy', en: 'Extra spicy', ar: 'حار جدًا' },
  { key: 'no_sugar', en: 'No sugar', ar: 'بدون سكر' },
  { key: 'less_sugar', en: 'Less sugar', ar: 'سكر خفيف' },
  { key: 'medium_sugar', en: 'Medium sugar', ar: 'سكر وسط' },
  { key: 'extra_sweet', en: 'Extra sweet', ar: 'سكر زيادة' },
  { key: 'warmed', en: 'Warmed', ar: 'دافئ' },
  { key: 'as_is', en: 'As is', ar: 'كما هو' },
  { key: 'iced', en: 'Iced', ar: 'مثلج' },
  { key: 'hot', en: 'Hot', ar: 'ساخن' },
  { key: 'less_ice', en: 'Less ice', ar: 'ثلج أقل' },
  { key: 'no_ice', en: 'No ice', ar: 'بدون ثلج' },
  { key: 'well_done', en: 'Well done', ar: 'مستوي جيدًا' },
  { key: 'medium_cook', en: 'Medium', ar: 'متوسط' },
  { key: 'toasted', en: 'Toasted', ar: 'محمص' },
  { key: 'cut_half', en: 'Cut in half', ar: 'مقطوع نصفين' },
  { key: 'on_side', en: 'Sauce on the side', ar: 'الصوص جانبًا' },
];

/** Names for the parts of a combo. */
export const SLOT_PRESETS: Preset[] = [
  { key: 'main', en: 'Main', ar: 'الوجبة الرئيسية' },
  { key: 'burger', en: 'Burger', ar: 'البرجر' },
  { key: 'side', en: 'Side', ar: 'الطبق الجانبي' },
  { key: 'fries', en: 'Fries', ar: 'البطاطس' },
  { key: 'drink', en: 'Drink', ar: 'المشروب' },
  { key: 'dessert', en: 'Dessert', ar: 'الحلى' },
  { key: 'sauce', en: 'Sauce', ar: 'الصوص' },
  { key: 'coffee', en: 'Coffee', ar: 'القهوة' },
  { key: 'pastry', en: 'Pastry', ar: 'المعجنات' },
  { key: 'water', en: 'Water', ar: 'المياه' },
  { key: 'extra', en: 'Extra', ar: 'إضافة' },
];

export const findPreset = (list: Preset[], en: string) =>
  list.find((p) => p.en.toLowerCase() === en.trim().toLowerCase() || p.key === en);

/** "No onion" / "بدون بصل". */
export const removeName = (ing: { nameEn: string; nameAr: string }) => ({
  en: `No ${ing.nameEn.charAt(0).toLowerCase()}${ing.nameEn.slice(1)}`,
  ar: `بدون ${ing.nameAr}`,
});

/** "Extra cheddar slice" / "إضافة شريحة شيدر". */
export const extraName = (ing: { nameEn: string; nameAr: string }) => ({
  en: `Extra ${ing.nameEn.charAt(0).toLowerCase()}${ing.nameEn.slice(1)}`,
  ar: `إضافة ${ing.nameAr}`,
});
