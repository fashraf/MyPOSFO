import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Info, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface KpiCardProps {
  label: ReactNode;
  value: ReactNode;
  /** Signed ratio: 0.125 renders as +12.5%. */
  change?: number;
  /** Text under the change indicator, e.g. "vs yesterday". */
  changeLabel?: ReactNode;
  icon?: ReactNode;
  /** Set true when a rise is bad — refunds, costs, shrinkage. */
  invertTrend?: boolean;
  /** A small bar sparkline drawn top-right, oldest first. */
  spark?: number[];
  /** Explains how the figure is computed, shown on the footer info icon. */
  hint?: string;
  /**
   * Where this figure leads.
   *
   * A number that needs a decision should reach the screen where the decision
   * is made. When absent the card stays a plain figure — not every measure has
   * somewhere useful to go, and a button that goes nowhere is worse than text.
   */
  onClick?: () => void;
  className?: string;
}

/** Thin bars, one highlighted at the peak — the reference's KPI glyph. */
function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const peak = values.indexOf(Math.max(...values));
  return (
    <span aria-hidden className="flex h-8 items-end gap-[3px]" dir="ltr">
      {values.map((value, index) => (
        <span
          key={index}
          className={cn('w-[3px] rounded-full', index === peak ? 'bg-ink-900' : 'bg-ink-300')}
          style={{ height: `${Math.max(12, (value / max) * 100)}%` }}
        />
      ))}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  change,
  changeLabel,
  icon,
  invertTrend = false,
  spark,
  hint,
  onClick,
  className,
}: KpiCardProps) {
  const hasChange = typeof change === 'number' && Number.isFinite(change);
  const flat = hasChange && Math.abs(change) < 0.0005;
  const rising = hasChange && change > 0;
  const positive = invertTrend ? !rising : rising;

  const TrendIcon = flat ? Minus : rising ? ArrowUpRight : ArrowDownRight;

  /* A real button when it acts like one, so it is reachable by keyboard and
     announced correctly. A div with a click handler is neither. */
  const Root = onClick ? 'button' : 'div';

  return (
    <Root
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border border-ink-200 bg-surface text-start shadow-xs',
        onClick && 'w-full transition hover:border-ink-300 hover:shadow-sm',
        className,
      )}
    >
      <div className="flex flex-1 items-start justify-between gap-2 px-3.5 pb-3 pt-3 sm:gap-3 sm:px-4 sm:pb-3.5 sm:pt-3.5">
        <div className="min-w-0">
          <p className="eyebrow truncate">{label}</p>
          <p className="numeric mt-1.5 truncate text-lg font-semibold tracking-tight text-ink-900 min-[400px]:text-xl sm:mt-2 sm:text-2xl">{value}</p>
        </div>
        {spark && spark.length > 1 ? (
          /* On a two-up phone grid the number needs the room more than the glyph. */
          <span className="hidden min-[480px]:block"><MiniBars values={spark.slice(-12)} /></span>
        ) : (
          icon && (
            <span aria-hidden className="text-ink-300 [&>svg]:h-4 [&>svg]:w-4">
              {icon}
            </span>
          )
        )}
      </div>

      {(hasChange || hint) && (
        <div className="flex items-center justify-between gap-2 border-t border-ink-200 bg-ink-50 px-4 py-2">
          <span title={hint} className="text-ink-400">
            <Info aria-hidden className="h-3.5 w-3.5" />
            {hint && <span className="sr-only">{hint}</span>}
          </span>
          {hasChange && (
            <span className="flex min-w-0 items-center gap-1.5 text-xs">
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 font-medium',
                  flat ? 'text-ink-500' : positive ? 'text-success-600' : 'text-danger-600',
                )}
              >
                <TrendIcon aria-hidden className="h-3.5 w-3.5" />
                <span className="numeric">
                  {rising && !flat ? '+' : ''}
                  {(change * 100).toFixed(1)}%
                </span>
              </span>
              {changeLabel && <span className="truncate text-ink-500">{changeLabel}</span>}
            </span>
          )}
        </div>
      )}
    </Root>
  );
}
