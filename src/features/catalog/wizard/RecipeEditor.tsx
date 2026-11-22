import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatCurrency, formatPercent } from '@/lib/format';
import { recipeCostH } from '@/lib/recipes';
import type { Ingredient, RecipeLine } from '@/types/ingredients';

export interface RecipeDraft {
  ingredientId: string;
  quantity: string;
}

export const recipeToDraft = (recipe: RecipeLine[] | undefined): RecipeDraft[] =>
  (recipe ?? []).map((l) => ({ ingredientId: l.ingredientId, quantity: String(l.quantity) }));

export const recipeFromDraft = (rows: RecipeDraft[]): RecipeLine[] =>
  rows.filter((r) => r.ingredientId && Number(r.quantity) > 0).map((r) => ({ ingredientId: r.ingredientId, quantity: Number(r.quantity) }));

/**
 * "What is one of these made of?"
 *
 * Ingredients are picked from the Ingredients list — never typed — so stock and
 * food cost follow automatically. The bar at the top shows the cost of one
 * portion against the selling price as you build it.
 */
export function RecipeEditor({
  value, onChange, ingredients, priceH,
}: {
  value: RecipeDraft[];
  onChange: (next: RecipeDraft[]) => void;
  ingredients: Ingredient[];
  priceH: number;
}) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const ar = language === 'ar';
  const money = (h: number) => formatCurrency(Math.round(h), { language: language as 'en' | 'ar' });
  const costH = recipeCostH(recipeFromDraft(value), ingredients);
  const foodCost = priceH > 0 ? costH / priceH : null;
  const used = new Set(value.map((r) => r.ingredientId));
  const options = (current: string) =>
    ingredients
      .filter((i) => i.status === 'active' && (i.id === current || !used.has(i.id)))
      .map((i) => ({ value: i.id, label: `${ar ? i.nameAr : i.nameEn} · ${t(`ingredients.units.${i.unit}`)}` }));

  if (ingredients.length === 0) {
    return <p className="rounded-xl border border-dashed border-ink-300 bg-ink-50 p-6 text-center text-sm text-ink-500">{t('itemWizard.recipe.noIngredients')}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 grid grid-cols-3 gap-2 rounded-xl border border-ink-200 bg-ink-50 p-3 text-center shadow-sm">
        <div>
          <p className="text-2xs uppercase tracking-wide text-ink-500">{t('itemWizard.recipe.cost')}</p>
          <p className="numeric text-lg font-semibold text-ink-900">{money(costH)}</p>
        </div>
        <div>
          <p className="text-2xs uppercase tracking-wide text-ink-500">{t('itemWizard.recipe.price')}</p>
          <p className="numeric text-lg font-semibold text-ink-900">{money(priceH)}</p>
        </div>
        <div>
          <p className="text-2xs uppercase tracking-wide text-ink-500">{t('itemWizard.recipe.foodCost')}</p>
          <p className={cn('numeric text-lg font-semibold', foodCost === null ? 'text-ink-400' : foodCost > 0.4 ? 'text-danger-600' : foodCost > 0.3 ? 'text-warning-600' : 'text-success-700')}>
            {foodCost === null ? '—' : formatPercent(foodCost, { language: language as 'en' | 'ar' })}
          </p>
        </div>
        {foodCost !== null && foodCost > 0.4 && <p className="col-span-3 text-xs text-danger-600">{t('itemWizard.recipe.highCost')}</p>}
      </div>

      {value.length > 0 && (
        <div className="space-y-2">
          <div className="hidden grid-cols-[1fr_9rem_6rem_2.25rem] gap-2 px-1 text-2xs font-medium uppercase tracking-wide text-ink-400 sm:grid">
            <span>{t('itemWizard.options.ingredient')}</span>
            <span>{t('itemWizard.options.amount')}</span>
            <span className="text-end">{t('itemWizard.recipe.lineCost')}</span>
            <span />
          </div>
          {value.map((row, index) => {
            const ing = ingredients.find((i) => i.id === row.ingredientId);
            const lineCost = ing ? ing.costPerUnitH * (Number(row.quantity) || 0) : 0;
            return (
              <div key={index} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_9rem_6rem_2.25rem]">
                <Select value={row.ingredientId} placeholder={t('itemWizard.options.pickIngredient')} options={options(row.ingredientId)}
                  onChange={(ingredientId) => onChange(value.map((r, i) => (i === index ? { ...r, ingredientId } : r)))} />
                <div className="relative">
                  <Input type="number" min="0" step="any" dir="ltr" value={row.quantity} className="pe-12" aria-label={t('itemWizard.options.amount')}
                    onChange={(e) => onChange(value.map((r, i) => (i === index ? { ...r, quantity: e.target.value } : r)))} />
                  {ing && <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">{t(`ingredients.units.${ing.unit}`)}</span>}
                </div>
                <span className="numeric hidden text-end text-sm text-ink-600 sm:block">{money(lineCost)}</span>
                <Button variant="ghost" size="icon" aria-label={t('common.delete')} onClick={() => onChange(value.filter((_, i) => i !== index))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Button variant="outline" size="sm" leadingIcon={<Plus />} onClick={() => onChange([...value, { ingredientId: '', quantity: '1' }])}>
        {t('itemWizard.options.addIngredient')}
      </Button>
      <p className="text-xs text-ink-500">{t('itemWizard.recipe.hint')}</p>
    </div>
  );
}
