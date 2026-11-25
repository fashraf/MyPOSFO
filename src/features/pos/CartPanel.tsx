import { Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { Button, CurrencyDisplay } from '@/components/ui';
import { DiscountPicker } from './DiscountPicker';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { useI18n, useTranslation } from '@/i18n';
import { lineGrossH } from '@/types/sales';
import type { DiscountApproval } from '@/types/discounts';
import type { ResolvedDiscount } from '@/services';
import type { PosCart } from './usePosCart';

export interface CartPanelProps {
  cart: PosCart;
  onCheckout: () => void;
  /** Configured discounts, each resolved against the current basket. */
  discounts: ResolvedDiscount[];
  selectedDiscountId: string | null;
  onSelectDiscount: (discountId: string | null) => void;
  discountApproval: DiscountApproval;
  onRequestApproval: (reason: string) => void;
  discountCapped: boolean;
  /** True when an approval is outstanding, so checkout must wait. */
  checkoutBlocked: boolean;
  /** When editing a paid order: what the customer already paid. Changes the button wording. */
  paidBeforeH?: number;
}

export function CartPanel({
  cart,
  onCheckout,
  discounts,
  selectedDiscountId,
  onSelectDiscount,
  discountApproval,
  onRequestApproval,
  discountCapped,
  checkoutBlocked,
  paidBeforeH,
}: CartPanelProps) {
  const { t } = useTranslation();
  const { language } = useI18n();

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const { totals } = cart;

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-lg border border-ink-200 bg-surface">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-ink-200 px-3 py-2">
        <div className="flex items-center gap-2">
          <ShoppingCart aria-hidden className="h-4 w-4 text-ink-400" />
          <h2 className="text-sm font-semibold text-ink-900">{t('pos.cart.title')}</h2>
          {!cart.isEmpty && (
            <span className="numeric rounded-full bg-ink-100 px-1.5 py-0.5 text-2xs font-semibold text-ink-600">
              {totals.itemCount}
            </span>
          )}
        </div>

        {!cart.isEmpty && (
          <Button variant="ghost" size="sm" onClick={cart.clear} leadingIcon={<Trash2 />} className="touch:h-10 max-lg:h-10">
            {t('pos.cart.clear')}
          </Button>
        )}
      </header>

      {/* Lines */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {cart.isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 text-ink-400"
            >
              <ShoppingCart className="h-4.5 w-4.5" />
            </span>
            <p className="text-base font-medium text-ink-700">{t('pos.cart.empty')}</p>
            <p className="text-sm text-ink-400">{t('pos.cart.emptyHint')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {/* One compact row per line. A tall card per item is what forces
                a cashier to scroll after four products. */}
            {cart.lines.map((line) => (
              <li
                key={line.id}
                className="group grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-1.5 hover:bg-ink-50 touch:py-2.5 max-[480px]:grid-cols-[1fr_auto] md:max-lg:grid-cols-[1fr_auto] max-[480px]:gap-y-1.5 md:max-lg:gap-y-1.5 max-[480px]:py-3 md:max-lg:py-3"
              >
                {/* Phone: the name gets the whole first row (no "Mushroom Sw…"),
                    stepper and amount share the second. */}
                <div className="min-w-0 max-[480px]:col-span-2 md:max-lg:col-span-2">
                  <p className="truncate text-sm font-medium leading-tight text-ink-900 max-[480px]:line-clamp-2 md:max-lg:line-clamp-2 max-[480px]:whitespace-normal md:max-lg:whitespace-normal max-[480px]:text-md md:max-lg:text-md">
                    {nameOf(line)}
                  </p>
                  {line.modifiers && line.modifiers.length > 0 && (
                    <p className="truncate text-2xs leading-tight text-ink-500">
                      {line.modifiers.map((modifier) => (language === 'ar' ? modifier.nameAr : modifier.nameEn)).join(' · ')}
                    </p>
                  )}
                  {line.components && line.components.length > 0 && (
                    <ul className="mt-0.5 space-y-px">
                      {line.components.map((c) => (
                        <li key={c.slotId} className="truncate text-2xs leading-tight text-ink-500">
                          <span className="text-ink-400">{c.quantity > 1 ? `${c.quantity}× ` : '· '}</span>
                          {language === 'ar' ? c.nameAr : c.nameEn}
                          {c.modifiers && c.modifiers.length > 0 && (
                            <span className="text-ink-400"> ({c.modifiers.map((m) => (language === 'ar' ? m.nameAr : m.nameEn)).join(', ')})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="numeric text-2xs leading-tight text-ink-400">
                    {formatCurrency(line.unitPriceH, { language })}
                  </p>
                </div>

                <div className="flex items-center justify-self-start rounded border border-ink-200 max-sm:rounded-md">
                  <button
                    type="button"
                    onClick={() => cart.decrement(line.id)}
                    aria-label={t('pos.cart.decrease')}
                    className="flex h-6 w-6 items-center justify-center rounded-s text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200 touch:h-11 touch:w-11 max-sm:h-11 max-sm:w-11"
                  >
                    <Minus aria-hidden className="h-3 w-3 touch:h-4 touch:w-4" />
                  </button>

                  <input
                    type="number"
                    min="1"
                    dir="ltr"
                    value={line.quantity}
                    onChange={(event) =>
                      cart.setQuantity(line.id, Number(event.target.value) || 0)
                    }
                    aria-label={nameOf(line)}
                    className="numeric h-6 w-9 border-x border-ink-200 bg-surface text-center text-xs text-ink-900 outline-none focus:bg-brand-50/50 touch:h-11 touch:w-11 touch:text-md max-sm:h-11 max-sm:w-11 max-sm:text-md [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />

                  <button
                    type="button"
                    onClick={() => cart.increment(line.id)}
                    aria-label={t('pos.cart.increase')}
                    className="flex h-6 w-6 items-center justify-center rounded-e text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200 touch:h-11 touch:w-11 max-sm:h-11 max-sm:w-11"
                  >
                    <Plus aria-hidden className="h-3 w-3 touch:h-4 touch:w-4" />
                  </button>
                </div>

                <div className="flex w-20 items-center justify-end gap-1 max-sm:w-auto max-sm:gap-2">
                  <CurrencyDisplay
                    amount={lineGrossH(line)}
                    className="text-sm font-semibold text-ink-900 max-sm:text-md"
                  />
                  <button
                    type="button"
                    onClick={() => cart.remove(line.id)}
                    aria-label={t('pos.cart.removeLine')}
                    className="rounded p-0.5 text-ink-300 opacity-0 transition-all hover:bg-danger-50 hover:text-danger-600 focus:opacity-100 group-hover:opacity-100 touch:grid touch:h-11 touch:w-11 touch:place-items-center touch:p-0 touch:text-ink-400 touch:opacity-100 touch:active:bg-danger-50 max-sm:grid max-sm:h-11 max-sm:w-11 max-sm:place-items-center max-sm:opacity-100"
                  >
                    <X aria-hidden className="h-3 w-3 touch:h-4 touch:w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Totals */}
      <footer className="shrink-0 border-t border-ink-200 bg-ink-50/60 px-3 py-2.5 max-lg:rounded-b-lg">
        {/* Thumb-height discount trigger and options on touch screens. */}
        <div className="mb-2 touch:[&_button]:min-h-[2.75rem] max-sm:[&_button]:min-h-[2.75rem]">
          <DiscountPicker
            inline
            resolved={discounts}
            selectedId={selectedDiscountId}
            onSelect={onSelectDiscount}
            approval={discountApproval}
            onRequestApproval={onRequestApproval}
            amountH={cart.discountH}
            capped={discountCapped}
            disabled={cart.isEmpty}
          />
        </div>

        <dl className="space-y-1 border-t border-dashed border-ink-200 pt-2 text-xs">
          <div className="flex items-center justify-between">
            <dt className="text-ink-500">{t('pos.cart.subtotal')}</dt>
            <dd>
              <CurrencyDisplay amount={totals.subtotalH} className="text-ink-700" />
            </dd>
          </div>

          {totals.discountH > 0 && (
            <div className="flex items-center justify-between">
              <dt className="text-ink-500">{t('pos.cart.discount')}</dt>
              <dd>
                <CurrencyDisplay amount={-totals.discountH} className="text-danger-600" />
              </dd>
            </div>
          )}

          {/* One row per tax component: "VAT 15%", or "CGST 2.5%" and "SGST 2.5%". */}
          {totals.taxEnabled ? (
            totals.taxLines.length > 0 ? (
              totals.taxLines.map((line) => (
                <div key={line.label} className="flex items-center justify-between" data-testid="cart-tax-line">
                  <dt className="text-ink-500">
                    {line.label}
                    <span className="ms-1 text-ink-400">{totals.pricesIncludeTax ? t('tax.included') : t('tax.added')}</span>
                  </dt>
                  <dd>
                    <CurrencyDisplay amount={line.taxH} className="text-ink-700" />
                  </dd>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-between">
                <dt className="text-ink-500">{t('tax.none')}</dt>
                <dd><CurrencyDisplay amount={0} className="text-ink-700" /></dd>
              </div>
            )
          ) : (
            <div className="flex items-center justify-between" data-testid="cart-tax-off">
              <dt className="text-ink-400">{t('tax.off')}</dt>
              <dd />
            </div>
          )}

        </dl>

        <Button
          size="lg"
          fullWidth
          disabled={cart.isEmpty || checkoutBlocked}
          onClick={onCheckout}
          className={cn('mt-3.5', 'max-lg:h-14 max-lg:text-lg max-lg:font-semibold')}
        >
          {/* The button says what will happen and for how much, so nobody has
              to look back up at the totals before pressing it. */}
          {paidBeforeH !== undefined && !cart.isEmpty
            ? totals.totalH > paidBeforeH
              ? t('posEdit.collectButton', { amount: formatCurrency(totals.totalH - paidBeforeH, { language }) })
              : totals.totalH < paidBeforeH
                ? t('posEdit.refundButton', { amount: formatCurrency(paidBeforeH - totals.totalH, { language }) })
                : t('posEdit.confirmSave')
            : cart.isEmpty
              ? t('pos.cart.charge')
              : `${t('pos.cart.charge')} ${formatCurrency(totals.totalH, { language })}`}
        </Button>
      </footer>
    </aside>
  );
}
