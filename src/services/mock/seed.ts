import { SAMPLE_ACTIVITY, SERVER_CORE } from '@/config/env';
import type {
  Category,
  CatalogItem,
  ComboSlot,
  ModifierGroup,
  Product,
  Service,
  StaffMember,
  Vendor,
} from '@/types/catalog';
import type { Customer } from '@/types/sales';
import type { Branch, PermissionKey, Role, StaffDocument, User } from '@/types/permissions';
import type { Discount } from '@/types/discounts';
import type { KitchenOrder } from '@/types/kitchen';
import type { Ingredient } from '@/types/ingredients';
import { ingredientsFor, recipesFor } from './ingredientSeed';
import type { PrintGroup } from '@/types/printing';
import type { CompanyProfile } from '@/types/company';
import { ALL_PERMISSIONS } from '@/types/permissions';
import { DEMO_TENANTS, type DemoTenantId } from './tenants';
import { clone } from './store';

/**
 * Factory seed data, per tenant.
 *
 * Each tenant is a complete, self-consistent database: every foreign key
 * (category → item, item → vendor, user → role/branch, discount → role) points
 * at a row in the same tenant. Nothing here is random — a reset produces exactly
 * the same data on every machine, which is what makes a bug report reproducible.
 *
 * `seedFor()` returns a deep copy, so a service mutating its collection can
 * never corrupt the original and a reset always starts clean.
 */

export interface TenantSeed {
  company: CompanyProfile;
  branches: Branch[];
  roles: Role[];
  users: User[];
  ingredients?: Ingredient[];
  vendors: Vendor[];
  staff: StaffMember[];
  categories: Category[];
  catalog: CatalogItem[];
  customers: Customer[];
  discounts: Discount[];
  kitchenOrders: KitchenOrder[];
  printGroups: PrintGroup[];
  /** Opening stock per branch, as a share of the item's base quantity. */
  branchStockShare: Record<string, number>;
}

const SEED_DATE = '2026-08-20T09:00:00.000Z';
const stamps = () => ({ createdAt: SEED_DATE, updatedAt: SEED_DATE });

/* ========================================================================== */
/* Roles — the same built-in set for every tenant                              */
/* ========================================================================== */

const P = (keys: PermissionKey[]) => keys;

/** Employee numbers are numeric: AN-001 → 10001, NJ-002 → 20002, LZ-003 → 30003. */
function numericEmp(code: string): string {
  const m = code.match(/^([A-Z]+)-0*(\d+)$/);
  if (!m) return code;
  const prefix = { AN: '1', NJ: '2', LZ: '3' }[m[1]] ?? '9';
  return `${prefix}${m[2].padStart(4, '0')}`;
}

function builtInRoles(): Role[] {
  return [
    {
      id: 'rol_owner', kind: 'owner', nameAr: 'المالك', nameEn: 'Tenant Owner',
      description: 'Full access across every branch: finance, P&L, payroll, roles and settings.',
      permissions: ALL_PERMISSIONS, status: 'active', builtIn: true, external: false, ...stamps(),
    },
    {
      id: 'rol_manager', kind: 'manager', nameAr: 'مدير الفرع', nameEn: 'Branch Manager',
      description: 'Runs one branch: till, voids and discounts, stock and restock, shift close, local reports.',
      permissions: P([
        'dashboard.view',
        'pos.view', 'pos.create_sale', 'pos.apply_discount', 'pos.override_price', 'pos.void_sale', 'pos.return_sale',
        'sales.view', 'sales.view_details', 'sales.return', 'sales.void', 'sales.reprint',
        'products.view', 'products.create', 'products.edit',
        'inventory.view', 'inventory.adjust', 'inventory.stocktake', 'inventory.purchase_entry',
        'vendors.view', 'vendors.create', 'vendors.edit',
        'customers.view', 'customers.create', 'customers.edit',
        'discounts.view', 'reports.view', 'users.view', 'branches.view',
        'kitchen.view', 'kitchen.bump', 'shifts.view', 'shifts.manage',
        'devices.view', 'settings.view',
        'restaurant.session.view', 'restaurant.session.open', 'restaurant.session.close',
        'restaurant.session.reconcile', 'restaurant.session.approve_discrepancy',
        'restaurant.session.view_history', 'restaurant.session.view_reports',
        'restaurant.cash_movement.create', 'restaurant.cash_movement.view',
      ]),
      status: 'active', builtIn: true, external: false, ...stamps(),
    },
    {
      id: 'rol_cashier', kind: 'cashier', nameAr: 'كاشير أول', nameEn: 'Senior Cashier',
      description: 'Sells at the till, opens and closes their own shift, looks up customers. No costs, P&L or settings.',
      permissions: P([
        'pos.view', 'pos.create_sale', 'pos.apply_discount',
        'sales.view', 'sales.reprint',
        'customers.view', 'customers.create',
        'shifts.view', 'shifts.manage',
        'restaurant.session.view',
      ]),
      status: 'active', builtIn: true, external: false, ...stamps(),
    },
    {
      id: 'rol_supervisor', kind: 'custom', nameAr: 'مشرف الوردية', nameEn: 'Shift Supervisor',
      description: 'Watches the floor: sees the open session, signs off cash differences and may close the day when asked to.',
      permissions: P([
        'pos.view', 'sales.view', 'sales.view_details', 'sales.reprint', 'kitchen.view', 'shifts.view',
        'restaurant.session.view', 'restaurant.session.close', 'restaurant.session.reconcile',
        'restaurant.session.approve_discrepancy', 'restaurant.session.view_history',
        'restaurant.cash_movement.view',
      ]),
      status: 'active', builtIn: true, external: false, ...stamps(),
    },
    {
      id: 'rol_kitchen', kind: 'custom', nameAr: 'المطبخ / الباريستا', nameEn: 'Kitchen / Barista (KDS)',
      description: 'The kitchen display and nothing else: see tickets, bump items and orders.',
      permissions: P(['kitchen.view', 'kitchen.bump']),
      status: 'active', builtIn: true, external: false, ...stamps(),
    },
    {
      id: 'rol_accountant', kind: 'accountant', nameAr: 'المراقب المالي', nameEn: 'Finance Controller',
      description: 'Ledger, expenses, payables and receivables, commission, periods and the ZATCA trail. Read-only at the till.',
      permissions: P([
        'dashboard.view', 'pos.view',
        'sales.view', 'sales.view_details', 'sales.reprint',
        'products.view', 'inventory.view', 'vendors.view', 'customers.view',
        'finance.view', 'finance.expenses', 'finance.ledger', 'finance.reverse',
        'reports.view', 'reports.export', 'shifts.view', 'zatca.view', 'audit.view',
        'restaurant.session.view', 'restaurant.session.view_history', 'restaurant.session.view_reports',
        'restaurant.cash_movement.view',
      ]),
      status: 'active', builtIn: true, external: false, ...stamps(),
    },
    {
      id: 'rol_inventory', kind: 'inventory_manager', nameAr: 'مسؤول المخزون', nameEn: 'Inventory Manager',
      description: 'Receives stock and keeps the counts honest.',
      permissions: P([
        'products.view', 'products.create', 'products.edit',
        'inventory.view', 'inventory.adjust', 'inventory.stocktake', 'inventory.purchase_entry',
        'vendors.view', 'vendors.create', 'vendors.edit',
      ]),
      status: 'active', builtIn: true, external: false, ...stamps(),
    },
    {
      id: 'rol_maintenance', kind: 'maintenance', nameAr: 'مورّد الصيانة', nameEn: 'Vendor (Maintenance)',
      description: 'External support engineer. No access to money or customer data.',
      permissions: P([
        'settings.view', 'products.view', 'inventory.view', 'users.view',
        'branches.view', 'company.view', 'bill_builder.view', 'devices.view', 'devices.command',
      ]),
      status: 'active', builtIn: true, external: true, ...stamps(),
    },
  ];
}

/* ========================================================================== */
/* Shared builders                                                             */
/* ========================================================================== */

interface ProductSpec {
  id: string; ar: string; en: string; cat: string; price: number; cost: number;
  sku: string; barcode: string; vendor?: string | null; unit?: Product['unit'];
  track?: boolean; stock?: number; min?: number; prep?: boolean; group?: string | null;
  desc?: string; pos?: boolean; modifiers?: ModifierGroup[];
}

function product(spec: ProductSpec): Product {
  return {
    id: spec.id, kind: 'product', nameAr: spec.ar, nameEn: spec.en, categoryId: spec.cat,
    description: spec.desc ?? '', imageUrl: null,
    priceH: Math.round(spec.price * 100), costH: Math.round(spec.cost * 100),
    showOnPos: spec.pos ?? true, requiresPreparation: spec.prep ?? false,
    printGroupId: spec.group ?? null, status: 'active',
    sku: spec.sku, barcode: spec.barcode, vendorId: spec.vendor ?? null, unit: spec.unit ?? 'piece',
    trackInventory: spec.track ?? true, stockQuantity: spec.stock ?? 0, minStockLevel: spec.min ?? 0,
    modifierGroups: spec.modifiers, ...stamps(),
  };
}

interface ComboSpec {
  id: string; ar: string; en: string; cat: string; price: number; sku: string; desc?: string;
  slots: ComboSlot[]; group?: string | null;
}

/** A combo is a product with slots. It never tracks its own stock — its components do. */
function combo(spec: ComboSpec): Product {
  return {
    ...product({
      id: spec.id, ar: spec.ar, en: spec.en, cat: spec.cat, price: spec.price, cost: 0, sku: spec.sku,
      barcode: '', track: false, prep: true, group: spec.group ?? null, desc: spec.desc,
    }),
    combo: { slots: spec.slots },
  };
}

