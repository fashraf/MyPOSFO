import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { className, checked, onCheckedChange, label, description, disabled, ...props },
  ref,
) {
  const labelId = useId();
  const control = (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={label ? labelId : undefined}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150',
        checked ? 'bg-brand-600' : 'bg-ink-300',
        'disabled:cursor-not-allowed disabled:opacity-55',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-surface shadow-sm transition-transform duration-150',
          checked ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  );

  if (!label && !description) return control;

  return (
    /* The whole row toggles, not just the small pill — a bigger target, and
       what people expect when they tap the words. */
    <div
      className={cn('flex items-start justify-between gap-4', !disabled && 'cursor-pointer')}
      onClick={(event) => {
        if (disabled || (event.target as HTMLElement).closest('button')) return;
        onCheckedChange(!checked);
      }}
    >
      <span className="space-y-0.5">
        {label && <span id={labelId} className="block text-base font-medium text-ink-800">{label}</span>}
        {description && <span className="block text-xs text-ink-500">{description}</span>}
      </span>
      {control}
    </div>
  );
});
