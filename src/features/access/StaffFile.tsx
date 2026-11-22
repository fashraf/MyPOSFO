import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/contexts/SessionContext';
import { ROUTES } from '@/routes/paths';
import { safeCall, userService } from '@/services';
import { AlertTriangle, BadgeCheck, CalendarClock, Copy, Eye, EyeOff, FileWarning, IdCard, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge, Checkbox, DatePicker, FormField, Input, Select, type BadgeTone } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useI18n, useTranslation } from '@/i18n';
import {
  NATIONALITIES,
  checkPassword,
  daysUntil,
  documentKindsFor,
  flagOf,
  generatePassword,
  hijriOf,
  requiredDocuments,
  statusOf,
  type DocumentStatus,
  STATUS_RANK,
  alertsFor,
} from '@/lib/staffDocs';
import type { StaffDocument, StaffDocumentKind, User } from '@/types/permissions';

export const STATUS_TONE: Record<DocumentStatus, BadgeTone> = {
  expired: 'danger', missing: 'danger', critical: 'danger', soon: 'warning', valid: 'success', no_expiry: 'neutral',
};

/** "Expires in 9 days" / "Expired 6 days ago" / "Missing" — the words an admin needs. */
export function DocumentStatusBadge({ doc, required }: { doc: StaffDocument | undefined; required?: boolean }) {
  const { t } = useTranslation();
  const status = statusOf(doc);
  if (status === 'missing' && !required) return null;
  const days = doc?.expiresAt ? daysUntil(doc.expiresAt) : null;
  const label =
    status === 'missing' ? t('staff.status.missing')
    : status === 'expired' ? t('staff.status.expiredAgo', { days: String(Math.abs(days ?? 0)) })
    : status === 'no_expiry' ? t('staff.status.noExpiry')
    : days === 0 ? t('staff.status.today')
    : t('staff.status.expiresIn', { days: String(days) });
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {label}
    </Badge>
  );
}

export interface StaffFileValue {
  nationality: string;
  jobTitle: string;
  joinedAt: string;
  documents: StaffDocument[];
}

/**
 * Nationality, job and the documents the law expects on file.
 *
 * Choosing a nationality decides which documents are asked for (Saudi →
 * National ID; everyone else → Iqama and passport), so nobody has to know the
 * rules. Each expiry shows the Hijri date too, because that is what is printed
 * on the card in their hand.
 */
