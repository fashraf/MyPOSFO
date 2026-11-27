/**
 * Newest order first, by the order's number (invoice 1, 2, 3 …).
 *
 * Not by time: tickets and sales are stamped by the device that made them, and two devices' clocks never agree
 * exactly, which put 23 before 24 before 19. The number comes from the server and only goes up.
 */
const num = (value: string | number | undefined | null): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : -Infinity;
};

export function newestOrderFirst<T extends { orderNumber: string }>(a: T, b: T): number {
  return num(b.orderNumber) - num(a.orderNumber);
}

export function newestInvoiceFirst<T extends { invoiceNumber: string }>(a: T, b: T): number {
  return num(b.invoiceNumber) - num(a.invoiceNumber);
}
