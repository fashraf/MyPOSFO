import { useEffect, useState } from 'react';
import { CornerDownRight, CupSoda, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { Button, Input, Select, SizedDialog } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency, fromMinorUnits, toMinorUnits } from '@/lib/format';
import { extraName, findPreset, SLOT_PRESETS } from '@/lib/optionPresets';
import { useTranslation } from '@/i18n';
import { isCombo } from '@/types/catalog';
import type { CatalogItem, ComboSlot } from '@/types/catalog';
import type { Ingredient } from '@/types/ingredients';

let counter = 0;
const uid = (p = 'sl') => `${p}_${Date.now().toString(36)}${(counter++).toString(36)}`;

/* ---- Drafts (prices as text while editing) -------------------------------- */

export interface SlotDraft {
  id: string;
  nameAr: string;
  nameEn: string;
  quantity: number;
  defaultItemId: string;
  choices: { itemId: string; price: string }[];
  sizes: { key: string; price: string }[];
  extras: { id: string; ingredientId: string; quantity: string; price: string }[];
}

/** The four sizes a meal part can come in. The icon grows with the size. */
export const PART_SIZES = [
  { key: 'small', short: 'S', en: 'Small', ar: 'صغير', scale: 0.75, icon: 'h-5 w-5' },
  { key: 'medium', short: 'M', en: 'Medium', ar: 'وسط', scale: 1, icon: 'h-6 w-6' },
  { key: 'large', short: 'L', en: 'Large', ar: 'كبير', scale: 1.5, icon: 'h-8 w-8' },
  { key: 'xl', short: 'XL', en: 'Extra large', ar: 'كبير جدًا', scale: 2, icon: 'h-10 w-10' },
];

const price = (h: number) => (h ? fromMinorUnits(h) : '');

export function slotsToDraft(slots: ComboSlot[] | undefined): SlotDraft[] {
  return (slots ?? []).map((slot) => ({
    id: slot.id,
    nameAr: slot.nameAr,
    nameEn: slot.nameEn,
    quantity: slot.quantity,
    defaultItemId: slot.defaultItemId,
    choices: slot.choices.map((c) => ({ itemId: c.itemId, price: price(c.priceDeltaH) })),
    sizes: (slot.sizes ?? []).map((s) => ({ key: s.key, price: price(s.priceDeltaH) })),
    extras: (slot.extras ?? []).map((e) => ({ id: e.id, ingredientId: e.ingredientId, quantity: String(e.quantity), price: price(e.priceDeltaH) })),
  }));
}

export function slotsFromDraft(slots: SlotDraft[], ingredients: Ingredient[] = []): ComboSlot[] {
  return slots.map((slot) => {
    const sizes = PART_SIZES.filter((p) => slot.sizes.some((s) => s.key === p.key)).map((p) => ({
      key: p.key, nameEn: p.en, nameAr: p.ar, scale: p.scale,
      priceDeltaH: toMinorUnits(slot.sizes.find((s) => s.key === p.key)?.price || '0'),
    }));
    const extras = slot.extras.flatMap((e) => {
      const ing = ingredients.find((i) => i.id === e.ingredientId);
      if (!ing) return [];
      const n = extraName(ing);
      return [{ id: e.id, ingredientId: ing.id, nameEn: n.en, nameAr: n.ar, quantity: Number(e.quantity) || 1, priceDeltaH: toMinorUnits(e.price || '0') }];
    });
    return {
      id: slot.id,
      nameAr: slot.nameAr.trim() || slot.nameEn.trim(),
      nameEn: slot.nameEn.trim() || slot.nameAr.trim(),
      quantity: Math.max(1, slot.quantity),
      defaultItemId: slot.defaultItemId,
      choices: slot.choices
        .filter((c) => c.itemId && c.itemId !== slot.defaultItemId)
        .map((c) => ({ itemId: c.itemId, priceDeltaH: toMinorUnits(c.price || '0') })),
      ...(sizes.length ? { sizes } : {}),
      ...(extras.length ? { extras } : {}),
    };
  });
}

const emptySlot = (): SlotDraft => ({
  id: uid(), nameEn: 'Main', nameAr: 'الوجبة الرئيسية', quantity: 1, defaultItemId: '', choices: [], sizes: [], extras: [],
});

/* ---- Editor: the nested list ---------------------------------------------- */

