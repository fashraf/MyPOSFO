import { CheckCircle2, ChefHat, Eye, Plus, Printer, Receipt, X } from 'lucide-react';
import { Button, CurrencyDisplay, Modal } from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ORDER_TYPE_ICON } from './OrderTypePicker';
import { ZatcaQr } from '@/components/ui/ZatcaQr';
import { useI18n, useTranslation, type TranslationKey } from '@/i18n';
import type { Sale } from '@/types/sales';
import type { Discount } from '@/types/discounts';
import type { PrintGroup } from '@/types/printing';
import type { PrintOutcome } from '@/types/printers';
import { PrintStatus } from '@/features/printing/PrintStatus';
import type { ReceiptSelection } from '@/features/printing/ReceiptChoice';

export interface OrderCompleteProps {
  open: boolean;
  sale: Sale | null;
  /** Named so the receipt and the screen agree on why the total changed. */
  discount: Discount | null;
  changeH: number;
  /** True when the order also created work on the kitchen board. */
  sentToKitchen: boolean;
  /** Where the order was routed by its type. */
  routedTo?: 'kitchen' | 'collection' | 'none';
  /** Only the groups this order actually touches. */
  printGroups: PrintGroup[];
  onPrint: (documentId: string) => void;
  onPrintAll: () => void;
  onView: () => void;
  onNewSale: () => void;
  /** Clear the finished order and stay on the till. */
  onClose: () => void;
  /** Edited order that cost less: money to hand back. */
  refundH?: number;
  printOutcome?: PrintOutcome | null;
  printing?: boolean;
  printSelection?: ReceiptSelection | null;
  onReprint?: (sel: ReceiptSelection) => void;
  /** This order's bill prints when it is completed. */
  billLater?: boolean;
}

/**
 * The screen after a sale lands.
 *
 * It exists so the cashier gets an unambiguous answer to "did that go
 * through?" before the till resets. Change due is the largest thing on it,
 * because that is the one number they act on immediately.
 */
