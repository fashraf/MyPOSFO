import { HYBRID_TENANT } from '@/config/env';
import { activateTenant } from '@/services/mock/db';
import { setCurrentMockUser } from '@/services/mock/sessionRef';
import { HttpError } from '@/services/http';
import type { AuthSession } from '../types/auth.types';
import { apiAuthService } from './apiAuthService';

/**
 * Sign-in for hybrid mode: the server signs the person in (email + one-time code), then the browser database of the
 * same business is loaded for the modules not yet on the server. User, role and branch ids match the server seed, so
 * permissions and branches line up.
 */
function attach(session: AuthSession): AuthSession {
  activateTenant(HYBRID_TENANT);
  setCurrentMockUser(session.userId);
  return { ...session, tenantId: HYBRID_TENANT };
}

const isSession = (value: unknown): value is AuthSession =>
  typeof value === 'object' && value !== null && 'userId' in value && 'landingPath' in value;

export const hybridAuthService: typeof apiAuthService = {
  ...apiAuthService,

  async restore() {
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
    setCurrentMockUser(null);
  },
};
