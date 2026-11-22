import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Printer, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui';
import { useTranslation, type TranslationKey } from '@/i18n';
import { cn } from '@/lib/cn';
import type { PrintOutcome } from '@/types/printers';
import { ReceiptChoice, type ReceiptSelection } from './ReceiptChoice';
import { PrintPreview } from './PrintPreview';

/**
 * After the sale: where the receipt went, whether it printed, how big it was,
 * and a one-tap retry or reprint elsewhere.
 */
export function PrintStatus({
  outcome,
  printing,
  selection,
  onReprint,
  billLater = false,
}: {
  outcome: PrintOutcome | null;
  printing: boolean;
  selection: ReceiptSelection | null;
  onReprint: (sel: ReceiptSelection) => void;
  /** The bill will print when the order is completed (dine-in). */
  billLater?: boolean;
}) {
  const { t } = useTranslation();
  const tk = (k: string, v?: Record<string, string | number>) => t(`printers.${k}` as TranslationKey, v);
  const [choosing, setChoosing] = useState(false);
  const [sel, setSel] = useState<ReceiptSelection>(selection && selection.kind !== 'none' ? selection : { kind: 'receipt', printerId: null });
  const [zoom, setZoom] = useState(false);

  return (
    <div className="space-y-2 rounded-lg border border-ink-200 p-2.5" data-testid="print-status">
      <div className="flex items-center gap-2 text-sm">
        {printing ? (
          <><Loader2 className="h-4 w-4 animate-spin text-info-600" />{tk('printing')}</>
        ) : !outcome ? (
          <><Printer className="h-4 w-4 text-ink-400" /><span className="text-ink-600" data-testid="print-idle">{billLater ? t('orders.billWhenDone') : selection?.kind === 'none' ? tk('notPrinted') : tk('idle')}</span></>
        ) : outcome.ok ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-success-600" />
            <span className="min-w-0 flex-1 truncate" data-testid="print-ok">
              {outcome.jobId ? tk('queuedOn', { name: outcome.printer?.name ?? '' }) : tk('printedOn', { name: outcome.printer?.name ?? '' })}
              {outcome.bytes > 0 && <span className="text-ink-400"> · {(outcome.bytes / 1024).toFixed(1)} KB</span>}
            </span>
          </>
        ) : (
          <>
            <AlertTriangle className="h-4 w-4 text-danger-600" />
            <span className="min-w-0 flex-1 text-danger-700" data-testid="print-failed">{outcome.error}</span>
          </>
        )}
      </div>

      {outcome?.previewUrl && (
        <button type="button" onClick={() => setZoom(true)} className="block w-full overflow-hidden rounded-md bg-ink-100 p-2" data-testid="print-thumb">
          <img src={outcome.previewUrl} alt={tk('previewTitle')} className="mx-auto max-h-40 bg-white object-top shadow-sm" />
        </button>
      )}

      {choosing && <ReceiptChoice value={sel} onChange={setSel} />}

      <div className={cn('flex gap-2', printing && 'pointer-events-none opacity-50')}>
        {outcome && !outcome.ok && selection && selection.kind !== 'none' && (
          <Button size="sm" variant="outline" leadingIcon={<RotateCcw />} onClick={() => onReprint(selection)}>{tk('retry')}</Button>
        )}
        {choosing ? (
          <Button size="sm" leadingIcon={<Printer />} onClick={() => { onReprint(sel); setChoosing(false); }} disabled={sel.kind === 'none'} data-testid="print-again-go">{tk('printNow')}</Button>
        ) : (
          <Button size="sm" variant="ghost" leadingIcon={<Printer />} onClick={() => setChoosing(true)} data-testid="print-again">{tk('printAnother')}</Button>
        )}
      </div>
      <PrintPreview url={zoom ? outcome?.previewUrl ?? null : null} onClose={() => setZoom(false)} />
    </div>
  );
}
