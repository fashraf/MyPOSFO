import { PencilLine } from 'lucide-react';
import { useTranslation } from '@/i18n';
import type { KitchenOrder } from '@/types/kitchen';

/** Shown on a ticket that replaced an edited order, so the kitchen knows to check what changed. */
export function EditedBadge({ order }: { order: Pick<KitchenOrder, 'replacesOrder' | 'replacesTicketNo'> }) {
  const { t } = useTranslation();
  if (!order.replacesOrder) return null;
  const was = order.replacesTicketNo ? `#${order.replacesTicketNo}` : order.replacesOrder;
  return (
    <span
      data-testid="kds-edited"
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-warning-700 ring-1 ring-warning-100"
    >
      <PencilLine className="h-3 w-3" aria-hidden />
      {t('kdsEdited.badge', { order: was })}
    </span>
  );
}
