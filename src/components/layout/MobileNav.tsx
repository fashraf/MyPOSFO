import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Menu, Monitor, Moon, Sun, User, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { visibleNavigation, type NavItem } from '@/config/navigation';
import { useSession } from '@/contexts/SessionContext';
import { useTheme, type ThemePreference } from '@/contexts/ThemeContext';
import { useAuth } from '@/features/auth/context/AuthContext';
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll';
import { useTranslation } from '@/i18n';
import { Avatar } from '@/components/ui/Avatar';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { tenantById } from '@/services/mock/tenants';
import { LanguageSwitcher } from './LanguageSwitcher';

/**
 * Which destinations earn a slot in the bottom bar, most important first.
 * The bar shows the first four of these that the signed-in person can open
 * (in menu order, so the bar reads like the sidebar), and "More" holds the rest.
 * A cashier gets POS · Sales · Shift; a kitchen hand gets Kitchen · Collection;
 * an owner gets Dashboard · POS · Kitchen · Sales.
 */
const PRIORITY = [
  'pos',
  'kitchen',
  'dashboard',
  'sales',
  'collection',
  'restaurant',
  'shift',
  'customers',
  'catalog',
  'inventory',
  'finance',
];
const SLOTS = 4;

/** Bottom-bar labels have ~80px; the menu's full names do not fit there. */
const SHORT_LABELS: Record<string, { en: string; ar: string }> = {
  pos: { en: 'POS', ar: 'نقطة البيع' },
  collection: { en: 'Collection', ar: 'الاستلام' },
  dashboard: { en: 'Home', ar: 'الرئيسية' },
  catalog: { en: 'Products', ar: 'المنتجات' },
  shift: { en: 'Shift', ar: 'الوردية' },
};

const COPY = {
  more: { en: 'More', ar: 'المزيد' },
  menu: { en: 'All destinations', ar: 'كل الأقسام' },
  close: { en: 'Close', ar: 'إغلاق' },
  profile: { en: 'My profile', ar: 'ملفي الشخصي' },
  language: { en: 'Language', ar: 'اللغة' },
  theme: { en: 'Appearance', ar: 'المظهر' },
  light: { en: 'Light', ar: 'فاتح' },
  dark: { en: 'Dark', ar: 'داكن' },
  system: { en: 'Auto', ar: 'تلقائي' },
  signOut: { en: 'Sign out', ar: 'تسجيل الخروج' },
} as const;

