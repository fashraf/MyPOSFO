import { HYBRID_TENANT } from '@/config/env';
import { activateTenant, captureSlice, patchSlice } from '@/services/mock/db';
import { setCurrentMockUser } from '@/services/mock/sessionRef';
import { HttpError } from '@/services/http';
import { api, refreshSession } from '@/services/apiClient';
import { tokenStore } from '@/services/tokenStore';
import { startServerStore, stopServerStore } from '@/services/hybrid/serverStore';
import type { AuthSession } from '../types/auth.types';
import { apiAuthService } from './apiAuthService';

/**
 * Sign-in for hybrid mode: the server signs the person in (email + one-time code), then the browser database of the
 * same business is loaded for the modules not yet on the server. User, role and branch ids match the server seed, so
 * permissions and branches line up.
 */
interface Business {
  nameAr: string; nameEn: string; crNumber: string; vatNumber: string; city: string;
  branches: { id: string; code: string | null; nameAr: string | null; nameEn: string | null; city: string | null }[];
  users: { id: string; username: string | null; nameAr: string | null; nameEn: string | null; email: string | null; phone: string | null; roleId: string | null; status: string | null }[];
}

type AnyRow = Record<string, unknown> & { id: string };

/**
 * This browser holds another business's starter data (a new SaaS client, or a fresh device before anything was
 * shared): rebuild the people, branches and business name from this business's own server records.
 */
async function adoptServerBusiness(email: string): Promise<void> {
  const access = captureSlice('access') as { users?: AnyRow[]; branches?: AnyRow[] } | undefined;
  if (access?.users?.some((u) => String(u.email ?? '').trim().toLowerCase() === email)) return;
  const business = await api.get<Business>('/api/business');
  patchSlice<{ users: AnyRow[]; branches: AnyRow[] }>('access', (current) => {
    const userTemplate = current.users?.[0] ?? ({} as AnyRow);
    const branchTemplate = current.branches?.[0] ?? ({} as AnyRow);
    const branchIds = business.branches.map((b) => b.id);
    return {
      ...current,
      branches: business.branches.map((b) => ({
        ...branchTemplate, id: b.id, code: b.code ?? `BR-${b.id}`, nameAr: b.nameAr ?? business.nameAr, nameEn: b.nameEn ?? business.nameEn, city: b.city ?? business.city,
      })),
      users: business.users.map((u) => {
        const [firstName, ...rest] = (u.nameEn ?? u.nameAr ?? '').split(' ');
        return {
          ...userTemplate, id: u.id, username: u.username ?? u.email ?? u.id, nameAr: u.nameAr ?? u.nameEn ?? '', nameEn: u.nameEn ?? u.nameAr ?? '',
          firstName: firstName ?? '', lastName: rest.join(' '), email: u.email ?? '', mobile: u.phone ?? '', roleId: u.roleId ?? 'rol_owner',
          status: u.status === 'active' || !u.status ? 'active' : u.status, branchIds, defaultBranchId: branchIds[0] ?? null,
          documents: [], nationality: undefined, lastActiveAt: null,
        };
      }),
    };
  });
  patchSlice<{ profile: Record<string, unknown> }>('company', (current) => ({
    ...current,
    profile: { ...current.profile, nameAr: business.nameAr, nameEn: business.nameEn, crNumber: business.crNumber, vatNumber: business.vatNumber },
  }));
}

async function attach(session: AuthSession): Promise<AuthSession> {
  activateTenant(HYBRID_TENANT);
  /* Every module not yet in its own server tables is loaded from (and saved to) the server store. */
  await startServerStore();
  const email = (session.email ?? '').trim().toLowerCase();
  if (email) await adoptServerBusiness(email).catch(() => undefined);
  /* The server's user id is not always the same number as in the browser's user list (the server may have had other
     accounts first). Match by email, so the person signed in is the person shown as "Sold by". */
  const access = captureSlice('access') as { users?: { id: string; email?: string }[] } | undefined;
  const local = email ? access?.users?.find((u) => (u.email ?? '').trim().toLowerCase() === email) : undefined;
  const id = local?.id ?? session.userId;
  setCurrentMockUser(id);
  /* "Last active" on the Users page: the real time this person signed in (saved to the server with the users list). */
  if (access?.users?.some((u) => u.id === id)) {
    const now = new Date().toISOString();
    patchSlice<{ users: { id: string; lastActiveAt?: string | null }[] }>('access', (current) => ({
      ...current,
      users: current.users.map((u) => (u.id === id ? { ...u, lastActiveAt: now } : u)),
    }));
  }
  return { ...session, tenantId: HYBRID_TENANT };
}

const isSession = (value: unknown): value is AuthSession =>
  typeof value === 'object' && value !== null && 'userId' in value && 'landingPath' in value;

export const hybridAuthService: typeof apiAuthService = {
  ...apiAuthService,

  async restore() {
    /* After a page load the access token is gone (memory only) but the refresh token remains: renew first, so the
       first call is not a 401 in the console on every reload. */
    if (!tokenStore.getAccessToken() && tokenStore.getRefreshToken()) await refreshSession();
    const session = await apiAuthService.restore();
    return session ? await attach(session) : null;
  },

  async requestOtp(identifier, purpose, password) {
    const result = await apiAuthService.requestOtp(identifier, purpose, password);
    return isSession(result) ? await attach(result) : result;
  },

  async verifyOtp(pending, code) {
    return await attach(await apiAuthService.verifyOtp(pending, code));
  },

  async signInWithPin() {
    throw new HttpError({
      status: 501,
      code: 'pin_not_on_server_yet',
      message: 'PIN sign-in is not on the server yet. Sign in with your work email.',
    });
  },

  async signOut() {
    await apiAuthService.signOut();
    stopServerStore();
    setCurrentMockUser(null);
  },
};
