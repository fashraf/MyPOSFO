import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, PencilLine, ScanLine, ShoppingBag, X } from 'lucide-react';
import { Input } from '@/components/ui';
import { ModifierSheet } from '@/features/pos/ModifierSheet';
import { ComboSheet } from '@/features/pos/ComboSheet';
import { mealsFor } from '@/lib/combo';
import { ConfirmModal } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/cn';
import { uuidV4 } from '@/lib/zatca';
import { CartPanel } from '@/features/pos/CartPanel';
import { CheckoutModal, type CheckoutResult } from '@/features/pos/CheckoutModal';
import { OrderComplete } from '@/features/pos/OrderComplete';
import { CategoryScroller } from '@/features/pos/CategoryScroller';
import { ProductGrid } from '@/features/pos/ProductGrid';
import { usePosCart } from '@/features/pos/usePosCart';
import { useDisclosure } from '@/hooks/useDisclosure';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { ROUTES } from '@/routes/paths';
import {
  catalogService,
  categoryService,
  customerService,
  discountService,
  kitchenService,
  printGroupService,
  printService,
  printerService,
  settingsService,
  userService,
  safeCall,
  salesService,
} from '@/services';
import { isCombo, isProduct } from '@/types/catalog';
import type { CatalogItem, Category } from '@/types/catalog';
import type { Customer, Sale, SaleLine, SaleLineComponent, SaleLineModifier, SalePayment } from '@/types/sales';
import { buildPrintDocuments, groupsInOrder } from '@/types/printing';
import type { PrintGroup } from '@/types/printing';
import type { BranchSettings, KitchenRoute } from '@/types/settings';
import type { SaleOrderType } from '@/types/sales';
import type { PrintOutcome } from '@/types/printers';
import type { ReceiptSelection } from '@/features/printing/ReceiptChoice';
import type { User } from '@/types/permissions';
import { NO_APPROVAL, resolveAutomatic } from '@/types/discounts';
import type { DiscountApproval, DiscountableLine } from '@/types/discounts';
import type { ResolvedDiscount } from '@/services';
import { useSession } from '@/contexts/SessionContext';
import { RestaurantClosedBanner } from '@/features/restaurant/RestaurantClosedBanner';
import { useBranchSession } from '@/features/restaurant/shared';

/** Match against name, SKU, and barcode — whatever the cashier types or scans. */
function itemMatches(item: CatalogItem, term: string): boolean {
  const needle = term.trim().toLocaleLowerCase();
  if (!needle) return true;

  const fields = [item.nameAr, item.nameEn];
  if (isProduct(item)) fields.push(item.sku, item.barcode);

  return fields.some((field) => field?.toLocaleLowerCase().includes(needle));
}

/** Kitchen ticket lines for a basket: plain items as they are, meals exploded into components. */
function kitchenItemsFor(lines: SaleLine[], catalog: CatalogItem[], language: string) {
  const modifierText = (mods?: SaleLineModifier[]) =>
    (mods ?? []).map((m) => (language === 'ar' ? m.nameAr : m.nameEn)).join('، ');
  const withMods = (name: string, mods?: SaleLineModifier[]) =>
    mods && mods.length > 0 ? `${name} · ${mods.map((m) => m.nameEn).join(' · ')}` : name;

  return lines.flatMap((line) => {
    if (line.components && line.components.length > 0) {
      return line.components.map((component) => ({
        productId: component.itemId,
        nameAr: component.nameAr,
        nameEn: withMods(component.nameEn, component.modifiers),
        quantity: component.quantity * line.quantity,
        note: [`${language === 'ar' ? line.nameAr : line.nameEn}`, modifierText(component.modifiers)].filter(Boolean).join(' — '),
        baseAr: component.nameAr,
        baseEn: component.nameEn,
        mods: (component.modifiers ?? []).map((m) => ({ ar: m.nameAr, en: m.nameEn })),
        mealAr: line.nameAr,
        mealEn: line.nameEn,
      }));
    }
    const item = catalog.find((candidate) => candidate.id === line.itemId);
    if (!item?.requiresPreparation) return [];
    return [{
      productId: line.itemId,
      nameAr: line.nameAr,
      nameEn: withMods(line.nameEn, line.modifiers),
      quantity: line.quantity,
      note: modifierText(line.modifiers),
      baseAr: line.nameAr,
      baseEn: line.nameEn,
      mods: (line.modifiers ?? []).map((m) => ({ ar: m.nameAr, en: m.nameEn })),
    }];
  });
}