function matches(pathname: string, item: { to: string; end?: boolean }) {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/**
 * The phone and handheld shell's primary navigation: a bottom bar with the
 * role's four most-used destinations plus "More", which opens a sheet with the
 * full permission-filtered menu and the personal settings that the compact
 * header has no room for. Hidden from `lg` up, where the sidebar takes over.
 */
export function MobileNav() {
  const { t, language } = useTranslation();
  const { permissions } = useSession();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const lang = language === 'ar' ? 'ar' : 'en';

  const sections = useMemo(() => visibleNavigation(permissions), [permissions]);
  const allItems = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  const barItems = useMemo(() => {
    const ranked = [...allItems].sort((a, b) => {
      const ra = PRIORITY.indexOf(a.id);
      const rb = PRIORITY.indexOf(b.id);
      return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
    });
    const chosen = new Set(ranked.slice(0, SLOTS).map((item) => item.id));
    return allItems.filter((item) => chosen.has(item.id));
  }, [allItems]);

  /* Close the sheet whenever the route changes — a tap on a destination. */
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  if (allItems.length === 0) return null;

  const onBarRoute = barItems.some((item) => matches(location.pathname, item));
  const labelOf = (item: NavItem) => SHORT_LABELS[item.id]?.[lang] ?? t(item.labelKey);

  return (
    <>
      <nav
        aria-label={t('nav.mainNavigation')}
        className="z-header shrink-0 border-t border-ink-200 bg-surface/95 px-safe pb-safe backdrop-blur-md lg:hidden print:hidden"
      >
        <ul className="mx-auto flex max-w-xl items-stretch">
          {barItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id} className="min-w-0 flex-1">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex h-16 flex-col items-center justify-center gap-1 px-1 text-2xs font-medium transition-colors',
                      isActive ? 'text-ink-900' : 'text-ink-500 active:text-ink-900',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={cn(
                          'grid h-8 w-14 place-items-center rounded-full transition-colors',
                          isActive ? 'bg-ink-900 text-ink-50' : 'text-ink-500',
                        )}
                      >
                        <Icon aria-hidden className="h-5 w-5" />
                      </span>
                      <span className="max-w-full truncate leading-none">{labelOf(item)}</span>
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
          <li className="min-w-0 flex-1">
            <button
              type="button"
              data-testid="mobile-more"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={cn(
                'flex h-16 w-full flex-col items-center justify-center gap-1 px-1 text-2xs font-medium transition-colors',
                !onBarRoute || moreOpen ? 'text-ink-900' : 'text-ink-500 active:text-ink-900',
              )}
            >
              <span
                className={cn(
                  'grid h-8 w-14 place-items-center rounded-full transition-colors',
                  !onBarRoute && !moreOpen ? 'bg-ink-900 text-ink-50' : moreOpen ? 'bg-ink-100' : '',
                )}
              >
                <Menu aria-hidden className="h-5 w-5" />
              </span>
              <span className="max-w-full truncate leading-none">{COPY.more[lang]}</span>
            </button>
          </li>
        </ul>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}

/** The full menu as a bottom sheet: sections of tiles, then personal settings. */
function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, language } = useTranslation();
  const lang = language === 'ar' ? 'ar' : 'en';
  const { permissions, user, role } = useSession();
  const { session, signOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const sections = useMemo(() => visibleNavigation(permissions), [permissions]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /* Open on the group the current page belongs to, so its sub-pages show. */
  useEffect(() => {
    if (!open) return;
    const current = sections
      .flatMap((section) => section.items)
      .find((item) => item.children && matches(location.pathname, item));
    setExpanded(current?.id ?? null);
  }, [open, sections, location.pathname]);

  const tenant = tenantById(session?.tenantId);
  const personName = user ? (lang === 'ar' ? user.nameAr : user.nameEn) : session?.displayName ?? '';
  const roleName = role ? (lang === 'ar' ? role.nameAr : role.nameEn) : '';

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    setConfirmingSignOut(false);
    onClose();
    navigate('/login', { replace: true });
  }

  const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;

  return (
    <>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-overlay flex items-end lg:hidden">
            <div aria-hidden onClick={onClose} className="absolute inset-0 animate-fade-in bg-ink-900/35 backdrop-blur-[2px]" />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={COPY.menu[lang]}
              className="relative mx-auto flex max-h-[88svh] w-full max-w-xl animate-scale-in flex-col overflow-hidden rounded-t-2xl bg-surface px-safe shadow-overlay"
            >
              <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ink-300" />

              <header className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-2">
                <Avatar name={personName || '?'} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-md font-semibold text-ink-900">{personName}</p>
                  <p className="truncate text-xs text-ink-500">
                    {[roleName, tenant ? (lang === 'ar' ? tenant.nameAr : tenant.nameEn) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={COPY.close[lang]}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink-100 text-ink-600 active:bg-ink-200"
                >
                  <X aria-hidden className="h-5 w-5" />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-ink-200 px-4 pb-4">
                {sections.map((section) => (
                  <section key={section.id} className="pt-4">
                    {section.labelKey && <h3 className="eyebrow mb-2 px-1">{t(section.labelKey)}</h3>}
                    <ul className="grid grid-cols-4 gap-1.5 min-[600px]:grid-cols-5">
                      {section.items.map((item) => {
                        const Icon = item.icon;
                        const active = matches(location.pathname, item);
                        const hasChildren = !!item.children?.length;
                        const isExpanded = expanded === item.id;
                        const tileClass = cn(
                          'flex min-h-[5.25rem] w-full flex-col items-center justify-start gap-1.5 rounded-xl px-1 pb-2 pt-2.5 text-center text-2xs font-medium leading-tight transition-colors',
                          active || isExpanded ? 'bg-ink-100 text-ink-900' : 'text-ink-600 active:bg-ink-100',
                        );
                        const icon = (
                          <span
                            className={cn(
                              'relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border',
                              active ? 'border-ink-900 bg-ink-900 text-ink-50' : 'border-ink-200 bg-surface text-ink-700',
                            )}
                          >
                            <Icon aria-hidden className="h-5 w-5" />
                            {hasChildren && (
                              <ChevronDown
                                aria-hidden
                                className={cn(
                                  'absolute -bottom-1.5 -end-1.5 h-4 w-4 rounded-full border border-ink-200 bg-surface p-px text-ink-500 transition-transform',
                                  isExpanded && 'rotate-180',
                                )}
                              />
                            )}
                          </span>
                        );
                        return (
                          <li key={item.id} className="min-w-0">
                            {hasChildren ? (
                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                onClick={() => setExpanded(isExpanded ? null : item.id)}
                                className={tileClass}
                              >
                                {icon}
                                <span className="line-clamp-2 break-words">{t(item.labelKey)}</span>
                              </button>
                            ) : (
                              <NavLink to={item.to} end={item.end} onClick={onClose} className={tileClass}>
                                {icon}
                                <span className="line-clamp-2 break-words">{t(item.labelKey)}</span>
                              </NavLink>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {section.items
                      .filter((item) => item.id === expanded && item.children?.length)
                      .map((item) => (
                        <ul
                          key={item.id}
                          className="mt-2 divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200 bg-ink-50/60"
                        >
                          {item.children!.map((child) => (
                            <li key={child.id}>
                              <NavLink
                                to={child.to}
                                end
                                onClick={onClose}
                                className={({ isActive }) =>
                                  cn(
                                    'flex min-h-[2.75rem] items-center px-4 text-sm',
                                    isActive ? 'bg-surface font-semibold text-ink-900' : 'text-ink-700 active:bg-ink-100',
                                  )
                                }
                              >
                                {t(child.labelKey)}
                              </NavLink>
                            </li>
                          ))}
                        </ul>
                      ))}
                  </section>
                ))}

                <section className="mt-5 space-y-2 rounded-xl border border-ink-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-ink-700">{COPY.language[lang]}</span>
                    <LanguageSwitcher variant="segmented" className="[&>button]:min-h-[2.25rem] [&>button]:px-4" />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-ink-700">{COPY.theme[lang]}</span>
                    <div role="group" aria-label={COPY.theme[lang]} className="inline-flex items-center rounded-md bg-ink-100 p-0.5">
                      {(['light', 'dark', 'system'] as ThemePreference[]).map((option) => {
                        const Icon = themeIcons[option];
                        const on = option === preference;
                        return (
                          <button
                            key={option}
                            type="button"
                            aria-pressed={on}
                            onClick={() => setPreference(option)}
                            className={cn(
                              'inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-sm px-2.5 text-sm font-medium transition-colors',
                              on ? 'bg-surface text-ink-900 shadow-xs' : 'text-ink-500',
                            )}
                          >
                            <Icon aria-hidden className="h-4 w-4" />
                            {COPY[option][lang]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <NavLink
                    to="/profile"
                    onClick={onClose}
                    className="flex min-h-[2.75rem] items-center justify-center gap-2 rounded-lg border border-ink-200 text-sm font-medium text-ink-700 active:bg-ink-100"
                  >
                    <User aria-hidden className="h-4 w-4" />
                    {COPY.profile[lang]}
                  </NavLink>
                  <button
                    type="button"
                    onClick={() => setConfirmingSignOut(true)}
                    className="flex min-h-[2.75rem] items-center justify-center gap-2 rounded-lg border border-danger-100 bg-danger-50 text-sm font-medium text-danger-600 active:bg-danger-100"
                  >
                    <LogOut aria-hidden className="flip-rtl h-4 w-4" />
                    {COPY.signOut[lang]}
                  </button>
                </div>
                <div className="pb-safe" />
              </div>
            </div>
          </div>,
          document.body,
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
