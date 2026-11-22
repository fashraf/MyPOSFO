import type {
  AuthSession,
  IdentifierKind,
  OtpPurpose,
  PendingVerification,
  RegistrationDraft,
} from '../types/auth.types';
import { HttpError } from '@/services/http';
import { delay } from '@/services/mock/store';
import { activateTenant } from '@/services/mock/db';
import { setCurrentMockUser } from '@/services/mock/sessionRef';
import {
  DEMO_ACCOUNTS,
  accountByEmail,
  accountByPin,
  accountByUserId,
  type DemoAccount,
} from '@/services/mock/tenants';

/**
 * Mock authentication against the demo directory (services/mock/tenants.ts).
 *
 * Sign-in is single-step, email + password, matching POSAPI's default
 * `Auth:LoginMode = SinglePassword`. Terminals can also sign in with a 4-digit
 * PIN, which is how a cashier or barista starts a shift on a shared Sunmi
 * device. Signing in loads that account's tenant database — so switching
 * persona between tenants swaps the whole dataset, just as it would against
 * database-per-tenant SQL Server.
 *
 * The OTP path is kept for the registration flow and for anyone who signs in
 * with a mobile number instead of a password.
 */

/** Development code. The real service sends this by SMS or email. */
export const DEV_OTP = '1234';

const SESSION_KEY = 'auth.session';

/** Normalise so "+966 50 123 4567", "0501234567" and "501234567" all match. */
export function normaliseMobile(value: string): string {
  const digits = value.replace(/[\s\-()]/g, '');
  if (digits.startsWith('00966')) return `+${digits.slice(2)}`;
  if (digits.startsWith('+966')) return digits;
  if (digits.startsWith('966')) return `+${digits}`;
  if (digits.startsWith('05')) return `+966${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) return `+966${digits}`;
  return digits;
}

export function detectIdentifier(value: string): IdentifierKind | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes('@')) return 'email';
  if (/\d/.test(trimmed)) return 'mobile';
  return null;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** Saudi mobile: +9665XXXXXXXX once normalised. */
export function isValidSaudiMobile(value: string): boolean {
  return /^\+9665\d{8}$/.test(normaliseMobile(value));
}

/** Enough to recognise, not enough to leak. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(2, name.length - 1))}@${domain}`;
}

export function maskMobile(mobile: string): string {
  const normalised = normaliseMobile(mobile);
  return `${normalised.slice(0, 4)} •• ••• •${normalised.slice(-2)}`;
}

function readSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    /* A session from an older build, or for an account that no longer exists,
       is discarded rather than half-restored. */
    if (!session?.userId || !accountByUserId(session.userId)) return null;
    return session;
  } catch {
    return null;
  }
}

function writeSession(session: AuthSession | null): void {
  try {
    if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* Storage blocked — the session still holds for this tab. */
  }
}

/** Load the account's tenant database and mark them as the current user. */
function establish(account: DemoAccount, method: AuthSession['method']): AuthSession {
  activateTenant(account.tenantId);
  setCurrentMockUser(account.userId);

  const session: AuthSession = {
    userId: account.userId,
    email: account.email,
    mobile: '',
    displayName: account.displayName,
    roleId: account.roleId,
    landingPath: account.landingPath,
    issuedAt: new Date().toISOString(),
    tenantId: account.tenantId,
    method,
  };

  writeSession(session);
  return session;
}

function findByIdentifier(identifier: string): DemoAccount | undefined {
  return accountByEmail(identifier);
}

const invalidCredentials = () =>
  new HttpError({
    status: 401,
    code: 'invalid_credentials',
    message: 'That email and password do not match a demo account.',
    fieldErrors: { password: ['That email and password do not match a demo account.'] },
  });

/* Registration is parked here until the code is verified. */
let pendingRegistration: RegistrationDraft | null = null;