function slot(id: string, ar: string, en: string, defaultItemId: string, choices: [string, number][], quantity = 1): ComboSlot {
  return {
    id, nameAr: ar, nameEn: en, quantity, defaultItemId,
    choices: choices.map(([itemId, extra]) => ({ itemId, priceDeltaH: Math.round(extra * 100) })),
  };
}

function category(id: string, ar: string, en: string, order: number, appliesTo: Category['appliesTo'] = 'product'): Category {
  return { id, nameAr: ar, nameEn: en, appliesTo, sortOrder: order, status: 'active', ...stamps() };
}

function branch(id: string, ar: string, en: string, code: string, city: string, phone: string): Branch {
  return { id, nameAr: ar, nameEn: en, code, city, phone, status: 'active', ...stamps() };
}

interface UserSpec {
  id: string; first: string; last: string; ar: string; username: string; email: string;
  phone: string; emp: string; role: string; branches: string[]; status?: User['status'];
  extra?: PermissionKey[]; denied?: PermissionKey[]; lastActive?: string;
}

/* yyyy-mm-dd, n days from today. Expiries are relative so the demo always
   has something expired, something due soon and something fine. */
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

type Doc = [StaffDocument['kind'], string, number | null];
const STAFF_FILES: Record<string, { nat: string; job: string; joined: number; docs: Doc[] }> = {
  usr_an_owner: { nat: 'SA', job: 'Owner', joined: -2900, docs: [['national_id', '1023456789', 1400]] },
  usr_an_manager: { nat: 'SA', job: 'Branch manager', joined: -1500, docs: [['national_id', '1098765432', 820]] },
  usr_an_cashier: { nat: 'SA', job: 'Senior cashier', joined: -700, docs: [['national_id', '1045678123', 25]] },
  usr_an_kitchen: { nat: 'EG', job: 'Head barista', joined: -1100, docs: [['iqama', '2345678901', 47], ['passport', 'A24418865', 900], ['health_card', 'HC-77120', -6]] },
  usr_an_accountant: { nat: 'JO', job: 'Accountant', joined: -1300, docs: [['iqama', '2412098733', 310], ['passport', 'N9023311', 1500]] },
  usr_an_cashier2: { nat: 'SA', job: 'Cashier', joined: -300, docs: [['national_id', '1112223334', 1900]] },
  usr_an_cashier3: { nat: 'PH', job: 'Cashier', joined: -900, docs: [['iqama', '2501234567', -40], ['passport', 'P5512090A', 400]] },
  usr_nj_admin: { nat: 'SA', job: 'Operations director', joined: -3000, docs: [['national_id', '1009988776', 2100]] },
  usr_nj_manager: { nat: 'SA', job: 'Store manager', joined: -1200, docs: [['national_id', '1076655443', 600]] },
  usr_nj_cashier: { nat: 'SA', job: 'Cashier', joined: -400, docs: [['national_id', '1088877766', 14]] },
  usr_nj_stock: { nat: 'IN', job: 'Inventory controller', joined: -1600, docs: [['iqama', '2398765410', 120], ['passport', 'Z4410982', 58]] },
  usr_lz_owner: { nat: 'SA', job: 'Owner', joined: -1000, docs: [['national_id', '1034343434', 1700]] },
  usr_lz_cashier: { nat: 'SA', job: 'Cashier', joined: -250, docs: [['national_id', '1121212121', 980]] },
  usr_lz_kitchen: { nat: 'PK', job: 'Kitchen lead', joined: -800, docs: [['iqama', '2456789012', 9], ['passport', 'AB1234567', 700], ['health_card', 'HC-55021', 140]] },
  usr_lz_grill: { nat: 'IN', job: 'Grill cook', joined: -600, docs: [['iqama', '2367890123', 52], ['passport', 'M7781203', 1200], ['health_card', 'HC-55022', 21]] },
  usr_lz_fry: { nat: 'BD', job: 'Fry cook', joined: -150, docs: [['iqama', '2478901234', 260], ['passport', 'BX0098812', 1500]] },
  usr_lz_cashier2: { nat: 'PH', job: 'Cashier', joined: -420, docs: [['iqama', '2589012345', -12], ['passport', 'P7720115B', 950]] },
};

function user(spec: UserSpec): User {
  const file = STAFF_FILES[spec.id];
  return {
    ...(file
      ? {
          nationality: file.nat,
          jobTitle: file.job,
          joinedAt: inDays(file.joined),
          documents: file.docs.map(([kind, number, days]) => ({ kind, number, expiresAt: days === null ? null : inDays(days) })),
          mustChangePassword: false,
          passwordChangedAt: '2026-09-01T08:00:00.000Z',
        }
      : {}),
    id: spec.id, firstName: spec.first, lastName: spec.last, nameAr: spec.ar,
    nameEn: `${spec.first} ${spec.last}`, username: spec.username, email: spec.email,
    phone: spec.phone, address: '', employeeId: numericEmp(spec.emp), avatarUrl: null, roleId: spec.role,
    defaultBranchId: spec.branches[0] ?? null, branchIds: spec.branches,
    status: spec.status ?? 'active', extraPermissions: spec.extra ?? [], deniedPermissions: spec.denied ?? [],
    lastActiveAt: spec.lastActive ?? '2026-11-15T07:15:00.000Z', accessExpiresAt: null, ticketReference: null,
    ...stamps(),
  };
}

function customer(id: string, ar: string, en: string, phone: string, email: string, balance: number, limit: number): Customer {
  return {
    id, nameAr: ar, nameEn: en, phone, email,
    balanceH: Math.round(balance * 100), creditLimitH: Math.round(limit * 100), status: 'active', ...stamps(),
  };
}

function vendor(id: string, ar: string, en: string, contact: string, phone: string, email: string, vat: string, city: string): Vendor {
  return { id, nameAr: ar, nameEn: en, contactPerson: contact, phone, email, vatNumber: vat, city, status: 'active', ...stamps() };
}

