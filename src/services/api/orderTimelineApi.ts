import { api } from '@/services/apiClient';

export type TimelineKind =
  | 'placed' | 'print_receipt' | 'print_kitchen' | 'print_a4' | 'print_other'
  | 'kitchen_sent' | 'kitchen_started' | 'kitchen_ready' | 'collected' | 'kitchen_cancelled' | 'cancelled' | 'edited';

export interface TimelineStep {
  kind: TimelineKind;
  atUtc: string;
  detail: string | null;
  actor: string | null;
  secondsFromPrevious: number | null;
}

export interface OrderTimeline {
  invoiceNo: string;
  orderNo: number | null;
  totalH: number;
  status: string;
  kitchenStatus: string | null;
  steps: TimelineStep[];
  totalSeconds: number;
}

export const orderTimelineApi = {
  get: (invoiceNo: string) => api.get<OrderTimeline>(`/api/orders/${encodeURIComponent(invoiceNo)}/timeline`),
  /** Fire and forget: a print that worked is recorded; a failure to record never bothers the cashier. */
  logPrint(invoiceNo: string, kind: string, printer?: string | null): void {
    if (!/^\d+$/.test(invoiceNo)) return;
    const mapped = kind === 'receipt' || kind === 'kitchen' || kind === 'a4' ? `print_${kind}` : 'print_other';
    void api.post(`/api/orders/${invoiceNo}/events`, { kind: mapped, detail: printer ?? null }).catch(() => undefined);
  },
};
