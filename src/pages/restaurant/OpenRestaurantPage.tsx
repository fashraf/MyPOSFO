import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Store } from 'lucide-react';
import { Button, DatePicker, ImpactConfirm, FormField, Input, inputBaseClasses, LoadingState, PageHeader, PriceInput, Textarea } from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { cn } from '@/lib/cn';
import { toMinorUnits } from '@/lib/format';
import { ROUTES } from '@/routes/paths';
import { restaurantSessionService, safeCall } from '@/services';
import { businessDateOf } from '@/types/restaurantSession';
import {
  NoBranch,
  NoPermission,
  Notice,
  Panel,
  RestaurantTabs,
  useActor,
  useBranchSession,
  useRs,
} from '@/features/restaurant/shared';

/** "2026-11-20T10:05" in Riyadh for an instant. */
function riyadhLocal(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`;
}

export default function OpenRestaurantPage() {
  const { r, money, longDate } = useRs();
  const { can, activeBranch } = useSession();
  const actor = useActor();
  const toast = useToast();
  const navigate = useNavigate();
  const { open, loading, branchId, reload } = useBranchSession();

  const initial = useMemo(() => riyadhLocal(new Date()), []);
  const [openedLocal, setOpenedLocal] = useState(initial);
  const [businessDate, setBusinessDate] = useState(initial.slice(0, 10));
  const [dateTouched, setDateTouched] = useState(false);
  const [cash, setCash] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [idemKey] = useState(() => globalThis.crypto?.randomUUID?.() ?? `open-${Date.now()}`);

  const openedIso = useMemo(() => {
    const d = new Date(`${openedLocal}:00+03:00`);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }, [openedLocal]);

  const validate = () => {
    const next: Record<string, string> = {};
    if (cash.trim() === '') next.cash = r('open.errors.cashRequired');
    else if (!/^\d+(\.\d{1,2})?$/.test(cash.trim())) next.cash = r('open.errors.cashNumber');
    if (!openedIso) next.openedAt = r('open.errors.when');
    else if (Date.parse(openedIso) > Date.now() + 5 * 60_000) next.openedAt = r('open.errors.future');
    if (!businessDate) next.businessDate = r('open.errors.date');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    setBusy(true);
    const res = await safeCall(() =>
      restaurantSessionService.open(
        {
          branchId: branchId!,
          openingBalanceH: toMinorUnits(cash),
          /* Untouched field means "now" — to the second, not the minute shown. */
          openedAt: openedLocal === initial ? new Date().toISOString() : openedIso,
          businessDate,
          notes,
          idempotencyKey: idemKey,
        },
        actor,
      ),
    );
    setBusy(false);
    setConfirming(false);
    if (!res.ok) {
      toast.error(r('open.failed'), res.error.message);
      reload();
      return;
    }
    toast.success(r('open.done'), r('open.doneBody', { number: res.data.number }));
    navigate(ROUTES.restaurant);
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={r('nav.group')} title={r('open.title')} description={r('open.description')} />
      <RestaurantTabs />

      {!branchId ? (
        <NoBranch />
      ) : loading ? (
        <LoadingState />
      ) : !can('restaurant.session.open') ? (
        <NoPermission what={r('perm.open')} />
      ) : open ? (
        <Notice tone="warning" testId="already-open">
          <div className="font-semibold">{r('open.alreadyOpen', { number: open.number })}</div>
          <div className="mt-1">{r('open.alreadyOpenBody', { date: longDate(open.businessDate) })}</div>
          <div className="mt-2 flex gap-2">
            <Link to={ROUTES.restaurantSession}><Button size="sm" variant="secondary">{r('actions.viewSession')}</Button></Link>
            {can('restaurant.session.close') && <Link to={ROUTES.restaurantClose}><Button size="sm" variant="danger">{r('actions.close')}</Button></Link>}
          </div>
        </Notice>
      ) : (
        <Panel className="max-w-3xl">
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (validate()) setConfirming(true);
            }}
          >
            <FormField label={r('fields.branch')}>
              <Input value={activeBranch ? activeBranch.nameEn || activeBranch.nameAr : ''} readOnly disabled />
            </FormField>
            <FormField label={r('fields.openedBy')}>
              <Input value={actor.name} readOnly disabled />
            </FormField>
            <FormField label={r('fields.openedAt')} required error={errors.openedAt} hint={r('open.timeHint')}>
              <input
                type="datetime-local"
                data-testid="opened-at"
                value={openedLocal}
                onChange={(e) => {
                  setOpenedLocal(e.target.value);
                  if (!dateTouched && e.target.value) setBusinessDate(businessDateOf(new Date(`${e.target.value}:00+03:00`)));
                }}
                className={cn(inputBaseClasses, 'h-10')}
              />
            </FormField>
            <FormField label={r('fields.businessDate')} required error={errors.businessDate} hint={r('open.dateHint')}>
              <DatePicker value={businessDate} onChange={(v) => { setBusinessDate(v); setDateTouched(true); }} />
            </FormField>
            <FormField label={r('fields.openingCash')} required error={errors.cash} hint={r('open.cashHint')}>
              <PriceInput data-testid="opening-cash" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0.00" autoFocus />
            </FormField>
            <div className="hidden sm:block" />
            <FormField label={r('fields.notes')} showOptional className="sm:col-span-2">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500} />
            </FormField>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Link to={ROUTES.restaurant}><Button type="button" variant="ghost">{r('actions.cancel')}</Button></Link>
              <Button type="submit" leadingIcon={<Store className="h-4 w-4" />} data-testid="open-submit">{r('actions.open')}</Button>
            </div>
          </form>
        </Panel>
      )}

      <ImpactConfirm
        open={confirming}
        title={r('open.confirmTitle')}
        description={r('open.confirmMessage')}
        facts={[
          { label: r('fields.branch'), value: activeBranch?.nameEn || activeBranch?.nameAr },
          { label: r('fields.businessDate'), value: businessDate ? longDate(businessDate, true) : '—' },
          { label: r('fields.openedAt'), value: openedLocal.replace('T', ' ') },
          { label: r('fields.openedBy'), value: actor.name },
          { label: r('fields.openingCash'), amountH: cash ? toMinorUnits(cash) : 0, emphasis: true },
        ]}
        effects={[
          r('effects.open.orders'),
          r('effects.open.date', { date: businessDate ? longDate(businessDate) : '—' }),
          r('effects.open.float', { amount: money(cash ? toMinorUnits(cash) : 0) }),
          r('effects.open.audit'),
        ]}
        confirmLabel={r('open.confirmButton')}
        loading={busy}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
