import { useTax } from '@/hooks/useTax';
import { useEffect, useMemo, useState } from 'react';
import { Box, Layers, RefreshCw, SlidersHorizontal, Wrench, X } from 'lucide-react';
import {
  FormField,
  Input,
  PriceInput,
  ReviewRow,
  Select,
  Switch,
  Textarea,
  Wizard,
  type WizardStep,
} from '@/components/ui';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { recipeCostH } from '@/lib/recipes';
import { formatCurrency, formatPercent, fromMinorUnits, toMinorUnits } from '@/lib/format';
import { useTranslation } from '@/i18n';
import { catalogService, ingredientService, safeCall } from '@/services';
import { isCombo, isProduct } from '@/types/catalog';
import type { CatalogItem, CatalogItemInput, Category, StaffMember, UnitOfMeasure, Vendor } from '@/types/catalog';
import type { PrintGroup } from '@/types/printing';
import { OptionGroupsEditor, fromDraft, groupProblems, toDraft, type GroupDraft } from './OptionGroupsEditor';
import { RecipeEditor, recipeFromDraft, recipeToDraft, type RecipeDraft } from './RecipeEditor';
import type { Ingredient } from '@/types/ingredients';
import { ComboContentsEditor, ComboReview, slotsFromDraft, slotsToDraft, type SlotDraft } from './ComboContentsEditor';

type ItemType = 'product' | 'service' | 'combo';
const UNITS: UnitOfMeasure[] = ['piece', 'kg', 'gram', 'litre', 'ml', 'metre', 'box', 'pack'];

interface State {
  type: ItemType;
  nameAr: string;
  nameEn: string;
  categoryId: string;
  description: string;
  price: string;
  cost: string;
  sku: string;
  barcode: string;
  vendorId: string;
  unit: UnitOfMeasure;
  trackInventory: boolean;
  stockQuantity: string;
  minStockLevel: string;
  duration: string;
  providerId: string;
  showOnPos: boolean;
  requiresPreparation: boolean;
  printGroupId: string;
  taxRateId: string;
  active: boolean;
  groups: GroupDraft[];
  recipe: RecipeDraft[];
  slots: SlotDraft[];
}

function empty(type: ItemType): State {
  return {
    type, nameAr: '', nameEn: '', categoryId: '', description: '', price: '', cost: '', sku: '', barcode: '',
    vendorId: '', unit: 'piece', trackInventory: type === 'product', stockQuantity: '', minStockLevel: '5',
    duration: '', providerId: '', showOnPos: true, requiresPreparation: type === 'combo', printGroupId: '', taxRateId: '', active: true,
    groups: [], slots: [], recipe: [],
  };
}

function fromItem(item: CatalogItem): State {
  const type: ItemType = isCombo(item) ? 'combo' : item.kind;
  const base = {
    ...empty(type),
    nameAr: item.nameAr, nameEn: item.nameEn, categoryId: item.categoryId ?? '', description: item.description,
    price: fromMinorUnits(item.priceH), cost: item.costH ? fromMinorUnits(item.costH) : '',
    showOnPos: item.showOnPos, requiresPreparation: item.requiresPreparation, printGroupId: item.printGroupId ?? '', taxRateId: item.taxRateId ?? '',
    active: item.status === 'active', groups: toDraft(item.modifierGroups), slots: slotsToDraft(item.combo?.slots), recipe: recipeToDraft(item.recipe),
  };
  if (isProduct(item)) {
    return {
      ...base, sku: item.sku, barcode: item.barcode, vendorId: item.vendorId ?? '', unit: item.unit,
      trackInventory: item.trackInventory, stockQuantity: String(item.stockQuantity), minStockLevel: String(item.minStockLevel),
    };
  }
  return { ...base, duration: item.durationMinutes === null ? '' : String(item.durationMinutes), providerId: item.providerId ?? '' };
}

