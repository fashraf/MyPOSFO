/**
 * Runtime configuration.
 *
 * Vite inlines these at build time, so anything here ends up readable in the
 * shipped bundle. Nothing secret belongs in this file — the API is what holds
 * the signing key and talks to the database.
 *
 * Every value has a fallback, so a fresh `git clone && npm install && npm run
 * dev` works with no `.env` file at all: the app starts in mock mode.
 */

export type DataSourceKind = 'mock' | 'hybrid' | 'api';

function readDataSource(): DataSourceKind {
  const explicit = (import.meta.env.VITE_DATA_SOURCE ?? '').trim().toLowerCase();
  if (explicit === 'api' || explicit === 'mock' || explicit === 'hybrid') return explicit;

  /* Legacy flag, still honoured so older .env files keep working. */
  const legacy = (import.meta.env.VITE_USE_MOCKS ?? '').trim().toLowerCase();
  if (legacy === 'false') return 'api';

  return 'mock';
}

/**
 * Where every service reads and writes.
 *
 *   mock — the in-browser tenant databases (localStorage). No HTTP request is
 *          ever made; the API clients refuse before reaching `fetch`.
 *   api  — POSAPI over HTTP.
 */
export const DATA_SOURCE: DataSourceKind = readDataSource();

/** Shorthand used throughout the services: true when the in-browser database is in use (mock and hybrid). */
export const USE_MOCKS: boolean = DATA_SOURCE !== 'api';

/**
 * Hybrid: sign-in, catalog, restaurant sessions, sales and audit go through the server (one shared database for every
 * device); the modules not yet on the server keep working from the browser database of HYBRID_TENANT.
 */
export const SERVER_CORE: boolean = DATA_SOURCE === 'hybrid';

/** The business whose browser database backs the not-yet-ported modules in hybrid mode. Same ids as the server seed. */
export const HYBRID_TENANT: string = (import.meta.env.VITE_TENANT_ID ?? 'ten_alnoor').trim() || 'ten_alnoor';

/**
 * Where the API lives (api mode only).
 *
 * Empty means same origin: in development the Vite proxy forwards /api to the
 * backend, and in production the reverse proxy does.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '';

/** Shows the persona drawer, the demo session bar and the reset control. */
export const DEMO_TOOLS: boolean =
  USE_MOCKS && (import.meta.env.VITE_DEMO_TOOLS ?? 'true').toLowerCase() !== 'false';

/**
 * Sample activity: three weeks of generated sales, six months of finance history, kitchen tickets, expenses,
 * payroll runs, notifications and an invented audit trail. On for local demos; off on server builds, which start
 * with the catalog, combos, branches, users and settings only — every order, invoice and number is new.
 */
export const SAMPLE_ACTIVITY: boolean = DEMO_TOOLS;

export const APP_ENV: string = import.meta.env.MODE;

export const IS_PRODUCTION: boolean = import.meta.env.PROD;

/** The path the app is served under. `/` locally, `/<repo>/` on GitHub Pages. */
export const BASE_PATH: string = import.meta.env.BASE_URL ?? '/';
