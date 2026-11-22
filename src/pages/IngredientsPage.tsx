import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Carrot, PackageX, Plus, SlidersHorizontal, Wallet, X } from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  SearchInput,
  Select,
  SkeletonTable,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { formatQty, formatUnitCost } from '@/lib/recipes';
import { branchService, catalogService, ingredientService, safeCall, vendorService } from '@/services';
import { ALLERGENS, INGREDIENT_CATEGORIES, levelOf, stockAt } from '@/types/ingredients';
import type { Ingredient, IngredientInput, IngredientStockLevel } from '@/types/ingredients';
import type { CatalogItem, Vendor } from '@/types/catalog';
import type { Branch } from '@/types/permissions';
import { IngredientDetail } from '@/features/ingredients/IngredientDetail';
import { IngredientForm } from '@/features/ingredients/IngredientForm';

type SortKey = 'name' | 'stock' | 'value' | 'used';
type Level = 'all' | IngredientStockLevel;

const LEVEL_TONE = { ok: 'success', low: 'warning', out: 'danger' } as const;

/**
 * `/ingredients` — what dishes are made from.
 *
 * The four tiles answer the questions an owner opens this page with (how
 * many, what is running low, what has run out, how much is sitting on the
 * shelf) and each one is also a filter. The filter bar narrows by anything
 * that has a fixed answer; the grid sorts by clicking a column.
 */
