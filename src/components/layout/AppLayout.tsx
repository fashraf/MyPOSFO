import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { PrintOnCompletion } from '@/features/printing/PrintOnCompletion';
import { Outlet } from 'react-router-dom';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useDisclosure } from '@/hooks/useDisclosure';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useTranslation } from '@/i18n';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { Sidebar } from './Sidebar';
import { DemoBar } from '@/components/shell/DemoBar';

/**
 * The application shell: sidebar, header, scrolling content region, and the
 * mobile bottom bar. Every routed page renders into the <Outlet/>.
 */
export function AppLayout() {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const mobileNav = useDisclosure(false);
  const [collapsed, setCollapsed] = useLocalStorage('app.sidebar.collapsed', false);
  /* The till needs every pixel on a laptop or landscape tablet: the menu
     folds to icons there (it can still be opened), and stays as set elsewhere. */
  const location = useLocation();
  const roomy = useMediaQuery('(min-width: 1440px)');
  const tightTill = location.pathname.startsWith('/pos') && !roomy;
  /* On a tight till the menu starts folded; the burger at the top unfolds it for this visit. */
  const [tillMenuOpen, setTillMenuOpen] = useState(false);
  const folded = tightTill ? !tillMenuOpen : collapsed;
  const toggleSidebar = () => (tightTill ? setTillMenuOpen((open) => !open) : setCollapsed((value) => !value));

  return (
    /* `pt-safe`: in a standalone (installed) app the status bar overlays the
       page, so the shell starts below it. The bottom inset is the bar's job. */
    <div className="flex h-svh flex-col overflow-hidden bg-canvas pt-safe">
      <DemoBar />
      <div className="flex min-h-0 flex-1">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-toast focus:rounded focus:bg-surface focus:px-4 focus:py-2 focus:text-base focus:font-medium focus:shadow-md"
      >
        {t('nav.skipToContent')}
      </a>

      <Sidebar
        collapsed={isDesktop ? folded : false}
        onToggleCollapsed={toggleSidebar}
        mobileOpen={mobileNav.isOpen}
        onCloseMobile={mobileNav.close}
      />

      {/* The working surface: a lighter panel set into the canvas, with the
          sidebar beside it — the reference's two-tone frame. */}
      {/* Phones and handhelds: the bottom bar sits outside the scroller, so
          it never scrolls away and a page's own `h-full` (the till) ends above it. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-ink-50 lg:my-2 lg:me-2 lg:rounded-xl lg:border lg:border-ink-200 lg:shadow-xs">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain px-safe">
          <Header onOpenMobileNav={mobileNav.open} onToggleSidebar={toggleSidebar} />

          <main id="main-content" className="min-h-0 flex-1 px-3 py-3 sm:px-5 sm:py-5">
            <div className="mx-auto h-full w-full max-w-[1600px]">
              <Outlet />
            </div>
          </main>
        </div>

        <MobileNav />
        <PrintOnCompletion />
      </div>
      </div>
    </div>
  );
}
