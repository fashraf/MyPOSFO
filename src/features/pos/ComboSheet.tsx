import { useEffect, useMemo, useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/i18n';
import { isProduct } from '@/types/catalog';
import type { CatalogItem, ModifierGroup } from '@/types/catalog';
import type { SaleLineComponent, SaleLineModifier } from '@/types/sales';
import {
  buildComponents,
  comboSavingH,
  comboUnitPriceH,
  defaultSelection,
  slotDefaults,
  slotGroups,
  slotOptions,
  toModifier,
  type ComboSelection,
} from '@/lib/combo';

export interface ComboSheetProps {
  combo: CatalogItem | null;
  /** Everything sellable, to resolve slot items and their stock. */
  catalog: CatalogItem[];
  onClose: () => void;
  onAdd: (combo: CatalogItem, components: SaleLineComponent[], quantity: number) => void;
}

/**
 * Build a meal in one screen.
 *
 * Each slot is a numbered card showing what is in it now. The default is
 * already chosen, so the usual order is one tap on "Add". Swaps are chips with
 * their extra charge printed on them; an item's own options (Large fries,
 * no onion) appear under it. Sold-out swaps are visible but disabled, so the
 * cashier can say "sorry, no Fanta" instead of discovering it at payment.
 */
export function ComboSheet({ combo, catalog, onClose, onAdd }: ComboSheetProps) {
  const { t, language } = useTranslation();
  const [selection, setSelection] = useState<ComboSelection>({});
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!combo) return;
    setSelection(defaultSelection(combo, catalog));
    setQuantity(1);
  }, [combo, catalog]);

  const components = useMemo(
    () => (combo ? buildComponents(combo, selection, catalog) : []),
    [combo, selection, catalog],
  );

  if (!combo) return null;

  const ar = language === 'ar';
  const name = (entry: { nameAr: string; nameEn: string }) => (ar ? entry.nameAr : entry.nameEn);
  const money = (h: number) => formatCurrency(h, { language });
  const byId = (id: string) => catalog.find((item) => item.id === id);
  const soldOut = (item: CatalogItem | undefined) =>
    !item || (isProduct(item) && item.trackInventory && item.stockQuantity <= 0);

  const unitH = comboUnitPriceH(combo, components);
  const saving = comboSavingH(combo, catalog);
  const missingRequired = combo.combo!.slots.some((slot) => {
    const choice = selection[slot.id];
    const item = byId(choice?.itemId ?? '');
    return slotGroups(slot, item).some(
      (group) => group.required && !choice?.modifiers.some((m) => m.groupId === group.id),
    );
  });

  function pick(slotId: string, itemId: string) {
    const slot = combo!.combo!.slots.find((x) => x.id === slotId)!;
    setSelection((current) => {
      /* Keep the chosen size and extras when swapping the item; reset its own options. */
      const kept = (current[slotId]?.modifiers ?? []).filter((m) => m.groupId.startsWith('slotsize:') || m.groupId.startsWith('slotextra:'));
      const fresh = slotDefaults(slot, byId(itemId)).filter((m) => !kept.some((k) => k.groupId === m.groupId));
      return { ...current, [slotId]: { itemId, modifiers: [...kept, ...fresh] } };
    });
  }

  function toggleModifier(slotId: string, group: ModifierGroup, optionId: string) {
    setSelection((current) => {
      const choice = current[slotId];
      if (!choice) return current;
      const option = group.options.find((o) => o.id === optionId)!;
      const entry: SaleLineModifier = toModifier(group, option);
      const others = choice.modifiers.filter((m) => m.groupId !== group.id);
      const inGroup = choice.modifiers.filter((m) => m.groupId === group.id);
      const on = inGroup.some((m) => m.optionId === optionId);
      let nextGroup: SaleLineModifier[];
      if (group.multiple) nextGroup = on ? inGroup.filter((m) => m.optionId !== optionId) : [...inGroup, entry];
      else nextGroup = on && !group.required ? [] : [entry];
      return { ...current, [slotId]: { ...choice, modifiers: [...others, ...nextGroup] } };
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2">
          {name(combo)}
          {saving > 0 && (
            <span className="rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700">
              {t('posCombo.save', { amount: money(saving) })}
            </span>
          )}
        </span>
      }
      description={t('posCombo.subtitle')}
      footer={
        <div className="flex w-full items-center gap-3">
          <div className="flex items-center rounded-md border border-ink-200" dir="ltr">
            <button type="button" aria-label={t('pos.cart.decrease')} onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="grid h-11 w-11 place-items-center text-ink-600 hover:bg-ink-100">
              <Minus className="h-4 w-4" />
            </button>
            <span className="numeric w-8 text-center text-md font-semibold">{quantity}</span>
            <button type="button" aria-label={t('pos.cart.increase')} onClick={() => setQuantity((q) => q + 1)}
              className="grid h-11 w-11 place-items-center text-ink-600 hover:bg-ink-100">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <Button size="lg" className="flex-1" disabled={missingRequired}
            onClick={() => { onAdd(combo, components, quantity); onClose(); }}>
            {t('posCombo.addMeal')} · <span className="numeric">{money(unitH * quantity)}</span>
          </Button>
        </div>
      }
    >
      <ol className="space-y-3">
        {combo.combo!.slots.map((slot, index) => {
          const choice = selection[slot.id];
          const chosen = byId(choice?.itemId ?? slot.defaultItemId);
          const options = slotOptions(slot);
          return (
            <li key={slot.id} className="rounded-lg border border-ink-200 bg-surface p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="numeric grid h-6 w-6 place-items-center rounded-full bg-info-50 text-2xs font-semibold text-info-700">
                  {index + 1}
                </span>
                <span className="text-sm font-semibold text-ink-900">{name(slot)}</span>
                {slot.quantity > 1 && <span className="numeric text-xs text-ink-500">×{slot.quantity}</span>}
                <span className="ms-auto truncate text-xs text-ink-500">{chosen ? name(chosen) : ''}</span>
              </div>

              {options.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {options.map((option) => {
                    const item = byId(option.itemId);
                    const on = choice?.itemId === option.itemId;
                    const out = soldOut(item);
                    return (
                      <button key={option.itemId} type="button" disabled={out} aria-pressed={on}
                        onClick={() => pick(slot.id, option.itemId)}
                        className={cn(
                          'flex min-h-[2.75rem] items-center gap-2 rounded-md border px-3 py-1.5 text-start text-sm transition',
                          on ? 'border-info-300 bg-info-50 text-info-800' : 'border-ink-200 bg-surface text-ink-800 hover:border-ink-400',
                          out && 'cursor-not-allowed opacity-40 line-through',
                        )}>
                        {on && <Check aria-hidden className="h-3.5 w-3.5 shrink-0" />}
                        <span className="font-medium">{item ? name(item) : option.itemId}</span>
                        {option.priceDeltaH > 0 && (
                          <span className={cn('numeric text-2xs', on ? 'text-info-600' : 'text-ink-500')}>
                            +{money(option.priceDeltaH)}
                          </span>
                        )}
                        {out && <span className="text-2xs">{t('posCombo.soldOut')}</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* The chosen item's own options: Large fries, no onion. */}
              {slotGroups(slot, chosen).map((group) => (
                <div key={group.id} className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="me-1 text-2xs font-medium uppercase tracking-wide text-ink-500 max-sm:basis-full">{name(group)}</span>
                  {group.options.map((option) => {
                    const on = choice?.modifiers.some((m) => m.optionId === option.id) ?? false;
                    return (
                      <button key={option.id} type="button" aria-pressed={on}
                        onClick={() => toggleModifier(slot.id, group, option.id)}
                        className={cn(
                          'min-h-[2.25rem] rounded-full border px-3 text-xs font-medium transition touch:min-h-[2.75rem] touch:px-3.5 touch:text-sm',
                          on ? 'border-info-300 bg-info-50 text-info-800' : 'border-ink-200 text-ink-600 hover:border-ink-400',
                        )}>
                        {name(option)}
                        {option.priceDeltaH > 0 && <span className="numeric ms-1 text-ink-500">+{money(option.priceDeltaH)}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}
