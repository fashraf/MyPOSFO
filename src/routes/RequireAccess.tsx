import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, LoadingState } from '@/components/ui';
import { accessFor, firstAllowedPath } from '@/config/navigation';
import { useSession } from '@/contexts/SessionContext';
import { useAuth } from '@/features/auth/context/AuthContext';
import { useTranslation } from '@/i18n';

/**
 * Route-level RBAC.
 *
 * Sits between the shell and every page. The sidebar already hides what a
 * person cannot use; this covers the typed URL, the old bookmark and the link
 * in a shared message, and answers with a clear "not for your role" rather
 * than a page that half-loads and then fails on its first request.
 */
export function RequireAccess() {
  const { t } = useTranslation();
  const location = useLocation();
  const { permissions, loading, user } = useSession();

  if (loading && !user) return <LoadingState className="py-24" />;

  const needed = accessFor(location.pathname);
  if (!needed || needed.some((key) => permissions.includes(key))) return <Outlet />;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full border border-ink-200 bg-surface text-ink-500">
        <ShieldOff aria-hidden className="h-5 w-5" />
      </span>
      <div className="max-w-md space-y-1.5">
        <p className="eyebrow">403</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t('demo.forbiddenTitle')}</h1>
        <p className="text-md text-ink-500">{t('demo.forbiddenBody')}</p>
      </div>
      <Link to={firstAllowedPath(permissions)}>
        <Button variant="outline">{t('demo.forbiddenAction')}</Button>
      </Link>
    </div>
  );
}

/** `/` sends each role to its own home: a cashier to the till, a barista to the board. */
export function HomeRedirect() {
  const { session } = useAuth();
  const { permissions, loading, user } = useSession();

  if (loading && !user) return <LoadingState className="py-24" />;

  const landing = session?.landingPath;
  const allowed = landing && (accessFor(landing) ?? []).some((key) => permissions.includes(key));
  return <Navigate to={allowed ? landing : firstAllowedPath(permissions)} replace />;
}
