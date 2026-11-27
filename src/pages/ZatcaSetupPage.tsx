import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, ExternalLink, KeyRound, Rocket, ShieldCheck, Store, TriangleAlert } from 'lucide-react';
import { Alert, Button, FormField, Input, LoadingState, PageHeader } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useTranslation, type TranslationKey } from '@/i18n';
import { cn } from '@/lib/cn';
import { ROUTES } from '@/routes/paths';
import { safeCall } from '@/services';
import { zatcaSetupApi, type ZatcaDetails, type ZatcaEnvironment, type ZatcaSetup } from '@/services/api/zatcaSetupApi';
import { HttpError } from '@/services/http';

const FATOORA: Record<ZatcaEnvironment, string> = {
  sandbox: 'https://sandbox.zatca.gov.sa/',
  simulation: 'https://fatoora.zatca.gov.sa/',
  production: 'https://fatoora.zatca.gov.sa/',
};

/**
 * ZATCA (Fatoora) phase 2 setup, in five steps a restaurant owner can follow without an accountant:
 * details → device and environment → request → connect with the OTP → go live.
 */
export default function ZatcaSetupPage() {
  const { t } = useTranslation();
  const tk = (key: string, vars?: Record<string, string>) => t(`zatcaSetup.${key}` as TranslationKey, vars as never);
  const toast = useToast();
  const [setup, setSetup] = useState<ZatcaSetup | null>(null);
  const [details, setDetails] = useState<ZatcaDetails | null>(null);
  const [environment, setEnvironment] = useState<ZatcaEnvironment>('sandbox');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const apply = (next: ZatcaSetup) => {
    setSetup(next);
    setDetails(next.details);
    setEnvironment(next.environment);
  };

  const load = useCallback(async () => {
    const result = await safeCall(() => zatcaSetupApi.get());
    if (result.ok) apply(result.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(step: string, work: () => Promise<ZatcaSetup>, done: string) {
    setBusy(step);
    setErrors({});
    const result = await safeCall(work);
    setBusy(null);
    if (result.ok) {
      apply(result.data);
      toast.success(tk(done));
      return;
    }
    const error = result.error;
    if (error instanceof HttpError && error.fieldErrors) {
      setErrors(Object.fromEntries(Object.entries(error.fieldErrors).map(([key, list]) => [key, list[0] ?? ''])));
    }
    toast.error(tk('failed'), error.message);
    void load();
  }

  if (!setup || !details) return <LoadingState className="py-20" />;

  const set = (key: keyof ZatcaDetails) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setDetails({ ...details, [key]: event.target.value });
  const field = (key: keyof ZatcaDetails, opts: { required?: boolean; inputMode?: 'numeric'; maxLength?: number; dir?: 'rtl' | 'ltr' } = {}) => (
    <FormField label={tk(`fields.${key}`)} hint={tk(`hints.${key}`) || undefined} error={errors[key]} required={opts.required ?? true}>
      <Input
        value={(details[key] as string) ?? ''}
        onChange={set(key)}
        inputMode={opts.inputMode}
        maxLength={opts.maxLength}
        dir={opts.dir}
        data-testid={`zatca-${key}`}
      />
    </FormField>
  );

  const steps = [
    { key: 'details', done: setup.steps.details, icon: Store },
    { key: 'csr', done: setup.steps.csr, icon: KeyRound },
    { key: 'compliance', done: setup.steps.compliance, icon: ShieldCheck },
    { key: 'live', done: setup.steps.live, icon: Rocket },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={tk('eyebrow')}
        title={tk('title')}
        description={tk('description')}
        actions={<Link to={ROUTES.zatca} className="text-sm text-ink-600 underline hover:text-ink-900">{tk('backToInvoices')}</Link>}
      />

      {/* Progress */}
      <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="zatca-steps">
        {steps.map(({ key, done, icon: Icon }, index) => (
          <li key={key} className={cn('flex items-center gap-3 rounded-xl border p-3', done ? 'border-success-200 bg-success-50/60' : 'border-ink-200 bg-surface')} data-done={done}>
            <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full', done ? 'bg-success-600 text-white' : 'bg-ink-100 text-ink-500')}>
              {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-4.5 w-4.5" />}
            </span>
            <span className="min-w-0">
              <span className="block text-2xs font-semibold uppercase tracking-wider text-ink-400">{tk('step', { n: String(index + 1) })}</span>
              <span className="block truncate text-sm font-semibold text-ink-900">{tk(`steps.${key}`)}</span>
            </span>
          </li>
        ))}
      </ol>

      {setup.steps.live && (
        <Alert tone="success" title={tk('liveTitle')}>{tk('liveBody', { env: tk(`env.${setup.environment}`) })}</Alert>
      )}
      {setup.lastError && !setup.steps.live && (
        <Alert tone="danger" title={tk('lastError')}>
          <span className="inline-flex items-start gap-1.5"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{setup.lastError}</span>
        </Alert>
      )}

      {/* Step 1 + 2: details, device, environment */}
      <section className="rounded-xl border border-ink-200 bg-surface shadow-xs">
        <header className="border-b border-ink-200 px-4 py-3">
          <h2 className="text-base font-semibold text-ink-900">1 · {tk('steps.details')}</h2>
          <p className="text-xs text-ink-500">{tk('detailsHelp')}</p>
        </header>
        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
          {field('sellerNameAr', { dir: 'rtl' })}
          {field('sellerNameEn', { required: false })}
          {field('vatNumber', { inputMode: 'numeric', maxLength: 15 })}
          {field('crNumber', { inputMode: 'numeric', maxLength: 10 })}
          {field('buildingNumber', { inputMode: 'numeric', maxLength: 4 })}
          {field('street')}
          {field('district')}
          {field('city')}
          {field('postalCode', { inputMode: 'numeric', maxLength: 5 })}
          {field('additionalNumber', { inputMode: 'numeric', maxLength: 4, required: false })}
          {field('branchName', { required: false })}
          {field('deviceName')}
        </div>

        <div className="border-t border-ink-200 p-4">
          <p className="mb-2 text-sm font-semibold text-ink-900">{tk('environment')}</p>
          <div className="grid gap-2 md:grid-cols-3" role="radiogroup" aria-label={tk('environment')}>
            {(['sandbox', 'simulation', 'production'] as ZatcaEnvironment[]).map((env) => (
              <button
                key={env}
                type="button"
                role="radio"
                aria-checked={environment === env}
                data-testid={`zatca-env-${env}`}
                onClick={() => setEnvironment(env)}
                className={cn('flex items-start gap-2 rounded-lg border p-3 text-start transition-colors', environment === env ? 'border-ink-900 bg-ink-50' : 'border-ink-200 hover:border-ink-300')}
              >
                {environment === env ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ink-900" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ink-300" />}
                <span>
                  <span className="block text-sm font-semibold text-ink-900">{tk(`env.${env}`)}</span>
                  <span className="block text-xs text-ink-500">{tk(`envHelp.${env}`)}</span>
                </span>
              </button>
            ))}
          </div>
          {setup.steps.csr && <p className="mt-3 text-xs text-warning-700">{tk('changeWarning')}</p>}
          <div className="mt-4 flex justify-end">
            <Button loading={busy === 'save'} data-testid="zatca-save" onClick={() => void run('save', () => zatcaSetupApi.save(environment, details), 'saved')}>
              {tk('save')}
            </Button>
          </div>
        </div>
      </section>

      {/* Step 2: request */}
      <section className={cn('rounded-xl border border-ink-200 bg-surface p-4 shadow-xs', !setup.steps.details && 'opacity-60')}>
        <h2 className="text-base font-semibold text-ink-900">2 · {tk('steps.csr')}</h2>
        <p className="mt-1 text-sm text-ink-600">{tk('csrHelp')}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-ink-500">{setup.steps.csr ? tk('csrDone') : ''}</span>
          <Button variant={setup.steps.csr ? 'outline' : 'primary'} disabled={!setup.steps.details} loading={busy === 'csr'} data-testid="zatca-csr"
            onClick={() => void run('csr', () => zatcaSetupApi.csr(), 'csrCreated')}>
            {setup.steps.csr ? tk('csrAgain') : tk('csrButton')}
          </Button>
        </div>
      </section>

      {/* Step 3: OTP */}
      <section className={cn('rounded-xl border border-ink-200 bg-surface p-4 shadow-xs', !setup.steps.csr && 'opacity-60')}>
        <h2 className="text-base font-semibold text-ink-900">3 · {tk('steps.compliance')}</h2>
        <ol className="mt-2 list-decimal space-y-1 ps-5 text-sm text-ink-700">
          <li>
            {tk('otp1')}{' '}
            <a href={FATOORA[setup.environment]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 underline">
              {tk('fatoora')} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </li>
          <li>{tk('otp2')}</li>
          <li>{tk('otp3')}</li>
        </ol>
        {setup.environment === 'sandbox' && <p className="mt-2 text-xs text-ink-500">{tk('sandboxOtp')}</p>}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <FormField label={tk('otpLabel')} error={errors.otp}>
            <Input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={10} className="w-40 text-lg tracking-widest" data-testid="zatca-otp" />
          </FormField>
          <Button disabled={!setup.steps.csr || otp.length < 4} loading={busy === 'otp'} data-testid="zatca-onboard"
            onClick={() => void run('otp', () => zatcaSetupApi.onboard(otp), 'connected')}>
            {tk('connect')}
          </Button>
        </div>
      </section>

      {/* Step 4: live */}
      <section className={cn('rounded-xl border border-ink-200 bg-surface p-4 shadow-xs', !setup.steps.compliance && 'opacity-60')}>
        <h2 className="text-base font-semibold text-ink-900">4 · {tk('steps.live')}</h2>
        <p className="mt-1 text-sm text-ink-600">{tk('liveHelp')}</p>
        <div className="mt-3 flex justify-end">
          <Button disabled={!setup.steps.compliance || setup.steps.live} loading={busy === 'live'} data-testid="zatca-live"
            onClick={() => void run('live', () => zatcaSetupApi.production(), 'wentLive')}>
            {setup.steps.live ? tk('isLive') : tk('goLive')}
          </Button>
        </div>
      </section>
    </div>
  );
}
