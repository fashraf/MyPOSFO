import { useEffect, useState } from 'react';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { useSession } from '@/contexts/SessionContext';
import { onKitchenOrderCompleted } from '@/services/kitchenService';
import { printerService, salesService, settingsService, safeCall } from '@/services';
import { PrintPreview } from './PrintPreview';

/**
 * Prints the customer bill when an order finishes, for order types set to
 * "when the order completes" (dine-in by default). Mounted once in the shell,
 * so it works from the kitchen board, the collection page or anywhere else.
 */
export function PrintOnCompletion() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { branches } = useSession();
  const toast = useToast();
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(
    () =>
      onKitchenOrderCompleted(async (order) => {
        const found = await safeCall(() => salesService.list({ search: order.orderNumber, pageSize: 5 } as never));
        const sale = found.ok ? found.data.items.find((s) => s.invoiceNumber === order.orderNumber) : undefined;
        if (!sale || sale.status === 'voided' || !sale.branchId) return;
        const settings = await safeCall(() => settingsService.get(sale.branchId!));
        const type = sale.orderType ?? order.orderType;
        if (!settings.ok || settings.data.receiptTiming?.[type] !== 'on_completion') return;
        const branch = branches.find((b) => b.id === sale.branchId);
        const outcome = await printerService.printSale({
          sale, kind: 'receipt', branchName: branch ? (language === 'ar' ? branch.nameAr : branch.nameEn) : '', language: language === 'ar' ? 'ar' : 'en',
        });
        if (outcome.previewUrl) setPreview(outcome.previewUrl);
        if (outcome.ok) toast.success(t('orders.billPrinted', { order: sale.invoiceNumber, printer: outcome.printer?.name ?? '' }));
        else toast.error(t('orders.billFailed', { order: sale.invoiceNumber }), outcome.error);
      }),
    [branches, language, t, toast],
  );

  return <PrintPreview url={preview} onClose={() => setPreview(null)} />;
}
