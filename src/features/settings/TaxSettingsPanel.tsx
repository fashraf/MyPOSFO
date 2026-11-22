import { useEffect, useMemo, useState } from 'react';
import { Plus, Power, Receipt, Save, Trash2 } from 'lucide-react';
import { Alert, Button, Card, CardBody, FormField, ImpactConfirm, Input, LoadingState, Select, Switch } from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { describeTax, safeCall, taxService } from '@/services';
import {
  computeTax,
  presetFor,
  TAX_PRESETS,
  trimPercent,
  validateTax,
  type TaxCountry,
  type TaxKind,
  type TaxRate,
  type TaxSettings,
} from '@/types/tax';

const KINDS: TaxKind[] = ['standard', 'reduced', 'zero', 'exempt'];
const SAMPLE_H = 10_000;

/**
 * Settings & Tax → Tax.
 *
 * Tax is set once for the business (it follows the legal registration, not the
 * branch). Picking a country loads a ready-made setup; everything stays
 * editable. Turning tax off stops charging, showing and reporting it on new
 * orders — past invoices keep the tax they were issued with.
 */
export function TaxSettingsPanel() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { user, can } = useSession();
  const toast = useToast();

  const [saved, setSaved] = useState<TaxSettings | null>(null);
  const [draft, setDraft] = useState<TaxSettings | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const canEdit = can('settings.edit');
  const money = (h: number) => formatCurrency(h, { language });

  useEffect(() => {
    safeCall(() => taxService.get()).then((res) => {
      if (res.ok) {
        setSaved(res.data);
        setDraft(res.data);
      }
    });
  }, []);

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);
  const sample = useMemo(() => (draft ? computeTax([{ amountH: SAMPLE_H, rateId: draft.defaultRateId }], draft) : null), [draft]);
  const sampleBefore = useMemo(() => (saved ? computeTax([{ amountH: SAMPLE_H, rateId: saved.defaultRateId }], saved) : null), [saved]);

  if (!draft || !saved) return <LoadingState className="py-16" />;

  const set = <K extends keyof TaxSettings>(key: K, value: TaxSettings[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const setRate = (i: number, patch: Partial<TaxRate>) =>
    setDraft((d) => {
      if (!d) return d;
      const rates = d.rates.map((r, idx) => {
        if (idx !== i) return r;
        const next = { ...r, ...patch };
        /* Keep GST halves in step with the total. */
        if (patch.percent !== undefined && d.regime === 'gst' && next.percent > 0) {
          next.components = [{ name: 'CGST', percent: next.percent / 2 }, { name: 'SGST', percent: next.percent / 2 }];
        }
        if (next.percent === 0) next.components = [];
        return next;
      });
      return { ...d, rates };
    });

  const applyPreset = (country: TaxCountry) => {
    const preset = presetFor(country);
    setDraft((d) => (d ? { ...preset.settings, registrationNumber: d.country === country ? d.registrationNumber : '' } : d));
    setErrors({});
  };

  const tryToSave = () => {
    const found = validateTax(draft);
    setErrors(found);
    if (Object.keys(found).length === 0) setConfirming(true);
  };

  const save = async () => {
    setBusy(true);
    const res = await safeCall(() => taxService.update(draft, user ? (language === 'ar' ? user.nameAr : user.nameEn) : 'System'));
    setBusy(false);
    setConfirming(false);
    if (!res.ok) return toast.error(t('taxSettings.failed'), res.error.message);
    setSaved(res.data);
    setDraft(res.data);
    toast.success(t('taxSettings.saved'), describeTax(res.data));
  };

  const effects: string[] = [];
  if (saved.enabled && !draft.enabled) {
    effects.push(t('taxSettings.effects.off'), t('taxSettings.effects.offReceipts'));
  } else if (!saved.enabled && draft.enabled) {
    effects.push(t('taxSettings.effects.on', { name: draft.taxName }));
  }
  if (draft.enabled) {
    if (saved.pricesIncludeTax !== draft.pricesIncludeTax) {
      effects.push(draft.pricesIncludeTax ? t('taxSettings.effects.nowInclusive') : t('taxSettings.effects.nowExclusive'));
    }
    if (sample && sampleBefore && (sample.totalH !== sampleBefore.totalH || sample.taxH !== sampleBefore.taxH)) {
      effects.push(t('taxSettings.effects.sample', { price: money(SAMPLE_H), before: money(sampleBefore.totalH), after: money(sample.totalH) }));
    }
    if (saved.country !== draft.country) effects.push(t('taxSettings.effects.country', { name: presetFor(draft.country).label }));
    if (saved.zatca && !draft.zatca) effects.push(t('taxSettings.effects.zatcaOff'));
  }
  effects.push(t('taxSettings.effects.history'));

  return (
    <div className="space-y-3" data-testid="tax-settings">
      {/* Master switch */}
      <Card className={cn(!draft.enabled && 'border-warning-300')}>
        <CardBody className="flex flex-wrap items-center gap-3">
          <span className={cn('grid h-10 w-10 place-items-center rounded-xl', draft.enabled ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700')}>
            <Power className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-ink-900">{draft.enabled ? t('taxSettings.onTitle', { name: draft.taxName }) : t('taxSettings.offTitle')}</div>
            <div className="text-sm text-ink-500">{draft.enabled ? describeTax(draft) : t('taxSettings.offBody')}</div>
          </div>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(v) => set('enabled', v)}
            label={t('taxSettings.master')}
            disabled={!canEdit}
            data-testid="tax-master"
          />
        </CardBody>
      </Card>

      {!draft.enabled && (
        <Alert tone="warning" compact>{t('taxSettings.offWarning')}</Alert>
      )}

      <div className={cn('grid gap-3 lg:grid-cols-3', !draft.enabled && 'pointer-events-none opacity-50')} aria-disabled={!draft.enabled || undefined}>
        <Card className="lg:col-span-2">
          <CardBody className="space-y-4">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">{t('taxSettings.sections.setup')}</h2>

            <FormField label={t('taxSettings.country')} help={t('taxSettings.countryHelp')}>
              <Select
                value={draft.country}
                onChange={(v) => v && applyPreset(v as TaxCountry)}
                options={TAX_PRESETS.map((p) => ({ value: p.country, label: `${p.flag}  ${p.label}` }))}
                disabled={!canEdit}
                aria-label={t('taxSettings.country')}
              />
            </FormField>

            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label={t('taxSettings.taxName')} error={errors.taxName}>
                <Input inputSize="sm" value={draft.taxName} onChange={(e) => set('taxName', e.target.value)} disabled={!canEdit} />
              </FormField>
              <FormField label={t('taxSettings.registrationLabel')}>
                <Input inputSize="sm" value={draft.registrationLabel} onChange={(e) => set('registrationLabel', e.target.value)} disabled={!canEdit} />
              </FormField>
              <FormField label={draft.registrationLabel || t('taxSettings.registrationNumber')} error={errors.registrationNumber}>
                <Input inputSize="sm" dir="ltr" value={draft.registrationNumber} onChange={(e) => set('registrationNumber', e.target.value)} disabled={!canEdit} data-testid="tax-reg" />
              </FormField>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {[true, false].map((inclusive) => (
                <button
                  key={String(inclusive)}
                  type="button"
                  disabled={!canEdit}
                  data-testid={inclusive ? 'tax-inclusive' : 'tax-exclusive'}
                  onClick={() => set('pricesIncludeTax', inclusive)}
                  className={cn(
                    'rounded-lg border p-3 text-start transition-colors',
                    draft.pricesIncludeTax === inclusive ? 'border-info-400 bg-info-50 ring-1 ring-info-300' : 'border-ink-200 hover:bg-ink-50',
                  )}
                >
                  <div className="text-sm font-semibold text-ink-900">{inclusive ? t('taxSettings.inclusive') : t('taxSettings.exclusive')}</div>
                  <div className="text-xs text-ink-500">{inclusive ? t('taxSettings.inclusiveHelp') : t('taxSettings.exclusiveHelp')}</div>
                </button>
              ))}
            </div>

            {draft.regime === 'gst' && (
              <div className="grid gap-3 rounded-lg border border-ink-200 p-3 sm:grid-cols-2" data-testid="gst-panel">
                <FormField label={t('taxSettings.gstSupply')} help={t('taxSettings.gstSupplyHelp')}>
                  <Select
                    value={draft.gstSupply}
                    onChange={(v) => set('gstSupply', (v || 'intra') as TaxSettings['gstSupply'])}
                    options={[
                      { value: 'intra', label: t('taxSettings.intra') },
                      { value: 'inter', label: t('taxSettings.inter') },
                    ]}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField label={t('taxSettings.gstState')}>
                  <Input inputSize="sm" value={draft.gstState} onChange={(e) => set('gstState', e.target.value)} disabled={!canEdit} />
                </FormField>
              </div>
            )}

            <div className="space-y-2">
              <div className="rounded-md border border-ink-200 px-3 py-2.5">
                <Switch checked={draft.showBreakdown} onCheckedChange={(v) => set('showBreakdown', v)} label={t('taxSettings.breakdown')} description={t('taxSettings.breakdownHelp')} disabled={!canEdit} />
              </div>
              {draft.country === 'SA' && (
                <div className="rounded-md border border-ink-200 px-3 py-2.5">
                  <Switch checked={draft.zatca} onCheckedChange={(v) => set('zatca', v)} label={t('taxSettings.zatca')} description={t('taxSettings.zatcaHelp')} disabled={!canEdit} />
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Live preview */}
        <Card>
          <CardBody className="space-y-2" data-testid="tax-preview">
            <h2 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-400"><Receipt className="h-3.5 w-3.5" />{t('taxSettings.preview')}</h2>
            <p className="text-xs text-ink-500">{t('taxSettings.previewHelp', { price: money(SAMPLE_H) })}</p>
            {sample && (
              <dl className="space-y-1 rounded-lg bg-ink-50 p-3 text-sm">
                <div className="flex justify-between"><dt className="text-ink-500">{t('taxSettings.menuPrice')}</dt><dd className="tabular-nums">{money(SAMPLE_H)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">{t('taxSettings.net')}</dt><dd className="tabular-nums">{money(sample.netH)}</dd></div>
                {sample.lines.map((l) => (
                  <div key={l.label} className="flex justify-between"><dt className="text-ink-500">{l.label}</dt><dd className="tabular-nums">{money(l.taxH)}</dd></div>
                ))}
                <div className="flex justify-between border-t border-ink-200 pt-1 font-semibold"><dt>{t('taxSettings.customerPays')}</dt><dd className="tabular-nums" data-testid="tax-preview-total">{money(sample.totalH)}</dd></div>
              </dl>
            )}
          </CardBody>
        </Card>

        {/* Rates */}
        <Card className="lg:col-span-3">
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">{t('taxSettings.sections.rates')}</h2>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  leadingIcon={<Plus />}
                  onClick={() =>
                    set('rates', [...draft.rates, { id: `rate_${Date.now().toString(36)}`, name: t('taxSettings.newRate'), kind: 'standard', percent: 0, components: [] }])
                  }
                >
                  {t('taxSettings.addRate')}
                </Button>
              )}
            </div>
            {errors.rates && <p className="text-sm text-danger-700">{errors.rates}</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-start text-2xs uppercase tracking-wider text-ink-400">
                    <th className="py-1 text-start">{t('taxSettings.cols.default')}</th>
                    <th className="py-1 text-start">{t('taxSettings.cols.name')}</th>
                    <th className="py-1 text-start">{t('taxSettings.cols.kind')}</th>
                    <th className="py-1 text-start">{t('taxSettings.cols.percent')}</th>
                    <th className="py-1 text-start">{t('taxSettings.cols.charged')}</th>
                    <th className="py-1 text-start">{t('taxSettings.cols.code')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {draft.rates.map((rate, i) => (
                    <tr key={rate.id} data-testid="tax-rate-row">
                      <td className="py-1.5">
                        <input type="radio" name="defaultRate" checked={draft.defaultRateId === rate.id} onChange={() => set('defaultRateId', rate.id)} disabled={!canEdit} aria-label={t('taxSettings.cols.default')} />
                      </td>
                      <td className="py-1.5 pe-2"><Input inputSize="sm" value={rate.name} onChange={(e) => setRate(i, { name: e.target.value })} disabled={!canEdit} /></td>
                      <td className="py-1.5 pe-2">
                        <Select
                          selectSize="sm"
                          value={rate.kind}
                          onChange={(v) => setRate(i, { kind: (v || 'standard') as TaxKind, ...(v === 'zero' || v === 'exempt' ? { percent: 0 } : {}) })}
                          options={KINDS.map((k) => ({ value: k, label: t(`taxSettings.kinds.${k}`) }))}
                          disabled={!canEdit}
                        />
                      </td>
                      <td className="w-28 py-1.5 pe-2">
                        <Input
                          inputSize="sm"
                          type="number"
                          min="0"
                          max="100"
                          step="0.25"
                          dir="ltr"
                          value={rate.percent}
                          onChange={(e) => setRate(i, { percent: Math.max(0, Number(e.target.value) || 0) })}
                          trailingAddon={<span className="text-xs text-ink-500">%</span>}
                          disabled={!canEdit || rate.kind === 'zero' || rate.kind === 'exempt'}
                          data-testid={`tax-rate-percent-${i}`}
                        />
                      </td>
                      <td className="py-1.5 pe-2 text-xs text-ink-600">
                        {rate.percent <= 0
                          ? t(`taxSettings.kinds.${rate.kind}`)
                          : draft.regime === 'gst' && draft.gstSupply === 'inter'
                            ? `IGST ${trimPercent(rate.percent)}%`
                            : rate.components.length
                              ? rate.components.map((c) => `${c.name} ${trimPercent(c.percent)}%`).join(' + ')
                              : `${draft.taxName} ${trimPercent(rate.percent)}%`}
                        {errors[`rate_${i}`] && <div className="text-danger-700">{errors[`rate_${i}`]}</div>}
                      </td>
                      <td className="w-28 py-1.5 pe-2"><Input inputSize="sm" value={rate.code ?? ''} onChange={(e) => setRate(i, { code: e.target.value })} placeholder={draft.regime === 'gst' ? 'SAC 9963' : ''} disabled={!canEdit} /></td>
                      <td className="py-1.5 text-end">
                        {canEdit && draft.rates.length > 1 && draft.defaultRateId !== rate.id && (
                          <button type="button" aria-label={t('taxSettings.removeRate')} className="grid h-8 w-8 place-items-center rounded-md text-ink-400 hover:bg-danger-50 hover:text-danger-600" onClick={() => set('rates', draft.rates.filter((_, idx) => idx !== i))}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-500">{t('taxSettings.ratesHelp')}</p>
          </CardBody>
        </Card>
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-xl border border-ink-200 bg-surface/95 px-4 py-3 backdrop-blur">
        <span className="text-sm text-ink-500">{dirty ? t('taxSettings.unsaved') : saved.updatedAt ? t('taxSettings.lastSaved', { by: saved.updatedBy ?? '—' }) : t('taxSettings.factory')}</span>
        <div className="flex gap-2">
          {dirty && <Button variant="ghost" onClick={() => { setDraft(saved); setErrors({}); }}>{t('taxSettings.discard')}</Button>}
          <Button leadingIcon={<Save />} onClick={tryToSave} disabled={!dirty || !canEdit} data-testid="tax-save">{t('taxSettings.save')}</Button>
        </div>
      </div>

      <ImpactConfirm
        open={confirming}
        title={t('taxSettings.confirmTitle')}
        description={t('taxSettings.confirmBody')}
        facts={[
          { label: t('taxSettings.before'), value: describeTax(saved) },
          { label: t('taxSettings.after'), value: describeTax(draft), emphasis: true },
        ]}
        effects={effects}
        confirmLabel={t('taxSettings.confirmButton')}
        variant={saved.enabled && !draft.enabled ? 'warning' : 'primary'}
        loading={busy}
        onConfirm={save}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