export const mockAuthService = {
  /** Rehydrate an existing session on page load, and its tenant with it. */
  async restore(): Promise<AuthSession | null> {
    await delay(60);
    const session = readSession();
    if (!session) return null;

    const account = accountByUserId(session.userId);
    if (!account) return null;

    activateTenant(account.tenantId);
    setCurrentMockUser(account.userId);
    return { ...session, tenantId: account.tenantId };
  },

  /**
   * Step one. With a password this signs in outright (single-step mode, the
   * POSAPI default) and returns a session. Without one it starts an OTP
   * verification, for the mobile-number route.
   */
  async requestOtp(
    identifier: string,
    purpose: OtpPurpose,
    password?: string,
  ): Promise<AuthSession | PendingVerification> {
    await delay(320);

    const kind = detectIdentifier(identifier);
    if (!kind) {
      throw new HttpError({
        status: 422,
        code: 'invalid_identifier',
        message: 'Enter an email address or a mobile number.',
        fieldErrors: { identifier: ['Enter an email address or a mobile number.'] },
      });
    }

    if (kind === 'email' && !isValidEmail(identifier)) {
      throw new HttpError({
        status: 422,
        code: 'invalid_email',
        message: 'Please enter a valid email address.',
        fieldErrors: { identifier: ['Please enter a valid email address.'] },
      });
    }

    if (purpose === 'login' && password) {
      const account = findByIdentifier(identifier);
      if (!account || account.password !== password) throw invalidCredentials();
      return establish(account, 'password');
    }

    if (kind === 'mobile' && !isValidSaudiMobile(identifier)) {
      throw new HttpError({
        status: 422,
        code: 'invalid_mobile',
        message: 'Please enter a valid Saudi mobile number, for example +966 50 123 4567.',
        fieldErrors: { identifier: ['Please enter a valid Saudi mobile number.'] },
      });
    }

    if (purpose === 'login' && !findByIdentifier(identifier)) {
      throw new HttpError({
        status: 404,
        code: 'account_not_found',
        message: 'No account uses that email.',
        fieldErrors: { identifier: ['No account uses that email.'] },
      });
    }

    return {
      purpose,
      destination: identifier.trim(),
      kind,
      maskedDestination: kind === 'email' ? maskEmail(identifier.trim()) : maskMobile(identifier),
      attemptsRemaining: 5,
    };
  },

  /** Terminal sign-in with a 4-digit staff PIN. */
  async signInWithPin(pin: string): Promise<AuthSession> {
    await delay(260);
    const account = accountByPin(pin);
    if (!account) {
      throw new HttpError({ status: 401, code: 'invalid_pin', message: 'That PIN is not recognised.' });
    }
    return establish(account, 'pin');
  },

  /**
   * Switch to another predefined persona without a password.
   *
   * Demo tooling only: it exists so a tester can walk the same flow as
   * owner, cashier and barista in a minute. There is no equivalent against the
   * real API, and the switcher is hidden outside mock mode.
   */
  async switchTo(userId: string): Promise<AuthSession> {
    await delay(180);
    const account = accountByUserId(userId);
    if (!account) {
      throw new HttpError({ status: 404, code: 'account_not_found', message: 'Unknown demo account.' });
    }
    return establish(account, 'switch');
  },

  async resendOtp(pending: PendingVerification): Promise<PendingVerification> {
    await delay(360);
    return { ...pending, attemptsRemaining: 5 };
  },

  /** Verify a code. For a login this returns and stores the session. */
  async verifyOtp(pending: PendingVerification, code: string): Promise<AuthSession> {
    await delay(500);

    if (code !== DEV_OTP) {
      throw new HttpError({
        status: 401,
        code: 'invalid_otp',
        message: 'Invalid verification code. Please try again.',
      });
    }

    if (pending.purpose === 'register') {
      if (!pendingRegistration) {
        throw new HttpError({
          status: 409,
          code: 'no_pending_registration',
          message: 'That registration has expired. Please start again.',
        });
      }

      const draft = pendingRegistration;
      pendingRegistration = null;

      /* A newly registered owner is deliberately not signed in here — they go
         through a first login, which is both what the spec asks for and what a
         real system would do. No session is written. */
      return {
        userId: 'usr_new',
        email: draft.owner.email,
        mobile: normaliseMobile(draft.owner.mobile),
        displayName: `${draft.owner.firstName} ${draft.owner.lastName}`.trim(),
        roleId: 'rol_owner',
        landingPath: '/dashboard',
        issuedAt: new Date().toISOString(),
      };
    }

    const account = findByIdentifier(pending.destination);
    if (!account) {
      throw new HttpError({
        status: 404,
        code: 'account_not_found',
        message: 'No account uses that email or mobile number.',
      });
    }

    return establish(account, 'otp');
  },

  /** Submit a registration. Parks it until the code is verified. */
  async register(draft: RegistrationDraft): Promise<PendingVerification> {
    await delay(700);

    if (findByIdentifier(draft.owner.email)) {
      throw new HttpError({
        status: 409,
        code: 'email_taken',
        message: 'An account already uses that email address. Try signing in instead.',
        fieldErrors: { email: ['An account already uses that email address.'] },
      });
    }

    pendingRegistration = draft;

    return {
      purpose: 'register',
      destination: draft.owner.mobile,
      kind: 'mobile',
      maskedDestination: maskMobile(draft.owner.mobile),
      attemptsRemaining: 5,
    };
  },

  async signOut(): Promise<void> {
    await delay(120);
    setCurrentMockUser(null);
    writeSession(null);
  },
};

export { DEMO_ACCOUNTS };
