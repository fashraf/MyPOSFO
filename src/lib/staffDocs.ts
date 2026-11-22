import type { StaffDocument, StaffDocumentKind, User } from '@/types/permissions';

/**
 * Staff documents: what each person must hold, and how close it is to expiring.
 *
 * Everything here is derived, never stored: a document's status is worked out
 * from its expiry date and today, so an alert can never go stale.
 */

export interface Nationality {
  code: string;
  en: string;
  ar: string;
}

/* Saudi first, then the nationalities most common in KSA retail and food
   service. Anything else falls under "Other". */
export const NATIONALITIES: Nationality[] = [
  { code: 'SA', en: 'Saudi', ar: 'سعودي' },
  { code: 'EG', en: 'Egyptian', ar: 'مصري' },
  { code: 'IN', en: 'Indian', ar: 'هندي' },
  { code: 'PK', en: 'Pakistani', ar: 'باكستاني' },
  { code: 'BD', en: 'Bangladeshi', ar: 'بنغلاديشي' },
  { code: 'PH', en: 'Filipino', ar: 'فلبيني' },
  { code: 'YE', en: 'Yemeni', ar: 'يمني' },
  { code: 'SD', en: 'Sudanese', ar: 'سوداني' },
  { code: 'JO', en: 'Jordanian', ar: 'أردني' },
  { code: 'SY', en: 'Syrian', ar: 'سوري' },
  { code: 'LB', en: 'Lebanese', ar: 'لبناني' },
  { code: 'PS', en: 'Palestinian', ar: 'فلسطيني' },
  { code: 'NP', en: 'Nepali', ar: 'نيبالي' },
  { code: 'LK', en: 'Sri Lankan', ar: 'سريلانكي' },
  { code: 'ID', en: 'Indonesian', ar: 'إندونيسي' },
  { code: 'ET', en: 'Ethiopian', ar: 'إثيوبي' },
  { code: 'KE', en: 'Kenyan', ar: 'كيني' },
  { code: 'MA', en: 'Moroccan', ar: 'مغربي' },
  { code: 'TN', en: 'Tunisian', ar: 'تونسي' },
  { code: 'TR', en: 'Turkish', ar: 'تركي' },
  { code: 'AF', en: 'Afghan', ar: 'أفغاني' },
  { code: 'GB', en: 'British', ar: 'بريطاني' },
  { code: 'US', en: 'American', ar: 'أمريكي' },
  { code: 'XX', en: 'Other', ar: 'أخرى' },
];

