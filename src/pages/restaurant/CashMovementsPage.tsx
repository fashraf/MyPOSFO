import { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Receipt } from 'lucide-react';
import { Button, FormField, ImpactConfirm, Input, LoadingState, PageHeader, PriceInput } from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { cn } from '@/lib/cn';
import { toMinorUnits } from '@/lib/format';
import { restaurantSessionService, safeCall } from '@/services';
import type { CashMovement, CashMovementType, SessionSummary } from '@/types/restaurantSession';
import { NoBranch, NoPermission, Notice, Panel, RestaurantTabs, useActor, useBranchSession, useRs } from '@/features/restaurant/shared';
import { CashFormula, MovementsList } from '@/features/restaurant/SessionBlocks';

const TYPES: { type: CashMovementType; icon: typeof Receipt }[] = [
  { type: 'expense', icon: Receipt },
  { type: 'withdrawal', icon: ArrowUpRight },
  { type: 'addition', icon: ArrowDownLeft },
  { type: 'transfer', icon: ArrowRightLeft },
];

export default function CashMovementsPage() {
  const { r, money } = useRs();
  const { can } = useSession();
  const actor = useActor();
  const toast = useToast();
  const { open, loading, branchId } = useBranchSession();

  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [type, setType] = useState<CashMovementType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!open) return;
    const [m, s] = await Promise.all([
      safeCall(() => restaurantSessionService.movements(open.id)),
      safeCall(() => restaurantSessionService.summary(open.id)),
    ]);
    if (m.ok) setMovements(m.data);
    if (s.ok) setSummary(s.data);
  }, [open]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!open) return;
    setBusy(true);
    const res = await safeCall(() =>
      restaurantSessionService.addMovement({ sessionId: open.id, type, amountH: toMinorUnits(amount || '0'), description }, actor),
    );
    setBusy(false);
    setConfirming(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.success(r('cashPage.saved'));
    setAmount('');
    setDescription('');
    setError(null);
    load();
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={r('nav.group')} title={r('cashPage.title')} description={r('cashPage.description')} />
      <RestaurantTabs />
      {!branchId ? (
        <NoBranch />
      ) : loading ? (
        <LoadingState />
      ) : !can('restaurant.cash_movement.view') && !can('restaurant.cash_movement.create') ? (
        <NoPermission what={r('perm.cash')} />
      ) : !open ? (
        <Notice tone="danger" testId="closed-banner">{r('cashPage.closed')}</Notice>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-3">
            {can('restaurant.cash_movement.create') ? (
              <Panel title={r('cashPage.record')}>
                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {TYPES.map(({ type: tp, icon: Icon }) => (
                    <button
                      key={tp}
                      type="button"
                      data-testid={`movement-type-${tp}`}
                      onClick={() => setType(tp)}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-xl border p-3 text-sm font-medium transition-colors',
                        type === tp ? 'border-info-400 bg-info-50 text-info-800' : 'border-ink-200 text-ink-600 hover:bg-ink-50',
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {r(`movement.${tp}`)}
                    </button>
                  ))}
                </div>
                <p className="mb-3 text-xs text-ink-500">{r(`movementHint.${type}`)}</p>
                <form
                  className="grid gap-3 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!amount || toMinorUnits(amount) <= 0) return setError(r('cashPage.errAmount'));
                    if (!description.trim()) return setError(r('cashPage.errDescription'));
                    setError(null);
                    setConfirming(true);
                  }}
                >
                  <FormField label={r('cols.amount')} required>
                    <PriceInput data-testid="movement-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                  </FormField>
                  <FormField label={r('cols.description')} required>
                    <Input data-testid="movement-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder={r('cashPage.descPlaceholder')} />
                  </FormField>
                  {error && <p className="text-sm text-danger-700 sm:col-span-2" role="alert">{error}</p>}
                  <div className="flex justify-end sm:col-span-2">
                    <Button type="submit" data-testid="movement-submit">{r('cashPage.save', { type: r(`movement.${type}`) })}</Button>
                  </div>
                </form>
              </Panel>
            ) : (
              <NoPermission what={r('perm.cashCreate')} />
            )}
            <Panel title={r('blocks.movements')}><MovementsList movements={movements} /></Panel>
          </div>
          <div className="lg:col-span-2">{summary && <CashFormula summary={summary} />}</div>
        </div>
      )}
      <ImpactConfirm
        open={confirming}
        title={r('cashPage.confirmTitle')}
        description={r('cashPage.confirmBody', { type: r(`movement.${type}`), amount: money(toMinorUnits(amount || '0')) })}
        facts={[{ label: r('cols.description'), value: description }]}
        changes={summary ? [{
          label: r('fields.expectedCash'),
          beforeH: summary.cash.expectedH,
          afterH: summary.cash.expectedH + (type === 'addition' ? 1 : -1) * toMinorUnits(amount || '0'),
        }] : []}
        effects={[
          r(type === 'addition' ? 'effects.cash.in' : 'effects.cash.out'),
          r('effects.cash.count'),
          r('effects.cash.audit'),
        ]}
        confirmLabel={r('actions.confirm')}
        loading={busy}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
