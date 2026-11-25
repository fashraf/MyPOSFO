import { SERVER_CORE, USE_MOCKS } from '@/config/env';
import { hybridAuthService } from './hybridAuthService';
import { mockAuthService } from './mockAuthService';
import { apiAuthService } from './apiAuthService';

/**
 * The single auth entry point.
 *
 * Everything above imports from here and never from either implementation, so
 * whether the app is running against mocks or the API is one flag rather than a
 * change spread across the codebase.
 */
export const authService = SERVER_CORE ? hybridAuthService : USE_MOCKS ? mockAuthService : apiAuthService;

export { DEV_OTP } from './mockAuthService';
export { DEMO_ACCOUNTS, DEMO_PASSWORD, DEMO_TENANTS } from '@/services/mock/tenants';
