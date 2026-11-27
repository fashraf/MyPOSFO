import { useMemo } from 'react';
import { useSession } from '@/contexts/SessionContext';
import { salesSnapshot } from '@/services/salesService';
import { scopeWindow, ticketInScope, useScopeEnabled } from '@/services/sessionScope';
import type { KitchenOrder } from '@/types/kitchen';

/** Kitchen / Collection: only the current session's tickets while "This session" is on. */
export function useTicketScope(orders: KitchenOrder[]): KitchenOrder[] {
  const { activeBranch } = useSession();
  const [on] = useScopeEnabled();
  return useMemo(() => {
    const window = on ? scopeWindow(activeBranch?.id ?? null) : null;
    if (!window) return orders;
    const { sales } = salesSnapshot();
    const mine = new Set(sales.filter((s) => s.sessionId === window.sessionId).map((s) => s.invoiceNumber));
    const known = new Set(sales.map((s) => s.invoiceNumber));
    return orders.filter((o) => ticketInScope(o, window, mine, known));
  }, [orders, on, activeBranch]);
}
