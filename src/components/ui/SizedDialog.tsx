import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/i18n';

/**
 * A dialog sized as a share of the screen.
 *
 * `center` opens in the middle (e.g. 60% × 60% for an order, 85% × 85% for a
 * wizard); `start` slides in from the leading edge (left in English, right in
 * Arabic) for side panels such as analytics. On phones every variant becomes
 * a full-height sheet, because a 60%-wide dialog on a phone is unreadable.
 */
export function SizedDialog({
  open,
  onClose,
  title,
  subtitle,
  headerExtra,
  footer,
  children,
  placement = 'center',
  size = 60,
  busy = false,
  className,
  bodyClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  placement?: 'center' | 'start';
  /** Percent of the screen: width and height for center, width for start. */
  size?: number;
  busy?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    /* Capture phase + stop: Escape closes only the top-most dialog, not the
       wizard underneath it too. */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      if (!busy) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, busy, onClose]);

  if (!open) return null;

  const style =
    placement === 'center'
      ? ({ '--w': `${size}vw`, '--h': `${size}vh` } as React.CSSProperties)
      : ({ '--w': `${size}vw` } as React.CSSProperties);

  return createPortal(
    <div className={cn('fixed inset-0 z-modal flex', placement === 'center' ? 'items-end justify-center sm:items-center' : 'justify-start')}>
      <div aria-hidden className="absolute inset-0 animate-fade-in bg-ink-900/30" onClick={() => !busy && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        style={style}
        className={cn(
          'relative flex flex-col overflow-hidden border border-ink-200 bg-surface shadow-overlay',
          placement === 'center'
            ? 'h-[92svh] w-full animate-scale-in rounded-t-2xl border-b-0 sm:h-[var(--h)] sm:min-h-[28rem] sm:w-[var(--w)] sm:min-w-[36rem] sm:rounded-2xl sm:border-b'
            : 'h-full w-full animate-fade-in pt-safe sm:w-[var(--w)] sm:min-w-[24rem] sm:rounded-e-2xl',
          className,
        )}
      >
        {placement === 'center' && (
          <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ink-300 sm:hidden" />
        )}
        <header
          className={cn(
            'flex shrink-0 items-start justify-between gap-3 border-b border-ink-200 px-4 py-3',
            placement === 'center' && 'max-sm:pt-2',
          )}
        >
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-ink-900">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-ink-500">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerExtra}
            <button type="button" onClick={onClose} disabled={busy} aria-label={t('common.close')}
              className="grid h-11 w-11 place-items-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-100 sm:h-9 sm:w-9 sm:rounded-lg">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>
        <div className={cn('sheet-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3', !footer && 'pb-safe-3', bodyClassName)}>{children}</div>
        {footer && <footer className="sheet-footer shrink-0 border-t border-ink-200 px-4 pb-safe-3 pt-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
