import { Input, Select } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useRs } from './shared';

export interface ReasonValue {
  code: string;
  note: string;
}

export const EMPTY_REASON: ReasonValue = { code: '', note: '' };

/** "Change given wrongly: table 4" — what is stored and printed. */
export function reasonText(value: ReasonValue, label: (code: string) => string): string {
  if (!value.code) return '';
  const base = value.code === 'other' ? '' : label(value.code);
  const note = value.note.trim();
  if (value.code === 'other') return note;
  return note ? `${base}: ${note}` : base;
}

export function reasonValid(value: ReasonValue): boolean {
  return !!value.code && (value.code !== 'other' || value.note.trim().length > 0);
}

/**
 * A reason picked from a list, with a short note. "Other" makes the note
 * required. `id` is put on the list so a "fix this" link can focus it.
 */
export function ReasonPicker({
  id,
  group,
  codes,
  value,
  onChange,
  invalid,
}: {
  id: string;
  /** i18n group under rs.reasons: 'difference' | 'pending'. */
  group: 'difference' | 'pending';
  codes: readonly string[];
  value: ReasonValue;
  onChange: (value: ReasonValue) => void;
  invalid?: boolean;
}) {
  const { r } = useRs();
  return (
    <div className="space-y-2" data-testid={`reason-${group}`}>
      <Select
        id={id}
        value={value.code}
        onChange={(code) => onChange({ ...value, code })}
        placeholder={r('reasons.pick')}
        invalid={invalid && !value.code}
        options={codes.map((code) => ({ value: code, label: r(`reasons.${group}.${code}`) }))}
        aria-label={r(`reasons.${group}Label`)}
      />
      {value.code && (
        <Input
          id={`${id}-note`}
          inputSize="sm"
          value={value.note}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          maxLength={200}
          placeholder={value.code === 'other' ? r('reasons.noteRequired') : r('reasons.noteOptional')}
          className={cn(invalid && value.code === 'other' && !value.note.trim() && 'ring-1 ring-danger-400')}
          data-testid={`reason-${group}-note`}
        />
      )}
    </div>
  );
}

/** Scroll to a field and put the cursor in it (the list button, or its note). */
export function focusField(id: string) {
  const el = document.getElementById(id) ?? document.querySelector<HTMLElement>(`[data-field="${id}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const target = (el.matches('button, input, textarea, [tabindex]') ? el : el.querySelector<HTMLElement>('button, input, textarea')) ?? el;
  window.setTimeout(() => target.focus({ preventScroll: true }), 250);
}
