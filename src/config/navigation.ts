import { isRemovedPath } from './features';
import {
  Boxes,
  Carrot,
  ChefHat,
  HandPlatter,
  Building2,
  Contact,
  FileText,
  LayoutGrid,
  Package,
  Landmark,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tags,
  Users,
  type LucideIcon,
  ScrollText,
  Smartphone,
  Gauge,
  Wallet,
  QrCode,
  UtensilsCrossed,
} from 'lucide-react';
import type { TranslationKey } from '@/i18n';
import type { PermissionKey, PermissionModule } from '@/types/permissions';
import { ROUTES } from '@/routes/paths';

export interface NavItem {
  id: string;
  /** Nested entries, rendered as a submenu under this one. */
  children?: { id: string; to: string; labelKey: TranslationKey }[];
  to: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  end?: boolean;
  /**
   * The module this entry belongs to. The entry appears only when the user
   * holds `<module>.view`, so the menu is derived from permissions rather than
   * maintained as a second list that drifts out of step.
   */
  module: PermissionModule;
  /** Hide the entry when this permission is held — e.g. the cashier's "Cash
      shift" shortcut is redundant for anyone who already has Finance. */
  hideWhen?: PermissionKey;
  /** Gate on a specific permission instead of `<module>.view`. */
  requires?: PermissionKey;
}

export interface NavSection {
  id: string;
  labelKey?: TranslationKey;
  items: NavItem[];
}

/**
 * The full menu. Everything here is filtered by permission before it renders —
 * see `visibleNavigation` below.
 */
const ALL_NAVIGATION: NavSection[] = [
  {
    id: 'operate',
    labelKey: 'nav.groupMain',
    items: [
      { id: 'dashboard', to: ROUTES.dashboard, labelKey: 'nav.dashboard', icon: LayoutGrid, module: 'dashboard' },
      { id: 'pos', to: ROUTES.pos, labelKey: 'nav.pos', icon: ShoppingCart, module: 'pos' },
      { id: 'kitchen', to: ROUTES.kitchen, labelKey: 'nav.kitchen', icon: ChefHat, module: 'kitchen' },
      { id: 'collection', to: ROUTES.collection, labelKey: 'nav.collection', icon: HandPlatter, module: 'kitchen' },
      { id: 'sales', to: ROUTES.sales, labelKey: 'nav.sales', icon: Receipt, module: 'sales' },
      { id: 'shift', to: ROUTES.shift, labelKey: 'nav.shift', icon: Wallet, module: 'shifts', hideWhen: 'finance.view' },
    ],
  },
  {
    id: 'restaurant',
    labelKey: 'nav.groupRestaurant',
    items: [
      {
        id: 'restaurant',
        to: ROUTES.restaurant,
        labelKey: 'nav.restaurant',
        icon: UtensilsCrossed,
        module: 'restaurant',
        requires: 'restaurant.session.view',
        children: [
          { id: 'restaurant-dashboard', to: ROUTES.restaurant, labelKey: 'rs.nav.dashboard' },
          { id: 'restaurant-open', to: ROUTES.restaurantOpen, labelKey: 'rs.nav.open' },
          { id: 'restaurant-session', to: ROUTES.restaurantSession, labelKey: 'rs.nav.current' },
          { id: 'restaurant-close', to: ROUTES.restaurantClose, labelKey: 'rs.nav.close' },
          { id: 'restaurant-history', to: ROUTES.restaurantHistory, labelKey: 'rs.nav.history' },
          { id: 'restaurant-cash', to: ROUTES.restaurantCash, labelKey: 'rs.nav.cash' },
        ],
      },
    ],
  },
  {
    id: 'manage',
    labelKey: 'nav.groupManage',
    items: [
      { id: 'catalog', to: ROUTES.catalog, labelKey: 'nav.catalog', icon: Package, module: 'products' },
      { id: 'inventory', to: ROUTES.inventory, labelKey: 'nav.inventory', icon: Boxes, module: 'inventory' },
      { id: 'ingredients', to: ROUTES.ingredients, labelKey: 'nav.ingredients', icon: Carrot, module: 'inventory' },
      { id: 'vendors', to: ROUTES.vendors, labelKey: 'nav.vendors', icon: Building2, module: 'vendors' },
      { id: 'customers', to: ROUTES.customers, labelKey: 'nav.customers', icon: Contact, module: 'customers' },
      { id: 'discounts', to: ROUTES.discounts, labelKey: 'nav.discounts', icon: Tags, module: 'discounts' },
      {
        id: 'finance',
        to: ROUTES.finance,
        labelKey: 'nav.finance',
        icon: Landmark,
        module: 'finance',
        /* Finance has eleven sections; a flat list of them in the sidebar
           would drown every other menu entry. */
        children: [
          { id: 'finance-overview', to: '/finance', labelKey: 'finance.tabs.overview' },
          { id: 'finance-branches', to: '/finance/branches', labelKey: 'branch.compare' },
          { id: 'finance-expenses', to: '/finance/expenses', labelKey: 'finance.tabs.expenses' },
          { id: 'finance-recurring', to: '/finance/recurring', labelKey: 'finance.tabs.recurring' },
          { id: 'finance-cash', to: '/finance/cash', labelKey: 'finance.tabs.cash' },
          { id: 'finance-credit', to: '/finance/credit', labelKey: 'finance.tabs.credit' },
          { id: 'finance-receivables', to: '/finance/receivables', labelKey: 'finance.tabs.receivables' },
          { id: 'finance-payables', to: '/finance/payables', labelKey: 'finance.tabs.payables' },
          { id: 'finance-payroll', to: '/finance/payroll', labelKey: 'finance.tabs.payroll' },
          { id: 'finance-commission', to: '/finance/commission', labelKey: 'commissionPage.title' },
          { id: 'finance-pnl', to: '/finance/profit-loss', labelKey: 'finance.tabs.pnl' },
          { id: 'finance-periods', to: '/finance/periods', labelKey: 'finance.tabs.opening' },
          { id: 'finance-ledger', to: '/finance/ledger', labelKey: 'finance.tabs.ledger' },
        ],
      },
      { id: 'zatca', to: ROUTES.zatca, labelKey: 'nav.zatca', icon: QrCode, module: 'zatca' },
    ],
  },
  {
    id: 'administer',
    labelKey: 'nav.groupSettings',
    items: [
      { id: 'users', to: ROUTES.users, labelKey: 'nav.users', icon: Users, module: 'users' },
      { id: 'roles', to: ROUTES.roles, labelKey: 'nav.roles', icon: ShieldCheck, module: 'roles' },
      { id: 'branches', to: ROUTES.branches, labelKey: 'nav.branches', icon: Building2, module: 'branches' },
      { id: 'company', to: ROUTES.company, labelKey: 'nav.company', icon: Store, module: 'company' },
      { id: 'bills', to: '/bills', labelKey: 'nav.billBuilder', icon: FileText, module: 'bill_builder' },
      { id: 'settings', to: ROUTES.settings, labelKey: 'nav.settings', icon: Settings, module: 'settings' },
      /* `module` selects the permission that gates the entry, so both hide
         themselves from anyone without the audit permissions. */
      { id: 'devices', to: ROUTES.devices, labelKey: 'nav.devices', icon: Smartphone, module: 'devices' },
      { id: 'audit', to: ROUTES.audit, labelKey: 'nav.audit', icon: ScrollText, module: 'audit' },
      { id: 'apiPerformance', to: ROUTES.apiPerformance, labelKey: 'nav.apiPerformance', icon: Gauge, module: 'audit' },
    ],
  },
];

