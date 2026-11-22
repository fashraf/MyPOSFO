import { useEffect, useState } from 'react';
import { ArrowDownToLine, ClipboardCheck, Pencil, Trash2 } from 'lucide-react';
import { Badge, Button, Drawer, FormField, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { formatQty, formatUnitCost } from '@/lib/recipes';
import { useI18n, useTranslation } from '@/i18n';
import { ingredientService, safeCall } from '@/services';
import { levelOf, stockAt } from '@/types/ingredients';
import type { Ingredient, IngredientMovement } from '@/types/ingredients';
import type { CatalogItem } from '@/types/catalog';
import type { Branch } from '@/types/permissions';

type Action = 'receive' | 'waste' | 'count';

/**
 * Everything about one ingredient on one panel: how much is where, what it
 * goes into and what that costs, what happened to it recently, and the three
 * things people do with stock — receive, throw away, count.
 */
export function IngredientDetail({
  ingredient, open, onClose, branches, branchId, items, onEdit, onAdjust, canEdit,
}: {
  ingredient: Ingredient | null;
  open: boolean;
  onClose: () => void;
  branches: Branch[];
  branchId: string | null;
  items: CatalogItem[];
  onEdit: () => void;
  onAdjust: (action: Action, quantity: number, note: string, branchId: string) => Promise<boolean>;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const [movements, setMovements] = useState<IngredientMovement[]>([]);
  const [action, setAction] = useState<Action | null>(null);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !ingredient) return;
    setAction(null);
    void safeCall(() => ingredientService.movements(ingredient.id)).then((r) => r.ok && setMovements(r.data));
  }, [open, ingredient]);

  if (!ingredient) return null;
  const ar = language === 'ar';
  const name = (e: { nameAr: string; nameEn: string }) => (ar ? e.nameAr : e.nameEn);
  const unit = t(`ingredients.units.${ingredient.unit}`);
  const money = (h: number) => formatCurrency(Math.round(h), { language: language as 'en' | 'ar' });
  const level = levelOf(ingredient, branchId);
  const here = stockAt(ingredient, branchId);
  const usedIn = items
    .map((item) => ({ item, line: item.recipe?.find((l) => l.ingredientId === ingredient.id) }))
    .filter((x): x is { item: CatalogItem; line: NonNullable<typeof x.line> } => Boolean(x.line));
  const maxStock = Math.max(1, ...branches.map((b) => ingredient.stock[b.id] ?? 0), ingredient.minStock * 2);

  async function submit() {
    if (!action) return;
    setBusy(true);
    const ok = await onAdjust(action, Number(qty || 0), note, branchId ?? branches[0]?.id ?? '');
    setBusy(false);
    if (ok) {
      setAction(null);
      setQty('');
      setNote('');
      const r = await safeCall(() => ingredientService.movements(ingredient!.id));
      if (r.ok) setMovements(r.data);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      title={name(ingredient)}
      description={`${t(`ingredients.categories.${ingredient.category}`)} · ${t('ingredients.measuredIn', { unit })}`}
      footer={canEdit ? (
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="outline" leadingIcon={<Pencil />} onClick={onEdit}>{t('common.edit')}</Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" leadingIcon={<Trash2 />} onClick={() => setAction('waste')}>{t('ingredients.actions.waste')}</Button>
            <Button variant="outline" leadingIcon={<ClipboardCheck />} onClick={() => setAction('count')}>{t('ingredients.actions.count')}</Button>
            <Button leadingIcon={<ArrowDownToLine />} onClick={() => setAction('receive')}>{t('ingredients.actions.receive')}</Button>
          </div>
        </div>
      ) : undefined}
    >
      <div className="space-y-5">
        {/* Key numbers */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact label={branchId ? t('ingredients.onHandHere') : t('ingredients.onHandAll')} value={formatQty(here, unit, language)}
            tone={level === 'out' ? 'text-danger-600' : level === 'low' ? 'text-warning-600' : 'text-ink-900'} />
          <Fact label={t('ingredients.minStock')} value={formatQty(ingredient.minStock, unit, language)} />
          <Fact label={t('ingredients.costPer', { unit })} value={formatUnitCost(ingredient.costPerUnitH, language)} />
          <Fact label={t('ingredients.value')} value={money(here * ingredient.costPerUnitH)} />
        </div>

        {ingredient.allergens.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-ink-500">{t('ingredients.allergens')}:</span>
            {ingredient.allergens.map((a) => <Badge key={a} tone="warning">{t(`ingredients.allergenNames.${a}`)}</Badge>)}
          </div>
        )}

        {/* Quick stock action */}
        {action && (
          <div className="rounded-xl border border-info-100 bg-info-50/50 p-4">
            <p className="mb-3 text-sm font-semibold text-ink-900">{t(`ingredients.actionTitles.${action}`)}</p>
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
              <FormField label={action === 'count' ? t('ingredients.countedQty', { unit }) : t('ingredients.qty', { unit })}>
                <Input type="number" min="0" dir="ltr" autoFocus value={qty} onChange={(e) => setQty(e.target.value)} />
              </FormField>
              <FormField label={t('ingredients.note')} showOptional>
                <Input value={note} placeholder={t(`ingredients.notePlaceholder.${action}`)} onChange={(e) => setNote(e.target.value)} />
              </FormField>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setAction(null)}>{t('common.cancel')}</Button>
                <Button onClick={() => void submit()} loading={busy} disabled={qty === ''}>{t('common.save')}</Button>
              </div>
            </div>
          </div>
        )}

        {/* Stock by branch */}
        <section>
          <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-400">{t('ingredients.byBranch')}</h3>
          <ul className="space-y-2">
            {branches.map((b) => {
              const q = ingredient.stock[b.id] ?? 0;
              const lvl = levelOf(ingredient, b.id);
              return (
                <li key={b.id} className={cn('rounded-lg border p-2.5', b.id === branchId ? 'border-info-200 bg-info-50/40' : 'border-ink-200')}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-ink-800">{name(b)}</span>
                    <span className="numeric font-semibold text-ink-900">{formatQty(q, unit, language)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
                    <div className={cn('h-full rounded-full', lvl === 'out' ? 'bg-danger-500' : lvl === 'low' ? 'bg-warning-400' : 'bg-success-500')}
                      style={{ width: `${Math.min(100, (q / maxStock) * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Used in */}
        <section>
          <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-400">{t('ingredients.usedIn', { count: String(usedIn.length) })}</h3>
          {usedIn.length === 0 ? (
            <p className="rounded-lg border border-dashed border-ink-300 p-4 text-center text-sm text-ink-500">{t('ingredients.notUsed')}</p>
          ) : (
            <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
              {usedIn.map(({ item, line }) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-medium text-ink-800">{name(item)}</span>
                  <span className="flex shrink-0 items-center gap-3 text-ink-600">
                    <span className="numeric">{formatQty(line.quantity, unit, language)}</span>
                    <span className="numeric w-20 text-end text-xs text-ink-400">{money(line.quantity * ingredient.costPerUnitH)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* History */}
        <section>
          <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-400">{t('ingredients.history')}</h3>
          {movements.length === 0 ? (
            <p className="text-sm text-ink-500">{t('ingredients.noHistory')}</p>
          ) : (
            <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
              {movements.slice(0, 12).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium text-ink-800">{t(`ingredients.reasons.${m.reason}`)}</span>
                    <span className="block truncate text-xs text-ink-400">
                      {m.reference} · {branches.find((b) => b.id === m.branchId) ? name(branches.find((b) => b.id === m.branchId)!) : ''} · {new Date(m.at).toLocaleString(ar ? 'ar-SA' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </span>
                  <span className={cn('numeric shrink-0 font-semibold', m.change < 0 ? 'text-danger-600' : 'text-success-700')}>
                    {m.change > 0 ? '+' : ''}{formatQty(m.change, unit, language)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}

function Fact({ label, value, tone = 'text-ink-900' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-ink-200 p-3">
      <p className="text-2xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className={cn('numeric mt-1 text-md font-semibold', tone)}>{value}</p>
    </div>
  );
}
