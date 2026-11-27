export {
  API_BASE_URL,
  HttpError,
  createResourceService,
  http,
  safeCall,
  type RequestOptions,
} from './http';

export {
  catalogService,
  categoryService,
  staffService,
  type CatalogListQuery,
  type CatalogSummary,
} from './catalogService';

export {
  customerService,
  returnsService,
  salesService,
  type CommitSaleInput,
  type CustomerInput,
  type RecordPaymentInput,
  type ReturnInput,
} from './salesService';

export { branchService, roleService, userService } from './userService';

export {
  inventoryService,
  purchaseService,
  vendorService,
  type ReceiveStockInput,
  type RecordMovementInput,
  type VendorInput,
} from './inventoryService';
export { discountService, type ResolvedDiscount } from './discountService';
export { kitchenService } from './kitchenService';
export { ingredientService } from './ingredientService';
export { billTemplateService, companyService } from './companyService';
export { notificationService } from './notificationService';
export { printGroupService, printService } from './printService';
export { printerService, type PrintSaleInput } from './printerService';
export { settingsService } from './settingsService';
export { taxService, describeTax } from './taxService';
export { credit, debit, ledgerService, type LedgerQuery, type PostInput } from './ledgerService';
export { expenseCategoryService, expenseService, type ExpenseInput } from './expenseService';
export {
  drawerService,
  settlementService,
  type CloseDrawerInput,
  type OpenDrawerInput,
} from './cashService';
export {
  restaurantSessionService,
  type CashMovementInput,
  type CloseSessionInput,
  type HistoryFilter,
  type OpenSessionInput,
  type SessionActor,
} from './restaurantSessionService';
export { recurringService, type RecurringInput } from './recurringService';
export {
  commissionService,
  openingBalanceService,
  payrollService,
} from './payrollService';
export {
  balancePeriodService,
  type ClosePeriodInput,
  type OpenPeriodInput,
} from './balancePeriodService';

/*
 * Development-only test handle. Acceptance scripts drive the same service
 * instances the app uses (importing the module URL directly would load a
 * second copy with its own state). Stripped from production builds.
 */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  void Promise.all([
    import('./restaurantSessionService'),
    import('./salesService'),
    import('./catalogService'),
    import('@/types/permissions'),
    import('./kitchenService'),
    import('./taxService'),
    import('./printerService'),
    import('./discountService'),
    import('./expenseService'),
    import('./ledgerService'),
  ]).then(([rs, sales, catalog, perms, kitchen, tax, printers, discounts, expenses, ledger]) => {
    (window as unknown as Record<string, unknown>).__pos = {
      restaurantSessionService: rs.restaurantSessionService,
      salesService: sales.salesService,
      salesSnapshot: sales.salesSnapshot,
      catalogService: catalog.catalogService,
      ALL_PERMISSIONS: perms.ALL_PERMISSIONS,
      kitchenService: kitchen.kitchenService,
      taxService: tax.taxService,
      printerService: printers.printerService,
      discountService: discounts.discountService,
      returnsService: sales.returnsService,
      expenseService: expenses.expenseService,
      ledgerService: ledger.ledgerService,
    };
  });
}
