import { RouterProvider } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { ToastProvider } from '@/contexts/ToastContext';
import { SessionProvider } from '@/contexts/SessionContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider } from '@/features/auth/context/AuthContext';
import { router } from '@/routes';
import { GlobalTooltips } from '@/components/ui';

/**
 * Application root.
 *
 * AuthProvider wraps the router because the route guards depend on it;
 * SessionProvider sits inside because it describes the signed-in user.
 */
export default function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <ToastProvider>
        <AuthProvider>
          <SessionProvider>
            <RouterProvider router={router} future={{ v7_startTransition: true }} />
            <GlobalTooltips />
          </SessionProvider>
        </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
