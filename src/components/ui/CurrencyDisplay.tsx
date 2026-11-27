import { cn } from '@/lib/cn';
import { formatCurrency, DEFAULT_CURRENCY } from '@/lib/format';
import { useI18n } from '@/i18n';
import { useEffect, useState } from 'react';
import { currencySymbol, onCurrencySymbolChange } from '@/lib/currencySymbol';

export interface CurrencyDisplayProps {
  /** Amount in minor units (halalas) unless `fromMinorUnits` is false. */
  amount: number;
  currency?: string;
  fromMinorUnits?: boolean;
  /** Colour negatives red and positives green. Off by default. */
  signed?: boolean;
  className?: string;
}

/** Renders money consistently: LTR, tabular figures, currency code trailing. */
export function CurrencyDisplay({
  amount,
  currency = DEFAULT_CURRENCY,
  fromMinorUnits = true,
  signed = false,
  className,
}: CurrencyDisplayProps) {
  const { language } = useI18n();
  const [setting, setSetting] = useState(currencySymbol());
  useEffect(() => onCurrencySymbolChange(() => setSetting(currencySymbol())), []);

  /* The business's own image (e.g. the official Riyal symbol) sits beside the number, sized to the text. */
  if (setting.mode === 'image' && setting.imageDataUrl) {
    const number = formatCurrency(amount, { language, currency, fromMinorUnits, withSymbol: false });
    const img = <img src={setting.imageDataUrl} alt={currency} className="inline-block h-[0.85em] w-auto align-[-0.05em] dark:invert" />;
    return (
      <span
        className={cn('numeric inline-flex items-baseline gap-1', signed && amount < 0 && 'text-danger-600', signed && amount > 0 && 'text-success-600', className)}
        dir="ltr"
      >
        {setting.position === 'before' && img}
        {number}
        {setting.position === 'after' && img}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'numeric',
        signed && amount < 0 && 'text-danger-600',
        signed && amount > 0 && 'text-success-600',
        className,
      )}
    >
      {formatCurrency(amount, { language, currency, fromMinorUnits })}
    </span>
  );
}
