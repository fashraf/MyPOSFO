import { useEffect, useRef } from 'react';
import { ListChecks, MinusCircle, PlusCircle, Ruler, Trash2, type LucideIcon } from 'lucide-react';
import { Button, Input, PriceInput, Select, Switch } from '@/components/ui';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { fromMinorUnits, toMinorUnits } from '@/lib/format';
import {
  GROUP_PRESETS,
  PREFERENCE_PRESETS,
  SCALES,
  SIZE_PRESETS,
  extraName,
  findPreset,
  removeName,
} from '@/lib/optionPresets';
import type { CatalogItem, ModifierGroup, ModifierKind } from '@/types/catalog';
import type { Ingredient, RecipeLine } from '@/types/ingredients';

let counter = 0;
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;

type Source = 'size' | 'ingredient' | 'item' | 'preference' | 'legacy';

export interface OptionDraft {
  id: string;
  source: Source;
  key?: string;
  ingredientId?: string;
  itemId?: string;
  replacesIngredientId?: string;
  price: string;
  quantity: string;
  scale: number;
  legacy?: { ar: string; en: string };
}

export interface GroupDraft {
  id: string;
  kind: ModifierKind;
  nameKey: string;
  legacyName?: { ar: string; en: string };
  required: boolean;
  multiple: boolean;
  options: OptionDraft[];
}

const KIND_ICON: Record<ModifierKind, LucideIcon> = { size: Ruler, remove: MinusCircle, extra: PlusCircle, choice: ListChecks };
const KIND_DEFAULT: Record<ModifierKind, { nameKey: string; required: boolean; multiple: boolean }> = {
  size: { nameKey: 'size', required: true, multiple: false },
  remove: { nameKey: 'remove', required: false, multiple: true },
  extra: { nameKey: 'extras', required: false, multiple: true },
  choice: { nameKey: 'choose', required: false, multiple: false },
};

/* ---- Converting to and from stored groups -------------------------------- */

function guessKind(group: ModifierGroup): ModifierKind {
  if (group.kind) return group.kind;
  const en = group.nameEn.toLowerCase();
  if (en.includes('size')) return 'size';
  if (en.includes('remove') || group.options.every((o) => /^no /i.test(o.nameEn))) return 'remove';
  if (en.includes('extra')) return 'extra';
  return 'choice';
}

export function toDraft(groups: ModifierGroup[] | undefined): GroupDraft[] {
  return (groups ?? []).map((group) => {
    const kind = guessKind(group);
    const preset = findPreset(GROUP_PRESETS, group.nameEn);
    return {
      id: group.id,
      kind,
      nameKey: preset?.key ?? 'legacy',
      legacyName: preset ? undefined : { ar: group.nameAr, en: group.nameEn },
      required: group.required,
      multiple: group.multiple,
      options: group.options.map((o) => {
        const base = { id: o.id, price: o.priceDeltaH ? fromMinorUnits(o.priceDeltaH) : '', quantity: o.quantity ? String(o.quantity) : '1', scale: o.scale ?? 1 };
        const size = kind === 'size' ? SIZE_PRESETS.find((p) => p.en.toLowerCase() === o.nameEn.trim().toLowerCase()) : undefined;
        if (size) return { ...base, source: 'size' as const, key: size.key, scale: o.scale ?? size.scale };
        if (o.ingredientId) return { ...base, source: 'ingredient' as const, ingredientId: o.ingredientId, replacesIngredientId: o.replacesIngredientId };
        if (o.itemId) return { ...base, source: 'item' as const, itemId: o.itemId };
        const pref = findPreset(PREFERENCE_PRESETS, o.nameEn);
        if (pref) return { ...base, source: 'preference' as const, key: pref.key };
        return { ...base, source: 'legacy' as const, legacy: { ar: o.nameAr, en: o.nameEn } };
      }),
    };
  });
}

