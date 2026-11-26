import { HYBRID_TENANT } from '@/config/env';
import { activateTenant, captureSlice, patchSlice } from '@/services/mock/db';
import { setCurrentMockUser } from '@/services/mock/sessionRef';
import { HttpError } from '@/services/http';
import { refreshSession } from '@/services/apiClient';
import { tokenStore } from '@/services/tokenStore';
import { startServerStore, stopServerStore } from '@/services/hybrid/serverStore';
import type { AuthSession } from '../types/auth.types';
import { apiAuthService } from './apiAuthService';

/**
 * Sign-in for hybrid mode: the server signs the person in (email + one-time code), then the browser database of the
 * same business is loaded for the modules not yet on the server. User, role and branch ids match the server seed, so
 * permissions and branches line up.
 */
function attach(session: AuthSession): AuthSession {
  activateTenant(HYBRID_TENANT);
  /* The server's user id is not always the same number as in the browser's user list (the server may have had other
     accounts first). Match by email, so the person signed in is the person shown as "Sold by". */
  const access = captureSlice('access') as { users?: { id: string; email?: string }[] } | undefined;
  const email = (session.email ?? '').trim().toLowerCase();
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
  /* Every module not yet in its own server tables is loaded from (and saved to) the server store. */
  void startServerStore();
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
    return session ? attach(session) : null;
  },

  async requestOtp(identifier, purpose, password) {
    const result = await apiAuthService.requestOtp(identifier, purpose, password);
    return isSession(result) ? attach(result) : result;
  },

  async verifyOtp(pending, code) {
    return attach(await apiAuthService.verifyOtp(pending, code));
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
