import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, AtSign, ChevronDown, Grid3x3, KeyRound, Mail, WifiOff } from 'lucide-react';
import { Alert, Button, FormField, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import { DEMO_TOOLS } from '@/config/env';
import { AuthLayout } from '../components/AuthLayout';
import { PersonaIcon } from '../components/PersonaIcon';
import { PinPad } from '../components/PinPad';
import { useAuth, isAuthSession } from '../context/AuthContext';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, DEMO_TENANTS } from '../services/authService';
import type { DemoAccount } from '@/services/mock/tenants';
import { useTranslation } from '@/i18n';

type Mode = 'password' | 'pin';

/**
 * Sign in.
 *
 * Two ways in, because the people using this differ: an owner at a desk types
 * an email and password; a cashier on a shared Sunmi terminal taps a 4-digit
 * PIN. In the offline demo a third panel lists every predefined persona —
 * one tap fills the form and signs in, so nobody hunts for credentials.
 */
export default function Login() {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { requestOtp, signInWithPin } = useAuth();

  /* Shared terminals and tablets are touch-first and staff sign in with a PIN;
     a desk with a mouse starts on email. The last choice on this device wins. */
  const [mode, setModeState] = useState<Mode>(() => {
    try {
      const saved = localStorage.getItem('login.mode');
      if (saved === 'pin' || saved === 'password') return saved;
    } catch {
      /* storage blocked */
    }
    return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 'pin' : 'password';
  });
  const setMode = (next: Mode) => {
    setModeState(next);
    try {
      localStorage.setItem('login.mode', next);
    } catch {
      /* storage blocked */
    }
  };
  const [personasOpen, setPersonasOpen] = useState(() => typeof window === 'undefined' || window.matchMedia?.('(min-width: 768px)').matches);
  const [tenantFilter, setTenantFilter] = useState<string>('all');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activePersona, setActivePersona] = useState<string | null>(null);

  /* Return to the page that bounced them here, if it was not the root. */
  const from = (location.state as { from?: string } | null)?.from;
  const destination = (landing: string) => (from && from !== '/' ? from : landing);

  async function signIn(email: string, secret: string) {
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestOtp(email, 'login', secret);
      navigate(isAuthSession(result) ? destination(result.landingPath) : '/login/otp', { replace: true });
    } catch (caught) {
      const failure = caught as { fieldErrors?: Record<string, string[]>; message?: string };
      setError(
        failure.fieldErrors?.identifier?.[0] ?? failure.fieldErrors?.password?.[0] ?? failure.message ?? null,
      );
    } finally {
      setSubmitting(false);
      setActivePersona(null);
    }
  }

  async function usePersona(account: DemoAccount) {
    setModeState('password');
    setIdentifier(account.email);
    setPassword(account.password);
    setActivePersona(account.userId);
    await signIn(account.email, account.password);
  }

  async function submitPin(pin: string) {
    setSubmitting(true);
    setError(null);
    try {
      const session = await signInWithPin(pin);
      navigate(destination(session.landingPath), { replace: true });
    } catch (caught) {
      setError((caught as { message?: string }).message ?? t('demo.pinInvalid'));
    } finally {
      setSubmitting(false);
    }
  }

  const ar = language === 'ar';

  return (
    <AuthLayout
      title={t('auth.signInTitle')}
      subtitle={mode === 'pin' ? t('demo.pinSubtitle') : t('demo.signInSubtitle')}
      wide={DEMO_TOOLS}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-medium text-ink-900 underline-offset-4 hover:underline">
            {t('auth.createAccount')}
          </Link>
        </>
      }
    >
      <div className={cn(DEMO_TOOLS && 'grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]')}>
        {/* ---------------- Sign-in form ---------------- */}
        <div className="space-y-4">
          <div role="tablist" className="grid grid-cols-2 gap-1 rounded-lg bg-ink-100 p-1">
            {(
              [
                ['password', Mail, t('demo.tabEmail')],
                ['pin', Grid3x3, t('demo.tabPin')],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={mode === key}
                onClick={() => {
                  setMode(key);
                  setError(null);
                }}
                className={cn(
                  'flex h-11 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors sm:h-9',
                  mode === key ? 'bg-surface text-ink-900 shadow-xs' : 'text-ink-500 hover:text-ink-800',
                )}
              >
                <Icon aria-hidden className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {mode === 'password' ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (identifier.trim() && password) void signIn(identifier, password);
              }}
            >
              <FormField label={t('demo.emailLabel')} required>
                <Input
                  dir="ltr"
                  inputSize="lg"
                  autoComplete="username"
                  value={identifier}
                  onChange={(event) => {
                    setIdentifier(event.target.value);
                    setError(null);
                  }}
                  placeholder="name@company.sa"
                  leadingAddon={<AtSign aria-hidden />}
                />
              </FormField>

              <FormField label={t('auth.passwordLabel')} required error={error ?? undefined}>
                <Input
                  dir="ltr"
                  type="password"
                  inputSize="lg"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError(null);
                  }}
                  leadingAddon={<KeyRound aria-hidden />}
                />
              </FormField>

              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={submitting && !activePersona}
                disabled={!identifier.trim() || !password || submitting}
                trailingIcon={<ArrowRight className="flip-rtl" />}
              >
                {t('auth.signIn')}
              </Button>

              {DEMO_TOOLS && (
                <p className="text-center text-xs text-ink-500">
                  {t('demo.passwordHint')}{' '}
                  <code className="numeric rounded bg-ink-100 px-1.5 py-0.5 font-mono text-ink-800">
                    {DEMO_PASSWORD}
                  </code>
                </p>
              )}
            </form>
          ) : (
            <div className="space-y-4 pt-1">
              <PinPad busy={submitting} error={error} onComplete={(pin) => void submitPin(pin)} />
              {error && <Alert tone="danger" compact>{error}</Alert>}
              {DEMO_TOOLS && (
                <p className="text-center text-xs text-ink-500">
                  {t('demo.pinHint')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ---------------- Predefined personas (mock mode only) ---------------- */}
        {DEMO_TOOLS && (
          <section
            aria-labelledby="demo-personas"
            className="rounded-lg border border-ink-200 bg-ink-50/70 p-3 sm:p-4"
          >
            <button
              type="button"
              onClick={() => setPersonasOpen((v) => !v)}
              aria-expanded={personasOpen}
              data-testid="personas-toggle"
              className="flex w-full items-start justify-between gap-3 text-start"
            >
              <div>
                <h2 id="demo-personas" className="text-sm font-semibold text-ink-900">
                  {t('demo.personasTitle')}
                </h2>
                <p className="text-xs text-ink-500">{t('demo.personasSubtitle')}</p>
              </div>
              <span className="flex shrink-0 items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-surface px-2 py-0.5 text-2xs font-medium text-ink-600">
                  <WifiOff aria-hidden className="h-3 w-3" />
                  {t('demo.offline')}
                </span>
                <ChevronDown aria-hidden className={cn('h-4 w-4 text-ink-400 transition-transform md:hidden', personasOpen && 'rotate-180')} />
              </span>
            </button>

            {personasOpen && (
            <>
            {/* Tenant chips: on a phone, a short list of one business beats a long scroll of three. */}
            <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
              {[{ id: 'all', label: t('demo.allTenants') }, ...DEMO_TENANTS.map((tn) => ({ id: tn.id, label: ar ? tn.nameAr : tn.nameEn }))].map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setTenantFilter(chip.id)}
                  className={cn(
                    'h-8 shrink-0 whitespace-nowrap rounded-full border px-3 text-xs font-medium',
                    tenantFilter === chip.id ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-surface text-ink-600',
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="mt-2 space-y-4 pe-1 md:max-h-[26rem] md:overflow-y-auto">
              {DEMO_TENANTS.filter((tn) => tenantFilter === 'all' || tn.id === tenantFilter).map((tenant) => (
                <div key={tenant.id} className="space-y-1.5">
                  <div className="flex items-center gap-2 px-1">
                    <span className="grid h-5 w-5 place-items-center rounded bg-ink-900 text-[9px] font-bold text-ink-50">
                      {tenant.initials}
                    </span>
                    <span className="text-xs font-semibold text-ink-800">
                      {ar ? tenant.nameAr : tenant.nameEn}
                    </span>
                    <span className="truncate text-2xs text-ink-400">
                      · {ar ? tenant.planAr : tenant.planEn}
                    </span>
                  </div>

                  {DEMO_ACCOUNTS.filter((account) => account.tenantId === tenant.id).map((account) => (
                    <button
                      key={account.userId}
                      type="button"
                      disabled={submitting}
                      onClick={() => void usePersona(account)}
                      className={cn(
                        'group flex min-h-[3.25rem] w-full items-center gap-3 rounded-md border border-ink-200 bg-surface px-3 py-2.5 text-start shadow-xs transition',
                        'hover:border-ink-400 hover:shadow-sm disabled:cursor-wait disabled:opacity-60',
                        activePersona === account.userId && 'border-ink-900 ring-1 ring-ink-900',
                      )}
                    >
                      <PersonaIcon kind={account.icon} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-ink-900">
                            {ar ? account.titleAr : account.titleEn}
                          </span>
                          {account.pin && (
                            <span className="numeric rounded border border-ink-200 px-1 text-2xs text-ink-500">
                              PIN {account.pin}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-ink-500" dir="ltr">
                          {account.email}
                        </span>
                      </span>
                      <ArrowRight
                        aria-hidden
                        className="flip-rtl h-4 w-4 shrink-0 text-ink-300 transition group-hover:text-ink-900"
                      />
                    </button>
                  ))}
                </div>
              ))}
            </div>
            </>
            )}
          </section>
        )}
      </div>
    </AuthLayout>
  );
}
