import { USE_MOCKS } from '@/config/env';
import { branchApi, userApi, userWriteApi, type BranchRow, type SaveBranchBody } from './api';
import { toUser } from './mappers/adminMappers';
import { invalidate } from './dataVersion';
import type {
  Branch,
  PermissionKey,
  Role,
  RoleInput,
  User,
  UserInput,
} from '@/types/permissions';
import { EXTERNAL_FORBIDDEN } from '@/types/permissions';
import { HttpError } from './http';
import { seedFor } from './mock/seed';
import { registerSlice } from './mock/db';
import { toLatinDigits, validateNumber } from '@/lib/staffDocs';
import { currentMockUserId } from './mock/sessionRef';
import { compareBy, delay, nextId, notFound, timestamp, validationFailed } from './mock/store';

let roles: Role[] = [];
let users: User[] = [];
let branches: Branch[] = [];
/* The maintenance record of a branch: settings the picker list does not carry. */
let branchSettings: Record<string, Pick<BranchRow, 'addressAr' | 'addressEn' | 'vatRatePercent' | 'pricesIncludeVat' | 'allowNegativeStock'>> = {};

registerSlice('access', {
  capture: () => ({ roles, users, branches, branchSettings }),
  restore: (s: { roles: Role[]; users: User[]; branches: Branch[]; branchSettings?: typeof branchSettings }) => {
    if (!Array.isArray(s.users) || !Array.isArray(s.roles) || !Array.isArray(s.branches)) {
      throw new Error('access snapshot is malformed');
    }
    roles = s.roles;
    users = s.users;
    branches = s.branches;
    branchSettings = s.branchSettings ?? {};
  },
  seed: (tenantId) => {
    const seed = seedFor(tenantId);
    roles = seed.roles;
    users = seed.users;
    branches = seed.branches;
    branchSettings = {};
  },
});

const roleById = (id: string) => roles.find((role) => role.id === id);

/**
 * External accounts belong to the maintenance vendor, not the business, so they
 * are refused anything exposing money or personal data. Enforced here because a
 * check in the form is a hint, not a rule.
 */
function rejectForbiddenExternal(permissions: PermissionKey[], external: boolean): void {
  if (!external) return;

  const offending = permissions.filter((key) => EXTERNAL_FORBIDDEN.includes(key));
  if (offending.length > 0) {
    throw new HttpError({
      status: 422,
      code: 'external_permission_forbidden',
      message:
        'A maintenance account cannot be given access to financial or customer data. Remove those permissions first.',
      fieldErrors: { permissions: offending },
    });
  }
}

