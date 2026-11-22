/**
 * Who is signed in, for the mock services.
 *
 * The real API knows the caller from the bearer token. The mock services have
 * no token, so the mock auth service records the user here on sign-in and on
 * session restore, and `userService.current()` reads it. Without this every
 * persona would load as the first user in the table — which is exactly the bug
 * that made a cashier see the owner's menu.
 */

let userId: string | null = null;

export function setCurrentMockUser(id: string | null): void {
  userId = id;
}

export function currentMockUserId(): string | null {
  return userId;
}