/** 🇸🇦 from 'SA'. Built from regional-indicator letters, so no image assets. */
export function flagOf(code: string | undefined): string {
  if (!code || code.length !== 2 || code === 'XX') return '🌐';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function nationalityName(code: string | undefined, language: string): string {
  const found = NATIONALITIES.find((n) => n.code === code);
  if (!found) return '—';
  return language === 'ar' ? found.ar : found.en;
}

export const isSaudi = (user: Pick<User, 'nationality'>) => user.nationality === 'SA';

/** Food-handling roles need a municipality health card (شهادة صحية). */
const FOOD_ROLES = new Set(['rol_kitchen']);

/** The documents this person should have on file. */
export function requiredDocuments(user: Pick<User, 'nationality' | 'roleId'>): StaffDocumentKind[] {
  if (!user.nationality) return [];
  const base: StaffDocumentKind[] = user.nationality === 'SA' ? ['national_id'] : ['iqama', 'passport'];
  return FOOD_ROLES.has(user.roleId) ? [...base, 'health_card'] : base;
}

/** Document kinds offered in the form, in the order they are usually asked for. */
export function documentKindsFor(nationality: string | undefined): StaffDocumentKind[] {
  return nationality === 'SA'
    ? ['national_id', 'health_card']
    : ['iqama', 'passport', 'health_card', 'work_permit'];
}

export type DocumentStatus = 'missing' | 'expired' | 'critical' | 'soon' | 'valid' | 'no_expiry';

/* Muqeem lets an Iqama be renewed in its last 30 days or so; flag at 60 so
   there is time to collect the fees and the passport. */
export const CRITICAL_DAYS = 30;
export const SOON_DAYS = 60;

export function daysUntil(isoDate: string, now: Date = new Date()): number {
  const target = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function statusOf(doc: StaffDocument | undefined, now: Date = new Date()): DocumentStatus {
  if (!doc || !doc.number.trim()) return 'missing';
  if (!doc.expiresAt) return 'no_expiry';
  const days = daysUntil(doc.expiresAt, now);
  if (days < 0) return 'expired';
  if (days <= CRITICAL_DAYS) return 'critical';
  if (days <= SOON_DAYS) return 'soon';
  return 'valid';
}

export const STATUS_RANK: Record<DocumentStatus, number> = {
  expired: 0, missing: 1, critical: 2, soon: 3, no_expiry: 4, valid: 5,
};

export interface DocumentAlert {
  userId: string;
  kind: StaffDocumentKind;
  status: Exclude<DocumentStatus, 'valid' | 'no_expiry'>;
  /** Negative when already expired. Null when the document is missing. */
  days: number | null;
}

/** Everything that needs someone's attention for one person, worst first. */
export function alertsFor(user: User, now: Date = new Date()): DocumentAlert[] {
  if (user.status === 'suspended') return [];
  const docs = user.documents ?? [];
  const kinds = new Set<StaffDocumentKind>([...requiredDocuments(user), ...docs.map((d) => d.kind)]);
  const alerts: DocumentAlert[] = [];
  for (const kind of kinds) {
    const doc = docs.find((d) => d.kind === kind);
    const status = statusOf(doc, now);
    if (status === 'valid' || status === 'no_expiry') continue;
    if (status === 'missing' && !requiredDocuments(user).includes(kind)) continue;
    alerts.push({ userId: user.id, kind, status, days: doc?.expiresAt ? daysUntil(doc.expiresAt, now) : null });
  }
  return alerts.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || (a.days ?? -999) - (b.days ?? -999));
}

export function worstStatus(user: User, now: Date = new Date()): DocumentStatus | null {
  if (!user.nationality) return null;
  const alerts = alertsFor(user, now);
  return alerts[0]?.status ?? 'valid';
}

/** "•••••• 4821": enough to recognise, not enough to copy. */
export function maskNumber(value: string): string {
  const clean = value.replace(/\s+/g, '');
  if (clean.length <= 4) return clean;
  return `${'•'.repeat(Math.min(6, clean.length - 4))} ${clean.slice(-4)}`;
}

/**
 * Format checks only — the issuing authority is the real validator.
 * National ID starts with 1, Iqama with 2, both 10 digits.
 */
export function validateNumber(kind: StaffDocumentKind, value: string): 'ok' | 'length' | 'prefixId' | 'prefixIqama' | 'empty' {
  const v = toLatinDigits(value).replace(/\s+/g, '');
  if (!v) return 'empty';
  if (kind === 'national_id' || kind === 'iqama') {
    if (!/^\d{10}$/.test(v)) return 'length';
    if (kind === 'national_id' && v[0] !== '1') return 'prefixId';
    if (kind === 'iqama' && v[0] !== '2') return 'prefixIqama';
  }
  return 'ok';
}

/** ٠١٢ → 012, so numbers typed on an Arabic keyboard still validate. */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** The same date in the Umm al-Qura calendar, as printed on Saudi documents. */
export function hijriOf(isoDate: string, language: string): string {
  try {
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA-u-ca-islamic-umalqura' : 'en-u-ca-islamic-umalqura', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(`${isoDate.slice(0, 10)}T12:00:00`));
  } catch {
    return '';
  }
}

/* ---- Passwords ---------------------------------------------------------- */

export interface PasswordCheck {
  length: boolean;
  letters: boolean;
  numbers: boolean;
  mixed: boolean;
  score: 0 | 1 | 2 | 3 | 4;
}

export function checkPassword(value: string): PasswordCheck {
  const length = value.length >= 8;
  const letters = /[A-Za-z؀-ۿ]/.test(value);
  const numbers = /\d/.test(value);
  const mixed = /[A-Z]/.test(value) && /[a-z]/.test(value) || /[^A-Za-z0-9]/.test(value);
  const score = (!value ? 0 : [length, letters && numbers, mixed, value.length >= 12].filter(Boolean).length) as PasswordCheck['score'];
  return { length, letters, numbers, mixed, score };
}

/* No look-alike characters (0/O, 1/l/I), so it can be read out loud or
   written on a note for the first sign-in. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function generatePassword(): string {
  const random = new Uint32Array(10);
  crypto.getRandomValues(random);
  const chars = [...random].map((n) => ALPHABET[n % ALPHABET.length]);
  /* Guarantee each class so it always passes the rules it is meant to model. */
  chars[2] = String(2 + (random[0] % 8));
  chars[5] = 'ABCDEFGHJKLMNPQRSTUVWXYZ'[random[1] % 24];
  chars[7] = 'abcdefghijkmnpqrstuvwxyz'[random[2] % 24];
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
}