export const branchService = {
  /**
   * Every branch picker in the app reads this.
   *
   * It was mock-only, so the branch selector in the header, the device form,
   * the restock page and every report filter showed seed branches regardless
   * of what was in the database. Wiring this one method fixes all of them.
   */
  async list(): Promise<Branch[]> {
    if (!USE_MOCKS) {
      const rows = await branchApi.list();
      return rows.map(toBranch).sort((a, b) => a.nameEn.localeCompare(b.nameEn));
    }

    await delay(120);
    return compareBy(branches, 'nameEn', 'asc');
  },

  /** The full record for the maintenance screen. */
  async manage(): Promise<BranchRow[]> {
    if (!USE_MOCKS) return branchApi.manage();

    await delay(160);
    return compareBy(branches, 'nameEn', 'asc').map((branch) => {
      const settings = branchSettings[branch.id];
      return {
        branchId: branch.id,
        code: branch.code,
        nameAr: branch.nameAr,
        nameEn: branch.nameEn,
        phone: branch.phone || null,
        addressAr: settings?.addressAr ?? null,
        addressEn: settings?.addressEn ?? branch.city,
        isActive: branch.status === 'active',
        vatRatePercent: settings?.vatRatePercent ?? 15,
        pricesIncludeVat: settings?.pricesIncludeVat ?? true,
        allowNegativeStock: settings?.allowNegativeStock ?? false,
        staffCount: users.filter((user) => user.branchIds.includes(branch.id) && user.status === 'active').length,
        deviceCount: 0,
        createdAtUtc: branch.createdAt,
        updatedAtUtc: branch.updatedAt,
      };
    });
  },

  async create(body: SaveBranchBody): Promise<string> {
    if (!USE_MOCKS) {
      const saved = await branchApi.create(body);
      /* Every picker reads branches, so they all need to know. */
      invalidate('branches');
      return saved.branchId;
    }

    await delay(300);
    validateBranch(body);

    const now = timestamp();
    const created: Branch = {
      id: nextId('brn'),
      code: body.code.trim().toUpperCase(),
      nameAr: body.nameAr.trim(),
      nameEn: body.nameEn.trim(),
      city: body.addressEn?.trim() ?? '',
      phone: body.phone?.trim() ?? '',
      status: body.isActive === false ? 'inactive' : 'active',
      createdAt: now,
      updatedAt: now,
    };
    branches = [...branches, created];
    branchSettings[created.id] = settingsFrom(body);

    /* The owner works everywhere, so a new branch is theirs at once. */
    const ownerRole = roles.find((role) => role.kind === 'owner');
    users = users.map((user) =>
      user.roleId === ownerRole?.id ? { ...user, branchIds: [...user.branchIds, created.id] } : user,
    );

    invalidate('branches');
    return created.id;
  },

  async update(branchId: string, body: SaveBranchBody): Promise<void> {
    if (!USE_MOCKS) {
      await branchApi.update(branchId, body);
      invalidate('branches');
      return;
    }

    await delay(300);
    const existing = branches.find((branch) => branch.id === branchId);
    if (!existing) throw notFound('Branch', branchId);
    validateBranch(body, branchId);

    branches = branches.map((branch) =>
      branch.id === branchId
        ? {
            ...branch,
            code: body.code.trim().toUpperCase(),
            nameAr: body.nameAr.trim(),
            nameEn: body.nameEn.trim(),
            phone: body.phone?.trim() ?? '',
            city: body.addressEn?.trim() || branch.city,
            status: body.isActive === false ? 'inactive' : 'active',
            updatedAt: timestamp(),
          }
        : branch,
    );
    branchSettings[branchId] = settingsFrom(body);
    invalidate('branches');
  },
};

function validateBranch(body: SaveBranchBody, currentId?: string): void {
  const errors: Record<string, string[]> = {};
  if (!body.code?.trim()) errors.code = ['A branch code is required.'];
  if (!body.nameAr?.trim()) errors.nameAr = ['Arabic name is required.'];
  if (!body.nameEn?.trim()) errors.nameEn = ['English name is required.'];
  const clash = branches.find(
    (branch) => branch.code.toUpperCase() === body.code?.trim().toUpperCase() && branch.id !== currentId,
  );
  if (clash) errors.code = ['Another branch already uses this code.'];
  if (Object.keys(errors).length > 0) throw validationFailed(errors);
}

function settingsFrom(body: SaveBranchBody) {
  return {
    addressAr: body.addressAr ?? null,
    addressEn: body.addressEn ?? null,
    vatRatePercent: body.vatRatePercent ?? 15,
    pricesIncludeVat: body.pricesIncludeVat ?? true,
    allowNegativeStock: body.allowNegativeStock ?? false,
  };
}

/** A branch row to the domain type the pickers use. */
function toBranch(row: Record<string, unknown>): Branch {
  const pick = (k: string) => row[k] ?? row[k.charAt(0).toUpperCase() + k.slice(1)];
  const text = (k: string) => (typeof pick(k) === 'string' ? String(pick(k)) : '');

  return {
    id: text('branchId'),
    code: text('code'),
    nameAr: text('nameAr'),
    nameEn: text('nameEn'),
    /* The API has no city column; the English address is the nearest honest
       stand-in, and empty is better than an invented city. */
    city: text('addressEn'),
    phone: text('phone'),
    status: pick('isActive') === false ? 'inactive' : 'active',
    createdAt: text('createdAtUtc'),
    updatedAt: text('updatedAtUtc'),
  } as Branch;
}

