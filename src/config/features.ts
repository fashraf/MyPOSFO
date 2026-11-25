/**
 * Feature switches. Every page stays available; what is emptied for this product is the DATA behind some pages
 * (see services/mock/cleanStart.ts): customers and credit customers, upcoming (recurring) payments, payroll, POS
 * devices and components start empty, and the business has one branch.
 */
export const REMOVED_PATHS: readonly string[] = [];

export function isRemovedPath(path: string): boolean {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return REMOVED_PATHS.some((removed) => clean === removed || clean.startsWith(`${removed}/`));
}

/** Selling on credit (to a customer account). The option stays; there are simply no customers until someone adds one. */
export const CREDIT_SALES = true;

/** Customer records (picker in checkout, customers page). */
export const CUSTOMERS = true;

/** One branch: the business starts with a single branch (more can be added on the Branches page). */
export const SINGLE_BRANCH = true;