export default function PosPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const { role, activeBranch, user, can } = useSession();
  /* No open business session, no orders. The service refuses too; this just
     says so up front instead of at the payment screen. */
  const restaurant = useBranchSession();
  const restaurantClosed = !restaurant.loading && !restaurant.open;
  /* An accountant may open the till to look; only roles that sell may take payment. */
  const canSell = can('pos.create_sale');
  const sellerName = user ? (language === 'ar' ? user.nameAr : user.nameEn) : '—';
  /* Narrow screens show one pane at a time, switched by the bottom bar. */
  const [mobilePane, setMobilePane] = useState<'items' | 'cart'>('items');
  const [modifierItem, setModifierItem] = useState<CatalogItem | null>(null);
  const [comboItem, setComboItem] = useState<CatalogItem | null>(null);
  /* Editing an earlier order: what it was, and what was already paid on it. */
  const location = useLocation();
  const [editing, setEditing] = useState<Sale | null>(null);
  const [refundConfirm, setRefundConfirm] = useState(false);
  const paidBeforeH = editing ? editing.payments.reduce((sum, p) => sum + p.amountH, 0) : 0;
  /* One key per checkout attempt; a double-tapped Pay commits once. */
  const idempotencyKey = useRef<string>(uuidV4());
  const cart = usePosCart();
  const payment = useDisclosure();
  const scanRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [completedChangeH, setCompletedChangeH] = useState(0);
  const [sentToKitchen, setSentToKitchen] = useState(false);
  const [routedTo, setRoutedTo] = useState<KitchenRoute>('kitchen');
  const [printOutcome, setPrintOutcome] = useState<PrintOutcome | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printSelection, setPrintSelection] = useState<ReceiptSelection | null>(null);
  const [orderType, setOrderType] = useState<SaleOrderType>('takeaway');
  const [printGroups, setPrintGroups] = useState<PrintGroup[]>([]);
  const [settings, setSettings] = useState<BranchSettings | null>(null);
  const [staff, setStaff] = useState<User[]>([]);
  const [completedLines, setCompletedLines] = useState<typeof cart.lines>([]);
  const [discounts, setDiscounts] = useState<ResolvedDiscount[]>([]);
  const [approval, setApproval] = useState<DiscountApproval>(NO_APPROVAL);
  const [discountCapped, setDiscountCapped] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    const [itemResult, categoryResult, customerResult, printGroupResult, staffResult] =
      await Promise.all([
      safeCall(() => catalogService.posItems()),
      safeCall(() => categoryService.list()),
      safeCall(() => customerService.list()),
      safeCall(() => printGroupService.list()),
      safeCall(() => userService.list()),
    ]);

    if (itemResult.ok) setItems(itemResult.data);
    if (categoryResult.ok) setCategories(categoryResult.data);
    if (customerResult.ok) setCustomers(customerResult.data);
    if (printGroupResult.ok) setPrintGroups(printGroupResult.data);
    if (staffResult.ok) setStaff(staffResult.data.filter((user) => user.status === 'active'));

    if (activeBranch) {
      const settingsResult = await safeCall(() => settingsService.get(activeBranch.id));
      if (settingsResult.ok) {
        setSettings(settingsResult.data);
        setOrderType(settingsResult.data.defaultOrderType ?? 'takeaway');
      }
    }

    setLoading(false);
  }, [activeBranch]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Keep focus in the scan field: a hardware scanner is a keyboard, and it types
     wherever the caret happens to be. */
  useEffect(() => {
    if (payment.isOpen) return;
    scanRef.current?.focus();
  }, [payment.isOpen, items.length]);

  /* The basket, reduced to what a discount rule needs to reason about. */
  const discountableLines: DiscountableLine[] = useMemo(
    () =>
      cart.lines.map((line) => {
        const item = items.find((candidate) => candidate.id === line.itemId);
        return {
          itemId: line.itemId,
          categoryId: item?.categoryId ?? null,
          kind: line.kind,
          grossH: line.unitPriceH * line.quantity - line.discountH,
        };
      }),
    [cart.lines, items],
  );

  const basketGrossH = cart.totals.grossH;

  /* Re-resolve on every basket change: eligibility depends on what is in it, so
     a discount can become available part-way through a sale. */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await safeCall<ResolvedDiscount[]>(() =>
        discountService.resolveForCart({
          lines: discountableLines,
          basketTotalH: basketGrossH,
          roleId: role?.id ?? null,
          branchId: activeBranch?.id ?? null,
        }),
      );
      if (cancelled || !result.ok) return;
      setDiscounts(result.data);

      /* Automatic discounts apply themselves. The cashier is told which one
         and why, but is never asked to remember it exists. */
      const auto = resolveAutomatic(result.data);
      if (auto && cart.discountId !== auto.discount.id) {
        const manualChosen =
          cart.discountId !== null &&
          result.data.find((entry) => entry.discount.id === cart.discountId)?.discount
            .isAutomatic === false;

        /* A manual choice outranks an automatic one — the cashier made a
           deliberate decision and should not have it overwritten. */
        if (!manualChosen) {
          cart.setDiscount(auto.eligibility.amountH, auto.discount.id);
          setDiscountCapped(auto.eligibility.capped);
          setApproval(
            auto.eligibility.requiresApproval ? { ...NO_APPROVAL, state: 'pending' } : NO_APPROVAL,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [discountableLines, basketGrossH, role?.id, activeBranch?.id]);

  /**
   * Keep the applied amount honest as the basket changes.
   *
   * If the selected discount stops qualifying — an item was removed and the
   * basket dropped below the minimum — it is cleared rather than silently
   * left applied at a stale amount. Any approval is voided at the same time,
   * because it was granted for a different number.
   */
  useEffect(() => {
    if (!cart.discountId) return;

    const entry = discounts.find((candidate) => candidate.discount.id === cart.discountId);

    if (!entry || !entry.eligibility.eligible) {
      cart.setDiscount(0, null);
      setApproval(NO_APPROVAL);
      setDiscountCapped(false);
      return;
    }

    if (entry.eligibility.amountH !== cart.discountH) {
      cart.setDiscount(entry.eligibility.amountH, cart.discountId);
      setDiscountCapped(entry.eligibility.capped);
      /* The approved figure no longer matches, so approval must be sought again. */
      if (approval.state === 'approved') setApproval({ ...NO_APPROVAL, state: 'pending' });
    }
  }, [discounts, cart.discountId, cart.discountH, cart, approval.state]);

  /* Only categories that actually hold sellable items get a pill — an empty
     filter is a dead end the cashier has to back out of. */
  const categoryOptions = useMemo(() => {
    const used = new Set(items.map((item) => item.categoryId).filter(Boolean));

    return [
      { value: '', label: t('pos.allItems') },
      { value: 'products', label: t('pos.productsOnly') },
      { value: 'services', label: t('pos.servicesOnly') },
      ...categories
        .filter((category) => used.has(category.id))
        .map((category) => ({
          value: category.id,
          label: language === 'ar' ? category.nameAr : category.nameEn,
        })),
    ];
  }, [items, categories, language, t]);

  /* Grid follows the category order set in the back office (Meals first in a
     burger shop), then name — so tiles stay where the cashier's hand expects. */
  const visibleItems = useMemo(() => {
    const rank = new Map(categories.map((category, index) => [category.id, category.sortOrder ?? index]));
    const order = (id: string | null) => (id ? rank.get(id) ?? 999 : 1000);
    return items.filter((item) => {
      if (!itemMatches(item, search)) return false;
      if (filter === '') return true;
      if (filter === 'products') return item.kind === 'product';
      if (filter === 'services') return item.kind === 'service';
      return item.categoryId === filter;
    }).sort((a, b) => order(a.categoryId) - order(b.categoryId));
  }, [items, search, filter, categories]);

  const selectedCustomer = useMemo(
    () => customers.find((candidate) => candidate.id === cart.customerId) ?? null,
    [customers, cart.customerId],
  );

  function addItem(item: CatalogItem) {
    if (restaurantClosed) {
      toast.warning(t('rs.closedBanner'));
      return;
    }
    /* Refuse to oversell a tracked product rather than letting the cart go
       negative and failing at commit time. */
    if (isProduct(item) && item.trackInventory) {
      if (cart.quantityOf(item.id) >= item.stockQuantity) {
        toast.warning(t('pos.toast.maxStock'));
        return;
      }
    }
    /* A meal opens the meal builder. */
    if (isCombo(item)) {
      setComboItem(item);
      return;
    }
    /* Size, milk, extras — or the chance to make it a meal: ask once, in a sheet. */
    if ((item.modifierGroups && item.modifierGroups.length > 0) || mealsFor(item, items).length > 0) {
      setModifierItem(item);
      return;
    }
    cart.add(item);
  }

  function addWithModifiers(item: CatalogItem, modifiers: SaleLineModifier[], quantity: number) {
    cart.add(item, modifiers, { quantity });
  }

  function addCombo(combo: CatalogItem, components: SaleLineComponent[], quantity: number) {
    cart.add(combo, [], { components, quantity });
  }

  /* Opened from Sales → "Edit order": load the order into the cart. */
  useEffect(() => {
    const editId = (location.state as { editSaleId?: string } | null)?.editSaleId;
    if (!editId) return;
    void (async () => {
      const result = await safeCall(() => salesService.get(editId));
      if (!result.ok) return;
      if (await kitchenService.hasStarted(result.data.invoiceNumber)) {
        toast.warning(t('posEdit.kitchenStarted'));
        return;
      }
      cart.load(result.data.lines, result.data.customerId);
      setEditing(result.data);
      setMobilePane('cart');
    })();
    /* Consume the request so a reload does not re-open it. */
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  function cancelEditing() {
    setEditing(null);
    cart.clear();
    setMobilePane('items');
  }

  /**
   * A scanner ends its transmission with Enter. An exact barcode match adds the
   * item straight away and clears the field, so scanning ten items is ten scans
   * and nothing else.
   */
  function handleScanSubmit(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();

    const term = search.trim();
    if (!term) return;

    const exact = items.find(
      (item) => isProduct(item) && (item.barcode === term || item.sku === term),
    );
    const target = exact ?? (visibleItems.length === 1 ? visibleItems[0] : null);

    if (target) {
      addItem(target);
      setSearch('');
    }
  }

  /**
   * Commit the sale.
   *
   * Everything that has to happen together — the sale, the stock movement, the
   * kitchen ticket, the discount usage, and any balance settlement — is
   * sequenced here so no caller can perform half of it.
   */
  async function handleCheckout(result: CheckoutResult): Promise<boolean> {
    const payments: SalePayment[] = [];
    if (result.cardH > 0) payments.push({ method: 'card', amountH: result.cardH });
    if (result.cashH > 0) payments.push({ method: 'cash', amountH: result.cashH });
    if (result.creditH > 0) payments.push({ method: 'credit', amountH: result.creditH });

    const common = {
      lines: cart.lines,
      customerId: cart.customerId,
      servedByUserId: result.servedByUserId,
      discountH: cart.discountH,
      tenderedH: result.tenderedH,
      cashierName: sellerName,
      branchId: activeBranch?.id ?? null,
      idempotencyKey: idempotencyKey.current,
      orderType,
    };
    const dueNowH = Math.max(0, cart.totals.totalH - paidBeforeH);

    const saleResult = await safeCall(() =>
      editing
        ? salesService.replaceOrder(editing.id, { ...common, topUp: payments }, sellerName)
        : salesService.commit({
            ...common,
            payments: payments.length > 0 ? payments : [{ method: 'cash', amountH: dueNowH }],
          }),
    );

    if (!saleResult.ok) {
      toast.error(t('pos.toast.failed'), saleResult.error.message);
      return false;
    }

    const sale = saleResult.data;

    if (cart.discountId) await discountService.recordUsage(cart.discountId);

    /* Settling an existing balance is a separate collection, not part of the
       sale — it must land on the customer statement as its own line. */
    if (result.settleH > 0 && cart.customerId) {
      await safeCall(() =>
        customerService.recordPayment({
          customerId: cart.customerId!,
          amountH: result.settleH,
          method: result.cardH > 0 ? 'card' : 'cash',
          note: `Settled with ${sale.invoiceNumber}`,
          receivedBy: sellerName,
        }),
      );
    }

    /* What the kitchen sees. A meal is broken into what is cooked and what is
       handed over, each with its changes, and labelled with the meal so the
       bagging station knows they travel together. */
    const prepItems = kitchenItemsFor(cart.lines, items, language);
    /* Settings & Tax → Orders & kitchen decides where each order type goes:
       the kitchen screen, straight to collection as ready, or nowhere. */
    const route: KitchenRoute = settings?.kitchenRouting?.[orderType] ?? 'kitchen';

    if (prepItems.length > 0 && route !== 'none') {
      await kitchenService.createFromSale({
        orderNumber: sale.invoiceNumber,
        customerName: selectedCustomer ? selectedCustomer.nameEn : null,
        totalH: sale.totalH,
        items: prepItems,
        orderType,
        ticketNo: sale.orderNo,
        startAs: route === 'collection' ? 'ready' : 'open',
      });
    }
    const prepLines = route === 'none' ? [] : prepItems;
    setRoutedTo(route);

    /* Print what the cashier chose at checkout, on the chosen printer
       (pre-selected: the default for that document). Never blocks the sale. */
    const choice = result.print ?? { kind: 'receipt' as const, printerId: null };
    setPrintSelection(choice);
    setPrintOutcome(null);
    if (choice.kind !== 'none') void runPrint(sale, choice);
    if (route === 'kitchen' && prepItems.length > 0 && settings?.autoPrintGroupTickets) {
      void printerService.defaultFor('kitchen', sale.branchId).then((p) => {
        if (p && p.connection !== 'preview') void printerService.printSale({ sale, kind: 'kitchen', printerId: p.id, branchName: branchLabel, customer: selectedCustomer, language: language === 'ar' ? 'ar' : 'en' });
      });
    }

    setCompletedLines(cart.lines);
    setCompletedSale(sale);
    setCompletedChangeH(result.changeH + (sale.refundH ?? 0));
    setEditing(null);
    setSentToKitchen(prepLines.length > 0);
    payment.close();
    toast.success(t('pos.toast.completed', { invoice: sale.invoiceNumber }));

    await load();
    return true;
  }

  function selectDiscount(discountId: string | null) {
    if (!discountId) {
      cart.setDiscount(0, null);
      setApproval(NO_APPROVAL);
      setDiscountCapped(false);
      return;
    }

    const entry = discounts.find((candidate) => candidate.discount.id === discountId);
    if (!entry || !entry.eligibility.eligible) return;

    cart.setDiscount(entry.eligibility.amountH, discountId);
    setDiscountCapped(entry.eligibility.capped);
    setApproval(
      entry.eligibility.requiresApproval
        ? { ...NO_APPROVAL, state: 'pending' }
        : NO_APPROVAL,
    );
  }

  /**
   * Mocked approval. The real backend will enforce this — the frontend must not
   * be the thing deciding whether a manager said yes.
   */
  function requestApproval(reason: string) {
    setApproval({
      state: 'pending',
      approverName: null,
      reason,
      requestedAt: new Date().toISOString(),
      decidedAt: null,
    });

    window.setTimeout(() => {
      setApproval((current) =>
        current.state === 'pending'
          ? {
              ...current,
              state: 'approved',
              approverName: 'Sara Abdullah',
              decidedAt: new Date().toISOString(),
            }
          : current,
      );
      toast.success(t('posDiscount.approval.approvedBy', { name: 'Sara Abdullah' }));
    }, 1200);
  }

  /** Item id -> print group, so the split can be computed without the catalog. */
  const itemGroupIds = useMemo(
    () =>
      Object.fromEntries(items.map((item) => [item.id, item.printGroupId ?? null])) as Record<
        string,
        string | null
      >,
    [items],
  );

  const orderGroups = useMemo(
    () => groupsInOrder(completedLines, printGroups, itemGroupIds),
    [completedLines, printGroups, itemGroupIds],
  );

  const branchLabel = activeBranch ? (language === 'ar' ? activeBranch.nameAr : activeBranch.nameEn) : '';

  async function runPrint(sale: Sale, choice: ReceiptSelection) {
    if (choice.kind === 'none') return;
    setPrinting(true);
    const outcome = await printerService.printSale({
      sale, kind: choice.kind, printerId: choice.printerId, branchName: branchLabel,
      customer: customers.find((c) => c.id === sale.customerId) ?? null, language: language === 'ar' ? 'ar' : 'en',
    });
    setPrinting(false);
    setPrintOutcome(outcome);
    setPrintSelection(choice);
  }

  async function printDocument(documentId: string) {
    const documents = buildPrintDocuments(completedLines, printGroups, itemGroupIds);
    const target = documents.find((document) => document.id === documentId);
    if (!target) return;
    await printService.print(target.id);
  }

  async function printEverything() {
    const documents = buildPrintDocuments(completedLines, printGroups, itemGroupIds);
    /* Sequential: each document is a separate physical print job, and firing
       them together would interleave on a single-roll printer. */
    for (const document of documents) {
      await printService.print(document.id);
    }
  }

  function startNewSale() {
    idempotencyKey.current = uuidV4();
    setEditing(null);
    setMobilePane('items');
    cart.clear();
    setApproval(NO_APPROVAL);
    setDiscountCapped(false);
    setCompletedSale(null);
    setCompletedChangeH(0);
    setCompletedLines([]);
    setSentToKitchen(false);
    payment.close();
    setSearch('');
  }

  /* Fills the main region exactly (the shell gives it a definite height). No
     page scrolling — only the product grid and the cart scroll, internally. */
  return (
    <div className="flex h-full min-h-[30rem] flex-col gap-2">
      {restaurantClosed && <RestaurantClosedBanner onOpened={restaurant.reload} />}
      {!canSell && (
        <div className="flex shrink-0 items-center gap-2 rounded-md border border-ink-200 bg-surface px-3 py-2 text-sm text-ink-600">
          <Eye aria-hidden className="h-4 w-4 text-ink-400" />
          <span className="font-medium text-ink-900">{t('demo.readOnlyTill')}</span>
          <span className="hidden sm:inline">· {t('demo.readOnlyTillBody')}</span>
        </div>
      )}
      {/* Scan bar and today's running totals */}
      {/* Search and categories share one row: search takes 5 of 12 columns,
          the rail takes the rest and scrolls. Stacking them cost a whole row
          of product grid for no benefit. */}
      {/* Phone cart pane: search and categories belong to the items pane, and
          on a 740px screen the cart needs every pixel of that row. */}
      <header className={cn('grid shrink-0 grid-cols-12 items-center gap-2', mobilePane === 'cart' && 'max-md:hidden')}>
        <div className="col-span-12 sm:col-span-5">
          <Input
            ref={scanRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={handleScanSubmit}
            placeholder={t('pos.scanPlaceholder')}
            aria-label={t('pos.scanPlaceholder')}
            leadingAddon={<ScanLine aria-hidden />}
            autoComplete="off"
          />
        </div>

        <div className="col-span-12 min-w-0 sm:col-span-7">
          <CategoryScroller options={categoryOptions} value={filter} onChange={setFilter} />
        </div>
      </header>

      {/* Grid + cart. The cart is a fixed rail on desktop and stacks below on
          narrow screens, where the whole page scrolls instead. */}
      <div className="grid min-h-0 flex-1 gap-2 md:grid-cols-[minmax(0,1fr)_17.5rem] lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div
          aria-disabled={restaurantClosed || undefined}
          className={cn('min-h-0 md:flex md:flex-col', mobilePane === 'cart' ? 'hidden' : 'flex flex-col', restaurantClosed && 'pointer-events-none select-none opacity-50')}
        >
        <ProductGrid
          items={visibleItems}
          loading={loading}
          searching={search.trim() !== ''}
          quantityOf={cart.quantityOf}
          onSelect={addItem}
          onOpenCatalog={() => navigate(ROUTES.catalog)}
          catalog={items}
        />
        </div>

        <div className={cn('min-h-0 flex-col md:flex md:h-full', mobilePane === 'items' ? 'hidden' : 'flex h-full')}>
          <button
            type="button"
            onClick={() => setMobilePane('items')}
            className="mb-2 flex h-11 shrink-0 items-center gap-2 self-start rounded-md pe-3 ps-1 text-md font-medium text-ink-700 active:bg-ink-100 md:hidden"
          >
            <ArrowLeft aria-hidden className="flip-rtl h-5 w-5" />
            {t('posModifiers.backToItems')}
          </button>
          {editing && (
            <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
              <PencilLine aria-hidden className="h-4 w-4 shrink-0 text-amber-700" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink-900">
                  {t('posEdit.banner', { invoice: editing.invoiceNumber })}
                </span>
                <span className="block text-xs text-ink-600">
                  {t('posEdit.paid', { amount: formatCurrency(paidBeforeH, { language }) })}
                  {' · '}
                  {cart.totals.totalH >= paidBeforeH
                    ? t('posEdit.collect', { amount: formatCurrency(cart.totals.totalH - paidBeforeH, { language }) })
                    : t('posEdit.giveBack', { amount: formatCurrency(paidBeforeH - cart.totals.totalH, { language }) })}
                </span>
              </span>
              <button type="button" onClick={cancelEditing} aria-label={t('posEdit.stop')}
                className="grid h-9 w-9 place-items-center rounded-md text-ink-500 hover:bg-amber-100 hover:text-ink-900">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1">
          <CartPanel
            cart={cart}
            onCheckout={() => {
              /* Nothing more to collect on an edit: confirm the give-back instead of a payment screen. */
              if (editing && cart.totals.totalH <= paidBeforeH) setRefundConfirm(true);
              else payment.open();
            }}
            discounts={discounts}
            selectedDiscountId={cart.discountId}
            onSelectDiscount={selectDiscount}
            discountApproval={approval}
            onRequestApproval={requestApproval}
            discountCapped={discountCapped}
            checkoutBlocked={approval.state === 'pending' || !canSell || restaurantClosed}
            paidBeforeH={editing ? paidBeforeH : undefined}
          />
          </div>
        </div>
      </div>

      {/* Phone / handheld: a thumb-height bar that flips to the cart. */}
      {mobilePane === 'items' && !cart.isEmpty && (
        <div className="flex shrink-0 gap-2 md:hidden" data-testid="phone-cart-bar">
          <button
            type="button"
            onClick={() => setMobilePane('cart')}
            className="flex h-14 min-w-0 flex-1 items-center gap-3 rounded-xl border border-ink-200 bg-surface px-4 text-ink-900 shadow-sm transition-transform active:scale-[0.99]"
          >
            <span className="relative">
              <ShoppingBag aria-hidden className="h-5 w-5" />
              <span className="numeric absolute -end-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-ink-900 px-1 text-[10px] font-bold text-white">
                {cart.totals.itemCount}
              </span>
            </span>
            <span className="truncate text-md font-semibold">{t('posModifiers.viewCart')}</span>
          </button>
          {/* Straight to payment: on a busy counter, the cart review is optional. */}
          <button
            type="button"
            disabled={restaurantClosed || !canSell || approval.state === 'pending'}
            onClick={() => {
              if (editing && cart.totals.totalH <= paidBeforeH) setRefundConfirm(true);
              else payment.open();
            }}
            data-testid="phone-charge"
            className="flex h-14 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-600 px-5 text-brand-fg shadow-md transition-transform active:scale-[0.99] disabled:opacity-50"
          >
            <span className="text-xs font-medium opacity-80">{t('pos.cart.charge')}</span>
            <span className="numeric text-md font-bold">{formatCurrency(cart.totals.totalH, { language })}</span>
          </button>
        </div>
      )}

      <ModifierSheet
        item={modifierItem}
        onClose={() => setModifierItem(null)}
        onAdd={addWithModifiers}
        meals={modifierItem ? mealsFor(modifierItem, items) : []}
        catalog={items}
        onChooseMeal={(meal) => {
          setModifierItem(null);
          setComboItem(meal);
        }}
      />

      <CheckoutModal
        open={payment.isOpen}
        onClose={payment.close}
        lines={cart.lines}
        totals={cart.totals}
        customers={customers}
        customerId={cart.customerId}
        onCustomerChange={cart.setCustomer}
        settings={settings}
        orderType={orderType}
        onOrderTypeChange={setOrderType}
        staff={staff}
        appliedDiscount={
          discounts.find((entry) => entry.discount.id === cart.discountId)?.discount ?? null
        }
        onConfirm={handleCheckout}
        alreadyPaidH={paidBeforeH}
        alreadyPaidLabel={editing ? t('posEdit.paidOn', { invoice: editing.invoiceNumber }) : undefined}
      />

      <ConfirmModal
        open={refundConfirm}
        title={t('posEdit.confirmTitle')}
        description={
          paidBeforeH - cart.totals.totalH > 0
            ? t('posEdit.confirmRefund', { amount: formatCurrency(paidBeforeH - cart.totals.totalH, { language }) })
            : t('posEdit.confirmEven')
        }
        confirmLabel={t('posEdit.confirmSave')}
        variant="primary"
        onConfirm={async () => {
          setRefundConfirm(false);
          await handleCheckout({
            mode: 'cash', servedByUserId: null, cashH: 0, cardH: 0, creditH: 0, tenderedH: null, changeH: 0, settleH: 0,
          } as CheckoutResult);
        }}
        onCancel={() => setRefundConfirm(false)}
      />

      <ComboSheet combo={comboItem} catalog={items} onClose={() => setComboItem(null)} onAdd={addCombo} />

      <OrderComplete
        open={Boolean(completedSale)}
        sale={completedSale}
        discount={
          discounts.find((entry) => entry.discount.id === cart.discountId)?.discount ?? null
        }
        changeH={completedChangeH}
        sentToKitchen={sentToKitchen}
        routedTo={routedTo}
        printGroups={orderGroups}
        onPrint={(id) => void printDocument(id)}
        onPrintAll={() => void printEverything()}
        onView={() => navigate(ROUTES.sales)}
        onNewSale={startNewSale}
        onClose={startNewSale}
        refundH={completedSale?.refundH ?? 0}
        printOutcome={printOutcome}
        printing={printing}
        printSelection={printSelection}
        onReprint={(sel) => completedSale && void runPrint(completedSale, sel)}
        billLater={Boolean(completedSale?.orderType && settings?.receiptTiming?.[completedSale.orderType] === 'on_completion' && routedTo !== 'none')}
      />
    </div>
  );
}