/** A readable SKU from the category and name: "Classic Burger Meal" in Meals → MEA-CLASSIC-BURG. */
function suggestSku(state: State, categories: Category[]): string {
  const cat = categories.find((c) => c.id === state.categoryId)?.nameEn ?? (state.type === 'combo' ? 'Meal' : 'Item');
  const words = state.nameEn.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  const stem = words.slice(0, 2).map((w) => w.slice(0, 7)).join('-') || 'NEW';
  return `${cat.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)}-${stem}`;
}

function toInput(state: State, ingredients: Ingredient[], catalog: CatalogItem[]): CatalogItemInput {
  const shared = {
    kind: state.type === 'service' ? ('service' as const) : ('product' as const),
    nameAr: state.nameAr.trim() || state.nameEn.trim(),
    nameEn: state.nameEn.trim() || state.nameAr.trim(),
    categoryId: state.categoryId || null,
    description: state.description,
    priceH: toMinorUnits(state.price || '0'),
    costH: toMinorUnits(state.cost || '0'),
    showOnPos: state.showOnPos,
    requiresPreparation: state.requiresPreparation,
    printGroupId: state.printGroupId || null,
    taxRateId: state.taxRateId || null,
    status: state.active ? ('active' as const) : ('inactive' as const),
    modifierGroups: fromDraft(state.groups, ingredients, catalog),
    recipe: state.type === 'product' ? recipeFromDraft(state.recipe) : undefined,
    combo: state.type === 'combo' ? { slots: slotsFromDraft(state.slots, ingredients) } : undefined,
  };
  if (state.type === 'service') {
    return { ...shared, durationMinutes: state.duration ? Number(state.duration) : null, providerId: state.providerId || null };
  }
  return {
    ...shared,
    sku: state.sku,
    barcode: state.barcode,
    vendorId: state.vendorId || null,
    unit: state.unit,
    /* A combo never tracks its own stock: its components do. */
    trackInventory: state.type === 'combo' ? false : state.trackInventory,
    stockQuantity: state.type === 'product' && state.trackInventory ? Number(state.stockQuantity) || 0 : 0,
    minStockLevel: state.type === 'product' && state.trackInventory ? Number(state.minStockLevel) || 0 : 0,
  };
}

export interface ItemWizardProps {
  open: boolean;
  onClose: () => void;
  item: CatalogItem | null;
  defaultKind?: 'product' | 'service';
  categories: Category[];
  vendors: Vendor[];
  staff: StaffMember[];
  printGroups: PrintGroup[];
  onSubmit: (input: CatalogItemInput) => Promise<boolean>;
}

/**
 * Add or edit a product, service or combo, one question at a time.
 *
 * Sized at 65% of the screen so the till or list behind stays visible. Each step
 * asks only what it needs; a step that cannot be finished says why in a line
 * under the buttons. The last step shows the item exactly as it will look on
 * the till — ribbon included — before anything is saved.
 */