export function StaffFileSection({
  value,
  onChange,
  roleId,
  errors,
}: {
  value: StaffFileValue;
  onChange: (next: StaffFileValue) => void;
  roleId: string;
  errors: Record<string, string>;
}) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const kinds = value.nationality ? documentKindsFor(value.nationality) : [];
  const required = requiredDocuments({ nationality: value.nationality || undefined, roleId });

  const docOf = (kind: StaffDocumentKind) => value.documents.find((d) => d.kind === kind);
  const setDoc = (kind: StaffDocumentKind, patch: Partial<StaffDocument>) => {
    const existing = docOf(kind) ?? { kind, number: '', expiresAt: null };
    const next = { ...existing, ...patch };
    onChange({ ...value, documents: [...value.documents.filter((d) => d.kind !== kind), next] });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label={t('staff.nationality')} help={t('staff.nationalityHint')}>
          <Select
            value={value.nationality}
            placeholder={t('staff.chooseNationality')}
            onChange={(nationality) => onChange({ ...value, nationality })}
            options={NATIONALITIES.map((n) => ({ value: n.code, label: `${flagOf(n.code)}  ${language === 'ar' ? n.ar : n.en}` }))}
          />
        </FormField>
        <FormField label={t('staff.jobTitle')} showOptional>
          <Input value={value.jobTitle} placeholder={t('staff.jobTitlePlaceholder')} onChange={(e) => onChange({ ...value, jobTitle: e.target.value })} />
        </FormField>
        <FormField label={t('staff.joinedAt')} showOptional>
          <DatePicker value={value.joinedAt} onChange={(joinedAt) => onChange({ ...value, joinedAt })} />
        </FormField>
      </div>

      {!value.nationality ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-ink-300 bg-ink-50 px-4 py-3 text-sm text-ink-500">
          <IdCard aria-hidden className="h-4 w-4 shrink-0" />
          {t('staff.pickNationalityFirst')}
        </p>
      ) : (
        <div className="space-y-3">
          {kinds.map((kind) => {
            const doc = docOf(kind);
            const isRequired = required.includes(kind);
            const status = statusOf(doc);
            const error = errors[`doc_${kind}`];
            return (
              <div
                key={kind}
                className={cn(
                  'rounded-xl border p-3.5 transition-colors',
                  status === 'expired' || status === 'critical' || (status === 'missing' && isRequired)
                    ? 'border-danger-200 bg-danger-50/40'
                    : status === 'soon'
                      ? 'border-warning-200 bg-warning-50/40'
                      : 'border-ink-200 bg-surface',
                )}
              >
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink-100 text-ink-600">
                      {kind === 'health_card' ? <ShieldCheck className="h-4 w-4" /> : <IdCard className="h-4 w-4" />}
                    </span>
                    {t(`staff.docs.${kind}.title`)}
                    {isRequired ? (
                      <span className="text-2xs font-medium text-danger-600">{t('staff.required')}</span>
                    ) : (
                      <span className="text-2xs font-normal text-ink-400">{t('common.optional')}</span>
                    )}
                  </span>
                  <DocumentStatusBadge doc={doc} required={isRequired} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label={t('staff.number')} error={error} hint={!error ? t(`staff.docs.${kind}.hint`) : undefined}>
                    <Input
                      dir="ltr"
                      inputMode={kind === 'iqama' || kind === 'national_id' ? 'numeric' : 'text'}
                      maxLength={kind === 'iqama' || kind === 'national_id' ? 10 : 20}
                      value={doc?.number ?? ''}
                      placeholder={t(`staff.docs.${kind}.placeholder`)}
                      onChange={(e) => setDoc(kind, { number: e.target.value })}
                    />
                  </FormField>
                  <FormField
                    label={t('staff.expiry')}
                    hint={doc?.expiresAt ? `${t('staff.hijri')}: ${hijriOf(doc.expiresAt, language)}` : t('staff.expiryHint')}
                  >
                    <DatePicker value={doc?.expiresAt ?? ''} onChange={(expiresAt) => setDoc(kind, { expiresAt: expiresAt || null })} />
                  </FormField>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Password, the way a non-technical owner can manage it.
 *
 * A saved password is never shown again (it is stored as a hash), so the
 * choices are: type one, or generate one, show it, copy it, and hand it over.
 * "Ask to change at first sign-in" means the owner never knows it for long.
 */
export function PasswordSection({
  mode,
  password,
  confirm,
  mustChange,
  onChange,
  errors,
  passwordChangedAt,
}: {
  mode: 'create' | 'edit';
  password: string;
  confirm: string;
  mustChange: boolean;
  onChange: (patch: { password?: string; confirm?: string; mustChange?: boolean }) => void;
  errors: Record<string, string>;
  passwordChangedAt?: string | null;
}) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(mode === 'create');
  const check = checkPassword(password);

  if (!resetting) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-ink-50/60 p-3.5 sm:col-span-2">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-success-50 text-success-600">
            <BadgeCheck className="h-4.5 w-4.5" />
          </span>
          <div>
            <p className="text-sm font-medium text-ink-900">{t('staff.password.isSet')}</p>
            <p className="text-xs text-ink-500">
              {passwordChangedAt
                ? t('staff.password.changedOn', { date: new Date(passwordChangedAt).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-GB') })
                : t('staff.password.neverShown')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setResetting(true)}
          className="inline-flex min-h-[2.5rem] items-center gap-2 rounded-lg border border-ink-200 bg-surface px-3.5 text-sm font-medium text-ink-800 hover:border-ink-900"
        >
          <RefreshCw className="h-4 w-4" /> {t('staff.password.reset')}
        </button>
      </div>
    );
  }

  const meter = ['bg-ink-200', 'bg-danger-500', 'bg-warning-500', 'bg-success-500', 'bg-success-600'][check.score];
  const words = [t('staff.password.empty'), t('staff.password.weak'), t('staff.password.fair'), t('staff.password.good'), t('staff.password.strong')];

  return (
    <div className="space-y-3 rounded-xl border border-ink-200 p-3.5 sm:col-span-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={mode === 'edit' ? t('staff.password.new') : t('users.fields.password')} required={mode === 'create'} error={errors.password}>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={visible ? 'text' : 'password'}
                dir="ltr"
                autoComplete="new-password"
                value={password}
                onChange={(e) => onChange({ password: e.target.value })}
                className="pe-10"
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? t('staff.password.hide') : t('staff.password.show')}
                className="absolute end-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-800"
              >
                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = generatePassword();
                onChange({ password: next, confirm: next, mustChange: true });
                setVisible(true);
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-sm font-medium text-ink-700 hover:border-ink-900"
            >
              <RefreshCw className="h-3.5 w-3.5" /> {t('staff.password.generate')}
            </button>
          </div>
        </FormField>
        <FormField label={t('users.fields.confirmPassword')} required={mode === 'create'} error={errors.confirmPassword}>
          <div className="flex gap-2">
            <Input
              type={visible ? 'text' : 'password'}
              dir="ltr"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => onChange({ confirm: e.target.value })}
            />
            {password && (
              <button
                type="button"
                aria-label={t('staff.password.copy')}
                onClick={() => {
                  void navigator.clipboard?.writeText(password).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  });
                }}
                className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-ink-200 hover:border-ink-900', copied && 'border-success-500 text-success-600')}
              >
                <Copy className="h-4 w-4" />
              </button>
            )}
          </div>
        </FormField>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 items-center gap-2">
          <div className="flex h-1.5 flex-1 gap-1">
            {[1, 2, 3, 4].map((step) => (
              <span key={step} className={cn('flex-1 rounded-full', check.score >= step ? meter : 'bg-ink-200')} />
            ))}
          </div>
          <span className="w-16 text-xs font-medium text-ink-600">{words[check.score]}</span>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {([['length', check.length], ['mix', check.letters && check.numbers]] as const).map(([key, ok]) => (
            <li key={key} className={cn('flex items-center gap-1', ok ? 'text-success-700' : 'text-ink-400')}>
              <span className={cn('h-1.5 w-1.5 rounded-full', ok ? 'bg-success-500' : 'bg-ink-300')} />
              {t(`staff.password.rule.${key}`)}
            </li>
          ))}
        </ul>
      </div>

      <Checkbox
        checked={mustChange}
        onChange={(e) => onChange({ mustChange: e.target.checked })}
        label={t('staff.password.mustChange')}
        description={t('staff.password.mustChangeHint')}
      />
      {mode === 'edit' && (
        <button type="button" onClick={() => { onChange({ password: '', confirm: '' }); setResetting(false); }} className="text-sm font-medium text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline">
          {t('staff.password.keepCurrent')}
        </button>
      )}
    </div>
  );
}

/** Small row of icons used by the Users list. */
export function DocAlertIcon({ status }: { status: DocumentStatus | null }) {
  if (!status || status === 'valid' || status === 'no_expiry') return null;
  const Icon = status === 'soon' ? CalendarClock : status === 'missing' ? FileWarning : AlertTriangle;
  return <Icon aria-hidden className={cn('h-4 w-4', status === 'soon' ? 'text-warning-600' : 'text-danger-600')} />;
}

/**
 * Dashboard strip: who needs a document renewed, by name, with one button to
 * the filtered staff list. Hidden when nothing is due or the viewer cannot
 * manage staff.
 */
export function StaffDocumentsAlert() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { can } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const allowed = can('users.view');

  useEffect(() => {
    if (!allowed) return;
    void safeCall(() => userService.list()).then((result) => result.ok && setUsers(result.data));
  }, [allowed]);

  const rows = users
    .flatMap((user) => alertsFor(user).filter((a) => a.status !== 'soon').map((alert) => ({ user, alert })))
    .sort((a, b) => STATUS_RANK[a.alert.status] - STATUS_RANK[b.alert.status] || (a.alert.days ?? 0) - (b.alert.days ?? 0));
  if (!allowed || rows.length === 0) return null;

  const describe = ({ user, alert }: (typeof rows)[number]) => {
    const name = language === 'ar' ? user.nameAr : user.nameEn;
    const doc = t(`staff.docs.${alert.kind}.short`);
    return t(`notifications.items.document.${alert.status}`, { name, doc, days: String(Math.abs(alert.days ?? 0)) });
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-danger-200 bg-danger-50/60 p-3 sm:p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-danger-100 text-danger-600">
        <IdCard className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-danger-800">{t('staff.dashboard.title', { count: String(rows.length) })}</p>
        <ul className="mt-1 hidden space-y-0.5 text-sm text-danger-700 sm:block">
          {rows.slice(0, 3).map((row) => (
            <li key={`${row.user.id}-${row.alert.kind}`} className="truncate">• {describe(row)}</li>
          ))}
          {rows.length > 3 && <li className="text-xs text-danger-600">{t('staff.dashboard.more', { count: String(rows.length - 3) })}</li>}
        </ul>
      </div>
      <Link to={`${ROUTES.users}?docs=attention`} className="inline-flex min-h-[2.75rem] shrink-0 items-center justify-center rounded-lg bg-danger-600 px-3 text-sm font-semibold text-white hover:bg-danger-700 sm:px-4">
        {t('staff.dashboard.review')}
      </Link>
    </div>
  );
}
