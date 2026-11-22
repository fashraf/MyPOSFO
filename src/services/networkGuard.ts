import { DATA_SOURCE } from '@/config/env';
import { HttpError } from './http';

/**
 * The mock-mode firewall.
 *
 * Both HTTP clients (`apiClient.ts` and `http.ts`) call this before `fetch`.
 * In mock mode it refuses, so a service method that forgot its mock branch
 * fails fast and loudly in development rather than quietly hammering a backend
 * that is not there. Nothing reaches the network.
 *
 * Each refused path is logged once, which makes the gap easy to find without
 * flooding the console when a screen retries.
 */

const reported = new Set<string>();

export function assertNetworkAllowed(method: string, path: string): void {
  if (DATA_SOURCE !== 'mock') return;

  const key = `${method} ${path.split('?')[0]}`;
  if (!reported.has(key)) {
    reported.add(key);
    // eslint-disable-next-line no-console
    console.warn(
      `[mock-mode] Blocked ${key}. This call has no mock implementation yet; ` +
        'add one to the matching service rather than calling the API module directly.',
    );
  }

  throw new HttpError({
    status: 503,
    code: 'mock_mode_offline',
    message: 'This action is not available in the offline demo.',
  });
}
