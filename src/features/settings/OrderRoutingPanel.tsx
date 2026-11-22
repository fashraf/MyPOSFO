import { ChefHat, HandPlatter, Ban, Receipt, CheckCheck } from 'lucide-react';
import { Card, CardBody, Switch } from '@/components/ui';
import { useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { ORDER_TYPE_ICON } from '@/features/pos/OrderTypePicker';
import type { SaleOrderType } from '@/types/sales';
import { ORDER_TYPES, type BranchSettings, type KitchenRoute, type ReceiptTiming } from '@/types/settings';

const TIMINGS: { timing: ReceiptTiming; icon: typeof ChefHat }[] = [
  { timing: 'on_payment', icon: Receipt },
  { timing: 'on_completion', icon: CheckCheck },
  { timing: 'never', icon: Ban },
];

const ROUTES: { route: KitchenRoute; icon: typeof ChefHat }[] = [
  { route: 'kitchen', icon: ChefHat },
  { route: 'collection', icon: HandPlatter },
  { route: 'none', icon: Ban },
];

/**
 * Settings & Tax → Orders & kitchen.
 *
 * Which order types the till offers, which one it starts on, and — per type —
 * where the order goes after payment. A delivery brand that packs from a
 * separate line can send delivery orders straight to Collection & dispatch,
 * or skip the kitchen entirely.
 */
export function OrderRoutingPanel({
  settings,
  onChange,
}: {
  settings: BranchSettings;
  onChange: (patch: Partial<BranchSettings>) => void;
}) {
  const { t } = useTranslation();
  const enabled = settings.enabledOrderTypes ?? [];

  const toggle = (type: SaleOrderType, on: boolean) => {
    const next = on ? [...enabled, type] : enabled.filter((x) => x !== type);
    const ordered = ORDER_TYPES.filter((x) => next.includes(x));
    onChange({
      enabledOrderTypes: ordered,
      ...(on || settings.defaultOrderType !== type ? {} : { defaultOrderType: ordered[0] ?? 'takeaway' }),
    });
  };

  return (
    <Card data-testid="order-routing">
      <CardBody className="space-y-3">
        <div>
          <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">{t('orders.title')}</h2>
          <p className="mt-1 text-xs text-ink-500">{t('orders.help')}</p>
        </div>

        <div className="divide-y divide-ink-100 rounded-lg border border-ink-200">
          {ORDER_TYPES.map((type) => {
            const Icon = ORDER_TYPE_ICON[type];
            const on = enabled.includes(type);
            const route = settings.kitchenRouting?.[type] ?? 'kitchen';
            return (
              <div key={type} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5', !on && 'bg-ink-50/60')} data-testid={`routing-${type}`}>
                <Icon className={cn('h-5 w-5', on ? 'text-ink-700' : 'text-ink-300')} />
                <div className="min-w-[8rem] flex-1">
                  <div className={cn('text-sm font-medium', on ? 'text-ink-900' : 'text-ink-400')}>{t(`kitchen.orderType.${type}`)}</div>
                  {on && settings.defaultOrderType === type && <div className="text-xs text-info-700">{t('orders.isDefault')}</div>}
                  {on && settings.defaultOrderType !== type && (
                    <button type="button" className="text-xs text-ink-500 underline hover:text-ink-800" onClick={() => onChange({ defaultOrderType: type })}>
                      {t('orders.makeDefault')}
                    </button>
                  )}
                </div>
                <div role="radiogroup" aria-label={t('orders.routeLabel', { type: t(`kitchen.orderType.${type}`) })} className={cn('flex gap-1 rounded-lg bg-ink-100 p-0.5', !on && 'pointer-events-none opacity-40')}>
                  {ROUTES.map(({ route: r, icon: RIcon }) => (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      aria-checked={route === r}
                      data-testid={`route-${type}-${r}`}
                      onClick={() => onChange({ kitchenRouting: { ...settings.kitchenRouting, [type]: r } })}
                      className={cn(
                        'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                        route === r ? 'bg-surface text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800',
                      )}
                    >
                      <RIcon className="h-3.5 w-3.5" />
                      {t(`orders.route.${r}`)}
                    </button>
                  ))}
                </div>
                <div role="radiogroup" aria-label={t('orders.billLabel', { type: t(`kitchen.orderType.${type}`) })} className={cn('flex gap-1 rounded-lg bg-ink-100 p-0.5', !on && 'pointer-events-none opacity-40')}>
                  {TIMINGS.map(({ timing: tm, icon: TIcon }) => (
                    <button
                      key={tm}
                      type="button"
                      role="radio"
                      aria-checked={(settings.receiptTiming?.[type] ?? 'on_payment') === tm}
                      data-testid={`bill-${type}-${tm}`}
                      onClick={() => onChange({ receiptTiming: { ...settings.receiptTiming, [type]: tm } })}
                      className={cn(
                        'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                        (settings.receiptTiming?.[type] ?? 'on_payment') === tm ? 'bg-surface text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800',
                      )}
                    >
                      <TIcon className="h-3.5 w-3.5" />
                      {t(`orders.bill.${tm}`)}
                    </button>
                  ))}
                </div>
                <Switch checked={on} onCheckedChange={(v) => toggle(type, v)} aria-label={t('orders.offer', { type: t(`kitchen.orderType.${type}`) })} disabled={on && enabled.length === 1} />
              </div>
            );
          })}
        </div>
        <ul className="space-y-0.5 text-xs text-ink-500">
          <li><b className="text-ink-700">{t('orders.bill.on_payment')}:</b> {t('orders.billHelp.on_payment')}</li>
          <li><b className="text-ink-700">{t('orders.bill.on_completion')}:</b> {t('orders.billHelp.on_completion')}</li>
          <li><b className="text-ink-700">{t('orders.route.kitchen')}:</b> {t('orders.routeHelp.kitchen')}</li>
          <li><b className="text-ink-700">{t('orders.route.collection')}:</b> {t('orders.routeHelp.collection')}</li>
          <li><b className="text-ink-700">{t('orders.route.none')}:</b> {t('orders.routeHelp.none')}</li>
        </ul>
      </CardBody>
    </Card>
  );
}
