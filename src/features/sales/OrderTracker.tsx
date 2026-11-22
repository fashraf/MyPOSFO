import { Ban, Check, ChefHat, CreditCard, PackageCheck, ShoppingBag, Timer } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { useTranslation } from '@/i18n';
import type { FulfilmentStage, KitchenOrder } from '@/types/kitchen';

const FLOW: { stage: FulfilmentStage; icon: typeof Check }[] = [
  { stage: 'received', icon: Timer },
  { stage: 'preparing', icon: ChefHat },
  { stage: 'ready', icon: ShoppingBag },
  { stage: 'collected', icon: PackageCheck },
];

/**
 * Where the order is right now, as a horizontal track.
 *
 * Written for the question a cashier hears most — "where's my order?" — so the
 * current step is large and named in plain words, with how long it has been
 * there. An order with nothing to cook skips straight to "Completed".
 */
export function OrderTracker({
  stage,
  paidAt,
  ticket,
}: {
  stage: FulfilmentStage;
  paidAt: string;
  ticket: KitchenOrder | null;
}) {
  const { t, language } = useTranslation();

  if (stage === 'cancelled') {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-danger-100 bg-danger-50 p-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-danger-500 text-white">
          <Ban className="h-4 w-4" />
        </span>
        <p className="text-sm font-semibold text-danger-700">{t('orderTrack.cancelled')}</p>
      </div>
    );
  }

  if (stage === 'completed') {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-success-100 bg-success-50 p-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-success-500 text-white">
          <Check className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-success-700">{t('orderTrack.completed')}</p>
          <p className="text-xs text-success-700/80">{t('orderTrack.completedHint')}</p>
        </div>
      </div>
    );
  }

  const currentIndex = FLOW.findIndex((step) => step.stage === stage);
  const minutes = ticket ? Math.max(0, Math.round((Date.now() - new Date(ticket.updatedAt).getTime()) / 60000)) : 0;

  return (
    <div className="rounded-lg border border-ink-200 bg-surface p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-md font-semibold text-ink-900">{t(`orderTrack.stage.${stage}`)}</p>
        {stage !== 'collected' && ticket && (
          <span className="numeric rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">
            {t('orderTrack.since', { minutes })}
          </span>
        )}
      </div>
      <ol className="flex items-start">
        <li className="flex flex-1 flex-col items-center gap-1 text-center">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-ink-900 text-ink-50">
            <CreditCard className="h-4 w-4" />
          </span>
          <span className="text-2xs font-medium text-ink-700">{t('orderTrack.paid')}</span>
          <span className="numeric text-[10px] text-ink-400">{formatDate(paidAt, { language, withTime: true }).split(',').pop()}</span>
        </li>
        {FLOW.map((step, index) => {
          const done = index <= currentIndex;
          const Icon = step.icon;
          return (
            <li key={step.stage} className="relative flex flex-1 flex-col items-center gap-1 text-center">
              <span aria-hidden className={cn('absolute top-4 h-0.5 -translate-y-1/2', done ? 'bg-ink-900' : 'bg-ink-200')} style={{ insetInlineEnd: '50%', width: '100%' }} />
              <span
                className={cn(
                  'relative grid h-8 w-8 place-items-center rounded-full border-2',
                  index === currentIndex
                    ? 'border-ink-900 bg-surface text-ink-900 ring-4 ring-ink-900/10'
                    : done
                      ? 'border-ink-900 bg-ink-900 text-ink-50'
                      : 'border-ink-200 bg-surface text-ink-300',
                )}
              >
                {done && index < currentIndex ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <span className={cn('text-2xs font-medium', done ? 'text-ink-800' : 'text-ink-400')}>
                {t(`orderTrack.short.${step.stage}`)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
