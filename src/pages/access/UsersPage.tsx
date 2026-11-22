import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarClock, FileWarning, X, MoreHorizontal, Pencil, ShieldAlert, ShieldCheck, UserMinus, UserPlus, Users as UsersIcon } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  ConfirmModal,
  Dropdown,
  EmptyState,
  PageHeader,
  SearchInput,
  Select,
  SkeletonTable,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useToast } from '@/contexts/ToastContext';
import { CommissionBadge } from '@/features/finance/CommissionBadge';
import { useI18n, useTranslation } from '@/i18n';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { alertsFor, flagOf, maskNumber, nationalityName, toLatinDigits } from '@/lib/staffDocs';
import { DocumentStatusBadge } from '@/features/access/StaffFile';
import { ROUTES } from '@/routes/paths';
import { branchService, commissionService, roleService, safeCall, userService } from '@/services';
import { effectiveStatus, isAccessExpired } from '@/types/permissions';
import type { BadgeTone } from '@/components/ui';
import type { CommissionRule } from '@/types/finance';
import type { Branch, Role, User, UserStatus } from '@/types/permissions';

const STATUS_TONES: Record<UserStatus, BadgeTone> = {
  active: 'success',
  suspended: 'danger',
  invited: 'info',
};

type PendingAction = { user: User; kind: 'disable' | 'enable' | 'revoke' } | null;

