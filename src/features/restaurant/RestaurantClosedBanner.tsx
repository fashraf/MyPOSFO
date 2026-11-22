import { LockKeyhole, Store } from 'lucide-react';
import { Button } from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { useState } from 'react';
import { useRs } from './shared';
import { QuickOpenDialog } from './QuickDialogs';

/**
 * Shown on the till when no business session is open. New orders, the cart and
 * checkout are disabled behind it; the Open button only appears for someone
 * allowed to open the restaurant.
 */
export function RestaurantClosedBanner({ onOpened }: { onOpened?: () => void }) {
  const { r } = useRs();
  const { can } = useSession();
  const [opening, setOpening] = useState(false);
  return (
    <div
      role="alert"
      data-testid="pos-closed-banner"
      className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-danger-300 bg-danger-600 px-4 py-3 text-white shadow-sm"
    >
      <LockKeyhole aria-hidden className="h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{r('closedBanner')}</div>
        {!can('restaurant.session.open') && <div className="text-sm text-white/85">{r('dashboard.askManager')}</div>}
      </div>
      {can('restaurant.session.open') && (
        <Button size="sm" variant="secondary" leadingIcon={<Store className="h-4 w-4" />} onClick={() => setOpening(true)} data-testid="pos-open-restaurant">
          {r('actions.open')}
        </Button>
      )}
      <QuickOpenDialog open={opening} onClose={() => setOpening(false)} onOpened={onOpened} />
    </div>
  );
}
