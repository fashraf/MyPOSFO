import { Bike, Car, ChefHat, HandPlatter, Package, ShoppingBag, Utensils, type LucideIcon } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import type { SaleOrderType } from '@/types/sales';
import type { KitchenRoute } from '@/types/settings';

export const ORDER_TYPE_ICON: Record<SaleOrderType, LucideIcon> = {
  dine_in: Utensils,
  takeaway: ShoppingBag,
  delivery: Bike,
  drive_thru: Car,
  other: Package,
};

/**
 * Dine-in / takeaway / delivery… picked before charging. Under each choice a
 * small line says where the order will go, so the cashier is never surprised
 * that a delivery order did not reach the kitchen.
 */
export function OrderTypePicker({
  value,
  onChange,
  types,
  routing,
}: {
  value: SaleOrderType;
  onChange: (type: SaleOrderType) => void;
  types: SaleOrderType[];
  routing: Record<SaleOrderType, KitchenRoute>;
}) {
  const { t } = useTranslation();
  const route = routing[value] ?? 'kitchen';
  return (
    <div className="mb-2 rounded-lg border border-ink-200 bg-surface p-1.5" data-testid="order-type-picker">
      <div role="radiogroup" aria-label={t('orders.typeLabel')} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${types.length}, minmax(0, 1fr))` }}>
        {types.map((type) => {
          const Icon = ORDER_TYPE_ICON[type];
          const active = type === value;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`order-type-${type}`}
              onClick={() => onChange(type)}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-xs font-medium transition-colors',
                active ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100',
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{t(`kitchen.orderType.${type}`)}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1 flex items-center gap-1 px-1 text-[11px] text-ink-500" data-testid="order-route-hint">
        {route === 'kitchen' ? <ChefHat className="h-3 w-3" /> : route === 'collection' ? <HandPlatter className="h-3 w-3" /> : <Package className="h-3 w-3" />}
        {t(`orders.routeHint.${route}`)}
      </p>
    </div>
  );
}