export const roleService = {
  async list(): Promise<Role[]> {
    await delay(160);
    return compareBy(roles, 'nameEn', 'asc');
  },

  async get(id: string): Promise<Role> {
    await delay(120);
    const role = roleById(id);
    if (!role) throw notFound('Role', id);
    return role;
  },

  async create(input: RoleInput): Promise<Role> {
    await delay(340);

    const errors: Record<string, string[]> = {};
    if (!input.nameAr.trim()) errors.nameAr = ['Arabic name is required.'];
    if (!input.nameEn.trim()) errors.nameEn = ['English name is required.'];
    if (input.permissions.length === 0) {
      errors.permissions = ['Give the role at least one permission, or nobody can use it.'];
    }
    if (roles.some((role) => role.nameEn.trim().toLowerCase() === input.nameEn.trim().toLowerCase())) {
      errors.nameEn = ['Another role already uses this name.'];
    }
    if (Object.keys(errors).length > 0) throw validationFailed(errors);

    rejectForbiddenExternal(input.permissions, input.external);

    const now = timestamp();
    const created: Role = {
      id: nextId('rol'),
      kind: 'custom',
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      description: input.description.trim(),
      permissions: input.permissions,
      status: input.status,
      builtIn: false,
      external: input.external,
      createdAt: now,
      updatedAt: now,
    };

    roles = [...roles, created];
    return created;
  },

  async update(id: string, input: RoleInput): Promise<Role> {
    await delay(340);

    const existing = roleById(id);
    if (!existing) throw notFound('Role', id);

    /* The owner role is deliberately immutable: an owner who can lock
       themselves out of user administration has no way back in. */
    if (existing.kind === 'owner') {
      throw new HttpError({
        status: 409,
        code: 'owner_role_immutable',
        message: 'The owner role always holds every permission and cannot be edited.',
      });
    }

    if (input.permissions.length === 0) {
      throw validationFailed({
        permissions: ['Give the role at least one permission, or nobody can use it.'],
      });
    }

    rejectForbiddenExternal(input.permissions, existing.external);

    const updated: Role = {
      ...existing,
      /* Built-in roles keep their names; only permissions are tunable. */
      nameAr: existing.builtIn ? existing.nameAr : input.nameAr.trim(),
      nameEn: existing.builtIn ? existing.nameEn : input.nameEn.trim(),
      description: input.description.trim(),
      permissions: input.permissions,
      status: input.status,
      updatedAt: timestamp(),
    };

    roles = roles.map((role) => (role.id === id ? updated : role));
    return updated;
  },

  async remove(id: string): Promise<void> {
    await delay(280);

    const existing = roleById(id);
    if (!existing) throw notFound('Role', id);

    if (existing.builtIn) {
      throw new HttpError({
        status: 409,
        code: 'builtin_role',
        message: 'Built-in roles cannot be deleted.',
      });
    }

    const assigned = users.filter((user) => user.roleId === id).length;
    if (assigned > 0) {
      throw new HttpError({
        status: 409,
        code: 'role_in_use',
        message: `${assigned} user(s) still hold this role. Move them to another role first.`,
      });
    }

    roles = roles.filter((role) => role.id !== id);
  },

  /** How many users hold each role — drives the count column and the warning. */
  async usage(): Promise<Record<string, number>> {
    await delay(100);
    return users.reduce<Record<string, number>>((counts, user) => {
      counts[user.roleId] = (counts[user.roleId] ?? 0) + 1;
      return counts;
    }, {});
  },
};

/** The staff-file part of a user record, cleaned for storage. */
function staffFile(input: UserInput, previous?: User): Partial<User> {
  const documents = (input.documents ?? [])
    .map((doc) => ({ ...doc, number: toLatinDigits(doc.number).replace(/\s+/g, ' ').trim() }))
    .filter((doc) => doc.number || doc.expiresAt);
  return {
    nationality: input.nationality || undefined,
    jobTitle: input.jobTitle?.trim() || undefined,
    joinedAt: input.joinedAt || null,
    documents,
    mustChangePassword: input.password ? Boolean(input.mustChangePassword) : (previous?.mustChangePassword ?? false),
    passwordChangedAt: input.password ? timestamp() : (previous?.passwordChangedAt ?? null),
  };
}