/**
 * "What's in the meal?"
 *
 * A short nested list: each part shows its main item (the one it comes with)
 * and, indented under it, what it can be replaced with, its sizes and extras.
 * Tap a part — or "Add item" — to change it in a modal. Nothing here needs
 * typing except prices.
 */
export function ComboContentsEditor({
  value,
  onChange,
  catalog,
  ingredients,
  priceH,
}: {
  value: SlotDraft[];
  onChange: (next: SlotDraft[]) => void;
  catalog: CatalogItem[];
  ingredients: Ingredient[];
  priceH: number;
}) {
  const { t, language } = useTranslation();
  const ar = language === 'ar';
  const money = (h: number) => formatCurrency(h, { language });
  const byId = (id: string) => catalog.find((item) => item.id === id);
  const [editing, setEditing] = useState<SlotDraft | null>(null);

  const separateH = value.reduce((sum, slot) => sum + (byId(slot.defaultItemId)?.priceH ?? 0) * slot.quantity, 0);
  const savingH = separateH - priceH;

  function save(slot: SlotDraft) {
    const exists = value.some((s) => s.id === slot.id);
    onChange(exists ? value.map((s) => (s.id === slot.id ? slot : s)) : [...value, slot]);
    setEditing(null);
  }

  return (
    <div className="space-y-2.5">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-sm">
        <span className="text-ink-500">{t('itemWizard.combo.separately')}: <span className="numeric font-semibold text-ink-800">{money(separateH)}</span></span>
        <span className="text-ink-500">{t('itemWizard.combo.mealPrice')}: <span className="numeric font-semibold text-ink-900">{money(priceH)}</span></span>
        <span className="text-ink-500">{t('itemWizard.combo.saves')}: <span className={cn('numeric font-semibold', savingH > 0 ? 'text-success-700' : separateH > 0 ? 'text-danger-600' : 'text-ink-400')}>{money(Math.max(0, savingH))}</span></span>
        {savingH <= 0 && value.length > 0 && value.every((slot) => slot.defaultItemId) && (
          <span className="w-full text-xs text-danger-600">{t('itemWizard.combo.noSaving')}</span>
        )}
      </div>

      {value.map((slot, index) => (
        <PartCard
          key={slot.id}
          slot={slot}
          index={index}
          catalog={catalog}
          ingredients={ingredients}
          ar={ar}
          money={money}
          onEdit={() => setEditing(slot)}
          onDelete={() => onChange(value.filter((s) => s.id !== slot.id))}
        />
      ))}

      <button type="button" onClick={() => setEditing(emptySlot())}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-300 py-3 text-sm font-semibold text-ink-600 transition hover:border-info-300 hover:bg-info-50/40 hover:text-info-700">
        <Plus className="h-4 w-4" /> {value.length ? t('combo2.addAnother') : t('combo2.addFirst')}
      </button>

      <PartModal
        slot={editing}
        isNew={Boolean(editing && !value.some((s) => s.id === editing.id))}
        onClose={() => setEditing(null)}
        onSave={save}
        catalog={catalog}
        ingredients={ingredients}
      />
    </div>
  );
}