/** The menu without the features switched off in config/features.ts (single branch hides branch comparison too). */
export const NAVIGATION: NavSection[] = ALL_NAVIGATION.map((section) => ({
  ...section,
  items: section.items
    .filter((item) => !isRemovedPath(item.to))
    .map((item) =>
      item.children
        ? {
            ...item,
            children: item.children.filter(
              (child) => !isRemovedPath(child.to),
            ),
          }
        : item,
    ),
})).filter((section) => section.items.length > 0);

export const NAV_ITEMS: NavItem[] = NAVIGATION.flatMap((section) => section.items);

/**
 * Filter the menu down to what a set of permissions actually unlocks. Sections
 * left with no items disappear entirely rather than rendering a bare heading.
 */
export function visibleNavigation(permissions: PermissionKey[]): NavSection[] {
  const held = new Set(permissions);

  return NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        held.has(item.requires ?? (`${item.module}.view` as PermissionKey)) &&
        !(item.hideWhen && held.has(item.hideWhen)),
    ),
  })).filter((section) => section.items.length > 0);
}

/**
 * What a route needs. A person may reach a page if they hold any one of these.
 *
 * The menu hides what someone cannot use, but a URL can still be typed or
 * bookmarked; this is what stops a cashier pasting /finance/profit-loss. Longest
 * prefix wins, so /finance/cash can be opened by a cashier with a shift while
 * the rest of /finance cannot.
 */
export const ROUTE_ACCESS: { prefix: string; anyOf: PermissionKey[] }[] = [
  { prefix: '/dashboard', anyOf: ['dashboard.view'] },
  { prefix: '/pos', anyOf: ['pos.view'] },
  { prefix: '/kitchen', anyOf: ['kitchen.view'] },
  { prefix: '/collection', anyOf: ['kitchen.view'] },
  { prefix: '/restaurant', anyOf: ['restaurant.session.view'] },
  { prefix: '/restaurant/history', anyOf: ['restaurant.session.view_history', 'restaurant.session.view_reports'] },
  { prefix: '/restaurant/cash', anyOf: ['restaurant.cash_movement.view', 'restaurant.cash_movement.create'] },
  { prefix: '/sales', anyOf: ['sales.view'] },
  { prefix: '/catalog', anyOf: ['products.view'] },
  { prefix: '/inventory', anyOf: ['inventory.view'] },
  { prefix: '/ingredients', anyOf: ['inventory.view'] },
  { prefix: '/vendors', anyOf: ['vendors.view'] },
  { prefix: '/customers', anyOf: ['customers.view'] },
  { prefix: '/discounts', anyOf: ['discounts.view'] },
  { prefix: '/finance/cash', anyOf: ['finance.view', 'shifts.view'] },
  { prefix: '/finance', anyOf: ['finance.view'] },
  { prefix: '/zatca', anyOf: ['zatca.view'] },
  { prefix: '/users', anyOf: ['users.view'] },
  { prefix: '/roles', anyOf: ['roles.view'] },
  { prefix: '/branches', anyOf: ['branches.view'] },
  { prefix: '/company-profile', anyOf: ['company.view'] },
  { prefix: '/bills', anyOf: ['bill_builder.view'] },
  { prefix: '/settings', anyOf: ['settings.view'] },
  { prefix: '/devices', anyOf: ['devices.view'] },
  { prefix: '/audit', anyOf: ['audit.view'] },
  { prefix: '/api-performance', anyOf: ['audit.performance', 'audit.view'] },
];

export function accessFor(pathname: string): PermissionKey[] | null {
  const match = ROUTE_ACCESS.filter((rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match?.anyOf ?? null;
}

/** The first page this person may open — where to send them instead of a dead end. */
export function firstAllowedPath(permissions: PermissionKey[]): string {
  const first = visibleNavigation(permissions)[0]?.items[0];
  return first?.to ?? '/profile';
}
