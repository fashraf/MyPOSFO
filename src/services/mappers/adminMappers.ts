import type { ID } from '@/types';
import type { Discount } from '@/types/discounts';
import type { User } from '@/types/permissions';

/**
 * API rows to domain objects, for the admin modules.
 *
 * Field by field, as everywhere else. Two conversions here are easy to get
 * wrong and silent when you do:
 *
 *  - a percentage is **basis points of a percent** in the domain (1000 = 10%)
 *    and a plain decimal in the database (10 = 10%)
 *  - the API returns a flat user row; the domain type carries branch lists and
 *    permission overrides the list endpoint does not include
 */

type Row = Record<string, unknown>;

function pick(row: Row, name: string): unknown {
  if (row[name] !== undefined) return row[name];
  const pascal = name.charAt(0).toUpperCase() + name.slice(1);
  return row[pascal];
}

const num = (v: unknown, fb = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fb;
const str = (v: unknown, fb = '') => (typeof v === 'string' ? v : fb);
const strOrNull = (v: unknown) =>
  typeof v === 'string' && v.length > 0 ? v : null;

function iso(v: unknown): string {
  if (typeof v !== 'string') return new Date().toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/*-------------------------------------------------------------- discounts */

/** Database percent (10) to domain basis points (1000). */
export const percentToBasisPoints = (percent: number) => Math.round(percent * 100);

/** Domain basis points (1000) back to database percent (10). */
export const basisPointsToPercent = (points: number) => points / 100;

export function toDiscount(row: Row): Discount {
  const type = str(pick(row, 'discountType'), 'percent');

  return {
    id: str(pick(row, 'discountId') ?? pick(row, 'id')),
    nameAr: str(pick(row, 'nameAr')),
    nameEn: str(pick(row, 'nameEn')),
    description: '',
    type: (type === 'amount' ? 'fixed' : 'percentage') as Discount['type'],

    /* The conversion that matters. Passing 10 straight through would read as
       0.1% and quietly stop discounting anything. */
    value: type === 'percent'
      ? percentToBasisPoints(num(pick(row, 'value')))
      : num(pick(row, 'value')),

    maxAmountH: num(pick(row, 'maxDiscountH')),
    minOrderH: num(pick(row, 'minSubtotalH')),
    applicability: str(pick(row, 'appliesTo'), 'sale') as Discount['applicability'],

    /* The API has no per-item, per-branch or per-role scoping yet. Empty means
       "everywhere" in the domain, which is the honest reading of absent. */
    appliesToIds: [],
    branchIds: [],
    allowedRoleIds: [],

    requiresApprovalAboveH: num(pick(row, 'approvalAboveH')),
    isAutomatic: Boolean(pick(row, 'isAutomatic')),
    allowStacking: Boolean(pick(row, 'allowStacking')),
    activeDays: str(pick(row, 'activeDays')),
    startsOn: strOrNull(pick(row, 'startsOn'))?.slice(0, 10) ?? null,
    endsOn: strOrNull(pick(row, 'endsOn'))?.slice(0, 10) ?? null,
    usageCount: num(pick(row, 'usageCount')),
    status: pick(row, 'isActive') === false ? 'inactive' : 'active',
    createdAt: iso(pick(row, 'createdAtUtc')),
    updatedAt: iso(pick(row, 'updatedAtUtc')),
  } as unknown as Discount;
}

/*------------------------------------------------------------------ users */

export function toUser(row: Row): User {
  const nameEn = str(pick(row, 'nameEn'));
  const parts = nameEn.split(' ');

  return {
    id: str(pick(row, 'userId') ?? pick(row, 'id')),
    /* The database holds one name. Splitting it is a display convenience, not
       a claim about the person's actual given and family names. */
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
    nameAr: str(pick(row, 'nameAr')),
    nameEn,
    username: str(pick(row, 'username')),
    email: str(pick(row, 'email')),
    phone: str(pick(row, 'phone')),
    address: '',
    employeeId: '',
    avatarUrl: null,
    roleId: str(pick(row, 'roleId')) as ID,

    /* Branch assignment lives in core.UserBranch and is not in this row. Empty
       rather than guessed — a fabricated branch list would let a screen show
       access the person does not have. */
    defaultBranchId: null,
    branchIds: [],

    status: str(pick(row, 'status'), 'active') as User['status'],
    extraPermissions: [],
    deniedPermissions: [],
    lastActiveAt: strOrNull(pick(row, 'lastLoginAtUtc')),
    accessExpiresAt: strOrNull(pick(row, 'accessExpiresOn')),
    ticketReference: null,
    createdAt: iso(pick(row, 'createdAtUtc')),
    updatedAt: iso(pick(row, 'updatedAtUtc')),
  } as unknown as User;
}
