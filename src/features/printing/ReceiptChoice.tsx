import { useEffect, useState } from 'react';
import { Ban, FileText, Gift, Receipt, Star } from 'lucide-react';
import { Select } from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { useTranslation, type TranslationKey } from '@/i18n';
import { cn } from '@/lib/cn';
import { printerService, safeCall } from '@/services';
import type { PrintDocKind, PrinterConfig } from '@/types/printers';
import { CONNECTION_ICON } from './icons';

export interface ReceiptSelection {
  kind: PrintDocKind | 'none';
  printerId: string | null;
}

const CHOICES: { kind: ReceiptSelection['kind']; icon: typeof Receipt }[] = [
  { kind: 'receipt', icon: Receipt },
  { kind: 'gift', icon: Gift },
  { kind: 'a4', icon: FileText },
  { kind: 'none', icon: Ban },
];

/**
 * At checkout: which receipt, and on which printer. The default printer for
 * each document (Settings & Tax → Printers) is pre-selected and starred.
 */
export function ReceiptChoice({ value, onChange }: { value: ReceiptSelection; onChange: (v: ReceiptSelection) => void }) {
  const { t } = useTranslation();
  const { activeBranch } = useSession();
  const tk = (k: string, v?: Record<string, string | number>) => t(`printers.${k}` as TranslationKey, v);
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);

  useEffect(() => {
    safeCall(() => printerService.list(activeBranch?.id ?? null)).then((res) => res.ok && setPrinters(res.data.filter((p) => p.status === 'active')));
  }, [activeBranch]);

  const usable = value.kind === 'none' ? [] : printers.filter((p) => p.documents.includes(value.kind as PrintDocKind));
  const defaultOf = (kind: ReceiptSelection['kind']) => printers.find((p) => kind !== 'none' && p.defaultFor.includes(kind as PrintDocKind))?.id ?? null;

  /* Keep the printer valid when the document changes. */
  useEffect(() => {
    if (value.kind === 'none') return;
    if (!value.printerId || !usable.some((p) => p.id === value.printerId)) {
      const next = defaultOf(value.kind) ?? usable[0]?.id ?? null;
      if (next !== value.printerId) onChange({ ...value, printerId: next });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.kind, printers]);

  return (
    <div className="space-y-2" data-testid="receipt-choice">
      <div className="text-xs font-medium text-ink-500">{tk('choiceTitle')}</div>
      <div className="grid grid-cols-4 gap-1.5">
        {CHOICES.map(({ kind, icon: Icon }) => (
          <button
            key={kind}
            type="button"
            data-testid={`receipt-kind-${kind}`}
            aria-pressed={value.kind === kind}
            onClick={() => onChange({ kind, printerId: kind === 'none' ? null : defaultOf(kind) })}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-lg border px-1 py-2 text-[11px] font-medium',
              value.kind === kind ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 text-ink-600 hover:bg-ink-50',
            )}
          >
            <Icon className="h-4 w-4" />
            {tk(`choice.${kind}`)}
          </button>
        ))}
      </div>
      {value.kind !== 'none' && (
        usable.length ? (
          <Select
            selectSize="sm"
            value={value.printerId ?? ''}
            onChange={(id) => onChange({ ...value, printerId: id || null })}
            aria-label={tk('printOn')}
            options={usable.map((p) => ({
              value: p.id,
              label: `${p.defaultFor.includes(value.kind as PrintDocKind) ? '★ ' : ''}${p.name}`,
              description: tk(`conn.${p.connection}`),
            }))}
          />
        ) : (
          <p className="text-xs text-warning-800">{tk('noneFor')}</p>
        )
      )}
      {value.kind !== 'none' && value.printerId && (
        <p className="flex items-center gap-1 text-[11px] text-ink-500">
          {(() => {
            const p = printers.find((x) => x.id === value.printerId);
            if (!p) return null;
            const Icon = CONNECTION_ICON[p.connection];
            return (
              <>
                <Icon className="h-3 w-3" />
                {p.defaultFor.includes(value.kind as PrintDocKind) && <Star className="h-3 w-3 fill-warning-400 text-warning-500" />}
                {tk(`connHint.${p.connection}`)}
              </>
            );
          })()}
        </p>
      )}
    </div>
  );
}
