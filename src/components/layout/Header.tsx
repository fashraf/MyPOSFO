import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Building2, CheckCheck, ChevronDown, ChevronRight, CircleHelp, LogOut, Menu, Search, User } from 'lucide-react';
import { NAVIGATION } from '@/config/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/cn';
import { Dropdown } from '@/components/ui/Dropdown';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useTranslation } from '@/i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationBell } from '@/components/shell/NotificationBell';
import { SmartSearch } from '@/components/shell/SmartSearch';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { useSession } from '@/contexts/SessionContext';
import { useAuth } from '@/features/auth/context/AuthContext';
import { useI18n } from '@/i18n';

export interface HeaderProps {
  onOpenMobileNav: () => void;
  /** Desktop: fold or unfold the side menu. */
  onToggleSidebar?: () => void;
}

export function Header({ onOpenMobileNav, onToggleSidebar }: HeaderProps) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const {
    user,
    branches,
    activeBranch,
    setActiveBranch,
    viewingAllBranches,
    setViewingAllBranches,
  } = useSession();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [quickLinksOpen, setQuickLinksOpen] = useState(false);

  /* Ctrl/Cmd-K opens the palette from anywhere, which is what anyone who has
     used a modern tool will try first. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setQuickLinksOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    setConfirmingSignOut(false);
    navigate('/login', { replace: true });
  }

  /* Only offer the switcher when there is actually somewhere to switch to. The
     session has already narrowed `branches` to what this person may use. */
  const available = branches;

  /* Breadcrumb: the menu section, then the page — as in the reference. */
  const crumb = (() => {
    for (const section of NAVIGATION) {
      for (const item of section.items) {
        const child = item.children?.find((c) => c.to !== item.to && location.pathname.startsWith(c.to));
        if (location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)) {
          return {
            section: section.labelKey ? t(section.labelKey) : null,
            page: t(item.labelKey),
            child: child ? t(child.labelKey) : null,
          };
        }
      }
    }
    return null;
  })();
  const branchName = (branch: { nameAr: string; nameEn: string }) =>
    language === 'ar' ? branch.nameAr : branch.nameEn;

  const branchLabel = viewingAllBranches
    ? t('branch.allBranches')
    : activeBranch
      ? branchName(activeBranch)
      : t('branch.select');
  const branchItems = [
    {
      key: 'all',
      label: t('branch.allBranches'),
      description: t('branch.allBranchesHint'),
      icon: viewingAllBranches ? <CheckCheck /> : undefined,
      onSelect: () => setViewingAllBranches(true),
      separated: true,
    },
    ...available.map((branch) => ({
      key: branch.id,
      label: branchName(branch),
      icon: !viewingAllBranches && branch.id === activeBranch?.id ? <CheckCheck /> : undefined,
      onSelect: () => setActiveBranch(branch.id),
    })),
  ];

  return (
    <header className="sticky top-0 z-header flex h-14 shrink-0 items-center gap-1.5 border-b border-ink-200 bg-surface/90 px-3 backdrop-blur-md sm:gap-2 sm:px-5 print:hidden">
      <button
        type="button"
        onClick={() => (onToggleSidebar && window.matchMedia('(min-width: 1024px)').matches ? onToggleSidebar() : onOpenMobileNav())}
        aria-label={t('nav.openMenu')}
        data-testid="menu-toggle"
        className="-ms-1 hidden h-8 w-8 place-items-center rounded-md text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 md:grid"
      >
        <Menu aria-hidden className="h-4 w-4" />
      </button>

      {crumb && (
        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
          {crumb.section && <span className="truncate text-ink-500">{crumb.section}</span>}
          {crumb.section && <ChevronRight aria-hidden className="flip-rtl h-3.5 w-3.5 shrink-0 text-ink-300" />}
          <span className={cn('truncate', crumb.child ? 'text-ink-500' : 'font-medium text-ink-900')}>{crumb.page}</span>
          {crumb.child && (
            <>
              <ChevronRight aria-hidden className="flip-rtl h-3.5 w-3.5 shrink-0 text-ink-300" />
              <span className="truncate font-medium text-ink-900">{crumb.child}</span>
            </>
          )}
        </nav>
      )}

      {/* Phones: the page name, with the branch underneath as a small switch —
          a native app's title bar, instead of a breadcrumb that does not fit. */}
      <div className="min-w-0 flex-1 md:hidden">
        <p className="truncate text-md font-semibold leading-tight text-ink-900">
          {crumb ? crumb.child ?? crumb.page : t('common.appName')}
        </p>
        {available.length > 1 ? (
          <Dropdown
            align="start"
            trigger={
              <button
                type="button"
                className="-ms-1 flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-2xs font-medium text-ink-500 active:bg-ink-100"
              >
                <Building2 aria-hidden className="h-3 w-3 shrink-0" />
                <span className="truncate">{branchLabel}</span>
                <ChevronDown aria-hidden className="h-3 w-3 shrink-0" />
              </button>
            }
            items={branchItems}
          />
        ) : (
          activeBranch && <p className="truncate text-2xs text-ink-500">{branchName(activeBranch)}</p>
        )}
      </div>

      {available.length > 1 && (
        <Dropdown
          align="start"
          className="hidden md:block"
          trigger={
            <button
              type="button"
              className="flex h-9 max-w-[13rem] items-center gap-2 rounded-md border border-ink-200 bg-surface px-2.5 text-sm font-medium text-ink-700 shadow-xs transition-colors hover:bg-ink-50"
            >
              <Building2
                aria-hidden
                className={cn(
                  'h-3.5 w-3.5 shrink-0',
                  viewingAllBranches ? 'text-ink-900' : 'text-ink-400',
                )}
              />
              <span className="truncate">{branchLabel}</span>
            </button>
          }
          items={branchItems}
        />
      )}

      <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-1.5 md:flex-1">
        {/* Search opens the command palette — the reference's "⌘K" field. */}
        <button
          type="button"
          onClick={() => setQuickLinksOpen(true)}
          aria-label={t('search.title')}
          className="hidden h-9 w-64 items-center gap-2 rounded-md border border-ink-200 bg-surface px-3 text-sm text-ink-400 shadow-xs transition-colors hover:border-ink-300 hover:text-ink-600 md:inline-flex xl:w-80"
        >
          <Search aria-hidden className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('search.headerPlaceholder')}</span>
          <kbd className="ms-auto whitespace-nowrap rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-sans text-2xs text-ink-500">
            ⌘ K
          </kbd>
        </button>
        <button
          type="button"
          onClick={() => setQuickLinksOpen(true)}
          aria-label={t('search.title')}
          className="grid h-10 w-10 place-items-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 md:hidden"
        >
          <Search aria-hidden className="h-4.5 w-4.5" />
        </button>

        <LanguageSwitcher variant="compact" className="hidden sm:inline-flex" />

        <span className="rounded-md border border-ink-200 bg-surface shadow-xs">
          <NotificationBell />
        </span>

        <span className="hidden rounded-md border border-ink-200 bg-surface shadow-xs sm:block">
          <ThemeToggle />
        </span>

        <Dropdown
          align="end"
          className="lg:hidden"
          trigger={
            <button
              type="button"
              data-testid="account-menu"
              aria-label={t('common.profile')}
              className="flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-ink-100"
            >
              <Avatar name={user ? branchName(user) : "?"} size="sm" />
            </button>
          }
          items={[
            {
              key: 'profile',
              label: t('common.profile'),
              icon: <User />,
              onSelect: () => navigate('/profile'),
            },
            {
              key: 'help',
              label: t('common.help'),
              icon: <CircleHelp />,
            },
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

      <SmartSearch open={quickLinksOpen} onClose={() => setQuickLinksOpen(false)} />

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
    </header>
  );
}
