import { useEffect, useState } from 'react';
import { Button, Drawer, FormField, Input, Select } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useI18n, useTranslation } from '@/i18n';
import { ALLERGENS, INGREDIENT_CATEGORIES, INGREDIENT_UNITS } from '@/types/ingredients';
import type { Allergen, Ingredient, IngredientCategory, IngredientInput, IngredientUnit } from '@/types/ingredients';
import type { Vendor } from '@/types/catalog';

/**
 * Add or edit an ingredient. Everything with a fixed set of answers (category,
 * unit, supplier, allergens) is picked, never typed, so reports group cleanly.
 */
export function IngredientForm({
  open, onClose, ingredient, vendors, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  ingredient: Ingredient | null;
  vendors: Vendor[];
  onSubmit: (input: IngredientInput) => Promise<Record<string, string> | null>;
}) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [category, setCategory] = useState<IngredientCategory>('other');
  const [unit, setUnit] = useState<IngredientUnit>('piece');
  const [cost, setCost] = useState('');
  const [minStock, setMinStock] = useState('');
  const [opening, setOpening] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNameEn(ingredient?.nameEn ?? '');
    setNameAr(ingredient?.nameAr ?? '');
    setCategory(ingredient?.category ?? 'other');
    setUnit(ingredient?.unit ?? 'piece');
    setCost(ingredient ? String(Math.round(ingredient.costPerUnitH * 10) / 1000) : '');
    setMinStock(ingredient ? String(ingredient.minStock) : '');
    setOpening('');
    setVendorId(ingredient?.vendorId ?? '');
    setAllergens(ingredient?.allergens ?? []);
    setErrors({});
  }, [open, ingredient]);

  async function save() {
    setSaving(true);
    const result = await onSubmit({
      nameEn, nameAr, category, unit,
      costPerUnitH: Math.round(Number(cost || 0) * 100 * 1000) / 1000,
      minStock: Number(minStock || 0),
      vendorId: vendorId || null,
      allergens,
      status: ingredient?.status ?? 'active',
      openingStock: ingredient ? undefined : Number(opening || 0),
    });
    setSaving(false);
    if (result) setErrors(result);
    else onClose();
  }

  const unitLabel = t(`ingredients.units.${unit}`);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="md"
      title={ingredient ? t('ingredients.edit') : t('ingredients.add')}
      description={t('ingredients.formHint')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button onClick={() => void save()} loading={saving}>{ingredient ? t('common.saveChanges') : t('ingredients.add')}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('catalog.form.nameEn')} required error={errors.nameEn}>
            <Input value={nameEn} dir="ltr" autoFocus placeholder="Burger bun" onChange={(e) => setNameEn(e.target.value)} />
          </FormField>
          <FormField label={t('catalog.form.nameAr')} hint={t('itemWizard.details.arHint')}>
            <Input value={nameAr} dir="rtl" placeholder="خبز برجر" onChange={(e) => setNameAr(e.target.value)} />
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('ingredients.category')}>
            <Select value={category} onChange={(v) => setCategory(v as IngredientCategory)}
              options={INGREDIENT_CATEGORIES.map((c) => ({ value: c, label: t(`ingredients.categories.${c}`) }))} />
          </FormField>
          <FormField label={t('ingredients.unit')} hint={t('ingredients.unitHint')}>
            <Select value={unit} onChange={(v) => setUnit(v as IngredientUnit)}
              options={INGREDIENT_UNITS.map((u) => ({ value: u, label: t(`ingredients.units.${u}`) }))} />
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('ingredients.costPer', { unit: unitLabel })} error={errors.costPerUnitH} hint={t('ingredients.costHint')}>
            <Input type="number" min="0" step="0.001" dir="ltr" value={cost} placeholder="0.000" onChange={(e) => setCost(e.target.value)} />
          </FormField>
          <FormField label={t('ingredients.minStock')} hint={t('ingredients.minStockHint')}>
            <Input type="number" min="0" dir="ltr" value={minStock} placeholder="0" onChange={(e) => setMinStock(e.target.value)} />
          </FormField>
        </div>
        {!ingredient && (
          <FormField label={t('ingredients.openingStock', { unit: unitLabel })} hint={t('ingredients.openingHint')}>
            <Input type="number" min="0" dir="ltr" value={opening} placeholder="0" onChange={(e) => setOpening(e.target.value)} />
          </FormField>
        )}
        <FormField label={t('ingredients.supplier')} showOptional>
          <Select value={vendorId} onChange={setVendorId}
            options={[{ value: '', label: t('catalog.form.noVendor') }, ...vendors.map((v) => ({ value: v.id, label: language === 'ar' ? v.nameAr : v.nameEn }))]} />
        </FormField>
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-700">{t('ingredients.allergens')}</p>
          <div className="flex flex-wrap gap-2">
            {ALLERGENS.map((a) => {
              const on = allergens.includes(a);
              return (
                <button key={a} type="button" aria-pressed={on}
                  onClick={() => setAllergens(on ? allergens.filter((x) => x !== a) : [...allergens, a])}
                  className={cn('min-h-[2.25rem] rounded-full border px-3 text-sm font-medium transition',
                    on ? 'border-warning-300 bg-warning-50 text-warning-800' : 'border-ink-200 text-ink-600 hover:border-ink-400')}>
                  {t(`ingredients.allergenNames.${a}`)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