export function OrderComplete({
  open,
  sale,
  discount,
  changeH,
  sentToKitchen,
  routedTo = 'kitchen',
  printGroups,
  onPrint,
  onPrintAll,
  onView,
  onNewSale,
  onClose,
  refundH = 0,
  printOutcome = null,
  printing = false,
  printSelection = null,
  onReprint,
  billLater = false,
}: OrderCompleteProps) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const wide = useMediaQuery('(min-width: 1024px)');

  if (!sale) return null;

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const methods = [...new Set(sale.payments.map((p) => p.method))];
  const giveChangeH = Math.max(0, changeH - refundH);
  const TypeIcon = sale.orderType ? ORDER_TYPE_ICON[sale.orderType] : null;

  return (
    <Modal open={open} onClose={onClose} size="lg" className="order-complete">
      <div className="relative" data-testid="order-complete">
        {/* Close: clears the finished order and leaves the till ready. */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('checkout.done.close')}
          className="absolute -end-1 -top-1 z-10 grid h-11 w-11 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-6">
          {/* ---- What happened, and what to do now ---- */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 pe-10">
              <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-success-50 text-success-600">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-ink-900">{t('checkout.done.title')}</h2>
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-500">
                  {sale.orderNo ? (
                    <span className="numeric rounded-md bg-ink-900 px-2 py-0.5 text-sm font-bold text-white" data-testid="done-order-no">#{sale.orderNo}</span>
                  ) : null}
                  <span className="numeric" data-testid="done-invoice-no">{sale.invoiceNumber}</span>
                  {TypeIcon && sale.orderType && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700">
                      <TypeIcon className="h-3 w-3" />
                      {t(`kitchen.orderType.${sale.orderType}` as TranslationKey)}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* The one number the cashier acts on: change to hand back, or the total. */}
            {giveChangeH > 0 ? (
              <div className="rounded-2xl bg-success-600 p-4 text-white" data-testid="done-change">
                <div className="text-sm font-medium text-white/80">{t('checkout.done.change')}</div>
                <CurrencyDisplay amount={giveChangeH} className="text-4xl font-bold text-white" />
                <div className="mt-1 text-xs text-white/80">
                  {t('checkout.done.total')} <CurrencyDisplay amount={sale.totalH} className="text-white/90" />
                  {sale.tenderedH ? <> · {t('today.given')} <CurrencyDisplay amount={sale.tenderedH} className="text-white/90" /></> : null}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-ink-900 p-4 text-white" data-testid="done-total">
                <div className="text-sm font-medium text-white/70">{t('checkout.done.total')}</div>
                <CurrencyDisplay amount={sale.totalH} className="text-4xl font-bold text-white" />
                <div className="mt-1 text-xs text-white/70">{methods.map((m) => t(`checkout.payment.${m}` as TranslationKey)).join(' + ')}</div>
              </div>
            )}

            {refundH > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-warning-50 px-4 py-3">
                <span className="font-medium text-warning-800">{t('checkout.done.giveBack')}</span>
                <CurrencyDisplay amount={refundH} className="text-xl font-bold text-warning-800" />
              </div>
            )}

            <dl className="space-y-1 text-sm">
              {discount && sale.discountH > 0 && (
                <div className="flex items-start justify-between gap-2">
                  <dt className="min-w-0 text-ink-500">
                    {t('checkout.done.discount')} <span className="text-2xs text-brand-600">{nameOf(discount)}</span>
                  </dt>
                  <dd><CurrencyDisplay amount={-sale.discountH} className="text-danger-600" /></dd>
                </div>
              )}
              {sale.replacesInvoice && (
                <div className="flex items-center justify-between text-xs">
                  <dt className="text-ink-500">{t('checkout.done.replaces', { invoice: sale.replacesInvoice })}</dt>
                  <dd className="text-ink-600">{t('checkout.done.paymentKept')}</dd>
                </div>
              )}
            </dl>

            {/* Where the order went. */}
            {(sentToKitchen || routedTo === 'none') && (
              <div className="flex items-center gap-2 rounded-xl border border-info-200 bg-info-50 px-3 py-2.5 text-sm text-info-800">
                <ChefHat className="h-4 w-4 shrink-0" />
                {!sentToKitchen ? t('orders.done.none') : routedTo === 'collection' ? t('orders.done.collection') : t('checkout.done.kitchenSent')}
              </div>
            )}
          </div>

          {/* ---- Receipt: printing, preview, other documents, the e-invoice QR ---- */}
          <div className="space-y-3">
            {onReprint ? (
              <PrintStatus outcome={printOutcome} printing={printing} selection={printSelection} onReprint={onReprint} billLater={billLater && !printOutcome} />
            ) : (
              <Button variant="outline" fullWidth leadingIcon={<Receipt />} onClick={() => onPrint('customer')}>
                {t('print.customerBill')}
              </Button>
            )}

            {printGroups.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {printGroups.map((group) => (
                  <Button key={group.id} variant="outline" size="sm" leadingIcon={<Printer />} onClick={() => onPrint(group.id)}>
                    {nameOf(group)}
                  </Button>
                ))}
                <Button variant="secondary" size="sm" leadingIcon={<Printer />} onClick={onPrintAll} className="col-span-2">
                  {t('print.printAll')}
                </Button>
              </div>
            )}

            {sale.zatca && (
              <details className="group rounded-xl border border-ink-200 p-3 md:open:bg-surface" open={wide}>
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-ink-800">
                  {t('checkout.done.zatcaTitle')}
                  <span className="text-xs text-ink-400 group-open:hidden">{t('today.show')}</span>
                </summary>
                <div className="mt-3 flex items-center gap-3 text-start">
                  <ZatcaQr payload={sale.zatca.qrBase64} size={88} />
                  <div className="min-w-0 space-y-0.5 text-2xs text-ink-500">
                    <p className="numeric">ICV {sale.zatca.icv} · {sale.zatca.egsUnitId}</p>
                    <p className="truncate font-mono" dir="ltr">{sale.zatca.uuid}</p>
                    <p>{t('checkout.done.zatcaNote')}</p>
                  </div>
                </div>
              </details>
            )}
          </div>
        </div>

        {/* Sticky on phones: the next order is always one thumb away. */}
        <div className="sticky bottom-0 -mx-1 mt-4 grid grid-cols-[auto_auto_minmax(0,1fr)] gap-2 border-t border-ink-100 bg-surface px-1 pb-1 pt-3">
          <Button variant="ghost" leadingIcon={<Eye />} onClick={onView} className="h-12">
            <span className="hidden sm:inline">{t('checkout.done.view')}</span>
          </Button>
          <Button variant="outline" onClick={onClose} className="h-12">
            {t('checkout.done.close')}
          </Button>
          <Button leadingIcon={<Plus />} onClick={onNewSale} className="h-12 text-base" data-testid="done-new-order">
            {t('checkout.done.newSale')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
