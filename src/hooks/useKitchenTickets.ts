import { useEffect, useState } from 'react';
import { kitchenService, safeCall } from '@/services';
import type { KitchenOrder } from '@/types/kitchen';
import { ticketsByOrder } from '@/lib/orderStatus';

/** Kitchen tickets by order number, refreshed every few seconds, so order statuses stay live on list pages. */
export function useKitchenTickets(intervalMs = 5000): Map<string, KitchenOrder> {
  const [tickets, setTickets] = useState<Map<string, KitchenOrder>>(new Map());
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const result = await safeCall(() => kitchenService.list());
      if (!alive || !result.ok) return;
      const list = (Array.isArray(result.data) ? result.data : (result.data as { items: KitchenOrder[] }).items) as KitchenOrder[];
      setTickets(ticketsByOrder(list));
    };
    void load();
    const timer = window.setInterval(() => void load(), intervalMs);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [intervalMs]);
  return tickets;
}