export function ItemWizard({ open, onClose, item, defaultKind = 'product', categories, vendors, staff, printGroups, onSubmit }: ItemWizardProps) {
  const { t, language } = useTranslation();
  const tax = useTax();
  const ar = language === 'ar';
  const name = (e: { nameAr: string; nameEn: string }) => (ar ? e.nameAr : e.nameEn);
  const money = (h: number) => formatCurrency(h, { language });

  const [state, setState] = useState<State>(() => empty(defaultKind));
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  useEffect(() => {
    if (!open) return;
    setState(item ? fromItem(item) : empty(defaultKind));
    setStep(item ? 1 : 0);
    setServerError(null);
    void safeCall(() => ingredientService.list()).then((result) => result.ok && setIngredients(result.data));
    void safeCall(() => catalogService.list({ pageSize: 1000 })).then((result) => {
      if (result.ok) setCatalog(result.data.items);
    });
  }, [open, item, defaultKind]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, saving, onClose]);

  const set = <K extends keyof State>(key: K, value: State[K]) => setState((s) => ({ ...s, [key]: value }));

  const priceH = toMinorUnits(state.price || '0');
  const costH = toMinorUnits(state.cost || '0');
  const margin = priceH > 0 && costH > 0 ? (priceH - costH) / priceH : null;

  const categoryOptions = useMemo(
    () => [
      { value: '', label: t('catalog.form.noCategory') },
      ...categories
        .filter((c) => c.appliesTo === 'both' || c.appliesTo === (state.type === 'service' ? 'service' : 'product'))
        .map((c) => ({ value: c.id, label: name(c) })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, state.type, language],
  );

  if (!open) return null;

  const typeCards: { type: ItemType; icon: typeof Box }[] = [
    { type: 'product', icon: Box },
    { type: 'service', icon: Wrench },
    { type: 'combo', icon: Layers },
  ];

  /* Where it shows: compact switches on the last step instead of a step of their own. */
  const whereControls = (
    <div className="space-y-3 rounded-lg border border-ink-200 p-3">
      <p className="eyebrow">{t('itemWizard.steps.where')}</p>
      <Switch checked={state.showOnPos} onCheckedChange={(on) => set('showOnPos', on)} label={t('catalog.form.showOnPos')} />
      <Switch checked={state.requiresPreparation} onCheckedChange={(on) => set('requiresPreparation', on)} label={t('catalog.form.requiresPreparation')} />
      <Switch checked={state.active} onCheckedChange={(on) => set('active', on)} label={t('catalog.form.activeStatus')} />
      <Select value={state.printGroupId} onChange={(v) => set('printGroupId', v)} aria-label={t('catalog.form.printGroup')} placeholder={t('catalog.form.noPrintGroup')}
        options={[{ value: '', label: t('catalog.form.noPrintGroup') }, ...printGroups.filter((g) => g.status === 'active').map((g) => ({ value: g.id, label: name(g) }))]} />
      {tax.enabled && (
        <Select value={state.taxRateId} onChange={(v) => set('taxRateId', v)} aria-label={t('taxSettings.itemRate')}
          options={[
            { value: '', label: t('taxSettings.itemDefault', { rate: tax.rates.find((r) => r.id === tax.defaultRateId)?.name ?? '' }) },
            ...tax.rates.filter((r) => r.id !== tax.defaultRateId).map((r) => ({ value: r.id, label: r.name })),
          ]} />
      )}
    </div>
  );

  const steps: WizardStep[] = [
    {
      id: 'type',
      title: t('itemWizard.steps.type'),
      description: t('itemWizard.type.question'),
      content: (
        <div className="grid gap-3 sm:grid-cols-3">
          {typeCards.map(({ type, icon: Icon }) => {
            const on = state.type === type;
            const locked = Boolean(item) && fromItem(item!).type !== type;
            return (
              <button key={type} type="button" disabled={locked}
                onClick={() => setState((s) => ({ ...s, type, trackInventory: type === 'product', requiresPreparation: type === 'combo' ? true : s.requiresPreparation }))}
                className={cn(
                  'flex flex-col items-start gap-3 rounded-xl border p-4 text-start transition',
                  on ? 'border-info-300 bg-info-50/60 ring-1 ring-info-200' : 'border-ink-200 hover:border-ink-400',
                  locked && 'cursor-not-allowed opacity-40',
                )}>
                <span className={cn('grid h-11 w-11 place-items-center rounded-lg', on ? 'bg-info-100 text-info-700' : 'bg-ink-100 text-ink-600')}>
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-md font-semibold text-ink-900">{t(`itemWizard.type.${type}.title`)}</span>
                  <span className="mt-0.5 block text-sm text-ink-500">{t(`itemWizard.type.${type}.hint`)}</span>
                </span>
                <span className="text-xs text-ink-400">{t(`itemWizard.type.${type}.example`)}</span>
              </button>
            );
          })}
        </div>
      ),
    },
    {
      id: 'details',
      title: t('itemWizard.steps.details'),
      description: t('itemWizard.details.question'),
      validate: () =>
        !state.nameEn.trim() && !state.nameAr.trim()
          ? t('itemWizard.details.needName')
          : priceH <= 0
            ? t('itemWizard.details.needPrice')
            : null,
      content: (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('catalog.form.nameEn')} required>
              <Input value={state.nameEn} dir="ltr" autoFocus placeholder={state.type === 'combo' ? 'Classic Burger Meal' : 'Cappuccino'} onChange={(e) => set('nameEn', e.target.value)} />
            </FormField>
            <FormField label={t('catalog.form.nameAr')} hint={t('itemWizard.details.arHint')}>
              <Input value={state.nameAr} dir="rtl" placeholder={state.type === 'combo' ? 'وجبة برجر كلاسيك' : 'كابتشينو'} onChange={(e) => set('nameAr', e.target.value)} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={state.type === 'combo' ? t('itemWizard.details.mealPrice') : t('catalog.form.sellingPrice')} required hint={t('itemWizard.details.priceHint')}>
              <PriceInput value={state.price} placeholder="0.00" onChange={(e) => set('price', e.target.value)} />
            </FormField>
            <FormField label={t('catalog.form.category')}>
              <Select value={state.categoryId} options={categoryOptions} onChange={(v) => set('categoryId', v)} />
            </FormField>
          </div>
          {state.type !== 'combo' && (
            <FormField label={t('catalog.form.costPrice')} showOptional
              hint={margin === null ? t('itemWizard.details.costHint') : t('catalog.form.marginHint', { margin: formatPercent(margin, { language }) })}>
              <PriceInput value={state.cost} placeholder="0.00" onChange={(e) => set('cost', e.target.value)} />
            </FormField>
          )}
          <FormField label={t('catalog.form.descriptionLabel')} showOptional>
            <Textarea rows={2} value={state.description} onChange={(e) => set('description', e.target.value)} />
          </FormField>
        </div>
      ),
    },
    state.type === 'combo'
      ? {
          id: 'contents',
          title: t('itemWizard.steps.contents'),
          description: t('itemWizard.combo.question'),
          validate: () =>
            state.slots.length === 0
              ? t('itemWizard.combo.needPart')
              : state.slots.some((s) => !s.defaultItemId)
                ? t('itemWizard.combo.needItem')
                : null,
          content: <ComboContentsEditor value={state.slots} onChange={(v) => set('slots', v)} catalog={catalog.filter((c) => c.id !== item?.id)} ingredients={ingredients} priceH={priceH} />,
        }
      : state.type === 'service'
        ? {
            id: 'service',
            title: t('itemWizard.steps.service'),
            content: (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={t('catalog.form.duration')} hint={t('catalog.form.durationHint')} showOptional>
                  <Input type="number" min="0" step="5" dir="ltr" value={state.duration} onChange={(e) => set('duration', e.target.value)} placeholder="30" />
                </FormField>
                <FormField label={t('catalog.form.provider')} showOptional>
                  <Select value={state.providerId} onChange={(v) => set('providerId', v)}
                    options={[{ value: '', label: t('catalog.form.noProvider') }, ...staff.map((m) => ({ value: m.id, label: `${name(m)} — ${m.role}` }))]} />
                </FormField>
              </div>
            ),
          }
        : {
            id: 'stock',
            title: t('itemWizard.steps.stock'),
            description: t('itemWizard.stock.question'),
            validate: () =>
              state.trackInventory && !item && !(Number(state.stockQuantity) > 0)
                  ? t('itemWizard.stock.needStock')
                  : null,
            content: (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label={t('catalog.form.sku')} showOptional hint={t('itemWizard.stock.skuHint')}>
                    <div className="flex gap-2">
                      <Input value={state.sku} dir="ltr" onChange={(e) => set('sku', e.target.value)} placeholder="HOT-CAP" />
                      <button type="button" onClick={() => set('sku', suggestSku(state, categories))}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-ink-200 px-3 text-sm font-medium text-ink-700 hover:border-ink-900">
                        <RefreshCw className="h-3.5 w-3.5" /> {t('itemWizard.stock.generate')}
                      </button>
                    </div>
                  </FormField>
                  <FormField label={t('catalog.form.barcode')} showOptional hint={t('itemWizard.stock.barcodeHint')}>
                    <Input value={state.barcode} dir="ltr" inputMode="numeric" onChange={(e) => set('barcode', e.target.value)} placeholder="6281000000011" />
                  </FormField>
                </div>
                <div className="rounded-lg border border-ink-200 bg-ink-50/60 p-4">
                  <Switch checked={state.trackInventory} onCheckedChange={(on) => set('trackInventory', on)}
                    label={t('catalog.form.trackInventory')} description={t('itemWizard.stock.trackHint')} />
                  {state.trackInventory && (
                    <div className="mt-4 grid gap-4 border-t border-ink-200 pt-4 sm:grid-cols-3">
                      <FormField label={t('catalog.form.openingStock')}>
                        <Input type="number" min="0" dir="ltr" placeholder="50" value={state.stockQuantity} onChange={(e) => set('stockQuantity', e.target.value)} />
                      </FormField>
                      <FormField label={t('itemWizard.stock.alertAt')}>
                        <Input type="number" min="0" dir="ltr" value={state.minStockLevel} onChange={(e) => set('minStockLevel', e.target.value)} />
                      </FormField>
                      <FormField label={t('catalog.form.unit')}>
                        <Select value={state.unit} onChange={(v) => set('unit', v as UnitOfMeasure)} options={UNITS.map((u) => ({ value: u, label: u }))} />
                      </FormField>
                    </div>
                  )}
                </div>
                <FormField label={t('catalog.form.vendor')} showOptional>
                  <Select value={state.vendorId} onChange={(v) => set('vendorId', v)}
                    options={[{ value: '', label: t('catalog.form.noVendor') }, ...vendors.map((v) => ({ value: v.id, label: name(v) }))]} />
                </FormField>
              </div>
            ),
          },
    ...(state.type === 'product'
      ? [{
          id: 'recipe',
          title: t('itemWizard.steps.recipe'),
          badge: state.recipe.filter((r) => r.ingredientId).length,
          description: t('itemWizard.recipe.question'),
          validate: () => (state.recipe.some((r) => !r.ingredientId) ? t('itemWizard.recipe.incomplete') : null),
          content: <RecipeEditor value={state.recipe} onChange={(v) => set('recipe', v)} ingredients={ingredients} priceH={priceH} />,
        } satisfies WizardStep]
      : []),
    {
      id: 'options',
      title: t('itemWizard.steps.options'),
      badge: state.groups.length,
      description: state.type === 'combo' ? t('itemWizard.options.comboQuestion') : t('itemWizard.options.question'),
      validate: () => (groupProblems(state.groups) ? t('itemWizard.options.incomplete') : null),
      content: (
        <OptionGroupsEditor value={state.groups} onChange={(v) => set('groups', v)} ingredients={ingredients}
          items={catalog.filter((c) => c.id !== item?.id)} recipe={recipeFromDraft(state.recipe)} />
      ),
    },
    {
      id: 'review',
      title: t('itemWizard.steps.review'),
      description: t('itemWizard.review.question'),
      content: (
        <div className="grid gap-5 md:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="space-y-4">
            <div>
              <p className="eyebrow mb-2">{t('itemWizard.review.onTill')}</p>
              <TilePreview state={state} name={state.nameEn || state.nameAr} ar={state.nameAr || state.nameEn} language={language} price={money(priceH)} />
            </div>
            {whereControls}
          </div>
          {state.type === 'combo' ? (
            /* A meal reads best as what's in it: four facts on top, then the nested parts. */
            <div className="min-w-0 space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  [t('catalog.form.nameEn'), state.nameEn || '—'],
                  [t('catalog.form.nameAr'), state.nameAr || '—'],
                  [t('itemWizard.details.mealPrice'), money(priceH)],
                  [t('itemWizard.combo.saves'), money(Math.max(0, state.slots.reduce((sum, sl) => sum + (catalog.find((c) => c.id === sl.defaultItemId)?.priceH ?? 0) * sl.quantity, 0) - priceH))],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-ink-200 px-3 py-2">
                    <p className="truncate text-2xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
                    <p className="numeric mt-0.5 truncate text-sm font-semibold text-ink-900">{value}</p>
                  </div>
                ))}
              </div>
              <ComboReview slots={state.slots} catalog={catalog} ingredients={ingredients} />
            </div>
          ) : (
          <dl className="divide-y divide-ink-200 rounded-lg border border-ink-200 px-4">
            <ReviewRow label={t('itemWizard.review.type')} value={t(`itemWizard.type.${state.type}.title`)} />
            <ReviewRow label={t('catalog.form.nameEn')} value={state.nameEn || '—'} />
            <ReviewRow label={t('catalog.form.nameAr')} value={state.nameAr || '—'} />
            <ReviewRow label={t('catalog.form.sellingPrice')} value={money(priceH)} />
            <ReviewRow label={t('catalog.form.category')} value={categories.find((c) => c.id === state.categoryId) ? name(categories.find((c) => c.id === state.categoryId)!) : '—'} muted={!state.categoryId} />
            {state.type === 'product' && <ReviewRow label={t('catalog.form.sku')} value={state.sku || '—'} />}
            {state.type === 'product' && (
              <ReviewRow label={t('itemWizard.steps.recipe')}
                value={state.recipe.length ? t('itemWizard.recipe.summary', { count: String(state.recipe.length), cost: money(recipeCostH(recipeFromDraft(state.recipe), ingredients)) }) : t('itemWizard.review.noOptions')}
                muted={state.recipe.length === 0} />
            )}
            <ReviewRow label={t('itemWizard.steps.options')}
              value={state.groups.length ? fromDraft(state.groups, ingredients, catalog).map((g) => `${name(g)} (${g.options.length})`).join(', ') : t('itemWizard.review.noOptions')}
              muted={state.groups.length === 0} />
            <ReviewRow label={t('itemWizard.review.kitchen')} value={state.requiresPreparation ? t('common.yes') : t('common.no')} />
          </dl>
          )}
          {serverError && <p role="alert" className="text-sm text-danger-600 md:col-span-2">{serverError}</p>}
        </div>
      ),
    },
  ];

  /* Combos: name, price and contents on one screen, no separate options step —
     three steps in all. Parts keep their own options (Large fries) anyway. */
  const flow: WizardStep[] = (() => {
    if (state.type !== 'combo') return steps;
    const details = steps.find((x) => x.id === 'details')!;
    const contents = steps.find((x) => x.id === 'contents')!;
    const meal: WizardStep = {
      id: 'meal',
      title: t('itemWizard.steps.meal'),
      description: t('itemWizard.combo.mealQuestion'),
      badge: state.slots.length,
      validate: () => details.validate?.() ?? contents.validate?.() ?? null,
      content: (
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="space-y-3">
            <FormField label={t('catalog.form.nameEn')} required>
              <Input value={state.nameEn} dir="ltr" autoFocus placeholder="Classic Burger Meal" onChange={(e) => set('nameEn', e.target.value)} />
            </FormField>
            <FormField label={t('catalog.form.nameAr')} hint={t('itemWizard.details.arHint')}>
              <Input value={state.nameAr} dir="rtl" placeholder="وجبة برجر كلاسيك" onChange={(e) => set('nameAr', e.target.value)} />
            </FormField>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
              <FormField label={t('itemWizard.details.mealPrice')} required>
                <PriceInput value={state.price} placeholder="0.00" onChange={(e) => set('price', e.target.value)} />
              </FormField>
              <FormField label={t('catalog.form.category')}>
                <Select value={state.categoryId} options={categoryOptions} onChange={(v) => set('categoryId', v)} />
              </FormField>
            </div>
          </div>
          <div className="min-w-0">{contents.content}</div>
        </div>
      ),
    };
    return [steps[0], meal, ...steps.filter((x) => x.id === 'review')];
  })();

  async function finish() {
    setSaving(true);
    setServerError(null);
    try {
      /* Combos never ask for a code; give them a readable one so search and reports still work. */
      const ready = state.type === 'combo' && !state.sku.trim() ? { ...state, sku: suggestSku(state, categories) } : state;
      const ok = await onSubmit(toInput(ready, ingredients, catalog));
      if (ok) onClose();
    } catch (error) {
      const failure = error as { message?: string; fieldErrors?: Record<string, string[]> };
      setServerError(Object.values(failure.fieldErrors ?? {})[0]?.[0] ?? failure.message ?? 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-modal flex items-end justify-center sm:items-center">
      <div aria-hidden className="absolute inset-0 animate-fade-in bg-ink-900/40 backdrop-blur-[2px]" onClick={() => !saving && onClose()} />
      <div role="dialog" aria-modal="true" aria-label={item ? t('catalog.editItem') : t('catalog.newItem')}
        className="relative flex h-[92svh] w-full flex-col rounded-t-2xl border border-ink-200 bg-surface shadow-overlay animate-scale-in sm:h-[85vh] sm:min-h-[34rem] sm:w-[85vw] sm:min-w-[40rem] sm:rounded-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-ink-200 px-4 py-2.5">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">{item ? t('catalog.editItem') : t('itemWizard.title')}</h2>
            <p className="text-sm text-ink-500">{item ? name(item) : t('itemWizard.subtitle')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')} disabled={saving}
            className="grid h-10 w-10 place-items-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-900">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 px-4 py-3">
          <Wizard steps={flow} currentIndex={Math.min(step, flow.length - 1)} onStepChange={setStep}
            onComplete={() => void finish()} onCancel={onClose} submitting={saving}
            completeLabel={item ? t('common.saveChanges') : t('itemWizard.review.create')}
            completeHint={state.showOnPos ? t('itemWizard.review.saveHintPos') : t('itemWizard.review.saveHint')} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The item as the cashier will see it, ribbon and all. */
function TilePreview({ state, name, ar, language, price }: { state: State; name: string; ar: string; language: string; price: string }) {
  const combo = state.type === 'combo';
  const customisable = combo || state.groups.length > 0;
  const Icon = combo ? Layers : state.type === 'service' ? Wrench : Box;
  return (
    <div className="relative flex h-[8.5rem] w-full flex-col justify-between overflow-hidden rounded-md border border-ink-200 bg-surface p-2.5 shadow-sm">
      {customisable && (
        <span className="pointer-events-none absolute end-0 top-0 h-9 w-9">
          <span aria-hidden className={cn('absolute -end-[1.15rem] -top-[1.15rem] h-[2.3rem] w-[2.3rem] rotate-45', combo ? 'bg-amber-400' : 'bg-ink-900')} />
          {combo ? <Layers className="absolute end-[3px] top-[3px] h-3 w-3 text-ink-900" /> : <SlidersHorizontal className="absolute end-[3px] top-[3px] h-3 w-3 text-ink-50" />}
        </span>
      )}
      <span className={cn('flex h-7 w-7 items-center justify-center rounded', combo ? 'bg-amber-100 text-amber-800' : 'bg-ink-100 text-ink-600')}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="line-clamp-2 text-sm font-medium text-ink-900">{(language === 'ar' ? ar : name) || '—'}</span>
      <span className="numeric text-sm font-semibold text-ink-900">{price}</span>
    </div>
  );
}
