/**
 * The demo tenants and the accounts that sign in to them.
 *
 * In production this is the control plane's job (POSSA-API resolves which
 * tenant database an email belongs to). In mock mode this file *is* that
 * directory: one place listing every tenant and every predefined persona, used
 * by the login screen's persona drawer, the header persona switcher, the README
 * users matrix, and the mock auth service. Change a password here and all four
 * follow.
 */

export type DemoTenantId = 'ten_alnoor' | 'ten_najd' | 'ten_lazeez';

export interface DemoTenant {
  id: DemoTenantId;
  nameEn: string;
  nameAr: string;
  /** Subscription plan, as POSSA would report it. */
  planEn: string;
  planAr: string;
  industryEn: string;
  industryAr: string;
  /** Two letters for the workspace badge. */
  initials: string;
  /**
   * Modules switched off for this tenant by the control plane (POSSA feature
   * flags per plan and business type). A supermarket has no kitchen display.
   * Removed from every user's effective permissions, owner included.
   */
  disabledModules: string[];
}

export const DEMO_TENANTS: DemoTenant[] = [
  {
    id: 'ten_alnoor',
    nameEn: 'Al-Noor Specialty Coffee',
    nameAr: 'النور للقهوة المختصة',
    planEn: 'Enterprise plan',
    planAr: 'الباقة المؤسسية',
    industryEn: 'Café & roastery',
    industryAr: 'مقهى ومحمصة',
    initials: 'AN',
    disabledModules: [],
  },
  {
    id: 'ten_najd',
    nameEn: 'Najd Express Supermarket',
    nameAr: 'أسواق نجد إكسبرس',
    planEn: 'Multi-terminal retail plan',
    planAr: 'باقة التجزئة متعددة الأجهزة',
    industryEn: 'Supermarket',
    industryAr: 'سوبرماركت',
    initials: 'NE',
    disabledModules: ['kitchen'],
  },
  {
    id: 'ten_lazeez',
    nameEn: 'Lazeez Burger Co.',
    nameAr: 'لذيذ برجر',
    planEn: 'Quick-service plan',
    planAr: 'باقة الوجبات السريعة',
    industryEn: 'Burgers & combos',
    industryAr: 'برجر ووجبات',
    initials: 'LB',
    disabledModules: [],
  },
];

/** The shared demo password. Every persona uses it. */
export const DEMO_PASSWORD = 'Demo@1234';

export type PersonaIcon = 'owner' | 'manager' | 'cashier' | 'kitchen' | 'finance' | 'director' | 'stock';

