import { useTranslation } from '@/i18n';
import { ORDER_STATUS_TONES, type OrderStatus } from '@/lib/orderStatus';
import { Badge } from './Badge';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  return (
    <Badge tone={ORDER_STATUS_TONES[status]} dot data-testid="order-status" data-status={status}>
      {t(`orderStatus.${status}`)}
    </Badge>
  );
}