function validateUser(input: UserInput, currentId?: string): void {
  const errors: Record<string, string[]> = {};

  if (!input.firstName.trim()) errors.firstName = ['First name is required.'];
  if (!input.lastName.trim()) errors.lastName = ['Last name is required.'];
  if (!input.nameAr.trim()) errors.nameAr = ['Arabic name is required.'];

  const username = input.username.trim().toLowerCase();
  if (!username) {
    errors.username = ['A username is required to sign in.'];
  } else if (!/^[a-z0-9._-]{3,}$/.test(username)) {
    errors.username = ['At least 3 characters: letters, numbers, dot, dash, or underscore.'];
  } else if (users.some((user) => user.username.toLowerCase() === username && user.id !== currentId)) {
    errors.username = ['Another user already has this username.'];
  }

  const email = input.email.trim().toLowerCase();
  if (!email) {
    errors.email = ['Email is required.'];
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = ['Enter a valid email address.'];
  } else if (users.some((user) => user.email.toLowerCase() === email && user.id !== currentId)) {
    errors.email = ['Another user already uses this email.'];
  }

  /* Password is required on create only; blank on edit keeps the current one. */
  if (!currentId) {
    if (!input.password) {
      errors.password = ['Set a password so this person can sign in.'];
    } else if (input.password.length < 8) {
      errors.password = ['Use at least 8 characters.'];
    }
  } else if (input.password && input.password.length < 8) {
    errors.password = ['Use at least 8 characters, or leave it blank to keep the current one.'];
  }

  for (const doc of input.documents ?? []) {
    const check = validateNumber(doc.kind, doc.number);
    if (check === 'empty' && doc.expiresAt) errors[`doc_${doc.kind}`] = ['Enter the document number, or clear the expiry date.'];
    else if (check === 'length') errors[`doc_${doc.kind}`] = ['Use exactly 10 digits.'];
    else if (check === 'prefixId') errors[`doc_${doc.kind}`] = ['A Saudi National ID starts with 1.'];
    else if (check === 'prefixIqama') errors[`doc_${doc.kind}`] = ['An Iqama number starts with 2.'];
  }

  const role = roleById(input.roleId);
  if (!role) {
    errors.roleId = ['Choose a role.'];
  } else if (role.external) {
    if (!input.accessExpiresAt) {
      errors.accessExpiresAt = ['A maintenance account needs an end date.'];
    }
    if (!input.ticketReference?.trim()) {
      errors.ticketReference = ['Record the ticket that justifies this access.'];
    }
    if (input.extraPermissions.some((key) => EXTERNAL_FORBIDDEN.includes(key))) {
      errors.extraPermissions = [
        'A maintenance account cannot hold financial or customer permissions.',
      ];
    }
  }

  if (input.branchIds.length === 0) {
    errors.branchIds = ['Assign at least one branch.'];
  } else if (input.defaultBranchId && !input.branchIds.includes(input.defaultBranchId)) {
    errors.defaultBranchId = ['The default branch must be one of the assigned branches.'];
  }

  if (Object.keys(errors).length > 0) throw validationFailed(errors);
}