export default function UsersPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const [users, setUsers] = useState<User[]>([]);
  const [commissionRules, setCommissionRules] = useState<CommissionRule[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [params] = useSearchParams();
  const [roleFilter, setRoleFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [natFilter, setNatFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [docFilter, setDocFilter] = useState<'all' | 'attention' | 'expired' | 'critical' | 'soon' | 'missing'>(
    params.get('docs') === 'attention' ? 'attention' : 'all',
  );
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 300);

  const load = useCallback(async () => {
    setLoading(true);
    const [userResult, roleResult, ruleResult, branchResult] = await Promise.all([
      safeCall(() => userService.list()),
      safeCall(() => roleService.list()),
      safeCall(() => commissionService.rules()),
      safeCall(() => branchService.list()),
    ]);
    if (userResult.ok) setUsers(userResult.data);
    if (roleResult.ok) setRoles(roleResult.data);
    if (ruleResult.ok) setCommissionRules(ruleResult.data);
    if (branchResult.ok) setBranches(branchResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const roleById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);
  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);

  const visible = useMemo(() => {
    const needle = toLatinDigits(debouncedSearch.trim().toLocaleLowerCase());
    return users.filter((user) => {
      if (roleFilter && user.roleId !== roleFilter) return false;
      if (branchFilter && !user.branchIds.includes(branchFilter)) return false;
      if (natFilter && (user.nationality ?? '') !== natFilter) return false;
      if (statusFilter && effectiveStatus(user) !== statusFilter) return false;
      if (docFilter !== 'all') {
        const alerts = alertsFor(user);
        if (docFilter === 'attention' ? alerts.length === 0 : !alerts.some((a) => a.status === docFilter)) return false;
      }
      if (!needle) return true;
      return `${user.nameAr} ${user.nameEn} ${user.username} ${user.email} ${user.employeeId} ${user.jobTitle ?? ''} ${nationalityName(user.nationality, 'en')} ${nationalityName(user.nationality, 'ar')} ${(user.documents ?? []).map((d) => d.number).join(' ')}`
        .toLocaleLowerCase()
        .includes(needle);
    });
  }, [users, debouncedSearch, docFilter, roleFilter, branchFilter, natFilter, statusFilter]);

  /* One count per kind of problem, so the owner sees at a glance what to chase. */
  const docCounts = useMemo(() => {
    const counts = { expired: 0, critical: 0, soon: 0, missing: 0, attention: 0 };
    for (const user of users) {
      const alerts = alertsFor(user);
      if (alerts.length) counts.attention += 1;
      for (const status of new Set(alerts.map((a) => a.status))) counts[status] += 1;
    }
    return counts;
  }, [users]);

  async function runPending() {
    if (!pending) return;
    setBusy(true);

    const { user, kind } = pending;
    const result = await safeCall(() =>
      kind === 'revoke'
        ? userService.revokeAccess(user.id)
        : userService.setStatus(user.id, kind === 'disable' ? 'suspended' : 'active'),
    );

    if (result.ok) {
      toast.success(
        kind === 'revoke'
          ? t('users.toast.revoked')
          : kind === 'disable'
            ? t('users.toast.disabled')
            : t('users.toast.enabled'),
      );
      await load();
    } else {
      toast.error(t('users.toast.failed'), result.error.message);
    }

    setBusy(false);
    setPending(null);
  }

  const confirmCopy = pending
    ? {
        disable: {
          title: t('users.confirm.disableTitle'),
          description: t('users.confirm.disableDescription'),
          confirm: t('users.confirm.disableConfirm'),
          variant: 'danger' as const,
        },
        enable: {
          title: t('users.confirm.enableTitle'),
          description: t('users.confirm.enableDescription'),
          confirm: t('users.confirm.enableConfirm'),
          variant: 'primary' as const,
        },
        revoke: {
          title: t('users.confirm.revokeTitle'),
          description: t('users.confirm.revokeDescription'),
          confirm: t('users.confirm.revokeConfirm'),
          variant: 'danger' as const,
        },
      }[pending.kind]
    : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('users.title')}
        description={t('users.description')}
        actions={
          <Link to={ROUTES.userNew}>
            <Button leadingIcon={<UserPlus />}>{t('users.add')}</Button>
          </Link>
        }
      />

      {/* Document alerts — each tile is also a filter. */}
      {!loading && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(
            [
              ['expired', AlertTriangle, 'danger'],
              ['critical', CalendarClock, 'danger'],
              ['soon', CalendarClock, 'warning'],
              ['missing', FileWarning, 'danger'],
            ] as const
          ).map(([key, Icon, tone]) => {
            const on = docFilter === key;
            const count = docCounts[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setDocFilter(on ? 'all' : key)}
                aria-pressed={on}
                className={cn(
                  'flex items-center gap-3 rounded-xl border bg-surface p-3.5 text-start transition hover:shadow-sm',
                  on ? 'border-info-300 ring-1 ring-info-200' : 'border-ink-200',
                  count === 0 && 'opacity-60',
                )}
              >
                <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', count === 0 ? 'bg-ink-100 text-ink-400' : tone === 'danger' ? 'bg-danger-50 text-danger-600' : 'bg-warning-50 text-warning-600')}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="numeric block text-xl font-semibold text-ink-900">{count}</span>
                  <span className="block truncate text-xs text-ink-500">{t(`staff.tiles.${key}`)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 bg-surface p-2.5">
        <SearchInput
          className="sm:max-w-xs"
          value={search}
          placeholder={t('staff.searchPlaceholder')}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch('')}
        />
        <Select className="w-full sm:w-44" value={roleFilter} onChange={setRoleFilter} placeholder={t('users.filters.role')} isClearable
          options={roles.map((r) => ({ value: r.id, label: nameOf(r) }))} />
        <Select className="w-full sm:w-48" value={branchFilter} onChange={setBranchFilter} placeholder={t('users.filters.branch')} isClearable
          options={branches.map((b) => ({ value: b.id, label: nameOf(b) }))} />
        <Select className="w-full sm:w-44" value={natFilter} onChange={setNatFilter} placeholder={t('users.filters.nationality')} isClearable
          options={[...new Set(users.map((u) => u.nationality).filter(Boolean) as string[])].map((code) => ({ value: code, label: `${flagOf(code)}  ${nationalityName(code, language)}` }))} />
        <Select className="w-full sm:w-36" value={statusFilter} onChange={setStatusFilter} placeholder={t('users.filters.status')} isClearable
          options={(['active', 'invited', 'suspended'] as const).map((st) => ({ value: st, label: t(`users.status.${st}`) }))} />
        {(roleFilter || branchFilter || natFilter || statusFilter) && (
          <button type="button" onClick={() => { setRoleFilter(''); setBranchFilter(''); setNatFilter(''); setStatusFilter(''); }}
            className="text-sm font-medium text-info-700 hover:underline">{t('users.filters.clear')}</button>
        )}
        {docFilter !== 'all' && (
          <button type="button" onClick={() => setDocFilter('all')} className="inline-flex items-center gap-1.5 rounded-full border border-info-200 bg-info-50 px-3 py-1.5 text-xs font-medium text-info-700">
            {t(`staff.tiles.${docFilter}`)} <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <SkeletonTable rows={5} columns={6} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('users.columns.user')}</TableHeaderCell>
                <TableHeaderCell>{t('staff.column')}</TableHeaderCell>
                <TableHeaderCell>{t('users.columns.role')}</TableHeaderCell>
                <TableHeaderCell>{t('users.columns.branch')}</TableHeaderCell>
                <TableHeaderCell>{t('users.columns.status')}</TableHeaderCell>
                <TableHeaderCell>{t('users.columns.lastActive')}</TableHeaderCell>
                <TableHeaderCell align="end">
                  <span className="sr-only">{t('common.actions')}</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {visible.length === 0 ? (
                <TableEmptyRow colSpan={7}>
                  <EmptyState
                    icon={<UsersIcon />}
                    title={t('users.empty.title')}
                    description={t('users.empty.description')}
                    action={
                      <Link to={ROUTES.userNew}>
                        <Button>{t('users.add')}</Button>
                      </Link>
                    }
                  />
                </TableEmptyRow>
              ) : (
                visible.map((user) => {
                  const role = roleById.get(user.roleId);
                  const status = effectiveStatus(user);
                  const expired = isAccessExpired(user);
                  const branch = user.defaultBranchId
                    ? branchById.get(user.defaultBranchId)
                    : undefined;

                  return (
                    <TableRow
                      key={user.id}
                      interactive
                      onClick={() => navigate(`/users/${user.id}/edit`)}
                    >
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={nameOf(user)} size="sm" />
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate font-medium text-ink-900">
                              {nameOf(user)}
                              <CommissionBadge rules={commissionRules} userId={user.id} />
                            </p>
                            <p className="truncate text-xs text-ink-400" dir="ltr">
                              @{user.username}{user.jobTitle ? ` · ${user.jobTitle}` : ''}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <StaffDocCell user={user} />
                      </TableCell>

                      <TableCell>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-ink-700">{role ? nameOf(role) : '—'}</span>
                          {role?.external && (
                            <Badge tone="info">{t('users.external.badge')}</Badge>
                          )}
                        </span>
                      </TableCell>

                      <TableCell className="text-ink-600">
                        {branch ? nameOf(branch) : '—'}
                      </TableCell>

                      <TableCell>
                        <span className="flex flex-col gap-1">
                          <Badge tone={STATUS_TONES[status]} dot>
                            {t(`users.status.${status}`)}
                          </Badge>
                          {expired && (
                            <span className="text-2xs text-danger-600">
                              {t('users.external.expired')}
                            </span>
                          )}
                        </span>
                      </TableCell>

                      <TableCell className="text-ink-500">
                        {user.lastActiveAt
                          ? formatDate(user.lastActiveAt, { language, withTime: true })
                          : '—'}
                      </TableCell>

                      <TableCell align="end">
                        <div onClick={(event) => event.stopPropagation()}>
                          <Dropdown
                            align="end"
                            trigger={
                              <Button variant="ghost" size="icon" aria-label={t('common.actions')}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            }
                            items={[
                              {
                                key: 'edit',
                                label: t('users.actions.edit'),
                                icon: <Pencil />,
                                onSelect: () => navigate(`/users/${user.id}/edit`),
                              },
                              ...(role?.external && !expired
                                ? [
                                    {
                                      key: 'revoke',
                                      label: t('users.actions.revoke'),
                                      icon: <ShieldAlert />,
                                      destructive: true,
                                      separated: true,
                                      onSelect: () => setPending({ user, kind: 'revoke' }),
                                    },
                                  ]
                                : []),
                              {
                                key: 'status',
                                label:
                                  user.status === 'suspended'
                                    ? t('users.actions.enable')
                                    : t('users.actions.disable'),
                                icon:
                                  user.status === 'suspended' ? <ShieldCheck /> : <UserMinus />,
                                destructive: user.status !== 'suspended',
                                separated: !role?.external,
                                onSelect: () =>
                                  setPending({
                                    user,
                                    kind: user.status === 'suspended' ? 'enable' : 'disable',
                                  }),
                              },
                            ]}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmModal
        open={Boolean(pending)}
        title={confirmCopy?.title ?? ''}
        description={confirmCopy?.description ?? ''}
        confirmLabel={confirmCopy?.confirm}
        variant={confirmCopy?.variant ?? 'danger'}
        loading={busy}
        onConfirm={runPending}
        onCancel={() => setPending(null)}
      >
        {pending && (
          <p className="rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-600">
            {nameOf(pending.user)} · <span dir="ltr">{pending.user.username}</span>
          </p>
        )}
      </ConfirmModal>
    </div>
  );
}

/** Nationality plus the one document that most needs attention. */
function StaffDocCell({ user }: { user: User }) {
  const { t } = useTranslation();
  const { language } = useI18n();
  if (!user.nationality) return <span className="text-xs text-ink-400">{t('staff.notRecorded')}</span>;
  const alerts = alertsFor(user);
  const worst = alerts[0];
  const mainKind = user.nationality === 'SA' ? 'national_id' : 'iqama';
  const shown = (user.documents ?? []).find((d) => d.kind === (worst?.kind ?? mainKind));
  return (
    <div className="min-w-0 space-y-1">
      <p className="flex items-center gap-1.5 text-sm text-ink-700">
        <span aria-hidden className="text-base leading-none">{flagOf(user.nationality)}</span>
        {nationalityName(user.nationality, language)}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-2xs font-medium text-ink-500">{t(`staff.docs.${worst?.kind ?? mainKind}.short`)}</span>
        {shown?.number && <span className="numeric text-2xs text-ink-400" dir="ltr">{maskNumber(shown.number)}</span>}
        <DocumentStatusBadge doc={shown} required />
        {alerts.length > 1 && <span className="text-2xs font-medium text-danger-600">+{alerts.length - 1}</span>}
      </div>
    </div>
  );
}
