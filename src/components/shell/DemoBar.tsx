import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, FlaskConical, RotateCcw, Users } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Dropdown } from '@/components/ui/Dropdown';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/features/auth/context/AuthContext';
import { useTranslation } from '@/i18n';
import { DEMO_TOOLS } from '@/config/env';
import { resetAllDemoData } from '@/services/mock/db';
import { DEMO_ACCOUNTS, DEMO_TENANTS, accountByUserId, tenantById } from '@/services/mock/tenants';
import { cn } from '@/lib/cn';

/**
 * The demo session bar.
 *
 * Visible only in mock mode. Says which tenant and persona the tester is
 * looking at, swaps persona in two clicks (crossing tenants swaps the whole
 * database), and resets every tenant to factory seed. It sits above the app
 * header in a single quiet line so it never covers the product being shown.
 */
export function DemoBar() {
  const { t, language } = useTranslation();
  const { session, switchPersona } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [switching, setSwitching] = useState(false);

  if (!DEMO_TOOLS || !session) return null;

  const ar = language === 'ar';
  const account = accountByUserId(session.userId);
  const tenant = tenantById(account?.tenantId ?? session.tenantId);

  async function become(userId: string) {
    if (userId === session?.userId) return;
    setSwitching(true);
    try {
      const next = await switchPersona(userId);
      const persona = accountByUserId(userId);
      navigate(next.landingPath, { replace: true });
      toast.success(
        t('demo.switched'),
        persona ? `${persona.displayName} · ${ar ? persona.titleAr : persona.titleEn}` : undefined,
      );
    } catch (caught) {
      toast.error(t('demo.switchFailed'), (caught as Error).message);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-ink-200 bg-ink-900 px-3 text-2xs text-ink-300 sm:px-4 dark:bg-ink-100">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 font-medium text-white dark:text-ink-900">
        <FlaskConical aria-hidden className="h-3 w-3" />
        <span className="hidden sm:inline">{t('demo.badge')}</span>
      </span>

      {tenant && (
        <span className="hidden truncate text-ink-300 md:inline">
          <span className="font-medium text-white dark:text-ink-900">{ar ? tenant.nameAr : tenant.nameEn}</span>
          <span className="mx-1.5 text-ink-500">/</span>
        </span>
      )}

      <Dropdown
        align="start"
        panelClassName="w-80 max-h-[70vh] overflow-y-auto"
        trigger={
          <button
            type="button"
            disabled={switching}
            className="inline-flex min-w-0 items-center gap-1.5 rounded px-1.5 py-1 font-medium text-white transition-colors hover:bg-white/10 dark:text-ink-900"
          >
            <Users aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className="truncate">
              {account ? `${account.displayName} · ${ar ? account.titleAr : account.titleEn}` : session.displayName}
            </span>
            <ChevronDown aria-hidden className="h-3 w-3 shrink-0 opacity-70" />
          </button>
        }
        items={DEMO_TENANTS.flatMap((group, groupIndex) =>
          DEMO_ACCOUNTS.filter((candidate) => candidate.tenantId === group.id).map((candidate, index) => ({
            key: candidate.userId,
            separated: groupIndex > 0 && index === 0,
            icon: candidate.userId === session.userId ? <Check /> : <span className="inline-block h-4 w-4" />,
            label: (
              <span className={cn(candidate.userId === session.userId && 'font-semibold')}>
                {ar ? candidate.titleAr : candidate.titleEn}
              </span>
            ),
            description: (
              <span dir="ltr" className="block truncate">
                {(ar ? group.nameAr : group.nameEn)} · {candidate.email}
              </span>
            ),
            onSelect: () => void become(candidate.userId),
          })),
        )}
      />

      <span className="ms-auto hidden text-ink-400 lg:inline">{t('demo.localOnly')}</span>

      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1.5 rounded px-2 py-1 font-medium text-white transition-colors hover:bg-white/10 dark:text-ink-900 lg:ms-2"
      >
        <RotateCcw aria-hidden className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t('demo.reset')}</span>
      </button>

      <ConfirmModal
        open={confirming}
        title={t('demo.resetTitle')}
        description={t('demo.resetBody')}
        confirmLabel={t('demo.resetConfirm')}
        variant="warning"
        onConfirm={() => resetAllDemoData({ keepSession: true })}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
