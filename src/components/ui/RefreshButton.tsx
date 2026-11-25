import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { SERVER_CORE } from '@/config/env';
import { forceNextSync } from '@/services/hybrid/serverCore';
import { useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';

/**
 * Reload this page's data now. With the server in use it skips the few-second sync cache, so what shows is what the
 * server holds this moment (an order placed on another till appears straight away).
 */
export function RefreshButton({ onRefresh, className }: { onRefresh: () => unknown; className?: string }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      if (SERVER_CORE) forceNextSync();
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={busy}
      data-testid="refresh"
      aria-label={busy ? t('common.refreshing') : t('common.refresh')}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-ink-200 bg-surface px-3 text-sm font-medium text-ink-700',
        'transition-colors hover:bg-ink-50 disabled:opacity-60',
        className,
      )}
    >
      <RotateCw aria-hidden className={cn('h-4 w-4', busy && 'animate-spin')} />
      <span className="hidden sm:inline">{busy ? t('common.refreshing') : t('common.refresh')}</span>
    </button>
  );
}
