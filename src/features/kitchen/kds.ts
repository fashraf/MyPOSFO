import type { KitchenOrder, KitchenOrderItem } from '@/types/kitchen';

/**
 * Pure helpers for the kitchen display, kept out of the component so the
 * rules (what counts as a removal, how the all-day list adds up) are easy to
 * read and to test.
 */

export type ModTone = 'remove' | 'add' | 'size';

export interface ItemView {
  name: string;
  meal: string | null;
  mods: { label: string; tone: ModTone }[];
  note: string | null;
}

const REMOVE = /^(no |without |hold |بدون|بلا|من غير)/i;
const ADD = /^(extra|add |\+|with |إضافة|زيادة|اضافة)/i;

export function toneOf(label: string): ModTone {
  if (REMOVE.test(label.trim())) return 'remove';
  if (ADD.test(label.trim())) return 'add';
  return 'size';
}

/** Name, meal and modifiers of one ticket line, in the screen's language. */
export function viewOf(item: KitchenOrderItem, language: string): ItemView {
  const ar = language === 'ar';
  /* New tickets carry structured detail; older ones only "Fries · Large". */
  const parts = item.nameEn.split(' · ');
  const name = ar ? (item.baseAr ?? item.nameAr) : (item.baseEn ?? parts[0]);
  const modLabels = item.mods
    ? item.mods.map((m) => (ar ? m.ar : m.en))
    : parts.slice(1);
  const meal = (ar ? item.mealAr : item.mealEn) ?? null;
  const structured = Boolean(item.mods || item.mealEn);
  const note = !structured && item.note && !parts.slice(1).some((p) => item.note.includes(p)) ? item.note : null;
  return {
    name,
    meal,
    mods: modLabels.filter(Boolean).map((label) => ({ label, tone: toneOf(label) })),
    note,
  };
}

/** "#1695" from "INV-1695" — the number a runner calls out. */
/**
 * The number staff call out: the order's number within today's session
 * (#1, #2 …), which restarts every business session. Older tickets without
 * one fall back to the tail of the invoice number.
 */
export function ticketLabel(order: { ticketNo?: number; orderNumber: string }): string {
  return order.ticketNo ? `#${order.ticketNo}` : shortNumber(order.orderNumber);
}

export function shortNumber(orderNumber: string): string {
  const digits = orderNumber.match(/(\d+)$/)?.[1];
  return digits ? `#${digits}` : orderNumber;
}

export interface AllDayRow {
  key: string;
  name: string;
  mods: string;
  count: number;
}

/**
 * Everything still to make, added up across tickets: "7 × Fries · Large".
 * Lets the grill drop a full basket instead of cooking ticket by ticket.
 */
export function allDay(orders: KitchenOrder[], language: string, include: (item: KitchenOrderItem) => boolean): AllDayRow[] {
  const rows = new Map<string, AllDayRow>();
  for (const order of orders) {
    if (order.status !== 'open' && order.status !== 'preparing') continue;
    for (const item of order.items) {
      const left = item.quantity - item.completedQuantity;
      if (left <= 0 || !include(item)) continue;
      const view = viewOf(item, language);
      const mods = view.mods.map((m) => m.label).join(' · ');
      const key = `${view.name}|${mods}`;
      const row = rows.get(key) ?? { key, name: view.name, mods, count: 0 };
      row.count += left;
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Two soft rising tones. Generated, so there is no audio file to load. */
export function playChime(): void {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* No audio (blocked autoplay, old browser): the flashing card still shows it. */
  }
}