export function fromDraft(groups: GroupDraft[], ingredients: Ingredient[], items: CatalogItem[]): ModifierGroup[] {
  const ing = new Map(ingredients.map((i) => [i.id, i]));
  const itm = new Map(items.map((i) => [i.id, i]));
  return groups.map((g) => {
    const preset = GROUP_PRESETS.find((p) => p.key === g.nameKey);
    return {
      id: g.id,
      kind: g.kind,
      nameEn: preset?.en ?? g.legacyName?.en ?? 'Options',
      nameAr: preset?.ar ?? g.legacyName?.ar ?? 'خيارات',
      required: g.required,
      multiple: g.multiple,
      options: g.options.flatMap((o) => {
        const priceDeltaH = toMinorUnits(o.price || '0');
        if (o.source === 'size') {
          const s = SIZE_PRESETS.find((p) => p.key === o.key);
          return s ? [{ id: o.id, nameEn: s.en, nameAr: s.ar, priceDeltaH, scale: o.scale }] : [];
        }
        if (o.source === 'ingredient') {
          const i = o.ingredientId ? ing.get(o.ingredientId) : undefined;
          if (!i) return [];
          const name = g.kind === 'remove' ? removeName(i) : g.kind === 'extra' ? extraName(i) : { en: i.nameEn, ar: i.nameAr };
          return [{
            id: o.id, nameEn: name.en, nameAr: name.ar, priceDeltaH, ingredientId: i.id,
            ...(g.kind === 'remove' ? {} : { quantity: Number(o.quantity) || 1 }),
            ...(o.replacesIngredientId ? { replacesIngredientId: o.replacesIngredientId } : {}),
          }];
        }
        if (o.source === 'item') {
          const it = o.itemId ? itm.get(o.itemId) : undefined;
          return it ? [{ id: o.id, nameEn: it.nameEn, nameAr: it.nameAr, priceDeltaH, itemId: it.id }] : [];
        }
        if (o.source === 'preference') {
          const p = PREFERENCE_PRESETS.find((x) => x.key === o.key);
          return p ? [{ id: o.id, nameEn: p.en, nameAr: p.ar, priceDeltaH }] : [];
        }
        return o.legacy ? [{ id: o.id, nameEn: o.legacy.en, nameAr: o.legacy.ar, priceDeltaH }] : [];
      }),
    };
  });
}

/** A group is complete when it has at least one choice and every row has picked something. */
export function groupProblems(groups: GroupDraft[]): boolean {
  return groups.some(
    (g) =>
      g.options.length === 0 ||
      g.options.some((o) =>
        o.source === 'ingredient' ? !o.ingredientId : o.source === 'item' ? !o.itemId : o.source === 'preference' || o.source === 'size' ? !o.key : false,
      ),
  );
}

/* ---- Editor -------------------------------------------------------------- */

/**
 * "What can the customer change?"
 *
 * Four kinds of group, each with the picker that fits it:
 * - Size: tap the sizes; set the extra price and how much more of the recipe it uses.
 * - Remove: tap ingredients from this item's recipe ("No onion" is named for you).
 * - Extras: pick ingredients and how much each adds ("Extra cheddar slice").
 * - Choose one: pick ingredients (oat milk instead of full cream), items, or
 *   preferences (Spicy, No sugar).
 */
