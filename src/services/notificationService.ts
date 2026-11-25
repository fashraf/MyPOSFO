import { SAMPLE_ACTIVITY } from '@/config/env';
import { USE_MOCKS } from '@/config/env';
import { notificationApi } from './api';
import type { AppNotification } from '@/types/notifications';
import { delay, timestamp, clone } from './mock/store';
import { registerSlice } from './mock/db';
import { userService } from './userService';
import { alertsFor } from '@/lib/staffDocs';

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60 * 1000).toISOString();

/**
 * Notifications.
 *
 * Every entry points at a place in the app that can actually resolve it —
 * a notification you cannot act on is just noise, so `href` is close to
 * mandatory in practice.
 */
/* Ids of document alerts already read. The alerts themselves are derived
   from the staff records each time, so they can never go stale; only "has
   someone seen this one" is stored. The id carries the status, so a document
   that moves from "60 days" to "expired" alerts again. */
let readDocumentAlerts: string[] = [];

let notifications: AppNotification[] = [
  {
    id: 'ntf_001',
    kind: 'low_stock',
    severity: 'warning',
    titleKey: 'notifications.items.lowStock',
    values: { count: '3' },
    href: '/inventory',
    read: false,
    occurredAt: minutesAgo(12),
    createdAt: minutesAgo(12),
    updatedAt: minutesAgo(12),
  },
  {
    id: 'ntf_002',
    kind: 'kitchen_delay',
    severity: 'danger',
    titleKey: 'notifications.items.kitchenDelay',
    values: { order: 'INV-1044' },
    href: '/kitchen',
    read: false,
    occurredAt: minutesAgo(4),
    createdAt: minutesAgo(4),
    updatedAt: minutesAgo(4),
  },
  {
    id: 'ntf_003',
    kind: 'credit_limit',
    severity: 'warning',
    titleKey: 'notifications.items.creditLimit',
    values: { customer: 'Al Nukhba Est.' },
    href: '/customers',
    read: false,
    occurredAt: minutesAgo(48),
    createdAt: minutesAgo(48),
    updatedAt: minutesAgo(48),
  },
  {
    id: 'ntf_004',
    kind: 'system',
    severity: 'info',
    titleKey: 'notifications.items.billSaved',
    values: {},
    href: '/bill-builder',
    read: true,
    occurredAt: minutesAgo(180),
    createdAt: minutesAgo(180),
    updatedAt: minutesAgo(180),
  },
];
/* Tenant state, owned by the mock database (see mock/db.ts). The values above
   are this module's factory defaults; each tenant starts from a copy. */
const INITIAL_NOTIFICATIONS = clone({ notifications });

registerSlice('notifications', {
  capture: () => ({ notifications, readDocumentAlerts }),
  restore: (s: typeof INITIAL_NOTIFICATIONS) => {
    if (!s || typeof s !== 'object') throw new Error('notifications snapshot is malformed');
    notifications = s.notifications ?? INITIAL_NOTIFICATIONS.notifications;
    readDocumentAlerts = (s as { readDocumentAlerts?: string[] }).readDocumentAlerts ?? [];
  },
  seed: (tenantId) => {
    void tenantId;
    const initial = clone(INITIAL_NOTIFICATIONS);
    notifications = SAMPLE_ACTIVITY ? initial.notifications : [];
    readDocumentAlerts = [];
  },
});


export const notificationService = {
  async list(): Promise<AppNotification[]> {
    if (!USE_MOCKS) {
      const rows = await notificationApi.list(false);
      return rows.map((row) => ({
        id: String(row.notificationId ?? row.NotificationId ?? ''),
        kind: String(row.kind ?? row.Kind ?? 'info'),
        titleAr: String(row.titleAr ?? row.TitleAr ?? ''),
        titleEn: String(row.titleEn ?? row.TitleEn ?? ''),
        bodyAr: String(row.bodyAr ?? row.BodyAr ?? ''),
        bodyEn: String(row.bodyEn ?? row.BodyEn ?? ''),
        /* Unread is the absence of a read timestamp, not a separate flag —
           two fields recording one fact drift apart. */
        isRead: Boolean(row.readAtUtc ?? row.ReadAtUtc),
        createdAt: String(row.createdAtUtc ?? row.CreatedAtUtc ?? ''),
      })) as never;
    }

    await delay(140);
    const documents = await documentNotifications();
    return [...documents, ...notifications].sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  },

  async markRead(id: string): Promise<void> {
    if (!USE_MOCKS) {
      await notificationApi.markRead(id);
      return;
    }

    await delay(80);
    if (id.startsWith('doc:')) readDocumentAlerts = [...new Set([...readDocumentAlerts, id])];
    notifications = notifications.map((entry) =>
      entry.id === id ? { ...entry, read: true, updatedAt: timestamp() } : entry,
    );
  },

  async markAllRead(): Promise<void> {
    if (!USE_MOCKS) {
      await notificationApi.markAllRead();
      return;
    }

    await delay(160);
    readDocumentAlerts = [...new Set([...readDocumentAlerts, ...(await documentNotifications()).map((n) => n.id)])];
    const now = timestamp();
    notifications = notifications.map((entry) =>
      entry.read ? entry : { ...entry, read: true, updatedAt: now },
    );
  },
};

/** Staff documents that are expired, missing or close to expiry, as notifications. */
async function documentNotifications(): Promise<AppNotification[]> {
  const users = await userService.list();
  const now = timestamp();
  return users.flatMap((user) =>
    alertsFor(user)
      .filter((alert) => alert.status !== 'soon')
      .map((alert) => {
        const id = `doc:${user.id}:${alert.kind}:${alert.status}`;
        return {
          id,
          kind: 'documents' as const,
          severity: 'danger' as const,
          titleKey: `notifications.items.document.${alert.status}`,
          values: {
            name: user.nameEn,
            nameAr: user.nameAr,
            doc: alert.kind,
            days: String(Math.abs(alert.days ?? 0)),
          },
          href: `/users/${user.id}/edit`,
          read: readDocumentAlerts.includes(id),
          occurredAt: now,
          createdAt: now,
          updatedAt: now,
        };
      }),
  );
}
