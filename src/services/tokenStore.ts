/**
 * Where the session lives.
 *
 * The access token is held in memory only. localStorage is readable by any
 * script on the page, so a single XSS flaw would hand an attacker a working
 * session; keeping it in a module variable means it dies with the tab.
 *
 * The refresh token is the awkward one. Ideally it is an httpOnly cookie the
 * browser handles and JavaScript cannot read. Until the API sets that cookie,
 * it sits in sessionStorage — narrower than localStorage because it clears when
 * the tab closes, and it survives a refresh so people are not signed out on F5.
 */

const REFRESH_KEY = 'nazad.refresh';

let accessToken: string | null = null;
let expiresAt: number | null = null;
const REMEMBER_KEY = 'nazad.remember';

/** "Remember me": the refresh token survives closing the tab/app (localStorage) instead of ending with it. */
function remembered(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== '0';
  } catch {
    return false;
  }
}

function store(): Storage {
  return remembered() ? localStorage : sessionStorage;
}

export const tokenStore = {
  getAccessToken(): string | null {
    if (!accessToken || !expiresAt) return null;

    /* Treat a token that expires within thirty seconds as already expired, so a
       request does not set off mid-flight. */
    if (Date.now() > expiresAt - 30_000) return null;

    return accessToken;
  },

  setSession(token: string, expiresAtUtc: string, refreshToken: string): void {
    accessToken = token;
    expiresAt = new Date(expiresAtUtc).getTime();

    try {
      const target = store();
      (target === localStorage ? sessionStorage : localStorage).removeItem(REFRESH_KEY);
      target.setItem(REFRESH_KEY, refreshToken);
    } catch {
      /* Private browsing can refuse storage. The session still works for this
         tab; the person just signs in again after a refresh. */
    }
  },

  /** Chosen on the sign-in screen; on by default. */
  get rememberMe(): boolean {
    return remembered();
  },

  setRememberMe(value: boolean): void {
    try {
      localStorage.setItem(REMEMBER_KEY, value ? '1' : '0');
    } catch {
      /* Storage blocked: the session simply ends with the tab. */
    }
  },

  getRefreshToken(): string | null {
    try {
      return localStorage.getItem(REFRESH_KEY) ?? sessionStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },

  clear(): void {
    accessToken = null;
    expiresAt = null;

    try {
      sessionStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(REFRESH_KEY);
    } catch {
      /* Nothing to do. */
    }
  },

  get hasSession(): boolean {
    return accessToken !== null || tokenStore.getRefreshToken() !== null;
  },
};