export function OptionGroupsEditor({
  value, onChange, ingredients, items, recipe,
}: {
  value: GroupDraft[];
  onChange: (next: GroupDraft[]) => void;
  ingredients: Ingredient[];
  items: CatalogItem[];
  recipe: RecipeLine[];
}) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const ar = language === 'ar';
  const nm = (e: { nameAr: string; nameEn: string }) => (ar ? e.nameAr : e.nameEn);
  const pn = (p: { ar: string; en: string }) => (ar ? p.ar : p.en);

  const endRef = useRef<HTMLDivElement>(null);
  const count = useRef(value.length);
  useEffect(() => {
    if (value.length > count.current) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    count.current = value.length;
  }, [value.length]);

  const ingredientOptions = ingredients.filter((i) => i.status === 'active').map((i) => ({ value: i.id, label: `${nm(i)} · ${t(`ingredients.units.${i.unit}`)}` }));
  const recipeIngredients = recipe.map((l) => ingredients.find((i) => i.id === l.ingredientId)).filter((i): i is Ingredient => Boolean(i));
  const itemOptions = items.filter((i) => i.status === 'active' && !i.combo).map((i) => ({ value: i.id, label: nm(i) }));

  const update = (id: string, patch: Partial<GroupDraft>) => onChange(value.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const updateOption = (gid: string, oid: string, patch: Partial<OptionDraft>) =>
    onChange(value.map((g) => (g.id === gid ? { ...g, options: g.options.map((o) => (o.id === oid ? { ...o, ...patch } : o)) } : g)));
  const addOption = (gid: string, option: Partial<OptionDraft> & { source: Source }) =>
    onChange(value.map((g) => (g.id === gid ? { ...g, options: [...g.options, { id: uid('mo'), price: '', quantity: '1', scale: 1, ...option }] } : g)));
  const removeOption = (gid: string, oid: string) =>
    onChange(value.map((g) => (g.id === gid ? { ...g, options: g.options.filter((o) => o.id !== oid) } : g)));

  const addGroup = (kind: ModifierKind) => onChange([...value, { id: uid('mg'), kind, ...KIND_DEFAULT[kind], options: [] }]);

  return (
    <div className="space-y-3">
      {/* Add a group: four small buttons, one line. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium text-ink-700">{t('itemWizard.options.addGroup')}</span>
        {(['size', 'remove', 'extra', 'choice'] as ModifierKind[]).map((kind) => {
          const Icon = KIND_ICON[kind];
          return (
            <button key={kind} type="button" onClick={() => addGroup(kind)} data-tip={t(`itemWizard.options.kinds.${kind}.hint`)}
              className="inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-full border border-ink-200 bg-surface px-3 text-sm font-medium text-ink-700 hover:border-info-300 hover:text-info-700">
              <Icon className="h-3.5 w-3.5 text-info-600" />
              {t(`itemWizard.options.kinds.${kind}.title`)}
            </button>
          );
        })}
      </div>

      {value.length === 0 && (
        <p className="rounded-lg border border-dashed border-ink-300 bg-ink-50 p-4 text-center text-sm text-ink-500">{t('itemWizard.options.none')}</p>
      )}

      {value.map((g, index) => {
        const Icon = KIND_ICON[g.kind];
        const groupNames = [
          ...GROUP_PRESETS.map((p) => ({ value: p.key, label: pn(p) })),
          ...(g.legacyName ? [{ value: 'legacy', label: ar ? g.legacyName.ar : g.legacyName.en }] : []),
        ];
        return (
          <div key={g.id} className="rounded-lg border border-ink-200 bg-surface p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="numeric grid h-6 w-6 shrink-0 place-items-center rounded-full bg-info-50 text-2xs font-semibold text-info-700">{index + 1}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700">
                <Icon className="h-3.5 w-3.5" /> {t(`itemWizard.options.kinds.${g.kind}.title`)}
              </span>
              <Select className="w-48" value={g.nameKey} onChange={(nameKey) => update(g.id, { nameKey })} options={groupNames} aria-label={t('itemWizard.options.groupName')} />
              <span className="flex-1" />
              <Button variant="ghost" size="icon" aria-label={t('itemWizard.options.deleteGroup')} onClick={() => onChange(value.filter((x) => x.id !== g.id))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {g.kind === 'choice' && (
              <div className="mt-3">
                <Switch checked={g.required} onCheckedChange={(on) => update(g.id, { required: on })}
                  label={t('itemWizard.options.required')} description={t('itemWizard.options.requiredHint')} />
              </div>
            )}

            <div className="mt-2 space-y-2">
              {/* SIZE: tap preset sizes */}
              {g.kind === 'size' && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {SIZE_PRESETS.map((s) => {
                      const on = g.options.some((o) => o.key === s.key);
                      return (
                        <Chip key={s.key} on={on} onClick={() => on
                          ? onChange(value.map((x) => (x.id === g.id ? { ...x, options: x.options.filter((o) => o.key !== s.key) } : x)))
                          : addOption(g.id, { source: 'size', key: s.key, scale: s.scale })}>
                          {pn(s)}
                        </Chip>
                      );
                    })}
                  </div>
                  {g.options.length > 0 && (
                    <Rows head={[t('itemWizard.options.choice'), t('itemWizard.options.extra'), t('itemWizard.options.recipeAmount')]}>
                      {[...g.options].sort((a, b) => SIZE_PRESETS.findIndex((p) => p.key === a.key) - SIZE_PRESETS.findIndex((p) => p.key === b.key)).map((o) => {
                        const s = SIZE_PRESETS.find((p) => p.key === o.key);
                        return (
                          <Row key={o.id} onDelete={() => removeOption(g.id, o.id)} deleteLabel={t('common.delete')}>
                            <span className="text-sm font-medium text-ink-900">{s ? pn(s) : o.legacy ? pn(o.legacy) : '—'}</span>
                            <PriceInput value={o.price} placeholder="0.00" onChange={(e) => updateOption(g.id, o.id, { price: e.target.value })} />
                            <Select value={String(o.scale)} onChange={(v) => updateOption(g.id, o.id, { scale: Number(v) })}
                              options={SCALES.map((x) => ({ value: String(x), label: `× ${x}` }))} />
                          </Row>
                        );
                      })}
                    </Rows>
                  )}
                </>
              )}

              {/* REMOVE: tap recipe ingredients */}
              {g.kind === 'remove' && (recipeIngredients.length === 0 ? (
                <p className="rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-800">{t('itemWizard.options.needRecipe')}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {recipeIngredients.map((i) => {
                    const on = g.options.some((o) => o.ingredientId === i.id);
                    return (
                      <Chip key={i.id} on={on} tone="danger" onClick={() => on
                        ? onChange(value.map((x) => (x.id === g.id ? { ...x, options: x.options.filter((o) => o.ingredientId !== i.id) } : x)))
                        : addOption(g.id, { source: 'ingredient', ingredientId: i.id })}>
                        {pn(removeName(i))}
                      </Chip>
                    );
                  })}
                </div>
              ))}

              {/* EXTRA: ingredient + amount + price */}
              {g.kind === 'extra' && (
                <>
                  {g.options.length > 0 && (
                    <Rows head={[t('itemWizard.options.ingredient'), t('itemWizard.options.amount'), t('itemWizard.options.extra')]}>
                      {g.options.map((o) => {
                        const i = ingredients.find((x) => x.id === o.ingredientId);
                        return (
                          <Row key={o.id} onDelete={() => removeOption(g.id, o.id)} deleteLabel={t('common.delete')}>
                            {o.source === 'legacy' ? <span className="text-sm text-ink-700">{o.legacy ? pn(o.legacy) : '—'}</span> : (
                              <Select value={o.ingredientId ?? ''} placeholder={t('itemWizard.options.pickIngredient')} options={ingredientOptions}
                                onChange={(ingredientId) => updateOption(g.id, o.id, { ingredientId })} />
                            )}
                            <div className="relative">
                              <Input type="number" min="0" dir="ltr" value={o.quantity} disabled={o.source === 'legacy'}
                                aria-label={t('itemWizard.options.amount')} className="pe-12"
                                onChange={(e) => updateOption(g.id, o.id, { quantity: e.target.value })} />
                              {i && <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">{t(`ingredients.units.${i.unit}`)}</span>}
                            </div>
                            <PriceInput value={o.price} placeholder="0.00" onChange={(e) => updateOption(g.id, o.id, { price: e.target.value })} />
                          </Row>
                        );
                      })}
                    </Rows>
                  )}
                  <Button variant="outline" size="sm" leadingIcon={<PlusCircle />} onClick={() => addOption(g.id, { source: 'ingredient' })}>
                    {t('itemWizard.options.addIngredient')}
                  </Button>
                </>
              )}

              {/* CHOICE: ingredient (optionally instead of a recipe ingredient), item, or preference */}
              {g.kind === 'choice' && (
                <>
                  {g.options.length > 0 && (
                    <div className="space-y-2">
                      {g.options.map((o) => (
                        <div key={o.id} className="grid items-center gap-2 rounded-lg border border-ink-100 bg-ink-50/50 p-2 sm:grid-cols-[1fr_1fr_8rem_2.25rem]">
                          {o.source === 'ingredient' ? (
                            <>
                              <Select value={o.ingredientId ?? ''} placeholder={t('itemWizard.options.pickIngredient')} options={ingredientOptions}
                                onChange={(ingredientId) => updateOption(g.id, o.id, { ingredientId })} />
                              <Select value={o.replacesIngredientId ?? ''} isClearable placeholder={t('itemWizard.options.insteadOf')}
                                options={recipeIngredients.map((i) => ({ value: i.id, label: `${t('itemWizard.options.instead')} ${nm(i)}` }))}
                                onChange={(v) => updateOption(g.id, o.id, { replacesIngredientId: v || undefined })} />
                            </>
                          ) : o.source === 'item' ? (
                            <>
                              <Select value={o.itemId ?? ''} placeholder={t('itemWizard.options.pickItem')} options={itemOptions}
                                onChange={(itemId) => updateOption(g.id, o.id, { itemId })} />
                              <span className="text-xs text-ink-400">{t('itemWizard.options.itemHint')}</span>
                            </>
                          ) : o.source === 'preference' ? (
                            <>
                              <Select value={o.key ?? ''} placeholder={t('itemWizard.options.pickPreference')}
                                options={PREFERENCE_PRESETS.map((p) => ({ value: p.key, label: pn(p) }))}
                                onChange={(key) => updateOption(g.id, o.id, { key })} />
                              <span className="text-xs text-ink-400">{t('itemWizard.options.preferenceHint')}</span>
                            </>
                          ) : (
                            <>
                              <span className="text-sm text-ink-700">{o.legacy ? pn(o.legacy) : '—'}</span>
                              <span className="text-xs text-ink-400">{t('itemWizard.options.legacyHint')}</span>
                            </>
                          )}
                          <PriceInput value={o.price} placeholder="0.00" onChange={(e) => updateOption(g.id, o.id, { price: e.target.value })} />
                          <Button variant="ghost" size="icon" aria-label={t('common.delete')} onClick={() => removeOption(g.id, o.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" leadingIcon={<PlusCircle />} onClick={() => addOption(g.id, { source: 'ingredient' })}>{t('itemWizard.options.addIngredient')}</Button>
                    <Button variant="outline" size="sm" leadingIcon={<PlusCircle />} onClick={() => addOption(g.id, { source: 'item' })}>{t('itemWizard.options.addItem')}</Button>
                    <Button variant="outline" size="sm" leadingIcon={<PlusCircle />} onClick={() => addOption(g.id, { source: 'preference' })}>{t('itemWizard.options.addPreference')}</Button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

function Chip({ on, onClick, children, tone }: { on: boolean; onClick: () => void; children: React.ReactNode; tone?: 'danger' }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn('min-h-[2.5rem] rounded-full border px-3.5 text-sm font-medium transition',
        on ? (tone === 'danger' ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-info-300 bg-info-50 text-info-700') : 'border-ink-200 text-ink-600 hover:border-ink-400')}>
      {children}
    </button>
  );
}

function Rows({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[1fr_8rem_8rem_2.25rem] gap-2 px-1 text-2xs font-medium uppercase tracking-wide text-ink-400 sm:grid">
        {head.map((h) => <span key={h}>{h}</span>)}
        <span />
      </div>
      {children}
    </div>
  );
}

function Row({ children, onDelete, deleteLabel }: { children: React.ReactNode; onDelete: () => void; deleteLabel: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_8rem_8rem_2.25rem]">
      {children}
      <Button variant="ghost" size="icon" aria-label={deleteLabel} onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}