function PartCard({ slot, index, catalog, ingredients, ar, money, onEdit, onDelete, readOnly = false }: {
  slot: SlotDraft; index: number; catalog: CatalogItem[]; ingredients: Ingredient[]; ar: boolean;
  money: (h: number) => string; onEdit: () => void; onDelete: () => void; readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const name = (e: { nameAr: string; nameEn: string }) => (ar ? e.nameAr : e.nameEn);
  const main = catalog.find((c) => c.id === slot.defaultItemId);
  const plus = (p: string) => (toMinorUnits(p || '0') ? `+${money(toMinorUnits(p))}` : t('itemWizard.combo.free'));
  return (
    <div className="group rounded-xl border border-ink-200 bg-surface transition hover:border-info-300">
      <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-2">
        <span className="numeric grid h-6 w-6 place-items-center rounded-full bg-info-50 text-2xs font-semibold text-info-700">{index + 1}</span>
        <span className="text-sm font-semibold uppercase tracking-wide text-ink-500">{name(slot)}</span>
        {slot.quantity > 1 && <span className="numeric rounded-full bg-ink-100 px-1.5 text-xs font-semibold text-ink-700">×{slot.quantity}</span>}
        <span className="flex-1" />
        {!readOnly && (
          <>
            <Button variant="ghost" size="sm" leadingIcon={<Pencil />} onClick={onEdit}>{t('common.edit')}</Button>
            <Button variant="ghost" size="icon" aria-label={t('common.delete')} onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
          </>
        )}
      </div>
      <button type="button" onClick={onEdit} disabled={readOnly} className="block w-full px-3 py-2 text-start disabled:cursor-default">
        {/* Primary */}
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 shrink-0 fill-warning-300 text-warning-500" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-md font-semibold text-ink-900">{main ? name(main) : t('combo2.noMain')}</span>
          <span className="rounded-full bg-success-50 px-2 py-0.5 text-2xs font-semibold text-success-700">{t('combo2.primary')}</span>
          {main && <span className="numeric text-sm text-ink-500">{money(main.priceH)}</span>}
        </div>
        {/* Replacements, nested */}
        {slot.choices.filter((c) => c.itemId).map((c) => {
          const it = catalog.find((x) => x.id === c.itemId);
          return (
            <div key={c.itemId} className="mt-1 flex items-center gap-2 ps-6 text-sm">
              <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-ink-300 flip-rtl" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-ink-700">{it ? name(it) : '—'}</span>
              <span className="text-2xs text-ink-400">{t('combo2.replacement')}</span>
              <span className={cn('numeric text-xs font-medium', toMinorUnits(c.price || '0') ? 'text-ink-700' : 'text-success-700')}>{plus(c.price)}</span>
            </div>
          );
        })}
        {(slot.sizes.length > 0 || slot.extras.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5 ps-6">
            {PART_SIZES.filter((p) => slot.sizes.some((s) => s.key === p.key)).map((p) => {
              const s = slot.sizes.find((x) => x.key === p.key)!;
              return (
                <span key={p.key} className="inline-flex items-center gap-1 rounded-full bg-info-50 px-2 py-0.5 text-xs font-medium text-info-700">
                  <span className="font-bold">{p.short}</span>
                  {toMinorUnits(s.price || '0') ? <span className="numeric">+{money(toMinorUnits(s.price))}</span> : null}
                </span>
              );
            })}
            {slot.extras.map((e) => {
              const ing = ingredients.find((i) => i.id === e.ingredientId);
              return (
                <span key={e.id} className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700">
                  <Plus className="h-3 w-3" /> {ing ? name(ing) : '—'}
                  {toMinorUnits(e.price || '0') ? <span className="numeric">+{money(toMinorUnits(e.price))}</span> : null}
                </span>
              );
            })}
          </div>
        )}
      </button>
    </div>
  );
}

/* ---- The part modal ------------------------------------------------------- */

type PartStep = 'item' | 'sizes' | 'replace' | 'extras' | 'review';
const PART_STEPS: PartStep[] = ['item', 'sizes', 'replace', 'extras', 'review'];

/**
 * Add or edit one part of a meal, as a short wizard: one decision per screen,
 * full-width fields on phones and two columns where there is room. Sizes,
 * replacements and extras are optional — the cashier can save after step 1.
 */
function PartModal({ slot, isNew, onClose, onSave, catalog, ingredients }: {
  slot: SlotDraft | null; isNew: boolean; onClose: () => void; onSave: (s: SlotDraft) => void;
  catalog: CatalogItem[]; ingredients: Ingredient[];
}) {
  const { t, language } = useTranslation();
  const ar = language === 'ar';
  const name = (e: { nameAr: string; nameEn: string }) => (ar ? e.nameAr : e.nameEn);
  const money = (h: number) => formatCurrency(h, { language });
  const [draft, setDraft] = useState<SlotDraft | null>(slot);
  const [step, setStep] = useState<PartStep>('item');

  useEffect(() => {
    setDraft(slot);
    setStep('item');
  }, [slot]);
  if (!draft) return null;

  const set = (patch: Partial<SlotDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const parts = catalog.filter((item) => !isCombo(item) && item.status === 'active');
  const itemLabel = (i: CatalogItem) => `${name(i)} · ${money(i.priceH)}`;
  const mainOptions = parts.map((i) => ({ value: i.id, label: itemLabel(i) }));
  const replacementOptions = parts
    .filter((i) => i.id !== draft.defaultItemId && !draft.choices.some((c) => c.itemId === i.id))
    .map((i) => ({ value: i.id, label: itemLabel(i) }));
  const ingredientOptions = ingredients.filter((i) => i.status === 'active').map((i) => ({ value: i.id, label: `${name(i)} · ${t(`ingredients.units.${i.unit}`)}` }));
  const main = catalog.find((c) => c.id === draft.defaultItemId);
  const blocker = !draft.defaultItemId ? t('combo2.needMain') : draft.extras.some((e) => !e.ingredientId) ? t('combo2.needExtra') : null;

  const index = PART_STEPS.indexOf(step);
  const isLast = step === 'review';
  const stepTitle = (s: PartStep) => t(`combo3.steps.${s}`);
  const counts: Record<PartStep, number | null> = {
    item: draft.defaultItemId ? 1 : 0,
    sizes: draft.sizes.length || null,
    replace: draft.choices.length || null,
    extras: draft.extras.length || null,
    review: null,
  };
  const canLeaveItem = Boolean(draft.defaultItemId);
  const go = (s: PartStep) => {
    if (s !== 'item' && !canLeaveItem) return;
    setStep(s);
  };

  return (
    <SizedDialog
      open
      onClose={onClose}
      size={70}
      title={isNew ? t('combo2.newTitle') : t('combo2.editTitle', { part: name(draft) })}
      subtitle={t('combo3.subtitle')}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <p className={cn('me-auto min-w-0 text-sm', blocker && step === 'item' ? 'text-warning-800' : 'text-ink-500')}>
            {step === 'item' && blocker ? blocker : isLast ? t('combo2.saveHint') : t('combo3.next', { step: stepTitle(PART_STEPS[index + 1]) })}
          </p>
          {index > 0 && <Button variant="ghost" onClick={() => setStep(PART_STEPS[index - 1])}>{t('combo3.back')}</Button>}
          {!isLast && canLeaveItem && step !== 'item' && (
            <Button variant="outline" disabled={Boolean(blocker)} onClick={() => onSave(draft)} data-testid="part-save-now">{t('combo3.saveNow')}</Button>
          )}
          {isLast ? (
            <Button disabled={Boolean(blocker)} onClick={() => onSave(draft)} data-testid="part-save">
              {isNew ? t('combo2.addToMeal') : t('common.saveChanges')}
            </Button>
          ) : (
            <Button disabled={step === 'item' && !canLeaveItem} onClick={() => setStep(PART_STEPS[index + 1])} data-testid="part-next">
              {t('combo3.nextButton')}
            </Button>
          )}
        </div>
      }
    >
      <nav className="sticky -top-3 z-10 -mx-4 -mt-3 mb-4 border-b border-ink-100 bg-surface/95 px-4 py-2.5 backdrop-blur" aria-label={t('combo3.stepsLabel')}>
        <div className="mx-auto max-w-3xl">
          <ol className="flex gap-1 overflow-x-auto no-scrollbar" data-testid="part-steps">
            {PART_STEPS.map((s, i) => {
              const active = s === step;
              const done = i < index;
              const locked = s !== 'item' && !canLeaveItem;
              return (
                <li key={s} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => go(s)}
                    disabled={locked}
                    data-testid={`part-step-${s}`}
                    aria-current={active ? 'step' : undefined}
                    className={cn(
                      'flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                      active ? 'border-ink-900 bg-ink-900 text-white' : done ? 'border-success-200 bg-success-50 text-success-800' : 'border-ink-200 text-ink-600 hover:bg-ink-50',
                      locked && 'opacity-40',
                    )}
                  >
                    <span className={cn('numeric grid h-5 w-5 place-items-center rounded-full text-2xs font-bold', active ? 'bg-white/20' : done ? 'bg-success-100' : 'bg-ink-100')}>{i + 1}</span>
                    {stepTitle(s)}
                    {counts[s] ? <span className={cn('numeric rounded-full px-1.5 text-2xs', active ? 'bg-white/20' : 'bg-ink-100')}>{counts[s]}</span> : null}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </nav>
      <div className="mx-auto max-w-3xl" data-testid={`part-step-body-${step}`}>
        {step === 'item' && (
          <div className="grid grid-cols-12 gap-4">
            <section className="col-span-12">
              <StepLabel title={t('combo2.partName')} hint={t('combo3.partNameHint')} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SLOT_PRESETS.map((p) => {
                  const on = findPreset(SLOT_PRESETS, draft.nameEn)?.key === p.key;
                  return (
                    <button key={p.key} type="button" aria-pressed={on} onClick={() => set({ nameEn: p.en, nameAr: p.ar })}
                      className={cn('h-12 rounded-xl border text-sm font-medium transition',
                        on ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 text-ink-700 hover:border-ink-400')}>
                      {ar ? p.ar : p.en}
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="col-span-12 md:col-span-8">
              <StepLabel title={t('combo2.mainItem')} hint={t('combo2.mainHint')} />
              <Select value={draft.defaultItemId} placeholder={t('itemWizard.combo.pickItem')} options={mainOptions}
                onChange={(id) => set({ defaultItemId: id, choices: draft.choices.filter((c) => c.itemId !== id) })} />
            </section>
            <section className="col-span-12 md:col-span-4">
              <StepLabel title={t('itemWizard.combo.howMany')} />
              <div className="flex h-10 items-center justify-between rounded-lg border border-ink-200" role="group" aria-label={t('itemWizard.combo.howMany')}>
                <button type="button" aria-label="−" disabled={draft.quantity <= 1} onClick={() => set({ quantity: Math.max(1, draft.quantity - 1) })}
                  className="grid h-full w-12 place-items-center text-lg text-ink-600 hover:bg-ink-50 disabled:opacity-30">−</button>
                <span className="numeric text-sm font-semibold">× {draft.quantity}</span>
                <button type="button" aria-label="+" onClick={() => set({ quantity: Math.min(20, draft.quantity + 1) })}
                  className="grid h-full w-12 place-items-center text-lg text-ink-600 hover:bg-ink-50">+</button>
              </div>
            </section>
            {main && (
              <div className="col-span-12 flex items-center gap-2 rounded-xl bg-success-50 px-3 py-2.5 text-sm text-success-800">
                <Star className="h-4 w-4 fill-success-500 text-success-500" />
                {t('combo3.mainChosen', { item: name(main), qty: draft.quantity })}
              </div>
            )}
          </div>
        )}

        {step === 'sizes' && (
          <section>
            <StepLabel title={t('combo3.steps.sizes')} hint={t('combo2.sizesHint')} optional />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {PART_SIZES.map((p) => {
                const entry = draft.sizes.find((s) => s.key === p.key);
                const on = Boolean(entry);
                return (
                  <div key={p.key} className={cn('flex flex-col items-center rounded-2xl border-2 p-3 transition', on ? 'border-info-300 bg-info-50/50' : 'border-ink-200')}>
                    <button type="button" aria-pressed={on}
                      onClick={() => set({ sizes: on ? draft.sizes.filter((s) => s.key !== p.key) : [...draft.sizes, { key: p.key, price: '' }] })}
                      className="flex w-full flex-col items-center gap-1 rounded-lg py-1">
                      <span className="grid h-12 place-items-end">
                        <CupSoda className={cn(p.icon, on ? 'text-info-600' : 'text-ink-300')} />
                      </span>
                      <span className={cn('text-xl font-bold', on ? 'text-info-800' : 'text-ink-500')}>{p.short}</span>
                      <span className="text-xs text-ink-500">{ar ? p.ar : p.en}</span>
                    </button>
                    {on && (
                      <div className="mt-2 w-full">
                        <PriceBox value={entry!.price} label={t('combo2.sizePrice', { size: p.short })}
                          onChange={(v) => set({ sizes: draft.sizes.map((s) => (s.key === p.key ? { ...s, price: v } : s)) })} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {step === 'replace' && (
          <section>
            <StepLabel title={t('combo2.replace')} hint={t('combo2.replaceHint', { item: main ? name(main) : '—' })} optional />
            <div className="space-y-2">
              {draft.choices.map((c, i) => {
                const it = catalog.find((x) => x.id === c.itemId);
                return (
                  <div key={c.itemId || i} className="grid grid-cols-12 items-center gap-2 rounded-xl border border-ink-100 bg-ink-50/60 p-2">
                    <span className="col-span-12 flex items-center gap-2 truncate text-sm font-medium text-ink-800 sm:col-span-7">
                      <CornerDownRight className="h-4 w-4 shrink-0 text-ink-300 flip-rtl" aria-hidden />{it ? name(it) : '—'}
                    </span>
                    <div className="col-span-9 sm:col-span-4">
                      <PriceBox value={c.price} label={t('itemWizard.options.extra')}
                        onChange={(v) => set({ choices: draft.choices.map((x, j) => (j === i ? { ...x, price: v } : x)) })} />
                    </div>
                    <div className="col-span-3 flex justify-end sm:col-span-1">
                      <Button variant="ghost" size="icon" aria-label={t('common.delete')} onClick={() => set({ choices: draft.choices.filter((_, j) => j !== i) })}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              <Select value="" placeholder={t('combo2.addReplacement')} options={replacementOptions}
                onChange={(id) => id && set({ choices: [...draft.choices, { itemId: id, price: '' }] })} />
              {draft.choices.length === 0 && <p className="text-xs text-ink-500">{t('combo3.noneYet')}</p>}
            </div>
          </section>
        )}

        {step === 'extras' && (
          <section>
            <StepLabel title={t('combo2.extras')} hint={t('combo2.extrasHint')} optional />
            <div className="space-y-2">
              {draft.extras.map((e, i) => {
                const ing = ingredients.find((x) => x.id === e.ingredientId);
                return (
                  <div key={e.id} className="grid grid-cols-12 items-center gap-2 rounded-xl border border-ink-100 bg-ink-50/60 p-2">
                    <div className="col-span-12 sm:col-span-6">
                      <Select value={e.ingredientId} placeholder={t('itemWizard.options.pickIngredient')} options={ingredientOptions}
                        onChange={(id) => set({ extras: draft.extras.map((x, j) => (j === i ? { ...x, ingredientId: id } : x)) })} />
                    </div>
                    <div className="relative col-span-5 sm:col-span-2">
                      <Input type="number" min="0" step="any" dir="ltr" value={e.quantity} className="pe-10" aria-label={t('combo2.howMuch')}
                        onChange={(ev) => set({ extras: draft.extras.map((x, j) => (j === i ? { ...x, quantity: ev.target.value } : x)) })} />
                      {ing && <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-xs text-ink-400">{t(`ingredients.units.${ing.unit}`)}</span>}
                    </div>
                    <div className="col-span-5 sm:col-span-3">
                      <PriceBox value={e.price} label={t('itemWizard.options.extra')}
                        onChange={(v) => set({ extras: draft.extras.map((x, j) => (j === i ? { ...x, price: v } : x)) })} />
                    </div>
                    <div className="col-span-2 flex justify-end sm:col-span-1">
                      <Button variant="ghost" size="icon" aria-label={t('common.delete')} onClick={() => set({ extras: draft.extras.filter((_, j) => j !== i) })}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              <Button variant="outline" leadingIcon={<Plus />} fullWidth
                onClick={() => set({ extras: [...draft.extras, { id: uid('ex'), ingredientId: '', quantity: '1', price: '' }] })}>
                {t('combo2.addExtra')}
              </Button>
            </div>
          </section>
        )}

        {step === 'review' && (
          <section className="space-y-3">
            <StepLabel title={t('combo3.reviewTitle')} hint={t('combo3.reviewHint')} />
            <PartCard slot={draft} index={0} catalog={catalog} ingredients={ingredients} ar={ar} money={money}
              onEdit={() => setStep('item')} onDelete={() => undefined} readOnly />
          </section>
        )}
      </div>
    </SizedDialog>
  );
}

function StepLabel({ title, hint, optional }: { title: string; hint?: string; optional?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="mb-3">
      <p className="flex items-center gap-2 text-base font-semibold text-ink-900">
        {title}
        {optional && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-2xs font-medium text-ink-500">{t('common.optional')}</span>}
      </p>
      {hint && <p className="mt-0.5 text-sm text-ink-500">{hint}</p>}
    </div>
  );
}

function PriceBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="flex h-10 items-center gap-1 rounded-lg border border-ink-200 bg-surface px-2">
      <span className="text-xs text-ink-400">+</span>
      <input type="number" min="0" step="0.5" dir="ltr" inputMode="decimal" value={value} placeholder="0" aria-label={label}
        onChange={(e) => onChange(e.target.value)} className="numeric w-full min-w-0 bg-transparent text-sm text-ink-900 outline-none" />
      <span className="text-2xs text-ink-400">SAR</span>
    </div>
  );
}

/* ---- Review --------------------------------------------------------------- */

/** The meal as a clean nested list, for the last step. */
export function ComboReview({ slots, catalog, ingredients }: { slots: SlotDraft[]; catalog: CatalogItem[]; ingredients: Ingredient[] }) {
  const { language } = useTranslation();
  const money = (h: number) => formatCurrency(h, { language });
  return (
    <div className="space-y-2">
      {slots.map((slot, index) => (
        <PartCard key={slot.id} slot={slot} index={index} catalog={catalog} ingredients={ingredients} ar={language === 'ar'} money={money}
          onEdit={() => undefined} onDelete={() => undefined} readOnly />
      ))}
    </div>
  );
}
