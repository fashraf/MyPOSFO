import { useEffect, useState } from 'react';
import { ChefHat, FileText, Gift, Minus, Plus, Printer, Receipt } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/i18n';
import { printHtml, renderDocument, type PrintContext, type PrintKind } from '@/lib/receipt';

const KINDS: { kind: PrintKind; icon: typeof Receipt }[] = [
  { kind: 'receipt', icon: Receipt },
  { kind: 'gift', icon: Gift },
  { kind: 'kitchen', icon: ChefHat },
  { kind: 'a4', icon: FileText },
];

/**
 * "What do you want to print?" — four big choices, a live preview, copies, Print.
 *
 * The customer receipt is preselected because it is the answer nine times in
 * ten. Each choice says in one line when to use it, so the cashier does not
 * have to know what a "simplified tax invoice" is.
 */
export function PrintDialog({
  open,
  onClose,
  context,
  hasCustomer,
}: {
  open: boolean;
  onClose: () => void;
  context: Omit<PrintContext, 'copies'> | null;
  hasCustomer: boolean;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<PrintKind>('receipt');
  const [copies, setCopies] = useState(1);
  const [html, setHtml] = useState('');
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (open) {
      setKind('receipt');
      setCopies(1);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !context) return;
    let cancelled = false;
    void renderDocument(kind, { ...context, copies }).then((markup) => {
      if (!cancelled) setHtml(markup);
    });
    return () => {
      cancelled = true;
    };
  }, [open, context, kind, copies]);

  async function print() {
    setPrinting(true);
    await printHtml(html, copies);
    setPrinting(false);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('printDialog.title')}
      description={t('printDialog.subtitle')}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-600">{t('printDialog.copies')}</span>
            <div className="flex items-center rounded-md border border-ink-200" dir="ltr">
              <button type="button" aria-label="-" onClick={() => setCopies((c) => Math.max(1, c - 1))} className="grid h-10 w-10 place-items-center hover:bg-ink-100">
                <Minus className="h-4 w-4" />
              </button>
              <span className="numeric w-7 text-center font-semibold">{copies}</span>
              <button type="button" aria-label="+" onClick={() => setCopies((c) => Math.min(5, c + 1))} className="grid h-10 w-10 place-items-center hover:bg-ink-100">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button size="lg" leadingIcon={<Printer />} onClick={() => void print()} loading={printing} disabled={!html}>
              {t('printDialog.print')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div role="radiogroup" aria-label={t('printDialog.title')} className="space-y-2">
          {KINDS.map(({ kind: option, icon: Icon }) => {
            const on = option === kind;
            const warn = option === 'a4' && !hasCustomer;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setKind(option)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg border p-3 text-start transition',
                  on ? 'border-ink-900 bg-ink-50 ring-1 ring-ink-900' : 'border-ink-200 hover:border-ink-400',
                )}
              >
                <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-md', on ? 'bg-ink-900 text-ink-50' : 'bg-ink-100 text-ink-600')}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink-900">{t(`printDialog.kinds.${option}.title`)}</span>
                  <span className="block text-xs text-ink-500">{t(`printDialog.kinds.${option}.hint`)}</span>
                  {warn && <span className="mt-0.5 block text-xs text-warning-700">{t('printDialog.a4NoCustomer')}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex min-h-[22rem] justify-center overflow-hidden rounded-lg border border-ink-200 bg-ink-100 p-3">
          {html && (
            <iframe
              title={t('printDialog.preview')}
              srcDoc={html}
              className={cn('h-[22rem] rounded bg-white shadow-sm', kind === 'a4' ? 'w-full' : 'w-[300px]')}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
