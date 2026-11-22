import { useEffect, useMemo, useState } from 'react';
import { Check, Layers, Minus, Plus } from 'lucide-react';
import { comboSavingH } from '@/lib/combo';
import { Button, Modal } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/i18n';
import type { CatalogItem, ModifierGroup } from '@/types/catalog';
import type { SaleLineModifier } from '@/types/sales';

export interface ModifierSheetProps {
  item: CatalogItem | null;
  onClose: () => void;
  onAdd: (item: CatalogItem, modifiers: SaleLineModifier[], quantity: number) => void;
  /** Combos this item is the main of. When present, the sheet offers them first. */
  meals?: CatalogItem[];
  catalog?: CatalogItem[];
  onChooseMeal?: (meal: CatalogItem) => void;
}

/**
 * Size, milk, extras — chosen in one sheet, with the price updating as you tap.
 *
 * Opened when an item has modifier groups. Required groups start on their
 * first option, so a regular order is still one tap on "Add". Options are
 * large chips rather than radio rows: this is used standing at a counter.
 */
export function ModifierSheet({ item, onClose, onAdd, meals = [], catalog = [], onChooseMeal }: ModifierSheetProps) {
  const { t, language } = useTranslation();
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);

  const groups: ModifierGroup[] = useMemo(() => item?.modifierGroups ?? [], [item]);

  useEffect(() => {
    if (!item) return;
    setQuantity(1);
    setSelected(
      Object.fromEntries(
        groups.map((group) => [group.id, group.required && group.options[0] ? [group.options[0].id] : []]),
      ),
    );
  }, [item, groups]);

  if (!item) return null;

  const ar = language === 'ar';
  const name = (entry: { nameAr: string; nameEn: string }) => (ar ? entry.nameAr : entry.nameEn);

  const chosen: SaleLineModifier[] = groups.flatMap((group) =>
    group.options
      .filter((option) => selected[group.id]?.includes(option.id))
      .map((option) => ({
        groupId: group.id,
        optionId: option.id,
        nameAr: option.nameAr,
        nameEn: option.nameEn,
        priceDeltaH: option.priceDeltaH,
      })),
  );

  const unitH = item.priceH + chosen.reduce((sum, modifier) => sum + modifier.priceDeltaH, 0);
  const missing = groups.some((group) => group.required && (selected[group.id]?.length ?? 0) === 0);

  function toggle(group: ModifierGroup, optionId: string) {
    setSelected((current) => {
      const now = current[group.id] ?? [];
      if (group.multiple) {
        return { ...current, [group.id]: now.includes(optionId) ? now.filter((id) => id !== optionId) : [...now, optionId] };
      }
      /* A single-choice optional group can be cleared by tapping the choice again. */
      if (!group.required && now.includes(optionId)) return { ...current, [group.id]: [] };
      return { ...current, [group.id]: [optionId] };
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={name(item)}
      description={formatCurrency(item.priceH, { language })}
      size="sm"
      footer={
        <div className="flex w-full items-center gap-3">
          <div className="flex items-center rounded-md border border-ink-200" dir="ltr">
            <button
              type="button"
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              aria-label={t('pos.cart.decrease')}
              className="grid h-11 w-11 place-items-center text-ink-600 hover:bg-ink-100"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="numeric w-8 text-center text-md font-semibold">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((value) => value + 1)}
              aria-label={t('pos.cart.increase')}
              className="grid h-11 w-11 place-items-center text-ink-600 hover:bg-ink-100"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <Button
            size="lg"
            className="flex-1"
            disabled={missing}
            onClick={() => {
              onAdd(item, chosen, quantity);
              onClose();
            }}
          >
            {meals.length > 0 ? t('posCombo.addAlone') : t('posModifiers.add')} ·{' '}
            <span className="numeric">{formatCurrency(unitH * quantity, { language })}</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Upsell, worded for the customer: the cashier can read it out. */}
        {meals.length > 0 && onChooseMeal && (
          <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
              <Layers aria-hidden className="h-4 w-4 text-amber-700" />
              {t('posCombo.makeItAMeal')}
            </p>
            {meals.map((meal) => {
              const extra = meal.priceH - item.priceH;
              const saving = comboSavingH(meal, catalog);
              return (
                <button key={meal.id} type="button" onClick={() => onChooseMeal(meal)}
                  className="flex min-h-[3rem] w-full items-center justify-between gap-3 rounded-md border border-amber-300 bg-surface px-3 py-2 text-start transition hover:border-ink-900">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink-900">{name(meal)}</span>
                    {saving > 0 && (
                      <span className="block text-2xs text-success-700">
                        {t('posCombo.save', { amount: formatCurrency(saving, { language }) })}
                      </span>
                    )}
                  </span>
                  <span className="numeric shrink-0 rounded-md bg-ink-900 px-2.5 py-1 text-sm font-semibold text-ink-50">
                    {extra > 0 ? `+${formatCurrency(extra, { language })}` : formatCurrency(meal.priceH, { language })}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {groups.map((group) => (
          <fieldset key={group.id}>
            <legend className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-900">
              {name(group)}
              <span className="text-2xs font-normal text-ink-500">
                {group.required ? t('posModifiers.required') : group.multiple ? t('posModifiers.chooseAny') : t('posModifiers.optional')}
              </span>
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {group.options.map((option) => {
                const on = selected[group.id]?.includes(option.id) ?? false;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(group, option.id)}
                    className={cn(
                      'flex min-h-[3rem] flex-col items-start justify-center rounded-md border px-3 py-2 text-start transition',
                      on ? 'border-ink-900 bg-ink-900 text-ink-50' : 'border-ink-200 bg-surface text-ink-800 hover:border-ink-400',
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-1 text-sm font-medium">
                      {name(option)}
                      {on && <Check aria-hidden className="h-3.5 w-3.5 shrink-0" />}
                    </span>
                    {option.priceDeltaH > 0 && (
                      <span className={cn('numeric text-2xs', on ? 'text-ink-300' : 'text-ink-500')}>
                        +{formatCurrency(option.priceDeltaH, { language })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </Modal>
  );
}
