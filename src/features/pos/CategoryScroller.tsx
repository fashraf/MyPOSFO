import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/i18n';

export interface CategoryOption {
  value: string;
  label: string;
}

export interface CategoryScrollerProps {
  options: CategoryOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * A single-line category rail.
 *
 * Categories must never wrap: a second row steals height from the product grid,
 * and a shop with fifteen categories would push the grid off the screen. So the
 * rail scrolls horizontally instead, with arrows that appear only when there is
 * something to scroll to.
 */
export function CategoryScroller({ options, value, onChange, className }: CategoryScrollerProps) {
  const { t, isRTL } = useTranslation();
  const railRef = useRef<HTMLDivElement>(null);

  const [canScrollStart, setCanScrollStart] = useState(false);
  const [canScrollEnd, setCanScrollEnd] = useState(false);

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;

    /* scrollLeft goes negative in RTL, so compare on magnitude. */
    const offset = Math.abs(rail.scrollLeft);
    const maxOffset = rail.scrollWidth - rail.clientWidth;

    setCanScrollStart(offset > 4);
    setCanScrollEnd(offset < maxOffset - 4);
  }, []);

  useEffect(() => {
    measure();
    const rail = railRef.current;
    if (!rail) return;

    rail.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      rail.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure, options.length]);

  /* A vertical wheel over the rail scrolls it sideways, which is what people
     do instinctively on a trackpad or mouse. */
  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    const rail = railRef.current;
    if (!rail) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

    rail.scrollBy({ left: event.deltaY, behavior: 'smooth' });
  }

  function nudge(direction: -1 | 1) {
    railRef.current?.scrollBy({ left: direction * 220, behavior: 'smooth' });
  }

  return (
    <div className={cn('relative flex min-w-0 items-center', className)}>
      {canScrollStart && (
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label={t('common.previous')}
          className="absolute start-0 z-10 flex h-8 w-8 touch:hidden items-center justify-center rounded-full border border-ink-200 bg-surface text-ink-500 shadow-sm transition-colors hover:text-ink-900"
        >
          <ChevronLeft aria-hidden className="h-3.5 w-3.5 flip-rtl" />
        </button>
      )}

      <div
        ref={railRef}
        onWheel={onWheel}
        className={cn(
          'flex min-w-0 flex-1 snap-x snap-proximity items-center gap-1.5 overflow-x-auto overscroll-x-contain scroll-smooth no-scrollbar touch:gap-2',
          /* Room for the arrows, so a pill is never hidden underneath one.
             Touch screens swipe instead, so they keep the room for pills. */
          canScrollStart && 'ps-9 touch:ps-0',
          canScrollEnd && 'pe-9 touch:pe-0',
        )}
        style={{
          maskImage: `linear-gradient(to ${isRTL ? 'left' : 'right'}, ${canScrollStart ? 'transparent 0, #000 2.25rem' : '#000 0'}, ${canScrollEnd ? '#000 calc(100% - 2.25rem), transparent 100%' : '#000 100%'})`,
        }}
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value || 'all'}
              type="button"
              onClick={(event) => {
                onChange(option.value);
                /* Bring the chosen pill fully on screen, so the next one along
                   is visible and the thumb knows there is more to swipe. */
                event.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
              }}
              aria-pressed={active}
              className={cn(
                'shrink-0 snap-start whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                'touch:h-11 touch:px-4 touch:text-sm max-lg:h-10 max-lg:px-4 max-lg:text-sm',
                active
                  ? 'border-brand-600 bg-brand-600 text-brand-fg'
                  : 'border-ink-200 bg-surface text-ink-600 hover:border-ink-300 hover:text-ink-900',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {canScrollEnd && (
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label={t('common.next')}
          className="absolute end-0 z-10 flex h-8 w-8 touch:hidden items-center justify-center rounded-full border border-ink-200 bg-surface text-ink-500 shadow-sm transition-colors hover:text-ink-900"
        >
          <ChevronRight aria-hidden className="h-3.5 w-3.5 flip-rtl" />
        </button>
      )}
    </div>
  );
}
