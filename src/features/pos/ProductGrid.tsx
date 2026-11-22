import { Box, Layers, PackageOpen, SlidersHorizontal, Wrench } from 'lucide-react';
import { Badge, Button, EmptyState, LoadingState } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useI18n, useTranslation } from '@/i18n';
import { isCombo, isCustomisable, isProduct, stockLevelOf } from '@/types/catalog';
import { comboSavingH } from '@/lib/combo';
import type { CatalogItem } from '@/types/catalog';

export interface ProductGridProps {
  items: CatalogItem[];
  loading: boolean;
  /** True when a search term is narrowing the grid. */
  searching: boolean;
  quantityOf: (itemId: string) => number;
  onSelect: (item: CatalogItem) => void;
  onOpenCatalog: () => void;
  /** The full sellable catalog, for combo savings. */
  catalog: CatalogItem[];
}

export function ProductGrid({
  items,
  loading,
  searching,
  quantityOf,
  onSelect,
  onOpenCatalog,
  catalog,
}: ProductGridProps) {
  const { t } = useTranslation();
  const { language } = useI18n();

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {loading ? (
          <LoadingState className="py-20" />
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-300 bg-surface">
            <EmptyState
              icon={<PackageOpen />}
              title={searching ? t('pos.grid.noMatchTitle') : t('pos.grid.emptyTitle')}
              description={
                searching ? t('pos.grid.noMatchDescription') : t('pos.grid.emptyDescription')
              }
              action={
                searching ? undefined : (
                  <Button variant="outline" onClick={onOpenCatalog}>
                    {t('pos.grid.goToCatalog')}
                  </Button>
                )
              }
            />
          </div>
        ) : (
          /* 9rem minimum: two columns on a 360px phone, three on a 600px
             handheld, without any tile shrinking below a readable width. */
          <div
            className="grid gap-2 pb-1"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(9rem, 46%), 1fr))' }}
          >
            {items.map((item) => {
              const inCart = quantityOf(item.id);
              const level = stockLevelOf(item);
              const low = level === 'low_stock';
              const combo = isCombo(item);
              const customisable = isCustomisable(item);
              const saving = combo ? comboSavingH(item, catalog) : 0;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item)}
                  className={cn(
                    'group relative flex h-full flex-col justify-between gap-1.5 overflow-hidden rounded-md border bg-surface p-2.5 text-start transition-all',
                    'hover:border-ink-400 hover:shadow-sm active:scale-[0.97] active:bg-ink-50 touch:min-h-[7.5rem] touch:p-3',
                    inCart > 0 ? 'border-ink-900 ring-1 ring-ink-900' : 'border-ink-200',
                  )}
                >
                  {/* The ribbon: this item asks a question when tapped (size,
                      milk, a drink swap). A cashier learns to expect the sheet. */}
                  {customisable && (
                    <span
                      aria-label={combo ? t('posCombo.ribbonMeal') : t('posCombo.ribbonOptions')}
                      title={combo ? t('posCombo.ribbonMeal') : t('posCombo.ribbonOptions')}
                      className="pointer-events-none absolute end-0 top-0 h-9 w-9"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'absolute -end-[1.15rem] -top-[1.15rem] h-[2.3rem] w-[2.3rem] rotate-45',
                          combo ? 'bg-amber-400' : 'bg-ink-900',
                        )}
                      />
                      {combo ? (
                        <Layers aria-hidden className="absolute end-[3px] top-[3px] h-3 w-3 text-ink-900" />
                      ) : (
                        <SlidersHorizontal aria-hidden className="absolute end-[3px] top-[3px] h-3 w-3 text-ink-50" />
                      )}
                    </span>
                  )}

                  <span
                    aria-hidden
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded',
                      combo ? 'bg-amber-100 text-amber-800' : isProduct(item) ? 'bg-ink-100 text-ink-600' : 'bg-ink-900 text-ink-50',
                    )}
                  >
                    {combo ? <Layers className="h-3.5 w-3.5" /> : isProduct(item) ? <Box className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
                  </span>

                  <span className="min-w-0 space-y-0.5">
                    <span className="line-clamp-2 block text-sm font-medium leading-snug text-ink-900 touch:text-md touch:leading-snug">
                      {nameOf(item)}
                    </span>
                    {combo ? (
                      saving > 0 && (
                        <span className="block text-2xs font-medium text-success-700">
                          {t('posCombo.save', { amount: formatCurrency(saving, { language }) })}
                        </span>
                      )
                    ) : (
                      customisable && <span className="block text-2xs text-ink-500">{t('posModifiers.hasOptions')}</span>
                    )}
                    {low && isProduct(item) && (
                      <Badge tone="warning">
                        {t('pos.grid.lowStock', {
                          count: formatNumber(item.stockQuantity, { language }),
                        })}
                      </Badge>
                    )}
                  </span>

                  <span className="flex items-center justify-between gap-1">
                    <span className="numeric block text-sm font-semibold text-ink-900 touch:text-md">
                      {formatCurrency(item.priceH, { language })}
                    </span>
                    {inCart > 0 && (
                      <span
                        aria-label={t('pos.grid.inCart')}
                        className="numeric rounded-full bg-ink-900 px-1.5 py-0.5 text-2xs font-semibold text-ink-50 touch:px-2 touch:text-xs"
                      >
                        ×{inCart}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
