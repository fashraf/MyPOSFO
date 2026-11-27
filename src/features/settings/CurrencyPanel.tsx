import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, ImageUp, Save } from 'lucide-react';
import { Alert, Button, CurrencyDisplay, FormField, Input } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useTranslation, type TranslationKey } from '@/i18n';
import { cn } from '@/lib/cn';
import { applyCurrencySymbol, currencySymbol, RIYAL_SIGN, type CurrencySymbolMode, type CurrencySymbolSetting } from '@/lib/currencySymbol';
import { currencySymbolService } from '@/services';

/** Settings → Currency: the money label used on every screen and receipt. */
export function CurrencyPanel() {
  const { t } = useTranslation();
  const tk = (k: string) => t(`currencySymbol.${k}` as TranslationKey);
  const toast = useToast();
  const saved = useRef(currencySymbol());
  const [draft, setDraft] = useState<CurrencySymbolSetting>(currencySymbol());
  const [saving, setSaving] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  /* Leaving the tab without saving puts the saved symbol back. */
  useEffect(() => () => applyCurrencySymbol(saved.current), []);

  /* Preview live: apply the draft while on this tab, put the saved one back if not saved. */
  const preview = (next: CurrencySymbolSetting) => {
    setDraft(next);
    applyCurrencySymbol(next);
  };

  const options: { mode: CurrencySymbolMode; sample: React.ReactNode }[] = [
    { mode: 'code', sample: 'SAR' },
    { mode: 'arabic', sample: 'ر.س' },
    { mode: 'unicode', sample: <span className="text-lg">{RIYAL_SIGN}</span> },
    { mode: 'image', sample: draft.imageDataUrl ? <img src={draft.imageDataUrl} alt="" className="h-5 w-auto" /> : <ImageUp className="h-5 w-5" /> },
    { mode: 'text', sample: draft.text || 'Abc' },
  ];

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 60_000) {
      toast.error(tk('tooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => preview({ ...draft, mode: 'image', imageDataUrl: String(reader.result) });
    reader.readAsDataURL(f);
  }

  async function save() {
    setSaving(true);
    try {
      saved.current = await currencySymbolService.save(draft);
      toast.success(tk('saved'));
    } catch (error) {
      toast.error(tk('failed'), (error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.current);

  return (
    <section className="space-y-4 rounded-xl border border-ink-200 bg-surface p-4 shadow-xs" data-testid="currency-panel">
      <div>
        <h2 className="text-base font-semibold text-ink-900">{tk('title')}</h2>
        <p className="text-sm text-ink-500">{tk('description')}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" role="radiogroup" aria-label={tk('title')}>
        {options.map(({ mode, sample }) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={draft.mode === mode}
            data-testid={`currency-${mode}`}
            onClick={() => (mode === 'image' && !draft.imageDataUrl ? file.current?.click() : preview({ ...draft, mode }))}
            className={cn('flex items-start gap-2 rounded-lg border p-3 text-start', draft.mode === mode ? 'border-ink-900 bg-ink-50' : 'border-ink-200 hover:border-ink-300')}
          >
            {draft.mode === mode ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ink-300" />}
            <span className="min-w-0">
              <span className="flex h-6 items-center font-semibold text-ink-900">{sample}</span>
              <span className="block text-xs text-ink-500">{tk(`modes.${mode}`)}</span>
            </span>
          </button>
        ))}
      </div>
      <input ref={file} type="file" accept="image/svg+xml,image/png,image/webp" className="hidden" onChange={onFile} data-testid="currency-file" />

      {draft.mode === 'image' && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" leadingIcon={<ImageUp />} onClick={() => file.current?.click()}>{tk('upload')}</Button>
          <span className="text-xs text-ink-500">{tk('imageHint')}</span>
        </div>
      )}
      {draft.mode === 'unicode' && <Alert tone="tip" compact>{tk('unicodeHint')}</Alert>}
      {draft.mode === 'text' && (
        <FormField label={tk('textLabel')}>
          <Input value={draft.text} maxLength={8} onChange={(e) => preview({ ...draft, text: e.target.value })} className="w-40" data-testid="currency-text" />
        </FormField>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <span className="text-sm font-medium text-ink-800">{tk('position')}</span>
        {(['before', 'after'] as const).map((p) => (
          <label key={p} className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="radio" name="currency-position" checked={draft.position === p} onChange={() => preview({ ...draft, position: p })} data-testid={`currency-pos-${p}`} />
            {tk(`positions.${p}`)}
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ink-50 p-3">
        <span className="text-sm text-ink-600">{tk('preview')}</span>
        <span className="flex items-center gap-4 text-lg font-semibold text-ink-900" data-testid="currency-preview">
          <CurrencyDisplay amount={1250} /> <CurrencyDisplay amount={-375} className="text-danger-600" />
        </span>
      </div>

      <div className="flex justify-end gap-2">
        {dirty && <Button variant="ghost" onClick={() => preview(saved.current)}>{tk('undo')}</Button>}
        <Button leadingIcon={<Save />} disabled={!dirty} loading={saving} onClick={() => void save()} data-testid="currency-save">{tk('save')}</Button>
      </div>
    </section>
  );
}
