import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LockKeyhole, Store, Wallet } from 'lucide-react';
import { Button, LoadingState, PageHeader } from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { ROUTES } from '@/routes/paths';
import { restaurantSessionService, safeCall } from '@/services';
import type { CashMovement, SessionSummary } from '@/types/restaurantSession';
import { NoBranch, Notice, Panel, RestaurantTabs, SessionAlerts, useBranchSession, useRs } from '@/features/restaurant/shared';
import { QuickCloseDialog, QuickOpenDialog } from '@/features/restaurant/QuickDialogs';
import { CashFormula, MovementsList, PaymentTable, SalesSummaryBlock, SessionInfo, TransactionsTable } from '@/features/restaurant/SessionBlocks';

export default function CurrentSessionPage() {
  const { r } = useRs();
  const { can } = useSession();
  const { open, settings, loading, branchId, reload } = useBranchSession();
  const [dialog, setDialog] = useState<'open' | 'close' | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);

  useEffect(() => {
    if (!open) {
      setSummary(null);
      return;
    }
    safeCall(() => restaurantSessionService.summary(open.id)).then((res) => res.ok && setSummary(res.data));
    safeCall(() => restaurantSessionService.movements(open.id)).then((res) => res.ok && setMovements(res.data));
  }, [open]);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={r('nav.group')}
        title={r('current.title')}
        description={r('current.description')}
        actions={
          open && (
            <div className="flex gap-2">
              {can('restaurant.cash_movement.create') && (
                <Link to={ROUTES.restaurantCash}><Button variant="secondary" leadingIcon={<Wallet className="h-4 w-4" />}>{r('actions.recordCash')}</Button></Link>
              )}
              {can('restaurant.session.close') && (
                <Button variant="danger" leadingIcon={<LockKeyhole className="h-4 w-4" />} onClick={() => setDialog('close')}>{r('actions.close')}</Button>
              )}
            </div>
          )
        }
      />
      <RestaurantTabs />
      <QuickOpenDialog open={dialog === 'open'} onClose={() => setDialog(null)} onOpened={reload} />
      <QuickCloseDialog open={dialog === 'close'} session={open} onClose={() => setDialog(null)} onClosed={reload} />
      {!branchId ? (
        <NoBranch />
      ) : loading ? (
        <LoadingState />
      ) : !open ? (
        <Notice tone="danger" testId="closed-banner">
          <div className="font-semibold">{r('closedBanner')}</div>
          {can('restaurant.session.open') && (
            <Button size="sm" className="mt-2" leadingIcon={<Store className="h-4 w-4" />} onClick={() => setDialog('open')}>{r('actions.open')}</Button>
          )}
        </Notice>
      ) : (
        <>
          <SessionAlerts session={open} settings={settings} />
          <SessionInfo session={open} />
          {!summary ? (
            <LoadingState />
          ) : (
            <>
              <SalesSummaryBlock summary={summary} />
              <div className="grid gap-4 lg:grid-cols-5">
                <div className="lg:col-span-3"><PaymentTable summary={summary} /></div>
                <div className="lg:col-span-2"><CashFormula summary={summary} /></div>
              </div>
              {can('restaurant.cash_movement.view') && (
                <Panel title={r('blocks.movements')}><MovementsList movements={movements} /></Panel>
              )}
              <TransactionsTable summary={summary} />
            </>
          )}
        </>
      )}
    </div>
  );
}