export const userService = {
  async list(): Promise<User[]> {
    if (!USE_MOCKS) {
      /* The endpoint returns a plain array; the screens expect the whole list
         rather than a page, so there is nothing to wrap. */
      const rows = await userApi.list({});
      return rows.map(toUser) as never;
    }

    await delay(200);
    return compareBy(users, 'nameEn', 'asc');
  },

  async get(id: string): Promise<User> {
    await delay(140);
    const user = users.find((candidate) => candidate.id === id);
    if (!user) throw notFound('User', id);
    return user;
  },

  /**
   * The signed-in user.
   *
   * Mock mode: whoever the mock auth service signed in. API mode: the user
   * the session belongs to, looked up in the API's user list.
   */
  async current(): Promise<User> {
    const id = currentMockUserId();

    if (!USE_MOCKS) {
      const all = await userService.list();
      const found = all.find((candidate) => candidate.id === id) ?? all[0];
      if (!found) throw new HttpError({ status: 401, code: 'not_signed_in', message: 'No user is signed in.' });
      return found;
    }

    await delay(80);
    const match = id ? users.find((user) => user.id === id) : undefined;
    if (!match) {
      throw new HttpError({ status: 401, code: 'not_signed_in', message: 'No user is signed in.' });
    }
    return match;
  },

  async create(input: UserInput): Promise<User> {
    if (!USE_MOCKS) {
      const saved = await userWriteApi.create(toUserBody(input));
      invalidate('users');
      return userService.get(saved.userId);
    }

    await delay(380);
    validateUser(input);

    const now = timestamp();
    const created: User = {
      id: nextId('usr'),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim() || `${input.firstName} ${input.lastName}`.trim(),
      username: input.username.trim().toLowerCase(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      employeeId: input.employeeId.trim(),
      avatarUrl: null,
      roleId: input.roleId,
      defaultBranchId: input.defaultBranchId,
      branchIds: input.branchIds,
      status: 'invited',
      extraPermissions: input.extraPermissions,
      deniedPermissions: input.deniedPermissions,
      lastActiveAt: null,
      accessExpiresAt: input.accessExpiresAt,
      ticketReference: input.ticketReference,
      ...staffFile(input),
      createdAt: now,
      updatedAt: now,
    };

    users = [created, ...users];
    return created;
  },

  async update(id: string, input: UserInput): Promise<User> {
    if (!USE_MOCKS) {
      await userWriteApi.update(id, toUserBody(input));
      invalidate('users');
      return userService.get(id);
    }

    await delay(380);

    const existing = users.find((user) => user.id === id);
    if (!existing) throw notFound('User', id);

    validateUser(input, id);

    /* The last active owner must stay an owner, or nobody can administer the
       business and the only route back is a support call. */
    const ownerRole = roles.find((role) => role.kind === 'owner');
    if (ownerRole && existing.roleId === ownerRole.id && input.roleId !== ownerRole.id) {
      const remaining = users.filter(
        (user) => user.roleId === ownerRole.id && user.id !== id && user.status === 'active',
      ).length;

      if (remaining === 0) {
        throw new HttpError({
          status: 409,
          code: 'last_owner',
          message: 'This is the only owner. Promote another user before changing this role.',
        });
      }
    }

    const updated: User = {
      ...existing,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      username: input.username.trim().toLowerCase(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      employeeId: input.employeeId.trim(),
      roleId: input.roleId,
      defaultBranchId: input.defaultBranchId,
      branchIds: input.branchIds,
      status: input.status,
      extraPermissions: input.extraPermissions,
      deniedPermissions: input.deniedPermissions,
      accessExpiresAt: input.accessExpiresAt,
      ticketReference: input.ticketReference,
      ...staffFile(input, existing),
      updatedAt: timestamp(),
    };

    users = users.map((user) => (user.id === id ? updated : user));
    return updated;
  },

  /** Suspend rather than delete, so the audit trail keeps its actor. */
  async setStatus(id: string, status: User['status']): Promise<User> {
    await delay(260);

    const existing = users.find((user) => user.id === id);
    if (!existing) throw notFound('User', id);

    const ownerRole = roles.find((role) => role.kind === 'owner');
    if (ownerRole && existing.roleId === ownerRole.id && status !== 'active') {
      const remaining = users.filter(
        (user) => user.roleId === ownerRole.id && user.id !== id && user.status === 'active',
      ).length;

      if (remaining === 0) {
        throw new HttpError({
          status: 409,
          code: 'last_owner',
          message: 'This is the only active owner. Promote another user before suspending them.',
        });
      }
    }

    const updated: User = { ...existing, status, updatedAt: timestamp() };
    users = users.map((user) => (user.id === id ? updated : user));
    return updated;
  },

  /** Ends an external account's window immediately, ahead of its expiry. */
  async revokeAccess(id: string): Promise<User> {
    await delay(260);

    const existing = users.find((user) => user.id === id);
    if (!existing) throw notFound('User', id);

    const now = timestamp();
    const updated: User = {
      ...existing,
      status: 'suspended',
      accessExpiresAt: now,
      updatedAt: now,
    };

    users = users.map((user) => (user.id === id ? updated : user));
    return updated;
  },
};


/**
 * Domain input to the API's shape.
 *
 * Branch assignment and permission overrides are not sent: they live in their
 * own tables and have no endpoint yet, so including them here would silently
 * drop them and look like a save that worked.
 */
function toUserBody(source: UserInput) {
  const input = source as unknown as Record<string, unknown>;

  return {
    username: String(input.username ?? ''),
    nameAr: String(input.nameAr ?? ''),
    nameEn: String(input.nameEn ?? ''),
    email: (input.email as string) || null,
    phone: (input.phone as string) || null,
    roleId: String(input.roleId ?? ''),
    status: String(input.status ?? 'active'),
    isExternal: Boolean(input.isExternal),
    accessExpiresOn: (input.accessExpiresAt as string)?.slice(0, 10) || null,
    baseSalaryH: Number(input.baseSalaryH ?? 0),
  };
}
