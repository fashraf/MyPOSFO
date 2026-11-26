import { SAMPLE_ACTIVITY } from '@/config/env';
import type { ListQuery, Paginated } from '@/types';
import { HttpError } from '@/services/http';
import { schedulePersist } from './db';

/**
 * Shared machinery for the mock services.
 *
 * These functions exist so each mock service reads like a thin repository
 * instead of repeating pagination, sorting, and latency by hand. When the real
 * API arrives, the services are rewritten and this file is deleted — nothing in
 * the UI imports from here.
 */

/**
 * Simulated network latency so loading states are actually exercised.
 *
 * Every mock method awaits this before touching its collections, which makes it
 * the one place that sees every operation. It schedules a debounced flush of
 * the tenant database, so whatever the method mutates after the await is
 * persisted without the method having to say so.
 */
export function delay(ms = 220): Promise<void> {
  /* The pause imitates network latency in the sales demo only. A real business (hybrid/server data) never waits:
     these pauses chained up to 2-3 s before the print window and other screens appeared. */
  const wait = SAMPLE_ACTIVITY ? ms : 0;
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
      schedulePersist();
    }, wait);
  });
}

/**
 * A deterministic pseudo-random generator (mulberry32).
 *
 * Seed data must be identical on every machine and after every reset, so
 * nothing in a seed may call Math.random().
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deep copy for seed data, so a mutation never reaches the frozen original. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function timestamp(): string {
  return new Date().toISOString();
}

export function notFound(resource: string, id: string): HttpError {
  return new HttpError({
    status: 404,
    code: 'not_found',
    message: `${resource} ${id} was not found.`,
  });
}

export function validationFailed(fieldErrors: Record<string, string[]>): HttpError {
  return new HttpError({
    status: 422,
    code: 'validation_failed',
    message: 'Some fields need attention.',
    fieldErrors,
  });
}

/** Case- and diacritic-insensitive match, so Arabic search behaves sensibly. */
export function matches(haystack: string, needle: string): boolean {
  if (!needle) return true;
  const normalise = (value: string) =>
    value
      .toLocaleLowerCase()
      .normalize('NFKD')
      .replace(/[\u064B-\u065F\u0670]/g, '') // Arabic diacritics
      .replace(/[أإآ]/g, 'ا')
      .replace(/[ىي]/g, 'ي')
      .replace(/ة/g, 'ه')
      .trim();

  return normalise(haystack).includes(normalise(needle));
}

export function compareBy<T>(items: T[], key: string, direction: 'asc' | 'desc' = 'asc'): T[] {
  const factor = direction === 'asc' ? 1 : -1;

  return [...items].sort((a, b) => {
    const left = (a as Record<string, unknown>)[key];
    const right = (b as Record<string, unknown>)[key];

    if (typeof left === 'number' && typeof right === 'number') {
      return (left - right) * factor;
    }
    return String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true }) * factor;
  });
}

/** Slice a filtered collection into the envelope the real API returns. */
export function paginate<T>(items: T[], query?: ListQuery): Paginated<T> {
  const page = Math.max(1, query?.page ?? 1);
  const pageSize = Math.max(1, query?.pageSize ?? 25);
  const total = items.length;
  const start = (page - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Whether a record belongs to the branch currently being viewed.
 *
 * A null `branchId` on the record means "not branch-specific" — legacy rows,
 * or data created before branches were introduced — and stays visible
 * everywhere rather than vanishing. A null `activeBranchId` means no branch is
 * selected, which shows everything.
 */
export function inBranch(recordBranchId: string | null, activeBranchId?: string | null): boolean {
  if (!activeBranchId) return true;
  if (recordBranchId === null) return true;
  return recordBranchId === activeBranchId;
}