export interface DemoAccount {
  userId: string;
  tenantId: DemoTenantId;
  email: string;
  password: string;
  /** Four digits, unique across the directory, for the terminal PIN pad. */
  pin: string | null;
  roleId: string;
  displayName: string;
  displayNameAr: string;
  /** What the persona card says this person is. */
  titleEn: string;
  titleAr: string;
  /** One line on what they can and cannot do. */
  scopeEn: string;
  scopeAr: string;
  icon: PersonaIcon;
  landingPath: string;
  /** Shown first on the login screen. Others are reachable from the switcher. */
  featured: boolean;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    userId: 'usr_an_owner', tenantId: 'ten_alnoor', email: 'owner@alnoor.sa', password: DEMO_PASSWORD, pin: null,
    roleId: 'rol_owner', displayName: 'Faisal Al-Rashid', displayNameAr: 'فيصل الراشد',
    titleEn: 'Tenant Owner', titleAr: 'المالك',
    scopeEn: 'Everything, every branch: finance, P&L, payroll, roles, settings.',
    scopeAr: 'كل شيء في كل الفروع: المالية والأرباح والرواتب والأدوار والإعدادات.',
    icon: 'owner', landingPath: '/dashboard', featured: true,
  },
  {
    userId: 'usr_an_manager', tenantId: 'ten_alnoor', email: 'manager@alnoor.sa', password: DEMO_PASSWORD, pin: null,
    roleId: 'rol_manager', displayName: 'Noura Al-Qahtani', displayNameAr: 'نورة القحطاني',
    titleEn: 'Branch Manager · Riyadh Flagship', titleAr: 'مديرة الفرع · العليا',
    scopeEn: 'Till, voids, discounts, stock and restock, shift close. No billing or company admin.',
    scopeAr: 'نقطة البيع والإلغاء والخصومات والمخزون وإغلاق الوردية. بدون الفوترة أو إدارة الشركة.',
    icon: 'manager', landingPath: '/dashboard', featured: true,
  },
  {
    userId: 'usr_an_cashier', tenantId: 'ten_alnoor', email: 'cashier@alnoor.sa', password: DEMO_PASSWORD, pin: '1111',
    roleId: 'rol_cashier', displayName: 'Yousef Al-Harbi', displayNameAr: 'يوسف الحربي',
    titleEn: 'Senior Cashier', titleAr: 'كاشير أول',
    scopeEn: 'Sell, open and close own shift, look up customers. No costs, P&L or settings.',
    scopeAr: 'البيع وفتح وإغلاق ورديته والبحث عن العملاء. بدون التكاليف أو الأرباح أو الإعدادات.',
    icon: 'cashier', landingPath: '/pos', featured: true,
  },
  {
    userId: 'usr_an_kitchen', tenantId: 'ten_alnoor', email: 'kitchen@alnoor.sa', password: DEMO_PASSWORD, pin: '2222',
    roleId: 'rol_kitchen', displayName: 'Omar Bakri', displayNameAr: 'عمر بكري',
    titleEn: 'Barista · Kitchen Display', titleAr: 'باريستا · شاشة المطبخ',
    scopeEn: 'The kitchen display only: see tickets, bump items and orders.',
    scopeAr: 'شاشة المطبخ فقط: عرض الطلبات وتحديث حالتها.',
    icon: 'kitchen', landingPath: '/kitchen', featured: true,
  },
  {
    userId: 'usr_an_accountant', tenantId: 'ten_alnoor', email: 'accountant@alnoor.sa', password: DEMO_PASSWORD, pin: null,
    roleId: 'rol_accountant', displayName: 'Huda Al-Shammari', displayNameAr: 'هدى الشمري',
    titleEn: 'Finance Controller', titleAr: 'المراقبة المالية',
    scopeEn: 'Ledger, expenses, AP/AR, commission, periods, ZATCA trail. Read-only at the till.',
    scopeAr: 'الأستاذ العام والمصروفات والذمم والعمولات والفترات وسجل زاتكا. قراءة فقط في نقطة البيع.',
    icon: 'finance', landingPath: '/finance', featured: true,
  },
  {
    userId: 'usr_nj_admin', tenantId: 'ten_najd', email: 'admin@najdmarket.sa', password: DEMO_PASSWORD, pin: null,
    roleId: 'rol_owner', displayName: 'Khalid Al-Otaibi', displayNameAr: 'خالد العتيبي',
    titleEn: 'Retail Operations Director', titleAr: 'مدير العمليات',
    scopeEn: 'A separate tenant: grocery catalog, barcodes, three branches. Proves isolation.',
    scopeAr: 'مستأجر منفصل: كتالوج بقالة وباركود وثلاثة فروع. يثبت عزل البيانات.',
    icon: 'director', landingPath: '/dashboard', featured: true,
  },
  {
    userId: 'usr_nj_cashier', tenantId: 'ten_najd', email: 'cashier@najdmarket.sa', password: DEMO_PASSWORD, pin: '3333',
    roleId: 'rol_cashier', displayName: 'Lama Al-Anazi', displayNameAr: 'لمى العنزي',
    titleEn: 'Cashier · Al Malqa', titleAr: 'كاشير · الملقا',
    scopeEn: 'Barcode-first grocery till on a Sunmi terminal.',
    scopeAr: 'نقطة بيع بالباركود على جهاز صنمي.',
    icon: 'cashier', landingPath: '/pos', featured: false,
  },
  {
    userId: 'usr_nj_stock', tenantId: 'ten_najd', email: 'stock@najdmarket.sa', password: DEMO_PASSWORD, pin: null,
    roleId: 'rol_inventory', displayName: 'Turki Al-Dosari', displayNameAr: 'تركي الدوسري',
    titleEn: 'Inventory Manager', titleAr: 'مسؤول المخزون',
    scopeEn: 'Receiving, stock counts and suppliers across all branches.',
    scopeAr: 'الاستلام والجرد والموردون في كل الفروع.',
    icon: 'stock', landingPath: '/inventory', featured: false,
  },
  {
    userId: 'usr_lz_owner', tenantId: 'ten_lazeez', email: 'owner@lazeez.sa', password: DEMO_PASSWORD, pin: null,
    roleId: 'rol_owner', displayName: 'Saud Al-Ghamdi', displayNameAr: 'سعود الغامدي',
    titleEn: 'Owner · Burger chain', titleAr: 'المالك · سلسلة برجر',
    scopeEn: 'Combo meals with swaps and upsizes: see them in Products and on the till.',
    scopeAr: 'وجبات كومبو مع الاستبدال والتكبير: في المنتجات ونقطة البيع.',
    icon: 'owner', landingPath: '/dashboard', featured: true,
  },
  {
    userId: 'usr_lz_cashier', tenantId: 'ten_lazeez', email: 'cashier@lazeez.sa', password: DEMO_PASSWORD, pin: '4444',
    roleId: 'rol_cashier', displayName: 'Nawaf Al-Shehri', displayNameAr: 'نواف الشهري',
    titleEn: 'Cashier · Front counter', titleAr: 'كاشير · الكاونتر',
    scopeEn: 'Build meals: swap the drink, make the fries large, sell.',
    scopeAr: 'تكوين الوجبات: تغيير المشروب وتكبير البطاطس والبيع.',
    icon: 'cashier', landingPath: '/pos', featured: true,
  },
  {
    userId: 'usr_lz_kitchen', tenantId: 'ten_lazeez', email: 'kitchen@lazeez.sa', password: DEMO_PASSWORD, pin: '5555',
    roleId: 'rol_kitchen', displayName: 'Hamza Qureshi', displayNameAr: 'حمزة قريشي',
    titleEn: 'Grill · Kitchen Display', titleAr: 'الشواية · شاشة المطبخ',
    scopeEn: 'Meal tickets broken into burger, side and drink.',
    scopeAr: 'تذاكر الوجبات مقسمة: برجر وطبق جانبي ومشروب.',
    icon: 'kitchen', landingPath: '/kitchen', featured: false,
  },
];

export function tenantById(id: string | null | undefined): DemoTenant | undefined {
  return DEMO_TENANTS.find((tenant) => tenant.id === id);
}

export function accountByEmail(email: string): DemoAccount | undefined {
  const needle = email.trim().toLowerCase();
  return DEMO_ACCOUNTS.find((account) => account.email === needle);
}

export function accountByPin(pin: string): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find((account) => account.pin !== null && account.pin === pin.trim());
}

export function accountByUserId(userId: string): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find((account) => account.userId === userId);
}