function discount(partial: Partial<Discount> & Pick<Discount, 'id' | 'nameAr' | 'nameEn' | 'type' | 'value'>): Discount {
  return {
    description: '', maxAmountH: 0, minOrderH: 0, applicability: 'all', appliesToIds: [], branchIds: [],
    allowedRoleIds: [], requiresApprovalAboveH: 0, isAutomatic: false, allowStacking: false, activeDays: [],
    startsAt: null, endsAt: null, status: 'active', usageCount: 0, ...stamps(), ...partial,
  } as Discount;
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString();

/* ========================================================================== */
/* Tenant 1 — Al-Noor Specialty Coffee & Roastery (F&B, Enterprise)            */
/* ========================================================================== */

const SIZE: ModifierGroup = {
  id: 'mg_size', nameAr: 'الحجم', nameEn: 'Size', required: true, multiple: false,
  options: [
    { id: 'mo_s', nameAr: 'صغير', nameEn: 'Small', priceDeltaH: 0, scale: 1 },
    { id: 'mo_m', nameAr: 'وسط', nameEn: 'Medium', priceDeltaH: 300, scale: 1.25 },
    { id: 'mo_l', nameAr: 'كبير', nameEn: 'Large', priceDeltaH: 600, scale: 1.5 },
  ],
  kind: 'size',
};

const MILK: ModifierGroup = {
  id: 'mg_milk', nameAr: 'نوع الحليب', nameEn: 'Milk', required: false, multiple: false,
  options: [
    { id: 'mo_full', nameAr: 'حليب كامل الدسم', nameEn: 'Full cream milk', priceDeltaH: 0, ingredientId: 'ing_milk', replacesIngredientId: 'ing_milk' },
    { id: 'mo_oat', nameAr: 'حليب الشوفان', nameEn: 'Oat milk', priceDeltaH: 300, ingredientId: 'ing_oat', replacesIngredientId: 'ing_milk' },
    { id: 'mo_almond', nameAr: 'حليب اللوز', nameEn: 'Almond milk', priceDeltaH: 300, ingredientId: 'ing_almond', replacesIngredientId: 'ing_milk' },
    { id: 'mo_lactose', nameAr: 'حليب خالي من اللاكتوز', nameEn: 'Lactose-free milk', priceDeltaH: 200, ingredientId: 'ing_lactose', replacesIngredientId: 'ing_milk' },
  ],
  kind: 'choice',
};

const EXTRAS: ModifierGroup = {
  id: 'mg_extra', nameAr: 'إضافات', nameEn: 'Extras', required: false, multiple: true,
  options: [
    { id: 'mo_shot', nameAr: 'إضافة بن إسبريسو', nameEn: 'Extra espresso beans', priceDeltaH: 400, ingredientId: 'ing_beans', quantity: 18 },
    { id: 'mo_vanilla', nameAr: 'إضافة سيروب فانيلا', nameEn: 'Extra vanilla syrup', priceDeltaH: 200, ingredientId: 'ing_vanilla', quantity: 15 },
    { id: 'mo_caramel', nameAr: 'إضافة سيروب كراميل', nameEn: 'Extra caramel syrup', priceDeltaH: 200, ingredientId: 'ing_caramel', quantity: 15 },
    { id: 'mo_decaf', nameAr: 'بن منزوع الكافيين', nameEn: 'Decaf beans', priceDeltaH: 0, ingredientId: 'ing_decaf', replacesIngredientId: 'ing_beans' },
  ],
  kind: 'extra',
};

const SUGAR: ModifierGroup = {
  id: 'mg_sugar', nameAr: 'السكر', nameEn: 'Sugar', required: false, multiple: false,
  options: [
    { id: 'mo_nosugar', nameAr: 'بدون سكر', nameEn: 'No sugar', priceDeltaH: 0 },
    { id: 'mo_medsugar', nameAr: 'سكر وسط', nameEn: 'Medium sugar', priceDeltaH: 0 },
    { id: 'mo_sweet', nameAr: 'سكر زيادة', nameEn: 'Extra sweet', priceDeltaH: 0 },
  ],
};

const WARMED: ModifierGroup = {
  id: 'mg_warm', nameAr: 'التقديم', nameEn: 'Serve', required: false, multiple: false,
  options: [
    { id: 'mo_warm', nameAr: 'دافئ', nameEn: 'Warmed', priceDeltaH: 0 },
    { id: 'mo_asis', nameAr: 'كما هو', nameEn: 'As is', priceDeltaH: 0 },
  ],
};

const espressoMods = [SIZE, MILK, EXTRAS];

function alNoor(): TenantSeed {
  const company: CompanyProfile = {
    nameEn: 'Al-Noor Specialty Coffee & Roastery',
    nameAr: 'النور للقهوة المختصة والتحميص',
    description: 'Single-origin roasts, brewed with care since 2016.',
    logoUrl: null,
    crNumber: '1010456789',
    vatNumber: '310122393500003',
    phone: '+966 11 465 2200',
    email: 'hello@alnoor.sa',
    website: 'alnoor.sa',
    address: { street: 'Olaya Street, Building 7421', district: 'Al Olaya', city: 'Riyadh', postalCode: '12213', country: 'SA' },
    social: { instagram: '@alnoor.coffee', facebook: '', x: '@alnoorcoffee', tiktok: '@alnoor.coffee', linkedin: '', youtube: '' },
    ...stamps(),
  };

  const branches = [
    branch('brn_001', 'فرع العليا الرئيسي — الرياض', 'Riyadh Flagship — Olaya', 'RUH-OLY', 'Riyadh', '+966 11 465 2200'),
    branch('brn_002', 'فرع المركز المالي — الرياض', 'Riyadh — KAFD', 'RUH-KFD', 'Riyadh', '+966 11 465 2210'),
    branch('brn_003', 'فرع الكورنيش — جدة', 'Jeddah — Corniche', 'JED-COR', 'Jeddah', '+966 12 614 0090'),
  ];

  const all = branches.map((b) => b.id);

  const users = [
    user({ id: 'usr_an_owner', first: 'Faisal', last: 'Al-Rashid', ar: 'فيصل الراشد', username: 'faisal',
      email: 'owner@alnoor.sa', phone: '+966 50 111 2001', emp: 'AN-001', role: 'rol_owner', branches: all }),
    user({ id: 'usr_an_manager', first: 'Noura', last: 'Al-Qahtani', ar: 'نورة القحطاني', username: 'noura',
      email: 'manager@alnoor.sa', phone: '+966 55 111 2002', emp: 'AN-002', role: 'rol_manager', branches: ['brn_001'] }),
    user({ id: 'usr_an_cashier', first: 'Yousef', last: 'Al-Harbi', ar: 'يوسف الحربي', username: 'yousef',
      email: 'cashier@alnoor.sa', phone: '+966 53 111 2003', emp: 'AN-003', role: 'rol_cashier', branches: ['brn_001'] }),
    user({ id: 'usr_an_kitchen', first: 'Omar', last: 'Bakri', ar: 'عمر بكري', username: 'omar',
      email: 'kitchen@alnoor.sa', phone: '+966 56 111 2004', emp: 'AN-004', role: 'rol_kitchen', branches: ['brn_001'] }),
    user({ id: 'usr_an_accountant', first: 'Huda', last: 'Al-Shammari', ar: 'هدى الشمري', username: 'huda',
      email: 'accountant@alnoor.sa', phone: '+966 54 111 2005', emp: 'AN-005', role: 'rol_accountant', branches: all }),
    user({ id: 'usr_an_cashier2', first: 'Reem', last: 'Al-Ghamdi', ar: 'ريم الغامدي', username: 'reem',
      email: 'reem@alnoor.sa', phone: '+966 53 111 2006', emp: 'AN-006', role: 'rol_cashier', branches: ['brn_002'] }),
    user({ id: 'usr_an_cashier3', first: 'Majed', last: 'Al-Zahrani', ar: 'ماجد الزهراني', username: 'majed',
      email: 'majed@alnoor.sa', phone: '+966 53 111 2007', emp: 'AN-007', role: 'rol_cashier', branches: ['brn_003'],
      status: 'suspended', lastActive: '2026-10-02T11:20:00.000Z' }),
  ];

  const vendors = [
    vendor('ven_001', 'محمصة الجنوب', 'Southern Roasters Supply', 'Ali Al-Malki', '+966 17 224 1100', 'orders@southernroast.sa', '300441122300003', 'Jazan'),
    vendor('ven_002', 'ألبان المراعي — توريد', 'Almarai Food Service', 'Sultan Al-Dossary', '+966 11 470 0005', 'foodservice@almarai.example', '300009988700003', 'Riyadh'),
    vendor('ven_003', 'مخابز الفجر', 'Al-Fajr Bakeries', 'Hassan Nouri', '+966 11 455 3200', 'b2b@alfajr.example', '300077766500003', 'Riyadh'),
    vendor('ven_004', 'التغليف الحديث', 'Modern Packaging Co.', 'Rami Haddad', '+966 13 887 4520', 'sales@modpack.example', '300055512300003', 'Dammam'),
  ];

  const staff: StaffMember[] = [
    { id: 'stf_001', nameAr: 'عمر', nameEn: 'Omar', role: 'Head Barista', status: 'active', ...stamps() },
    { id: 'stf_002', nameAr: 'لين', nameEn: 'Leen', role: 'Barista', status: 'active', ...stamps() },
    { id: 'stf_003', nameAr: 'سامي', nameEn: 'Sami', role: 'Roaster', status: 'active', ...stamps() },
  ];

  const categories = [
    category('cat_hot', 'قهوة ساخنة', 'Hot Coffee', 1),
    category('cat_cold', 'قهوة باردة', 'Iced & Cold Brew', 2),
    category('cat_tea', 'شاي ومشروبات', 'Tea & Others', 3),
    category('cat_bakery', 'مخبوزات', 'Bakery', 4),
    category('cat_dessert', 'حلويات', 'Desserts', 5),
    category('cat_beans', 'بن للبيع', 'Retail Beans', 6),
    category('cat_bev', 'مشروبات معبأة', 'Bottled Drinks', 7),
    category('cat_class', 'ورش وتجارب', 'Workshops', 8, 'service'),
    category('cat_combo', 'عروض الكومبو', 'Combos', 0),
  ];

  const bar = 'pgr_bar';
  const kitchen = 'pgr_kitchen';

  const catalog: CatalogItem[] = [
    product({ id: 'itm_001', ar: 'إسبريسو', en: 'Espresso', cat: 'cat_hot', price: 12, cost: 3.1, sku: 'HOT-ESP', barcode: '6287001000011', track: false, prep: true, group: bar, modifiers: [EXTRAS] }),
    product({ id: 'itm_002', ar: 'أمريكانو', en: 'Americano', cat: 'cat_hot', price: 14, cost: 3.4, sku: 'HOT-AMR', barcode: '6287001000028', track: false, prep: true, group: bar, modifiers: [SIZE, EXTRAS] }),
    product({ id: 'itm_003', ar: 'كابتشينو', en: 'Cappuccino', cat: 'cat_hot', price: 18, cost: 4.6, sku: 'HOT-CAP', barcode: '6287001000035', track: false, prep: true, group: bar, modifiers: espressoMods }),
    product({ id: 'itm_004', ar: 'فلات وايت', en: 'Flat White', cat: 'cat_hot', price: 19, cost: 4.9, sku: 'HOT-FLW', barcode: '6287001000042', track: false, prep: true, group: bar, modifiers: [MILK, EXTRAS] }),
    product({ id: 'itm_005', ar: 'سبانش لاتيه', en: 'Spanish Latte', cat: 'cat_hot', price: 21, cost: 5.6, sku: 'HOT-SPL', barcode: '6287001000059', track: false, prep: true, group: bar, modifiers: espressoMods }),
    product({ id: 'itm_006', ar: 'قهوة سعودية — دلة', en: 'Saudi Coffee — Dallah', cat: 'cat_hot', price: 25, cost: 6.0, sku: 'HOT-DAL', barcode: '6287001000066', track: false, prep: true, group: bar, desc: 'Khawlani beans with cardamom and saffron, served with dates.', modifiers: [SUGAR] }),
    product({ id: 'itm_007', ar: 'في ٦٠ — قهوة مقطرة', en: 'V60 Pour-over', cat: 'cat_hot', price: 24, cost: 6.8, sku: 'HOT-V60', barcode: '6287001000073', track: false, prep: true, group: bar }),
    product({ id: 'itm_008', ar: 'آيس لاتيه', en: 'Iced Latte', cat: 'cat_cold', price: 20, cost: 5.0, sku: 'CLD-ILT', barcode: '6287001000080', track: false, prep: true, group: bar, modifiers: espressoMods }),
    product({ id: 'itm_009', ar: 'كولد برو', en: 'Cold Brew', cat: 'cat_cold', price: 22, cost: 5.4, sku: 'CLD-CBR', barcode: '6287001000097', track: false, prep: true, group: bar, modifiers: [SIZE] }),
    product({ id: 'itm_010', ar: 'آيس سبانش لاتيه', en: 'Iced Spanish Latte', cat: 'cat_cold', price: 23, cost: 5.9, sku: 'CLD-ISP', barcode: '6287001000103', track: false, prep: true, group: bar, modifiers: espressoMods }),
    product({ id: 'itm_011', ar: 'ماتشا لاتيه', en: 'Matcha Latte', cat: 'cat_tea', price: 22, cost: 6.2, sku: 'TEA-MTC', barcode: '6287001000110', track: false, prep: true, group: bar, modifiers: [SIZE, MILK] }),
    product({ id: 'itm_012', ar: 'شاي كرك', en: 'Karak Tea', cat: 'cat_tea', price: 9, cost: 1.8, sku: 'TEA-KRK', barcode: '6287001000127', track: false, prep: true, group: bar, modifiers: [SUGAR] }),
    product({ id: 'itm_013', ar: 'كرواسون بالزبدة', en: 'Butter Croissant', cat: 'cat_bakery', price: 12, cost: 4.2, sku: 'BAK-CRO', barcode: '6287001000134', vendor: 'ven_003', stock: 60, min: 15, prep: true, group: kitchen, modifiers: [WARMED] }),
    product({ id: 'itm_014', ar: 'كرواسون زعتر', en: 'Zaatar Croissant', cat: 'cat_bakery', price: 13, cost: 4.5, sku: 'BAK-ZTR', barcode: '6287001000141', vendor: 'ven_003', stock: 40, min: 12, prep: true, group: kitchen, modifiers: [WARMED] }),
    product({ id: 'itm_015', ar: 'كوكيز شوكولاتة', en: 'Chocolate Chip Cookie', cat: 'cat_bakery', price: 9, cost: 2.6, sku: 'BAK-CKE', barcode: '6287001000158', vendor: 'ven_003', stock: 8, min: 20 }),
    product({ id: 'itm_016', ar: 'كيكة التمر', en: 'Date Cake', cat: 'cat_dessert', price: 18, cost: 5.5, sku: 'DST-DTC', barcode: '6287001000165', vendor: 'ven_003', stock: 24, min: 8, prep: true, group: kitchen }),
    product({ id: 'itm_017', ar: 'سان سباستيان تشيزكيك', en: 'San Sebastián Cheesecake', cat: 'cat_dessert', price: 26, cost: 8.4, sku: 'DST-SSC', barcode: '6287001000172', vendor: 'ven_003', stock: 0, min: 6, prep: true, group: kitchen }),
    product({ id: 'itm_018', ar: 'بن إثيوبي يرغاتشيفي ٢٥٠ج', en: 'Ethiopia Yirgacheffe 250g', cat: 'cat_beans', price: 85, cost: 38, sku: 'BNS-ETH-250', barcode: '6287001000189', vendor: 'ven_001', stock: 34, min: 10 }),
    product({ id: 'itm_019', ar: 'بن كولومبي ٢٥٠ج', en: 'Colombia Huila 250g', cat: 'cat_beans', price: 78, cost: 34, sku: 'BNS-COL-250', barcode: '6287001000196', vendor: 'ven_001', stock: 22, min: 10 }),
    product({ id: 'itm_020', ar: 'بن خولاني سعودي ٢٥٠ج', en: 'Saudi Khawlani 250g', cat: 'cat_beans', price: 95, cost: 46, sku: 'BNS-KHW-250', barcode: '6287001000202', vendor: 'ven_001', stock: 6, min: 8 }),
    product({ id: 'itm_021', ar: 'مياه معدنية ٣٣٠ مل', en: 'Mineral Water 330ml', cat: 'cat_bev', price: 3, cost: 0.9, sku: 'BEV-WTR-330', barcode: '6281007012342', vendor: 'ven_002', stock: 240, min: 48 }),
    product({ id: 'itm_022', ar: 'مياه غازية ٢٥٠ مل', en: 'Sparkling Water 250ml', cat: 'cat_bev', price: 7, cost: 2.4, sku: 'BEV-SPK-250', barcode: '6281007012359', vendor: 'ven_002', stock: 36, min: 24 }),
    {
      id: 'itm_101', kind: 'service', nameAr: 'ورشة تحضير القهوة المقطرة', nameEn: 'Home Brewing Workshop',
      categoryId: 'cat_class', description: 'Two hours, V60 and Chemex, beans included.', imageUrl: null,
      priceH: 25000, costH: 6000, showOnPos: true, requiresPreparation: false, printGroupId: null,
      status: 'active', durationMinutes: 120, providerId: 'stf_003', ...stamps(),
    } as Service,
    combo({
      id: 'itm_201', ar: 'كومبو الفطور', en: 'Breakfast Combo', cat: 'cat_combo', price: 26, sku: 'CMB-BRKF',
      desc: 'A pastry, a coffee and water — before 11am.',
      slots: [
        slot('sl_pastry', 'المخبوز', 'Pastry', 'itm_013', [['itm_014', 1], ['itm_015', 0]]),
        slot('sl_coffee', 'القهوة', 'Coffee', 'itm_002', [['itm_003', 3], ['itm_004', 4], ['itm_005', 5], ['itm_012', 0]]),
        slot('sl_water', 'المياه', 'Water', 'itm_021', [['itm_022', 3]]),
      ],
    }),
  ];

  const customers = [
    customer('cus_001', 'شركة المدار للاستشارات', 'Al-Madar Consulting (Corporate)', '+966 11 220 8899', 'accounts@almadar.example', 1320, 5000),
    customer('cus_002', 'محمد الحسن', 'Mohammed Al-Hassan', '+966 55 987 6543', 'm.hassan@example.com', 0, 500),
    customer('cus_003', 'سارة عبدالله', 'Sara Abdullah', '+966 53 445 2211', 'sara.a@example.com', 75, 300),
    customer('cus_004', 'فندق الريتز — المشتريات', 'Hotel Procurement — Olaya', '+966 11 802 8020', 'purchasing@hotel.example', 2450, 15000),
    customer('cus_005', 'عبدالرحمن السبيعي', 'Abdulrahman Al-Subaie', '+966 50 334 1180', 'a.subaie@example.com', 0, 0),
  ];

  const discounts = [
    discount({ id: 'dsc_001', nameAr: 'خصم الولاء ١٠٪', nameEn: 'Loyalty 10%', type: 'percentage', value: 1000, maxAmountH: 3000, description: 'Loyalty members, any order.', usageCount: 64 }),
    discount({ id: 'dsc_002', nameAr: 'خصم الموظفين ٢٥٪', nameEn: 'Staff 25%', type: 'percentage', value: 2500, maxAmountH: 5000,
      allowedRoleIds: ['rol_owner', 'rol_manager'], requiresApprovalAboveH: 4000, description: 'Staff drinks. Manager approval above SAR 40.', usageCount: 21 }),
    discount({ id: 'dsc_003', nameAr: 'قهوة الصباح — ٥ ريال', nameEn: 'Morning Coffee SAR 5 off', type: 'fixed', value: 500, minOrderH: 2000, description: 'Before 10am, orders over SAR 20.', usageCount: 112 }),
    discount({ id: 'dsc_004', nameAr: 'عرض اليوم الوطني', nameEn: 'National Day 15%', type: 'percentage', value: 1500, status: 'inactive',
      startsAt: '2026-09-20T00:00:00.000Z', endsAt: '2026-09-25T00:00:00.000Z', description: 'Ended campaign, kept for reporting.', usageCount: 389 }),
  ];

  const kitchenOrders: KitchenOrder[] = [
    { id: 'kor_001', orderNumber: 'INV-1042', createdAt: minutesAgo(2), status: 'open', customerName: 'Mohammed Al-Hassan', orderType: 'dine_in', totalH: 5900,
      items: [
        { id: 'koi_1', productId: 'itm_005', nameAr: 'سبانش لاتيه', nameEn: 'Spanish Latte · Large · Oat milk', quantity: 2, completedQuantity: 0, note: 'Oat milk' },
        { id: 'koi_2', productId: 'itm_013', nameAr: 'كرواسون بالزبدة', nameEn: 'Butter Croissant · Warmed', quantity: 1, completedQuantity: 0, note: 'Warmed' },
      ], updatedAt: minutesAgo(2) },
    { id: 'kor_002', orderNumber: 'INV-1043', createdAt: minutesAgo(7), status: 'preparing', customerName: null, orderType: 'takeaway', totalH: 6200,
      items: [
        { id: 'koi_3', productId: 'itm_008', nameAr: 'آيس لاتيه', nameEn: 'Iced Latte · Medium', quantity: 3, completedQuantity: 2, note: 'Less ice' },
        { id: 'koi_4', productId: 'itm_001', nameAr: 'إسبريسو', nameEn: 'Espresso', quantity: 1, completedQuantity: 0, note: '' },
      ], updatedAt: minutesAgo(4) },
    { id: 'kor_003', orderNumber: 'INV-1044', createdAt: minutesAgo(13), status: 'preparing', customerName: 'Sara Abdullah', orderType: 'delivery', totalH: 4400,
      items: [
        { id: 'koi_5', productId: 'itm_006', nameAr: 'قهوة سعودية — دلة', nameEn: 'Saudi Coffee — Dallah', quantity: 1, completedQuantity: 0, note: 'Medium sugar' },
        { id: 'koi_6', productId: 'itm_016', nameAr: 'كيكة التمر', nameEn: 'Date Cake', quantity: 1, completedQuantity: 0, note: '' },
      ], updatedAt: minutesAgo(9) },
    { id: 'kor_004', orderNumber: 'INV-1045', createdAt: minutesAgo(1), status: 'open', customerName: null, orderType: 'dine_in', totalH: 2700,
      items: [{ id: 'koi_7', productId: 'itm_012', nameAr: 'شاي كرك', nameEn: 'Karak Tea', quantity: 3, completedQuantity: 0, note: '' }],
      updatedAt: minutesAgo(1) },
    { id: 'kor_005', orderNumber: 'INV-1041', createdAt: minutesAgo(18), status: 'ready', customerName: 'Al-Madar Consulting', orderType: 'takeaway', totalH: 9600,
      items: [{ id: 'koi_8', productId: 'itm_007', nameAr: 'في ٦٠', nameEn: 'V60 Pour-over', quantity: 4, completedQuantity: 4, note: 'Ethiopia beans' }],
      updatedAt: minutesAgo(3) },
  ];

  const printGroups: PrintGroup[] = [
    { id: 'pgr_bar', nameAr: 'البار', nameEn: 'Espresso Bar', ticketTitle: 'BAR', sortOrder: 1, status: 'active', ...stamps() },
    { id: 'pgr_kitchen', nameAr: 'المطبخ', nameEn: 'Pastry Kitchen', ticketTitle: 'KITCHEN', sortOrder: 2, status: 'active', ...stamps() },
    { id: 'pgr_packing', nameAr: 'التغليف', nameEn: 'Packing', ticketTitle: 'PACKING', sortOrder: 3, status: 'active', ...stamps() },
  ];

  return {
    company, branches, roles: builtInRoles(), users, vendors, staff, categories, catalog, customers,
    discounts, kitchenOrders, printGroups,
    branchStockShare: { brn_001: 1, brn_002: 0.6, brn_003: 0.45 },
  };
}

/* ========================================================================== */
/* Tenant 2 — Najd Express Supermarket (Retail, multi-terminal)                */
/* ========================================================================== */

function najd(): TenantSeed {
  const company: CompanyProfile = {
    nameEn: 'Najd Express Supermarket',
    nameAr: 'أسواق نجد إكسبرس',
    description: 'Neighbourhood groceries, open 24 hours.',
    logoUrl: null,
    crNumber: '1010987654',
    vatNumber: '311045678900003',
    phone: '+966 11 210 7700',
    email: 'care@najdmarket.sa',
    website: 'najdmarket.sa',
    address: { street: 'Anas Ibn Malik Road', district: 'Al Malqa', city: 'Riyadh', postalCode: '13521', country: 'SA' },
    social: { instagram: '@najdmarket', facebook: '', x: '@najdmarket', tiktok: '', linkedin: '', youtube: '' },
    ...stamps(),
  };

  const branches = [
    branch('brn_001', 'فرع الملقا — الرياض', 'Riyadh — Al Malqa', 'RUH-MLQ', 'Riyadh', '+966 11 210 7700'),
    branch('brn_002', 'فرع النسيم — الرياض', 'Riyadh — Al Naseem', 'RUH-NSM', 'Riyadh', '+966 11 210 7710'),
    branch('brn_003', 'فرع بريدة — القصيم', 'Buraidah — Qassim', 'QSM-BRD', 'Buraidah', '+966 16 380 4410'),
  ];
  const all = branches.map((b) => b.id);

  const users = [
    user({ id: 'usr_nj_admin', first: 'Khalid', last: 'Al-Otaibi', ar: 'خالد العتيبي', username: 'khalid',
      email: 'admin@najdmarket.sa', phone: '+966 50 222 3001', emp: 'NJ-001', role: 'rol_owner', branches: all }),
    user({ id: 'usr_nj_manager', first: 'Abdullah', last: 'Al-Mutairi', ar: 'عبدالله المطيري', username: 'abdullah',
      email: 'malqa.manager@najdmarket.sa', phone: '+966 55 222 3002', emp: 'NJ-002', role: 'rol_manager', branches: ['brn_001'] }),
    user({ id: 'usr_nj_cashier', first: 'Lama', last: 'Al-Anazi', ar: 'لمى العنزي', username: 'lama',
      email: 'cashier@najdmarket.sa', phone: '+966 53 222 3003', emp: 'NJ-003', role: 'rol_cashier', branches: ['brn_001'] }),
    user({ id: 'usr_nj_stock', first: 'Turki', last: 'Al-Dosari', ar: 'تركي الدوسري', username: 'turki',
      email: 'stock@najdmarket.sa', phone: '+966 56 222 3004', emp: 'NJ-004', role: 'rol_inventory', branches: all }),
  ];

  const vendors = [
    vendor('ven_001', 'المراعي', 'Almarai Retail Distribution', 'Saud Al-Harthi', '+966 11 470 0000', 'retail@almarai.example', '300000111100003', 'Riyadh'),
    vendor('ven_002', 'نادك', 'NADEC Trade', 'Bader Al-Shehri', '+966 11 402 9000', 'trade@nadec.example', '300000222200003', 'Riyadh'),
    vendor('ven_003', 'شركة الجزيرة للمواد الغذائية', 'Al-Jazeera Foodstuff Trading', 'Nasser Al-Yami', '+966 12 650 1100', 'sales@aljazeera-food.example', '300000333300003', 'Jeddah'),
    vendor('ven_004', 'المنظفات الحديثة', 'Modern Household Supplies', 'Waleed Al-Saleh', '+966 13 830 2244', 'orders@modhouse.example', '300000444400003', 'Dammam'),
  ];

  const categories = [
    category('cat_dairy', 'ألبان وأجبان', 'Dairy & Cheese', 1),
    category('cat_bakery', 'مخبوزات', 'Bakery', 2),
    category('cat_bev', 'مشروبات', 'Beverages', 3),
    category('cat_produce', 'خضار وفواكه', 'Fresh Produce', 4),
    category('cat_pantry', 'مواد غذائية', 'Pantry', 5),
    category('cat_snacks', 'وجبات خفيفة', 'Snacks', 6),
    category('cat_house', 'منظفات', 'Household', 7),
    category('cat_care', 'عناية شخصية', 'Personal Care', 8),
  ];

  const catalog: CatalogItem[] = [
    product({ id: 'itm_001', ar: 'حليب طازج كامل الدسم ١ لتر', en: 'Fresh Milk Full Fat 1L', cat: 'cat_dairy', price: 7, cost: 5.2, sku: 'DRY-MLK-1L', barcode: '6281007000011', vendor: 'ven_001', unit: 'litre', stock: 180, min: 60 }),
    product({ id: 'itm_002', ar: 'لبن ١ لتر', en: 'Laban 1L', cat: 'cat_dairy', price: 6.5, cost: 4.8, sku: 'DRY-LBN-1L', barcode: '6281007000028', vendor: 'ven_001', unit: 'litre', stock: 140, min: 48 }),
    product({ id: 'itm_003', ar: 'زبادي طبيعي ١٧٠ج', en: 'Plain Yoghurt 170g', cat: 'cat_dairy', price: 1.75, cost: 1.15, sku: 'DRY-YGT-170', barcode: '6281007000035', vendor: 'ven_002', stock: 320, min: 96 }),
    product({ id: 'itm_004', ar: 'جبنة شيدر شرائح ٢٠٠ج', en: 'Cheddar Slices 200g', cat: 'cat_dairy', price: 13.5, cost: 9.8, sku: 'DRY-CHD-200', barcode: '6281007000042', vendor: 'ven_001', stock: 44, min: 24 }),
    product({ id: 'itm_005', ar: 'بيض طازج ٣٠ حبة', en: 'Fresh Eggs 30pcs', cat: 'cat_dairy', price: 21.95, cost: 17.1, sku: 'DRY-EGG-30', barcode: '6281007000059', vendor: 'ven_002', unit: 'box', stock: 12, min: 20 }),
    product({ id: 'itm_006', ar: 'خبز صامولي ٦ حبات', en: 'Samoli Bread 6pcs', cat: 'cat_bakery', price: 4, cost: 2.6, sku: 'BKY-SAM-6', barcode: '6281007000066', vendor: 'ven_003', unit: 'pack', stock: 90, min: 40 }),
    product({ id: 'itm_007', ar: 'خبز توست أبيض', en: 'White Toast Bread', cat: 'cat_bakery', price: 6, cost: 4.1, sku: 'BKY-TST-W', barcode: '6281007000073', vendor: 'ven_003', unit: 'pack', stock: 55, min: 30 }),
    product({ id: 'itm_008', ar: 'مياه ٦٠٠ مل × ١٢', en: 'Water 600ml × 12', cat: 'cat_bev', price: 9.5, cost: 6.4, sku: 'BEV-WTR-12', barcode: '6281007000080', vendor: 'ven_003', unit: 'pack', stock: 260, min: 80 }),
    product({ id: 'itm_009', ar: 'عصير برتقال ١ لتر', en: 'Orange Juice 1L', cat: 'cat_bev', price: 8.25, cost: 5.9, sku: 'BEV-OJ-1L', barcode: '6281007000097', vendor: 'ven_001', unit: 'litre', stock: 75, min: 30 }),
    product({ id: 'itm_010', ar: 'مشروب غازي ٣٢٠ مل', en: 'Cola Can 320ml', cat: 'cat_bev', price: 2.5, cost: 1.6, sku: 'BEV-COL-320', barcode: '6281007000103', vendor: 'ven_003', stock: 480, min: 120 }),
    product({ id: 'itm_011', ar: 'موز — للكيلو', en: 'Bananas (per kg)', cat: 'cat_produce', price: 6.95, cost: 4.2, sku: 'PRD-BAN-KG', barcode: '2000011000001', vendor: 'ven_003', unit: 'kg', stock: 85, min: 30 }),
    product({ id: 'itm_012', ar: 'طماطم — للكيلو', en: 'Tomatoes (per kg)', cat: 'cat_produce', price: 4.5, cost: 2.9, sku: 'PRD-TOM-KG', barcode: '2000012000000', vendor: 'ven_003', unit: 'kg', stock: 18, min: 25 }),
    product({ id: 'itm_013', ar: 'تمر سكري ١ كجم', en: 'Sukkari Dates 1kg', cat: 'cat_produce', price: 38, cost: 26, sku: 'PRD-DTS-1K', barcode: '6281007000110', vendor: 'ven_003', unit: 'box', stock: 40, min: 10 }),
    product({ id: 'itm_014', ar: 'أرز بسمتي ٥ كجم', en: 'Basmati Rice 5kg', cat: 'cat_pantry', price: 54.95, cost: 41, sku: 'PNT-RCE-5K', barcode: '6281007000127', vendor: 'ven_003', unit: 'pack', stock: 64, min: 20 }),
    product({ id: 'itm_015', ar: 'زيت دوار الشمس ١.٨ لتر', en: 'Sunflower Oil 1.8L', cat: 'cat_pantry', price: 22.5, cost: 17.2, sku: 'PNT-OIL-18', barcode: '6281007000134', vendor: 'ven_003', unit: 'litre', stock: 38, min: 24 }),
    product({ id: 'itm_016', ar: 'سكر أبيض ٢ كجم', en: 'White Sugar 2kg', cat: 'cat_pantry', price: 9.75, cost: 7.3, sku: 'PNT-SGR-2K', barcode: '6281007000141', vendor: 'ven_003', unit: 'pack', stock: 0, min: 20 }),
    product({ id: 'itm_017', ar: 'معكرونة سباغيتي ٤٥٠ج', en: 'Spaghetti 450g', cat: 'cat_pantry', price: 3.95, cost: 2.5, sku: 'PNT-SPG-450', barcode: '6281007000158', vendor: 'ven_003', stock: 150, min: 40 }),
    product({ id: 'itm_018', ar: 'شيبس ملح ١٦٠ج', en: 'Potato Chips Salted 160g', cat: 'cat_snacks', price: 7.5, cost: 5.1, sku: 'SNK-CHP-160', barcode: '6281007000165', vendor: 'ven_003', stock: 96, min: 30 }),
    product({ id: 'itm_019', ar: 'شوكولاتة بالحليب ٩٠ج', en: 'Milk Chocolate Bar 90g', cat: 'cat_snacks', price: 6.25, cost: 4.0, sku: 'SNK-CHC-90', barcode: '6281007000172', vendor: 'ven_003', stock: 7, min: 24 }),
    product({ id: 'itm_020', ar: 'منظف أطباق ١ لتر', en: 'Dishwashing Liquid 1L', cat: 'cat_house', price: 11.5, cost: 7.9, sku: 'HSE-DSH-1L', barcode: '6281007000189', vendor: 'ven_004', unit: 'litre', stock: 46, min: 18 }),
    product({ id: 'itm_021', ar: 'مناديل ورقية × ٥', en: 'Facial Tissues × 5', cat: 'cat_house', price: 16.95, cost: 12.0, sku: 'HSE-TIS-5', barcode: '6281007000196', vendor: 'ven_004', unit: 'pack', stock: 70, min: 25 }),
    product({ id: 'itm_022', ar: 'مسحوق غسيل ٣ كجم', en: 'Laundry Powder 3kg', cat: 'cat_house', price: 32.5, cost: 24.8, sku: 'HSE-LND-3K', barcode: '6281007000202', vendor: 'ven_004', unit: 'pack', stock: 28, min: 12 }),
    product({ id: 'itm_023', ar: 'شامبو ٤٠٠ مل', en: 'Shampoo 400ml', cat: 'cat_care', price: 18.95, cost: 12.6, sku: 'CRE-SHP-400', barcode: '6281007000219', vendor: 'ven_004', unit: 'ml', stock: 33, min: 12 }),
    product({ id: 'itm_024', ar: 'معجون أسنان ١٠٠ مل', en: 'Toothpaste 100ml', cat: 'cat_care', price: 9.25, cost: 6.0, sku: 'CRE-TPS-100', barcode: '6281007000226', vendor: 'ven_004', stock: 58, min: 20 }),
  ];

  const customers = [
    customer('cus_001', 'مطعم البيت النجدي', 'Al-Bait Al-Najdi Restaurant', '+966 11 455 0101', 'purchasing@albait.example', 3890, 10000),
    customer('cus_002', 'أم فهد', 'Umm Fahad', '+966 50 600 1100', '', 120, 500),
    customer('cus_003', 'سعد القحطاني', 'Saad Al-Qahtani', '+966 55 600 2200', 's.qahtani@example.com', 0, 300),
    customer('cus_004', 'مدارس النخبة الأهلية', 'Al-Nukhba Private Schools', '+966 11 455 0202', 'finance@nukhba-schools.example', 6420, 20000),
  ];

  const discounts = [
    discount({ id: 'dsc_001', nameAr: 'عرض نهاية الأسبوع ٥٪', nameEn: 'Weekend 5%', type: 'percentage', value: 500, maxAmountH: 5000, description: 'Thursday to Saturday.', usageCount: 302 }),
    discount({ id: 'dsc_002', nameAr: '١٠ ريال على ٢٠٠', nameEn: 'SAR 10 off SAR 200+', type: 'fixed', value: 1000, minOrderH: 20000, description: 'Basket over SAR 200.', usageCount: 88 }),
    discount({ id: 'dsc_003', nameAr: 'خصم الموظفين ١٠٪', nameEn: 'Staff 10%', type: 'percentage', value: 1000,
      allowedRoleIds: ['rol_owner', 'rol_manager'], description: 'Staff purchases.', usageCount: 17 }),
  ];

  const printGroups: PrintGroup[] = [
    { id: 'pgr_packing', nameAr: 'التغليف والتوصيل', nameEn: 'Packing & Delivery', ticketTitle: 'PACKING', sortOrder: 1, status: 'active', ...stamps() },
  ];

  return {
    company, branches, roles: builtInRoles(), users, vendors,
    staff: [], categories, catalog, customers, discounts, kitchenOrders: [], printGroups,
    branchStockShare: { brn_001: 1, brn_002: 0.8, brn_003: 0.55 },
  };
}

/* ========================================================================== */
/* Tenant 3 — Lazeez Burger Co. (quick service, combos)                         */
/* ========================================================================== */

const FRIES_SIZE: ModifierGroup = {
  id: 'mg_fsize', nameAr: 'الحجم', nameEn: 'Size', required: true, multiple: false,
  options: [
    { id: 'mo_reg', nameAr: 'عادي', nameEn: 'Regular', priceDeltaH: 0, scale: 1 },
    { id: 'mo_lrg', nameAr: 'كبير', nameEn: 'Large', priceDeltaH: 300, scale: 1.5 },
  ],
  kind: 'size',
};

const DRINK_SIZE: ModifierGroup = {
  id: 'mg_dsize', nameAr: 'الحجم', nameEn: 'Size', required: true, multiple: false,
  options: [
    { id: 'mo_dreg', nameAr: 'عادي', nameEn: 'Regular', priceDeltaH: 0, scale: 1 },
    { id: 'mo_dlrg', nameAr: 'كبير', nameEn: 'Large', priceDeltaH: 200, scale: 1.5 },
  ],
  kind: 'size',
};

const BURGER_REMOVE: ModifierGroup = {
  id: 'mg_remove', nameAr: 'بدون', nameEn: 'Remove', required: false, multiple: true,
  options: [
    { id: 'mo_noonion', nameAr: 'بدون بصل', nameEn: 'No onion', priceDeltaH: 0, ingredientId: 'ing_onion' },
    { id: 'mo_nopickle', nameAr: 'بدون مخلل', nameEn: 'No pickles', priceDeltaH: 0, ingredientId: 'ing_pickle' },
    { id: 'mo_nosauce', nameAr: 'بدون صوص', nameEn: 'No sauce', priceDeltaH: 0, ingredientId: 'ing_sauce' },
  ],
  kind: 'remove',
};

const BURGER_EXTRA: ModifierGroup = {
  id: 'mg_bextra', nameAr: 'إضافات', nameEn: 'Add extra', required: false, multiple: true,
  options: [
    { id: 'mo_cheese', nameAr: 'جبنة إضافية', nameEn: 'Extra cheese', priceDeltaH: 200, ingredientId: 'ing_cheese', quantity: 1 },
    { id: 'mo_patty', nameAr: 'قطعة لحم إضافية', nameEn: 'Extra patty', priceDeltaH: 700, ingredientId: 'ing_patty', quantity: 1 },
    { id: 'mo_jalap', nameAr: 'هالبينو إضافي', nameEn: 'Extra jalapeños', priceDeltaH: 150, ingredientId: 'ing_jalap', quantity: 20 },
  ],
  kind: 'extra',
};

const SPICE: ModifierGroup = {
  id: 'mg_spice', nameAr: 'درجة الحرارة', nameEn: 'Spice level', required: true, multiple: false,
  options: [
    { id: 'mo_mild', nameAr: 'عادي', nameEn: 'Regular', priceDeltaH: 0 },
    { id: 'mo_spicy', nameAr: 'حار', nameEn: 'Spicy', priceDeltaH: 0 },
  ],
};

function lazeez(): TenantSeed {
  const company: CompanyProfile = {
    nameEn: 'Lazeez Burger Co.',
    nameAr: 'شركة لذيذ برجر',
    description: 'Smash burgers, crispy chicken and combos.',
    logoUrl: null,
    crNumber: '1010778899',
    vatNumber: '312345678900003',
    phone: '+966 11 520 3030',
    email: 'hello@lazeez.sa',
    website: 'lazeez.sa',
    address: { street: 'Prince Turki Road', district: 'Al Yasmin', city: 'Riyadh', postalCode: '13325', country: 'SA' },
    social: { instagram: '@lazeez.burger', facebook: '', x: '', tiktok: '@lazeez', linkedin: '', youtube: '' },
    ...stamps(),
  };

  const branches = [
    branch('brn_001', 'فرع الياسمين — الرياض', 'Riyadh — Al Yasmin', 'RUH-YSM', 'Riyadh', '+966 11 520 3030'),
    branch('brn_002', 'فرع النخيل — الرياض', 'Riyadh — Al Nakheel', 'RUH-NKH', 'Riyadh', '+966 11 520 3040'),
    branch('brn_003', 'فرع الكورنيش (سيارات) — الدمام', 'Dammam — Corniche Drive-thru', 'DMM-DRV', 'Dammam', '+966 13 810 2020'),
  ];
  const all = branches.map((b) => b.id);

  const users = [
    user({ id: 'usr_lz_owner', first: 'Saud', last: 'Al-Ghamdi', ar: 'سعود الغامدي', username: 'saud',
      email: 'owner@lazeez.sa', phone: '+966 50 333 4001', emp: 'LZ-001', role: 'rol_owner', branches: all }),
    user({ id: 'usr_lz_cashier', first: 'Nawaf', last: 'Al-Shehri', ar: 'نواف الشهري', username: 'nawaf',
      email: 'cashier@lazeez.sa', phone: '+966 53 333 4002', emp: 'LZ-002', role: 'rol_cashier', branches: ['brn_001'] }),
    user({ id: 'usr_lz_kitchen', first: 'Hamza', last: 'Qureshi', ar: 'حمزة قريشي', username: 'hamza',
      email: 'kitchen@lazeez.sa', phone: '+966 56 333 4003', emp: 'LZ-003', role: 'rol_kitchen', branches: ['brn_001'] }),
    user({ id: 'usr_lz_grill', first: 'Rajesh', last: 'Kumar', ar: 'راجيش كومار', username: 'rajesh',
      email: 'rajesh@lazeez.sa', phone: '+966 57 333 4004', emp: 'LZ-004', role: 'rol_kitchen', branches: ['brn_001'] }),
    user({ id: 'usr_lz_fry', first: 'Mohammed', last: 'Rahman', ar: 'محمد رحمن', username: 'mrahman',
      email: 'rahman@lazeez.sa', phone: '+966 57 333 4005', emp: 'LZ-005', role: 'rol_kitchen', branches: ['brn_002'] }),
    user({ id: 'usr_lz_cashier2', first: 'Jose', last: 'Santos', ar: 'خوسيه سانتوس', username: 'jose',
      email: 'jose@lazeez.sa', phone: '+966 58 333 4006', emp: 'LZ-006', role: 'rol_cashier', branches: ['brn_002'] }),
  ];

  const vendors = [
    vendor('ven_001', 'اللحوم الوطنية', 'National Meat Supply', 'Fahad Al-Jaber', '+966 11 400 1100', 'orders@nationalmeat.example', '300011100000003', 'Riyadh'),
    vendor('ven_002', 'مشروبات الخليج', 'Gulf Beverages Distribution', 'Ziad Hamdan', '+966 12 600 2200', 'sales@gulfbev.example', '300022200000003', 'Jeddah'),
    vendor('ven_003', 'البطاطس المجمدة', 'Frozen Foods Co.', 'Ayman Saleh', '+966 13 700 3300', 'b2b@frozen.example', '300033300000003', 'Dammam'),
  ];

  const categories = [
    category('cat_meals', 'الوجبات', 'Meals', 1),
    category('cat_burgers', 'برجر', 'Burgers', 2),
    category('cat_chicken', 'دجاج', 'Chicken', 3),
    category('cat_sides', 'أطباق جانبية', 'Sides', 4),
    category('cat_drinks', 'مشروبات', 'Drinks', 5),
    category('cat_dessert', 'حلويات', 'Desserts', 6),
  ];

  const kitchen = 'pgr_kitchen';
  const drinks = 'pgr_drinks';
  const burgerMods = [BURGER_REMOVE, BURGER_EXTRA];

  const sideChoices: [string, number][] = [['itm_008', 2], ['itm_009', 3], ['itm_010', 0]];
  const drinkChoices: [string, number][] = [['itm_012', 0], ['itm_013', 0], ['itm_014', 0], ['itm_015', 0], ['itm_016', 5], ['itm_017', 9]];

  const catalog: CatalogItem[] = [
    product({ id: 'itm_001', ar: 'برجر لحم كلاسيك', en: 'Classic Beef Burger', cat: 'cat_burgers', price: 18, cost: 6.2, sku: 'BRG-CLS', barcode: '6289001000011', track: false, prep: true, group: kitchen, modifiers: burgerMods }),
    product({ id: 'itm_002', ar: 'دبل سماش', en: 'Double Smash', cat: 'cat_burgers', price: 26, cost: 9.8, sku: 'BRG-DBL', barcode: '6289001000028', track: false, prep: true, group: kitchen, modifiers: burgerMods }),
    product({ id: 'itm_003', ar: 'برجر دجاج مقرمش', en: 'Crispy Chicken Burger', cat: 'cat_chicken', price: 17, cost: 5.6, sku: 'BRG-CHK', barcode: '6289001000035', track: false, prep: true, group: kitchen, modifiers: [SPICE, BURGER_REMOVE] }),
    product({ id: 'itm_004', ar: 'برجر مشروم سويس', en: 'Mushroom Swiss Burger', cat: 'cat_burgers', price: 22, cost: 7.9, sku: 'BRG-MSH', barcode: '6289001000042', track: false, prep: true, group: kitchen, modifiers: burgerMods }),
    product({ id: 'itm_005', ar: 'ناجتس ٦ قطع', en: 'Chicken Nuggets (6)', cat: 'cat_chicken', price: 14, cost: 4.1, sku: 'CHK-NUG6', barcode: '6289001000059', track: false, prep: true, group: kitchen }),
    product({ id: 'itm_006', ar: 'أجنحة حارة ٦ قطع', en: 'Spicy Wings (6)', cat: 'cat_chicken', price: 19, cost: 6.0, sku: 'CHK-WNG6', barcode: '6289001000066', track: false, prep: true, group: kitchen }),
    product({ id: 'itm_007', ar: 'بطاطس مقلية', en: 'Fries', cat: 'cat_sides', price: 7, cost: 1.6, sku: 'SID-FRY', barcode: '6289001000073', vendor: 'ven_003', stock: 400, min: 80, prep: true, group: kitchen, modifiers: [FRIES_SIZE] }),
    product({ id: 'itm_008', ar: 'بطاطس حلزونية', en: 'Curly Fries', cat: 'cat_sides', price: 9, cost: 2.1, sku: 'SID-CRL', barcode: '6289001000080', vendor: 'ven_003', stock: 160, min: 40, prep: true, group: kitchen, modifiers: [FRIES_SIZE] }),
    product({ id: 'itm_009', ar: 'حلقات البصل', en: 'Onion Rings', cat: 'cat_sides', price: 10, cost: 2.4, sku: 'SID-ONR', barcode: '6289001000097', vendor: 'ven_003', stock: 120, min: 30, prep: true, group: kitchen }),
    product({ id: 'itm_010', ar: 'كول سلو', en: 'Coleslaw', cat: 'cat_sides', price: 5, cost: 1.2, sku: 'SID-CLS', barcode: '6289001000103', stock: 60, min: 15, prep: true, group: kitchen }),
    product({ id: 'itm_011', ar: 'كوكاكولا ٣٣٠ مل', en: 'Coca-Cola 330ml', cat: 'cat_drinks', price: 4, cost: 1.3, sku: 'DRK-COKE', barcode: '5449000000996', vendor: 'ven_002', stock: 480, min: 96, group: drinks, modifiers: [DRINK_SIZE] }),
    product({ id: 'itm_012', ar: 'بيبسي ٣٣٠ مل', en: 'Pepsi 330ml', cat: 'cat_drinks', price: 4, cost: 1.3, sku: 'DRK-PEPSI', barcode: '6281006000111', vendor: 'ven_002', stock: 300, min: 96, group: drinks, modifiers: [DRINK_SIZE] }),
    product({ id: 'itm_013', ar: 'فانتا برتقال', en: 'Fanta Orange 330ml', cat: 'cat_drinks', price: 4, cost: 1.3, sku: 'DRK-FANTA', barcode: '5449000011527', vendor: 'ven_002', stock: 36, min: 48, group: drinks, modifiers: [DRINK_SIZE] }),
    product({ id: 'itm_014', ar: 'سبرايت', en: 'Sprite 330ml', cat: 'cat_drinks', price: 4, cost: 1.3, sku: 'DRK-SPRT', barcode: '5449000014535', vendor: 'ven_002', stock: 240, min: 48, group: drinks, modifiers: [DRINK_SIZE] }),
    product({ id: 'itm_015', ar: 'مياه ٣٣٠ مل', en: 'Water 330ml', cat: 'cat_drinks', price: 2, cost: 0.5, sku: 'DRK-WTR', barcode: '6281007012342', vendor: 'ven_002', stock: 600, min: 120, group: drinks }),
    product({ id: 'itm_016', ar: 'عصير برتقال طازج', en: 'Fresh Orange Juice', cat: 'cat_drinks', price: 9, cost: 2.8, sku: 'DRK-OJ', barcode: '6289001000110', track: false, prep: true, group: drinks }),
    product({ id: 'itm_017', ar: 'ميلك شيك فانيلا', en: 'Vanilla Milkshake', cat: 'cat_drinks', price: 14, cost: 3.9, sku: 'DRK-SHK', barcode: '6289001000127', track: false, prep: true, group: drinks }),
    product({ id: 'itm_018', ar: 'آيس كريم شوكولاتة', en: 'Chocolate Sundae', cat: 'cat_dessert', price: 8, cost: 2.0, sku: 'DST-SND', barcode: '6289001000134', track: false, prep: true, group: drinks }),
    combo({
      id: 'itm_101', ar: 'وجبة برجر كلاسيك', en: 'Classic Burger Meal', cat: 'cat_meals', price: 25, sku: 'MEAL-CLS', group: kitchen,
      desc: 'Burger, regular fries and a soft drink.',
      slots: [
        slot('sl_main', 'الساندويتش', 'Burger', 'itm_001', [['itm_003', 0], ['itm_004', 4], ['itm_002', 7]]),
        slot('sl_side', 'الطبق الجانبي', 'Side', 'itm_007', sideChoices),
        slot('sl_drink', 'المشروب', 'Drink', 'itm_011', drinkChoices),
      ],
    }),
    combo({
      id: 'itm_102', ar: 'وجبة دجاج مقرمش', en: 'Crispy Chicken Meal', cat: 'cat_meals', price: 24, sku: 'MEAL-CHK', group: kitchen,
      slots: [
        slot('sl_main', 'الساندويتش', 'Burger', 'itm_003', [['itm_001', 0]]),
        slot('sl_side', 'الطبق الجانبي', 'Side', 'itm_007', sideChoices),
        slot('sl_drink', 'المشروب', 'Drink', 'itm_011', drinkChoices),
      ],
    }),
    combo({
      id: 'itm_103', ar: 'وجبة دبل سماش', en: 'Double Smash Meal', cat: 'cat_meals', price: 32, sku: 'MEAL-DBL', group: kitchen,
      slots: [
        slot('sl_main', 'الساندويتش', 'Burger', 'itm_002', []),
        slot('sl_side', 'الطبق الجانبي', 'Side', 'itm_007', sideChoices),
        slot('sl_drink', 'المشروب', 'Drink', 'itm_011', drinkChoices),
      ],
    }),
    combo({
      id: 'itm_104', ar: 'وجبة أطفال ناجتس', en: 'Kids Nuggets Meal', cat: 'cat_meals', price: 18, sku: 'MEAL-KID', group: kitchen,
      desc: 'Nuggets, small fries, water and a sundae.',
      slots: [
        slot('sl_main', 'الوجبة', 'Main', 'itm_005', []),
        slot('sl_side', 'الطبق الجانبي', 'Side', 'itm_007', [['itm_010', 0]]),
        slot('sl_drink', 'المشروب', 'Drink', 'itm_015', [['itm_016', 4], ['itm_011', 1]]),
        slot('sl_treat', 'الحلى', 'Treat', 'itm_018', []),
      ],
    }),
    combo({
      id: 'itm_105', ar: 'صندوق العائلة', en: 'Family Box (4 people)', cat: 'cat_meals', price: 89, sku: 'MEAL-FAM', group: kitchen,
      desc: 'Four burgers, two large fries, nuggets and four drinks.',
      slots: [
        slot('sl_burgers', 'البرجر', 'Burgers', 'itm_001', [['itm_003', 0]], 4),
        slot('sl_fries', 'البطاطس', 'Fries', 'itm_007', [['itm_008', 2]], 2),
        slot('sl_nuggets', 'الناجتس', 'Nuggets', 'itm_005', [['itm_006', 4]]),
        slot('sl_drinks', 'المشروبات', 'Drinks', 'itm_011', drinkChoices.slice(0, 4), 4),
      ],
    }),
  ];

  const customers = [
    customer('cus_001', 'شركة ميدان للتقنية', 'Maidan Tech (office lunches)', '+966 11 455 7701', 'admin@maidan.example', 640, 3000),
    customer('cus_002', 'خالد الزهراني', 'Khalid Al-Zahrani', '+966 50 777 1122', '', 0, 0),
  ];

  const discounts = [
    discount({ id: 'dsc_001', nameAr: 'خصم الطلاب ١٠٪', nameEn: 'Student 10%', type: 'percentage', value: 1000, maxAmountH: 1500, description: 'With a valid student card.', usageCount: 214 }),
    discount({ id: 'dsc_002', nameAr: 'خصم الموظفين ٥٠٪', nameEn: 'Staff meal 50%', type: 'percentage', value: 5000, maxAmountH: 3000,
      allowedRoleIds: ['rol_owner', 'rol_manager'], description: 'One staff meal per shift.', usageCount: 66 }),
  ];

  const kitchenOrders: KitchenOrder[] = [
    { id: 'kor_001', orderNumber: 'K-201', createdAt: minutesAgo(3), status: 'open', customerName: null, orderType: 'takeaway', totalH: 2800,
      items: [
        { id: 'koi_1', productId: 'itm_001', nameAr: 'برجر لحم كلاسيك', nameEn: 'Classic Beef Burger · No onion', quantity: 1, completedQuantity: 0, note: '', baseAr: 'برجر لحم كلاسيك', baseEn: 'Classic Beef Burger', mods: [{ ar: 'بدون بصل', en: 'No onion' }], mealAr: 'وجبة برجر كلاسيك', mealEn: 'Classic Burger Meal' },
        { id: 'koi_2', productId: 'itm_007', nameAr: 'بطاطس مقلية', nameEn: 'Fries · Large', quantity: 1, completedQuantity: 0, note: '', baseAr: 'بطاطس مقلية', baseEn: 'Fries', mods: [{ ar: 'كبير', en: 'Large' }], mealAr: 'وجبة برجر كلاسيك', mealEn: 'Classic Burger Meal' },
        { id: 'koi_3', productId: 'itm_013', nameAr: 'فانتا', nameEn: 'Fanta Orange 330ml', quantity: 1, completedQuantity: 0, note: '', baseAr: 'فانتا', baseEn: 'Fanta Orange 330ml', mods: [], mealAr: 'وجبة برجر كلاسيك', mealEn: 'Classic Burger Meal' },
      ], updatedAt: minutesAgo(3) },
    { id: 'kor_002', orderNumber: 'K-200', createdAt: minutesAgo(9), status: 'preparing', customerName: 'Maidan Tech', orderType: 'delivery', totalH: 8900,
      items: [
        { id: 'koi_4', productId: 'itm_001', nameAr: 'برجر لحم كلاسيك', nameEn: 'Classic Beef Burger', quantity: 4, completedQuantity: 2, note: '', baseAr: 'برجر لحم كلاسيك', baseEn: 'Classic Beef Burger', mods: [], mealAr: 'صندوق العائلة', mealEn: 'Family Box' },
        { id: 'koi_5', productId: 'itm_007', nameAr: 'بطاطس مقلية', nameEn: 'Fries · Large', quantity: 2, completedQuantity: 0, note: '', baseAr: 'بطاطس مقلية', baseEn: 'Fries', mods: [{ ar: 'كبير', en: 'Large' }], mealAr: 'صندوق العائلة', mealEn: 'Family Box' },
        { id: 'koi_6', productId: 'itm_005', nameAr: 'ناجتس', nameEn: 'Chicken Nuggets (6)', quantity: 1, completedQuantity: 1, note: '', baseAr: 'ناجتس', baseEn: 'Chicken Nuggets (6)', mods: [], mealAr: 'صندوق العائلة', mealEn: 'Family Box' },
      ], updatedAt: minutesAgo(5) },
  ];

  const printGroups: PrintGroup[] = [
    { id: 'pgr_kitchen', nameAr: 'المطبخ', nameEn: 'Grill & Fry', ticketTitle: 'KITCHEN', sortOrder: 1, status: 'active', ...stamps() },
    { id: 'pgr_drinks', nameAr: 'المشروبات', nameEn: 'Drinks & Desserts', ticketTitle: 'DRINKS', sortOrder: 2, status: 'active', ...stamps() },
  ];

  return {
    company, branches, roles: builtInRoles(), users, vendors, staff: [], categories, catalog, customers,
    discounts, kitchenOrders, printGroups,
    branchStockShare: { brn_001: 1, brn_002: 0.7, brn_003: 0.5 },
  };
}

/* ========================================================================== */

const BUILDERS: Record<DemoTenantId, () => TenantSeed> = {
  ten_alnoor: alNoor,
  ten_najd: najd,
  ten_lazeez: lazeez,
};

/** A fresh deep copy of the tenant's factory data. Unknown ids fall back to tenant 1. */
export function seedFor(tenantId: string | null | undefined): TenantSeed {
  const id = ((tenantId ?? '') in BUILDERS ? tenantId : DEMO_TENANTS[0].id) as DemoTenantId;
  const seed = clone(BUILDERS[id]());
  /* Recipes live with the catalog item; the ingredient list is its own slice. */
  const recipes = recipesFor(id);
  seed.catalog = seed.catalog.map((item) => (recipes[item.id] ? { ...item, recipe: recipes[item.id] } : item));
  const full = { ...seed, ingredients: ingredientsFor(id, seed.branches.map((b) => b.id)) };
  if (SAMPLE_ACTIVITY) return full;
  const clean = cleanStart(full);
  return SERVER_CORE ? integerIds(clean) : clean;
}

/**
 * Hybrid mode: the server's primary keys are integers (branch 1, user 1, item 1 …). The same records here get the same
 * numbers, and every reference to them follows, so the browser database and the server agree.
 * Role ids stay as codes (rol_owner …): the program refers to them by name.
 */
function integerIds(seed: TenantSeed): TenantSeed {
  const map = new Map<string, string>();
  const number = (list: { id: string }[] | undefined) => (list ?? []).forEach((row, index) => map.set(row.id, String(index + 1)));
  number(seed.branches);
  number(seed.users);
  number(seed.categories);
  number((seed as unknown as { printGroups?: { id: string }[] }).printGroups);
  number(seed.catalog);
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return map.get(value) ?? value;
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, inner]) => [map.get(key) ?? key, walk(inner)]));
    }
    return value;
  };
  return walk(seed) as TenantSeed;
}

/**
 * Server builds start clean: the pages all stay, but customers (and so customers on credit), components (ingredients)
 * start empty, and the business has one branch. Items, combos, categories, users, roles and settings are kept.
 */
function cleanStart(seed: TenantSeed): TenantSeed {
  const first = seed.branches[0];
  const only = first ? [first] : [];
  const keep = new Set(only.map((b) => b.id));
  return {
    ...seed,
    branches: only,
    customers: [],
    ingredients: [],
    /* No sample records on a real business: discounts, vendors and commission staff are created by the owner. */
    discounts: [],
    vendors: [],
    staff: [],
    catalog: seed.catalog.map((item) => ({ ...item, recipe: [] })),
    users: seed.users.map((user) => ({
      ...user,
      /* Sample ID / health-card expiries and "last active" times are not real. */
      documents: [],
      nationality: undefined,
      lastActiveAt: null,
      branchIds: user.branchIds.filter((b: string) => keep.has(b)),
      defaultBranchId: user.defaultBranchId && keep.has(user.defaultBranchId) ? user.defaultBranchId : (first?.id ?? null),
    })),
  };
}
