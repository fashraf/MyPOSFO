import { useEffect, useState } from 'react';

/** "2 seconds ago", "5 minutes ago", "يوم أمس" — in the screen's language. */
export function relativeTime(iso: string | null | undefined, language: string, now = Date.now()): string {
  if (!iso) return '—';
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '—';
  const seconds = Math.round((at - now) / 1000);
  const format = new Intl.RelativeTimeFormat(language === 'ar' ? 'ar' : 'en', { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return format.format(seconds, 'second');
  if (abs < 3600) return format.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return format.format(Math.round(seconds / 3600), 'hour');
  return format.format(Math.round(seconds / 86400), 'day');
}

/** Re-render every few seconds, so "2 seconds ago" keeps counting. */
export function useNow(intervalMs = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Exact local time for a tooltip: 25 Nov 2026, 17:42:08. */
export function exactTime(iso: string | null | undefined, language: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}
