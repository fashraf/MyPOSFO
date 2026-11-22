import { useEffect, useState } from 'react';
import { Delete, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/i18n';

export interface PinPadProps {
  length?: number;
  busy?: boolean;
  error?: string | null;
  onComplete: (pin: string) => void;
}

/**
 * A terminal PIN pad.
 *
 * Built for a Sunmi screen and a thumb: 64px keys, digits always laid out
 * left-to-right (a keypad is not text and must not mirror in Arabic), and the
 * hardware keyboard works too so it can be used at a desk. Submits itself on
 * the last digit — a cashier should not have to find an OK button.
 */
export function PinPad({ length = 4, busy = false, error, onComplete }: PinPadProps) {
  const { t } = useTranslation();
  const [digits, setDigits] = useState('');

  useEffect(() => {
    if (error) setDigits('');
  }, [error]);

  function press(value: string) {
    if (busy) return;
    setDigits((current) => {
      if (current.length >= length) return current;
      const next = current + value;
      if (next.length === length) setTimeout(() => onComplete(next), 80);
      return next;
    });
  }

  function erase() {
    if (!busy) setDigits((current) => current.slice(0, -1));
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (/^\d$/.test(event.key)) press(event.key);
      else if (event.key === 'Backspace') erase();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="space-y-5">
      <div className="flex justify-center gap-3" dir="ltr" aria-live="polite">
        {Array.from({ length }, (_, index) => (
          <span
            key={index}
            className={cn(
              'h-4 w-4 rounded-full border-2 transition-colors',
              index < digits.length ? 'border-ink-900 bg-ink-900' : 'border-ink-300 bg-surface',
              error && 'border-danger-500',
            )}
          />
        ))}
        <span className="sr-only">{t('demo.pinEntered', { count: digits.length })}</span>
      </div>

      <div className="mx-auto grid max-w-[20rem] grid-cols-3 gap-3" dir="ltr">
        {keys.map((key) => (
          <PadKey key={key} onClick={() => press(key)} disabled={busy}>
            {key}
          </PadKey>
        ))}
        <span />
        <PadKey onClick={() => press('0')} disabled={busy}>
          0
        </PadKey>
        <PadKey onClick={erase} disabled={busy || digits.length === 0} aria-label={t('demo.pinErase')}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Delete className="h-5 w-5" />}
        </PadKey>
      </div>
    </div>
  );
}

function PadKey({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'grid h-16 place-items-center rounded-xl border border-ink-200 bg-surface text-2xl font-medium text-ink-900 shadow-xs sm:h-14 sm:text-xl',
        'select-none transition-colors hover:bg-ink-50 active:scale-[0.97] active:bg-ink-100 disabled:opacity-40 tabular [touch-action:manipulation]',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
