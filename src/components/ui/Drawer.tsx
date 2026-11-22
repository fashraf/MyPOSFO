import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll';
import { useTranslation } from '@/i18n';

export type DrawerSize = 'sm' | 'md' | 'lg';

const SIZES: Record<DrawerSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-xl',
};

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  size?: DrawerSize;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Slides in from the end side, so it mirrors automatically in RTL. */
export function Drawer({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
  className,
}: DrawerProps) {
  const { t, isRTL } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);

  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const timer = window.setTimeout(() => panelRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-modal flex justify-end">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-ink-900/35 backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        style={{ ['--slide-from' as string]: isRTL ? '-100%' : '100%' }}
        className={cn(
          /* Phone: full screen, clear of the notch and the home indicator. */
          'relative flex h-full w-full flex-col bg-surface pt-safe shadow-overlay outline-none animate-slide-in-end',
          SIZES[size],
          className,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-200 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0 space-y-1">
            {title && <h2 className="text-md font-semibold text-ink-900">{title}</h2>}
            {description && <p className="text-sm text-ink-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="-me-1 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 active:bg-ink-100 sm:h-auto sm:w-auto sm:rounded sm:p-1.5"
          >
            <X aria-hidden className="h-5 w-5 sm:h-4 sm:w-4" />
          </button>
        </header>

        <div
          className={cn(
            'sheet-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 text-base text-ink-700 sm:px-5',
            !footer && 'pb-safe-4',
          )}
        >
          {children}
        </div>

        {footer && (
          <footer className="sheet-footer flex shrink-0 items-center justify-end gap-2 border-t border-ink-200 bg-ink-50/60 px-4 pb-safe-3 pt-3 sm:px-5 sm:pt-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
