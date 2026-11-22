import { ChefHat, HandPlatter, Printer, Star } from 'lucide-react';
import { useTranslation, type TranslationKey } from '@/i18n';
import { cn } from '@/lib/cn';
import type { SaleOrderType } from '@/types/sales';
import type { KitchenRoute, ReceiptTiming } from '@/types/settings';
import { ORDER_TYPE_ICON } from './OrderTypePicker';

/**
 * Dine-in / takeaway / delivery as clean cards in the checkout's customer
 * column. Each card says where the order goes and when its bill prints, so the
 * cashier knows before pressing Place order.
 */
export function OrderTypeCards({
  value,
  onChange,
  types,
  routing,
  receiptTiming,
  defaultType,
}: {
  value: SaleOrderType;
  onChange: (type: SaleOrderType) => void;
  types: SaleOrderType[];
  routing: Record<SaleOrderType, KitchenRoute>;
  receiptTiming?: Partial<Record<SaleOrderType, ReceiptTiming>>;
  defaultType?: SaleOrderType;
}) {
  const { t } = useTranslation();
  const tk = (k: string) => t(k as TranslationKey);
  if (types.length <= 1) return null;
  const cols = types.length <= 4 ? types.length : 3;
  const route = routing[value] ?? 'kitchen';
  const timing = receiptTiming?.[value] ?? 'on_payment';
  return (
    <div className="shrink-0 space-y-1.5" data-testid="order-type-cards">
      <div className="text-xs font-medium text-ink-500">{t('orders.typeLabel')}</div>
      <div role="radiogroup" aria-label={t('orders.typeLabel')} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
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
                'relative flex min-h-[4rem] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center transition-colors active:scale-[0.98]',
                active ? 'border-ink-900 bg-ink-900 text-white shadow-sm' : 'border-ink-200 bg-surface text-ink-700 hover:border-ink-300 hover:bg-ink-50',
              )}
            >
              {defaultType === type && (
                <Star aria-label={t('orders.isDefault')} className={cn('absolute end-1.5 top-1.5 h-3 w-3', active ? 'fill-white/80 text-white/80' : 'fill-warning-400 text-warning-500')} />
              )}
              <Icon className="h-5 w-5" />
              <span className="w-full truncate text-xs font-semibold">{tk(`kitchen.orderType.${type}`)}</span>
            </button>
          );
        })}
      </div>
      {/* What the chosen type does — one calm line instead of text on every card. */}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-500" data-testid="order-type-effect">
        <span className="inline-flex items-center gap-1">
          {route === 'kitchen' ? <ChefHat className="h-3 w-3" /> : <HandPlatter className="h-3 w-3" />}
          {tk(`orders.cardRoute.${route}`)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Printer className="h-3 w-3" />
          {tk(`orders.cardBill.${timing}`)}
        </span>
      </p>
    </div>
  );
}
