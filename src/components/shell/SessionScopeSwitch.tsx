import { History, Timer } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/i18n';
import { useSession } from '@/contexts/SessionContext';
import { scopeWindow, useScopeEnabled } from '@/services/sessionScope';

/** "This session 1002 · All history": what the figures on this page cover. */
export function SessionScopeSwitch({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { activeBranch } = useSession();
  const [on, setOn] = useScopeEnabled();
  const window = on ? scopeWindow(activeBranch?.id ?? null) : null;
  const pill = (active: boolean) =>
    cn('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
      active ? 'bg-surface text-ink-900 shadow-xs' : 'text-ink-500 hover:text-ink-800');
  return (
    <div role="group" aria-label={t('sessionScope.label')} data-testid="session-scope" className={cn('inline-flex rounded-lg bg-ink-100 p-0.5', className)}>
      <button type="button" className={pill(on)} onClick={() => setOn(true)} aria-pressed={on} data-testid="scope-session">
        <Timer aria-hidden className="h-3.5 w-3.5" />
        {t('sessionScope.session')}
        {window && <span className="numeric text-ink-500">{window.number}{window.status === 'closed' ? ` · ${t('sessionScope.closed')}` : ''}</span>}
      </button>
      <button type="button" className={pill(!on)} onClick={() => setOn(false)} aria-pressed={!on} data-testid="scope-all">
        <History aria-hidden className="h-3.5 w-3.5" />
        {t('sessionScope.all')}
      </button>
    </div>
  );
}
