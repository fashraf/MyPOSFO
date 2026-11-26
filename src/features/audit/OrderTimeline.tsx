import { useCallback, useEffect, useState } from 'react';
import {
  Ban, ChefHat, CheckCircle2, Flame, HandPlatter, PencilLine, Printer, Receipt, ShoppingCart, type LucideIcon,
} from 'lucide-react';
import { CurrencyDisplay, Select } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useI18n, useTranslation } from '@/i18n';
import { safeCall, salesService } from '@/services';
import { orderTimelineApi, type OrderTimeline as Timeline, type TimelineKind } from '@/services/api/orderTimelineApi';
import type { Sale } from '@/types/sales';

const STEP: Record<TimelineKind, { icon: LucideIcon; tone: string }> = {
  placed: { icon: ShoppingCart, tone: 'bg-brand-600 text-white' },
  print_receipt: { icon: Receipt, tone: 'bg-ink-700 text-white' },
  print_kitchen: { icon: Printer, tone: 'bg-ink-700 text-white' },
  print_a4: { icon: Printer, tone: 'bg-ink-700 text-white' },
  print_other: { icon: Printer, tone: 'bg-ink-700 text-white' },
  kitchen_sent: { icon: ChefHat, tone: 'bg-info-600 text-white' },
  kitchen_started: { icon: Flame, tone: 'bg-warning-500 text-white' },
  kitchen_ready: { icon: CheckCircle2, tone: 'bg-success-600 text-white' },
  collected: { icon: HandPlatter, tone: 'bg-success-700 text-white' },
  kitchen_cancelled: { icon: Ban, tone: 'bg-danger-600 text-white' },
  cancelled: { icon: Ban, tone: 'bg-danger-600 text-white' },
  edited: { icon: PencilLine, tone: 'bg-warning-600 text-white' },
};

/** 75 → "1m 15s", 3700 → "1h 1m", 8 → "8s". */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Order → print → kitchen → collected, left to right, with the time each step took. */
export function OrderTimeline() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const [orders, setOrders] = useState<Sale[]>([]);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void safeCall(() => salesService.list({ page: 1, pageSize: 50 })).then((result) => {
      if (!result.ok) return;
      const list = [...result.data.items].sort((a, b) => Number(b.invoiceNumber) - Number(a.invoiceNumber));
      setOrders(list);
      setInvoice((current) => current ?? list[0]?.invoiceNumber ?? null);
    });
  }, []);

  const load = useCallback(async () => {
    if (!invoice) return;
    setLoading(true);
    const result = await safeCall(() => orderTimelineApi.get(invoice));
    setLoading(false);
    if (result.ok) {
      setTimeline(result.data);
      setError(null);
    } else {
      setTimeline(null);
      setError(result.error.message);
    }
  }, [invoice]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(language === 'ar' ? 'ar-SA' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <section className="rounded-lg border border-ink-200 bg-surface shadow-xs" data-testid="order-timeline">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-ink-900">{t('orderTimeline.title')}</h2>
          <p className="text-xs text-ink-500">{t('orderTimeline.description')}</p>
        </div>
        <div className="flex items-center gap-3">
          {timeline && (
            <span className="text-xs text-ink-500">
              {t('orderTimeline.total')}{' '}
              <span className="numeric font-semibold text-ink-900">{duration(timeline.totalSeconds)}</span>
              {' · '}
              <CurrencyDisplay amount={timeline.totalH} />
            </span>
          )}
          <Select
            className="w-56"
            value={invoice ?? ''}
            onChange={(value) => setInvoice(value || null)}
            placeholder={t('orderTimeline.pick')}
            options={orders.map((sale) => ({
              value: sale.invoiceNumber,
              label: `${t('orderTimeline.invoice')} ${sale.invoiceNumber}${sale.orderNo ? ` · #${sale.orderNo}` : ''}`,
            }))}
          />
        </div>
      </header>

      <div className="overflow-x-auto px-4 py-5">
        {!invoice || (orders.length === 0 && !timeline) ? (
          <p className="py-6 text-center text-sm text-ink-500">{t('orderTimeline.none')}</p>
        ) : error ? (
          <p className="py-6 text-center text-sm text-danger-600">{error}</p>
        ) : !timeline ? (
          <p className="py-6 text-center text-sm text-ink-400">{loading ? '…' : ''}</p>
        ) : (
          <ol className="flex min-w-max items-start" aria-label={t('orderTimeline.title')}>
            {timeline.steps.map((step, index) => {
              const meta = STEP[step.kind] ?? STEP.print_other;
              const Icon = meta.icon;
              return (
                <li key={`${step.kind}-${index}`} className="flex items-start" data-testid="timeline-step" data-kind={step.kind}>
                  {index > 0 && (
                    /* The gap between two steps, labelled with how long it took. */
                    <div className="flex w-24 flex-col items-center pt-3 sm:w-28">
                      <span className="numeric mb-1 rounded-full bg-ink-100 px-2 py-0.5 text-2xs font-semibold text-ink-700" data-testid="timeline-gap">
                        +{duration(step.secondsFromPrevious ?? 0)}
                      </span>
                      <span className="h-0.5 w-full bg-ink-200" />
                    </div>
                  )}
                  <div className="flex w-28 flex-col items-center text-center">
                    <span className={cn('grid h-10 w-10 place-items-center rounded-full shadow-xs', meta.tone)}>
                      <Icon aria-hidden className="h-5 w-5" />
                    </span>
                    <span className="mt-2 text-xs font-semibold text-ink-900">{t(`orderTimeline.kinds.${step.kind}`)}</span>
                    <span className="numeric text-2xs text-ink-500" title={new Date(step.atUtc).toLocaleString()}>{time(step.atUtc)}</span>
                    {(step.actor || step.detail) && (
                      <span className="mt-0.5 line-clamp-2 text-2xs text-ink-400">
                        {[step.actor, step.kind === 'edited' && step.detail ? `→ ${step.detail}` : step.detail].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
