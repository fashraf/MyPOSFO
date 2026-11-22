import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronsUpDown, LogOut, PanelLeftClose, PanelLeftOpen, Store, User, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { visibleNavigation } from '@/config/navigation';
import { useSession } from '@/contexts/SessionContext';
import { useAuth } from '@/features/auth/context/AuthContext';
import { useTranslation } from '@/i18n';
import { APP_VERSION } from '@/lib/version';
import { Avatar } from '@/components/ui/Avatar';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Dropdown } from '@/components/ui/Dropdown';
import { tenantById } from '@/services/mock/tenants';
import { Brand } from './Brand';

export interface SidebarProps {
  /** Desktop: collapsed to an icon rail. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Mobile: sheet is open. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

/**
 * The sidebar, after the Solvix reference: it sits on the grey canvas, the
 * workspace card at the top says whose business this is, sections carry quiet
 * labels, the active entry is a white card, and the signed-in person is a
 * card at the foot with their role.
 */
export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const { t, isRTL, language } = useTranslation();
  const { permissions, user, role } = useSession();
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const sections = visibleNavigation(permissions);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const ar = language === 'ar';
  const tenant = tenantById(session?.tenantId);
  const personName = user ? (ar ? user.nameAr : user.nameEn) : session?.displayName ?? '';
  const roleName = role ? (ar ? role.nameAr : role.nameEn) : '';

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    setConfirmingSignOut(false);
    navigate('/login', { replace: true });
  }

  const workspace = (compact: boolean) => (
    <div className={cn('px-3 pt-3', compact && 'px-2')}>
      <div
        className={cn(
          'flex items-center gap-2.5 rounded-lg border border-ink-200 bg-surface p-2 shadow-xs',
          compact && 'justify-center p-1.5',
        )}
      >
        {tenant ? (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-ink-900 text-2xs font-bold tracking-wide text-ink-50">
            {tenant.initials}
          </span>
        ) : (
          <Brand compact />
        )}
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink-900">
              {tenant ? (ar ? tenant.nameAr : tenant.nameEn) : t('common.appName')}
            </span>
            <span className="block truncate text-2xs text-ink-500">
              {tenant ? (ar ? tenant.planAr : tenant.planEn) : `v${APP_VERSION}`}
            </span>
          </span>
        )}
        {!compact && permissions.includes('company.view') && (
          <button
            type="button"
            onClick={() => {
              onCloseMobile();
              navigate('/company-profile');
            }}
            aria-label={t('nav.company')}
            className="rounded p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-800"
          >
            <Store aria-hidden className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  const nav = (compact: boolean) => (
    <nav aria-label={t('nav.mainNavigation')} className={cn('flex-1 overflow-y-auto px-3 py-3', compact && 'px-2')}>
      {sections.map((section, index) => (
        <div key={section.id} className={cn(index > 0 && 'mt-3 border-t border-ink-200 pt-3')}>
          {section.labelKey && !compact && (
            <p className="px-2.5 pb-1.5 text-xs font-medium text-ink-500">{t(section.labelKey)}</p>
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onCloseMobile}
                    title={compact ? t(item.labelKey) : undefined}
                    className={({ isActive }) =>
                      cn(
                        'group flex h-9 items-center gap-2.5 rounded-md border px-2.5 text-sm transition-colors',
                        compact && 'justify-center px-0',
                        isActive
                          ? 'border-ink-200 bg-surface font-medium text-ink-900 shadow-xs'
                          : 'border-transparent text-ink-600 hover:bg-ink-200/50 hover:text-ink-900',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          aria-hidden
                          className={cn(
                            'h-4 w-4 shrink-0',
                            isActive ? 'text-ink-900' : 'text-ink-400 group-hover:text-ink-700',
                          )}
                        />
                        {!compact && <span className="truncate">{t(item.labelKey)}</span>}
                      </>
                    )}
                  </NavLink>

                  {/* Children appear only while their parent section is open, so
                      the sidebar does not carry eleven extra rows at all times. */}
                  {item.children && location.pathname.startsWith(item.to) && !compact && (
                    <ul className="ms-[1.15rem] mt-1 space-y-0.5 border-s border-ink-200 ps-3">
                      {item.children.map((child) => (
                        <li key={child.id}>
                          <NavLink
                            to={child.to}
                            end={child.to === item.to}
                            onClick={onCloseMobile}
                            className={({ isActive }) =>
                              cn(
                                'block rounded px-2 py-1 text-xs transition-colors',
                                isActive ? 'font-semibold text-ink-900' : 'text-ink-500 hover:text-ink-900',
                              )
                            }
                          >
                            {t(child.labelKey)}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const userCard = (compact: boolean) => (
    <div className={cn('px-3 pb-3', compact && 'px-2')}>
      <Dropdown
        align="start"
        className="w-full"
        panelClassName="bottom-full top-auto mb-2 w-56"
        trigger={
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg border border-ink-200 bg-surface p-2 text-start shadow-xs transition hover:border-ink-300',
              compact && 'justify-center p-1.5',
            )}
          >
            <Avatar name={personName || '?'} size="sm" />
            {!compact && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-900">{personName}</span>
                  <span className="block truncate text-2xs text-ink-500">{roleName}</span>
                </span>
                <ChevronsUpDown aria-hidden className="h-4 w-4 shrink-0 text-ink-400" />
              </>
            )}
          </button>
        }
        items={[
          { key: 'profile', label: t('common.profile'), icon: <User />, onSelect: () => navigate('/profile') },
          {
            key: 'signout',
            label: t('common.signOut'),
            icon: <LogOut />,
            destructive: true,
            separated: true,
            onSelect: () => setConfirmingSignOut(true),
          },
        ]}
      />
    </div>
  );

  return (
    <>
      {/* Desktop rail — always mounted, width driven by `collapsed`. */}
      <aside
        className={cn(
          'sticky top-0 hidden h-full shrink-0 flex-col bg-canvas transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[4.5rem]' : 'w-[16rem]',
        )}
      >
        {workspace(collapsed)}
        {nav(collapsed)}
        <div className={cn('px-3 pb-2', collapsed && 'px-2')}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            className={cn(
              'flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-xs text-ink-500 transition-colors hover:bg-ink-200/50 hover:text-ink-800',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden className="h-4 w-4 shrink-0 flip-rtl" />
            ) : (
              <>
                <PanelLeftClose aria-hidden className="h-4 w-4 shrink-0 flip-rtl" />
                <span className="truncate">{t('nav.collapseSidebar')}</span>
                <span className="numeric ms-auto text-2xs text-ink-400">v{APP_VERSION}</span>
              </>
            )}
          </button>
        </div>
        {userCard(collapsed)}
      </aside>

      {/* Mobile sheet. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-sidebar lg:hidden">
          <div aria-hidden onClick={onCloseMobile} className="absolute inset-0 animate-fade-in bg-ink-900/40" />
          <aside
            className="relative flex h-full w-[17rem] max-w-[85vw] flex-col bg-canvas shadow-overlay animate-slide-in-end"
            style={{
              ['--slide-from' as string]: isRTL ? '100%' : '-100%',
              paddingTop: 'env(safe-area-inset-top)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            <div className="flex items-center justify-end px-3 pt-2">
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label={t('nav.closeMenu')}
                className="grid h-10 w-10 place-items-center rounded-md text-ink-500 transition-colors hover:bg-ink-200/60 hover:text-ink-900"
              >
                <X aria-hidden className="h-5 w-5" />
              </button>
            </div>
            {workspace(false)}
            {nav(false)}
            {userCard(false)}
          </aside>
        </div>
      )}

      <ConfirmModal
        open={confirmingSignOut}
        title={t('auth.signOut.title')}
        description={t('auth.signOut.description')}
        confirmLabel={t('auth.signOut.confirm')}
        variant="warning"
        loading={signingOut}
        onConfirm={handleSignOut}
        onCancel={() => setConfirmingSignOut(false)}
      />
    </>
  );
}