export default function IngredientsPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();
  const { activeBranch, viewingAllBranches, can, user } = useSession();
  const branchId = viewingAllBranches ? null : activeBranch?.id ?? null;
  const ar = language === 'ar';
  const name = (e: { nameAr: string; nameEn: string }) => (ar ? e.nameAr : e.nameEn);
  const money = (h: number) => formatCurrency(Math.round(h), { language: language as 'en' | 'ar' });
  const actor = user ? name(user) : '—';
  const canEdit = can('inventory.adjust') || can('inventory.purchase_entry') || can('products.edit');

  const [rows, setRows] = useState<Ingredient[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState<Level>('all');
  const [vendor, setVendor] = useState('');
  const [allergen, setAllergen] = useState('');
  const [usage, setUsage] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });

  const [selected, setSelected] = useState<Ingredient | null>(null);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    const [i, c, v, b] = await Promise.all([
      safeCall(() => ingredientService.list()),
      safeCall(() => catalogService.list({ pageSize: 1000 })),
      safeCall(() => vendorService.list()),
      safeCall(() => branchService.list()),
    ]);
    if (i.ok) setRows(i.data);
    if (c.ok) setItems(c.data.items);
    if (v.ok) setVendors(v.data);
    if (b.ok) setBranches(b.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const usedCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) for (const line of item.recipe ?? []) counts.set(line.ingredientId, (counts.get(line.ingredientId) ?? 0) + 1);
    return counts;
  }, [items]);

  const tiles = useMemo(() => {
    const low = rows.filter((r) => levelOf(r, branchId) === 'low').length;
    const out = rows.filter((r) => levelOf(r, branchId) === 'out').length;
    const value = rows.reduce((sum, r) => sum + stockAt(r, branchId) * r.costPerUnitH, 0);
    return { total: rows.length, low, out, value };
  }, [rows, branchId]);

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const list = rows.filter((r) => {
      if (needle && !`${r.nameEn} ${r.nameAr}`.toLocaleLowerCase().includes(needle)) return false;
      if (category && r.category !== category) return false;
      if (level !== 'all' && levelOf(r, branchId) !== level) return false;
      if (vendor && r.vendorId !== vendor) return false;
      if (allergen && !r.allergens.includes(allergen as never)) return false;
      if (usage === 'used' && !usedCount.get(r.id)) return false;
      if (usage === 'unused' && usedCount.get(r.id)) return false;
      return true;
    });
    const key = (r: Ingredient) =>
      sort.key === 'name' ? name(r).toLocaleLowerCase()
      : sort.key === 'stock' ? stockAt(r, branchId) / Math.max(1, r.minStock)
      : sort.key === 'value' ? stockAt(r, branchId) * r.costPerUnitH
      : usedCount.get(r.id) ?? 0;
    return [...list].sort((a, b) => {
      const x = key(a), y = key(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, category, level, vendor, allergen, usage, sort, branchId, usedCount, language]);

  const activeFilters = [category, vendor, allergen, usage].filter(Boolean).length + (level !== 'all' ? 1 : 0);
  const clearFilters = () => {
    setCategory('');
    setLevel('all');
    setVendor('');
    setAllergen('');
    setUsage('');
    setSearch('');
  };

  async function submit(input: IngredientInput): Promise<Record<string, string> | null> {
    const result = await safeCall(() =>
      editing ? ingredientService.update(editing.id, input) : ingredientService.create(input, branchId ?? branches[0]?.id ?? null, actor),
    );
    if (result.ok) {
      toast.success(editing ? t('ingredients.toast.updated') : t('ingredients.toast.created'));
      await load();
      if (selected) setSelected(result.data);
      return null;
    }
    if (result.error.fieldErrors) return Object.fromEntries(Object.entries(result.error.fieldErrors).map(([k, v]) => [k, v[0]]));
    toast.error(t('ingredients.toast.failed'), result.error.message);
    return {};
  }

  async function adjust(action: 'receive' | 'waste' | 'count', quantity: number, note: string, branch: string) {
    if (!selected) return false;
    const result = await safeCall(() => ingredientService.adjust(selected.id, branch, action, quantity, note, actor));
    if (!result.ok) {
      toast.error(t('ingredients.toast.failed'), result.error.message);
      return false;
    }
    toast.success(t(`ingredients.toast.${action}`));
    setSelected(result.data);
    setRows((current) => current.map((r) => (r.id === result.data.id ? result.data : r)));
    return true;
  }

  const SortHead = ({ k, children, align }: { k: SortKey; children: string; align?: 'end' }) => (
    <TableHeaderCell align={align}>
      <button type="button" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : 1 }))}
        className="inline-flex items-center gap-1 uppercase tracking-[inherit] hover:text-ink-900">
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </TableHeaderCell>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('ingredients.title')}
        description={t('ingredients.description')}
        actions={canEdit ? (
          <Button leadingIcon={<Plus />} onClick={() => { setEditing(null); setFormOpen(true); }}>{t('ingredients.add')}</Button>
        ) : undefined}
      />

      {/* Tiles — also filters */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={Carrot} label={t('ingredients.tiles.total')} value={String(tiles.total)} active={level === 'all' && !activeFilters} onClick={clearFilters} />
        <Tile icon={AlertTriangle} label={t('ingredients.tiles.low')} value={String(tiles.low)} tone="warning" active={level === 'low'} onClick={() => setLevel(level === 'low' ? 'all' : 'low')} />
        <Tile icon={PackageX} label={t('ingredients.tiles.out')} value={String(tiles.out)} tone="danger" active={level === 'out'} onClick={() => setLevel(level === 'out' ? 'all' : 'out')} />
        <Tile icon={Wallet} label={branchId ? t('ingredients.tiles.valueHere') : t('ingredients.tiles.valueAll')} value={money(tiles.value)} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 bg-surface p-2.5">
        <div className="flex w-full gap-2 sm:w-auto">
          <SearchInput className="w-full sm:w-64" value={search} placeholder={t('ingredients.search')} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} />
          {/* Phones: filters fold away behind one button so the list stays in view. */}
          <button type="button" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}
            className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium sm:hidden',
              showFilters || activeFilters ? 'border-info-200 bg-info-50 text-info-700' : 'border-ink-200 text-ink-600')}>
            <SlidersHorizontal className="h-4 w-4" /> {activeFilters ? activeFilters : ''}
          </button>
        </div>
        <div className={cn('w-full flex-wrap items-center gap-2 sm:flex sm:w-auto', showFilters ? 'flex' : 'hidden')}>
        <Select className="w-full sm:w-44" value={category} onChange={setCategory} placeholder={t('ingredients.filters.category')} isClearable
          options={INGREDIENT_CATEGORIES.filter((c) => rows.some((r) => r.category === c)).map((c) => ({ value: c, label: t(`ingredients.categories.${c}`) }))} />
        <Select className="w-full sm:w-40" value={level === 'all' ? '' : level} onChange={(v) => setLevel((v || 'all') as Level)} placeholder={t('ingredients.filters.stock')} isClearable
          options={(['ok', 'low', 'out'] as const).map((l) => ({ value: l, label: t(`ingredients.level.${l}`) }))} />
        <Select className="w-full sm:w-48" value={vendor} onChange={setVendor} placeholder={t('ingredients.filters.supplier')} isClearable
          options={vendors.filter((v) => rows.some((r) => r.vendorId === v.id)).map((v) => ({ value: v.id, label: name(v) }))} />
        <Select className="w-full sm:w-40" value={allergen} onChange={setAllergen} placeholder={t('ingredients.filters.allergen')} isClearable
          options={ALLERGENS.map((a) => ({ value: a, label: t(`ingredients.allergenNames.${a}`) }))} />
        <Select className="w-full sm:w-44" value={usage} onChange={setUsage} placeholder={t('ingredients.filters.usage')} isClearable
          options={[{ value: 'used', label: t('ingredients.filters.used') }, { value: 'unused', label: t('ingredients.filters.unused') }]} />
        </div>
        {activeFilters > 0 && (
          <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-info-700 hover:bg-info-50">
            <X className="h-3.5 w-3.5" /> {t('ingredients.filters.clear', { count: String(activeFilters) })}
          </button>
        )}
        <span className="ms-auto text-xs text-ink-500">{t('ingredients.showing', { shown: String(visible.length), total: String(rows.length) })}</span>
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface"><SkeletonTable rows={6} columns={6} /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-300 bg-surface">
          <EmptyState icon={<Carrot />} title={t('ingredients.empty.title')} description={t('ingredients.empty.description')} />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-300 bg-surface">
          <EmptyState icon={<Carrot />} title={t('ingredients.empty.filtered')} description={t('ingredients.empty.filteredHint')}
            action={<Button variant="outline" onClick={clearFilters}>{t('ingredients.filters.clearAll')}</Button>} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <Table>
            <TableHead>
              <TableRow>
                <SortHead k="name">{t('ingredients.columns.name')}</SortHead>
                <TableHeaderCell>{t('ingredients.columns.category')}</TableHeaderCell>
                <SortHead k="stock">{branchId ? t('ingredients.columns.stockHere') : t('ingredients.columns.stockAll')}</SortHead>
                <TableHeaderCell>{t('ingredients.columns.status')}</TableHeaderCell>
                <TableHeaderCell align="end">{t('ingredients.columns.cost')}</TableHeaderCell>
                <SortHead k="value" align="end">{t('ingredients.columns.value')}</SortHead>
                <SortHead k="used" align="end">{t('ingredients.columns.usedIn')}</SortHead>
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((r) => {
                const lvl = levelOf(r, branchId);
                const qty = stockAt(r, branchId);
                const min = branchId ? r.minStock : r.minStock * Math.max(1, branches.length);
                const unit = t(`ingredients.units.${r.unit}`);
                return (
                  <TableRow key={r.id} interactive onClick={() => setSelected(r)}>
                    <TableCell>
                      <p className="font-medium text-ink-900">{name(r)}</p>
                      {r.allergens.length > 0 && (
                        <p className="mt-0.5 truncate text-2xs text-warning-700">{r.allergens.map((a) => t(`ingredients.allergenNames.${a}`)).join(' · ')}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-ink-600">{t(`ingredients.categories.${r.category}`)}</TableCell>
                    <TableCell>
                      <div className="w-40">
                        <p className="numeric text-sm font-medium text-ink-900">{formatQty(qty, unit, language)}</p>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                          <div className={cn('h-full rounded-full', lvl === 'out' ? 'bg-danger-500' : lvl === 'low' ? 'bg-warning-400' : 'bg-success-500')}
                            style={{ width: `${Math.min(100, (qty / Math.max(1, min * 3)) * 100)}%` }} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge tone={LEVEL_TONE[lvl]} dot>{t(`ingredients.level.${lvl}`)}</Badge></TableCell>
                    <TableCell align="end" className="numeric text-ink-600">{formatUnitCost(r.costPerUnitH, language)}<span className="text-ink-400"> / {unit}</span></TableCell>
                    <TableCell align="end" className="numeric font-medium text-ink-800">{money(qty * r.costPerUnitH)}</TableCell>
                    <TableCell align="end" className="numeric text-ink-600">{usedCount.get(r.id) ?? 0}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <IngredientDetail
        ingredient={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        branches={branches}
        branchId={branchId}
        items={items}
        canEdit={canEdit}
        onEdit={() => { setEditing(selected); setFormOpen(true); }}
        onAdjust={adjust}
      />
      <IngredientForm open={formOpen} onClose={() => setFormOpen(false)} ingredient={editing} vendors={vendors} onSubmit={submit} />
    </div>
  );
}

function Tile({ icon: Icon, label, value, tone, active, onClick }: {
  icon: typeof Carrot; label: string; value: string; tone?: 'warning' | 'danger'; active?: boolean; onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick, 'aria-pressed': active } : {})}
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-surface p-3.5 text-start transition',
        onClick && 'hover:shadow-sm',
        active ? 'border-info-300 ring-1 ring-info-200' : 'border-ink-200',
      )}
    >
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl',
        tone === 'danger' ? 'bg-danger-50 text-danger-600' : tone === 'warning' ? 'bg-warning-50 text-warning-600' : 'bg-info-50 text-info-600')}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="numeric block truncate text-lg font-semibold text-ink-900 sm:text-xl">{value}</span>
        <span className="block truncate text-xs text-ink-500">{label}</span>
      </span>
    </Tag>
  );
}
