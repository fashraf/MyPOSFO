import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChefHat,
  Clock,
  Compass,
  Contact,
  CornerDownLeft,
  FileText,
  LifeBuoy,
  Package,
  PackagePlus,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Tags,
  UserPlus,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { visibleNavigation } from '@/config/navigation';
import { useSession } from '@/contexts/SessionContext';
import { useI18n, useTranslation, type TranslationKey } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { HELP_ARTICLES, type HelpArticle } from '@/lib/helpArticles';
import { alertsFor, flagOf, maskNumber } from '@/lib/staffDocs';
import { ROUTES } from '@/routes/paths';
import { catalogService, customerService, safeCall, salesService, userService } from '@/services';
import type { CatalogItem } from '@/types/catalog';
import type { PermissionKey, User } from '@/types/permissions';
import type { Customer, Sale } from '@/types/sales';

/*
 * One search box for the whole system.
 *
 * Type anything — a product, a phone number, an invoice number, a staff name,
 * an Iqama number, or a question like "how do I cancel" — and results come
 * back grouped by kind. Arabic is matched loosely (أ/ا/إ, ة/ه, ى/ي, Arabic
 * digits), because nobody types hamzas consistently at a till.
 */

type Category = 'all' | 'actions' | 'pages' | 'products' | 'customers' | 'orders' | 'staff' | 'help';

interface Result {
  id: string;
  category: Exclude<Category, 'all'>;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  score: number;
  run: () => void;
  article?: HelpArticle;
}

const CATEGORY_ICON: Record<Exclude<Category, 'all'>, LucideIcon> = {
  actions: Zap, pages: Compass, products: Package, customers: Contact, orders: Receipt, staff: Users, help: LifeBuoy,
};

const ACTIONS: { id: string; to: string; labelKey: TranslationKey; hintKey: TranslationKey; icon: LucideIcon; permission: PermissionKey }[] = [
  { id: 'sale', to: ROUTES.pos, labelKey: 'quickLinks.newSale', hintKey: 'quickLinks.newSaleHint', icon: ShoppingCart, permission: 'pos.view' },
  { id: 'product', to: ROUTES.catalog, labelKey: 'quickLinks.addProduct', hintKey: 'quickLinks.addProductHint', icon: Plus, permission: 'products.create' },
  { id: 'restock', to: ROUTES.restock, labelKey: 'quickLinks.restock', hintKey: 'quickLinks.restockHint', icon: PackagePlus, permission: 'inventory.purchase_entry' },
  { id: 'customer', to: ROUTES.customers, labelKey: 'quickLinks.addCustomer', hintKey: 'quickLinks.addCustomerHint', icon: UserPlus, permission: 'customers.create' },
  { id: 'discount', to: ROUTES.discountNew, labelKey: 'quickLinks.addDiscount', hintKey: 'quickLinks.addDiscountHint', icon: Tags, permission: 'discounts.create' },
  { id: 'user', to: ROUTES.userNew, labelKey: 'quickLinks.addUser', hintKey: 'quickLinks.addUserHint', icon: Users, permission: 'users.create' },
  { id: 'kitchen', to: ROUTES.kitchen, labelKey: 'quickLinks.kitchen', hintKey: 'quickLinks.kitchenHint', icon: ChefHat, permission: 'pos.view' },
  { id: 'bill', to: ROUTES.billBuilder, labelKey: 'quickLinks.billBuilder', hintKey: 'quickLinks.billBuilderHint', icon: FileText, permission: 'bill_builder.edit' },
];

/** Lower-case, no diacritics, one form of each Arabic letter, Latin digits. */
export function normalise(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, ' ')
    .trim();
}

/** 0 = no match. Every word typed must appear; earlier and whole-word hits rank higher. */
function scoreOf(haystack: string, tokens: string[]): number {
  if (tokens.length === 0) return 1;
  const text = normalise(haystack);
  let score = 0;
  for (const token of tokens) {
    const at = text.indexOf(token);
    if (at < 0) return 0;
    score += at === 0 ? 30 : text[at - 1] === ' ' || text[at - 1] === '-' ? 20 : 8;
  }
  return score;
}

const RECENT_KEY = 'search.recent';
function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}
function pushRecent(query: string) {
  const q = query.trim();
  if (q.length < 2) return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...readRecent().filter((r) => r !== q)].slice(0, 6)));
  } catch {
    /* ignore */
  }
}

export function SmartSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const ar = language === 'ar';
  const { can, permissions } = useSession();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [active, setActive] = useState(0);
  const [article, setArticle] = useState<HelpArticle | null>(null);
  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [orders, setOrders] = useState<Sale[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  const name = (e: { nameAr: string; nameEn: string }) => (ar ? e.nameAr : e.nameEn);
  const money = (h: number) => formatCurrency(h, { language });

  /* Load what this person may see, once per opening. Small lists are kept in
     memory and filtered as you type; orders are searched on the server. */
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCategory('all');
    setActive(0);
    setArticle(null);
    setRecent(readRecent());
    window.setTimeout(() => inputRef.current?.focus(), 30);
    if (can('products.view') || can('pos.view')) void safeCall(() => catalogService.posItems()).then((r) => r.ok && setProducts(r.data));
    if (can('customers.view')) void safeCall(() => customerService.list()).then((r) => r.ok && setCustomers(r.data));
    if (can('users.view')) void safeCall(() => userService.list()).then((r) => r.ok && setStaff(r.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !can('sales.view')) return;
    const q = query.trim();
    if (q.length < 2) {
      setOrders([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void safeCall(() => salesService.list({ search: q, pageSize: 6 })).then((r) => r.ok && setOrders(r.data.items));
    }, 180);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  const go = (to: string) => {
    pushRecent(query);
    onClose();
    navigate(to);
  };

  const results = useMemo<Result[]>(() => {
    const tokens = normalise(query).split(' ').filter(Boolean);
    const out: Result[] = [];
    const push = (r: Omit<Result, 'score'>, haystack: string, boost = 0) => {
      const score = scoreOf(haystack, tokens);
      if (score > 0) out.push({ ...r, score: score + boost });
    };

    for (const action of ACTIONS) {
      if (!can(action.permission)) continue;
      push({ id: `a-${action.id}`, category: 'actions', icon: action.icon, title: t(action.labelKey), subtitle: t(action.hintKey), run: () => go(action.to) },
        `${t(action.labelKey)} ${t(action.hintKey)}`, 5);
    }

    for (const section of visibleNavigation(permissions)) {
      for (const item of section.items) {
        push({ id: `p-${item.id}`, category: 'pages', icon: item.icon, title: t(item.labelKey), subtitle: section.labelKey ? t(section.labelKey) : undefined, run: () => go(item.to) },
          `${t(item.labelKey)} ${item.id}`);
        for (const child of item.children ?? []) {
          push({ id: `p-${child.id}`, category: 'pages', icon: item.icon, title: t(child.labelKey), subtitle: t(item.labelKey), run: () => go(child.to) },
            `${t(child.labelKey)} ${t(item.labelKey)}`);
        }
      }
    }

    if (tokens.length) {
      for (const p of products) {
        const sku = 'sku' in p ? p.sku : '';
        const barcode = 'barcode' in p ? p.barcode : '';
        const stock = 'trackInventory' in p && p.trackInventory ? p.stockQuantity : null;
        push({
          id: `pr-${p.id}`, category: 'products', icon: Package, title: name(p),
          subtitle: [sku, barcode].filter(Boolean).join(' · ') || undefined,
          meta: (
            <span className="flex items-center gap-2">
              {stock !== null && (
                <span className={cn('rounded-full px-1.5 py-0.5 text-2xs font-medium', stock <= 0 ? 'bg-danger-50 text-danger-700' : 'bg-ink-100 text-ink-600')}>
                  {stock <= 0 ? t('search.soldOut') : t('search.inStock', { count: String(stock) })}
                </span>
              )}
              <span className="numeric text-sm font-semibold text-ink-900">{money(p.priceH)}</span>
            </span>
          ),
          run: () => go(`${ROUTES.catalog}?q=${encodeURIComponent(p.nameEn)}`),
        }, `${p.nameEn} ${p.nameAr} ${sku} ${barcode}`);
      }

      for (const c of customers) {
        push({
          id: `c-${c.id}`, category: 'customers', icon: Contact, title: name(c), subtitle: c.phone,
          meta: c.balanceH > 0 ? <span className="numeric text-xs font-medium text-warning-700">{t('search.owes', { amount: money(c.balanceH) })}</span> : undefined,
          run: () => go(`${ROUTES.customers}?q=${encodeURIComponent(c.phone || c.nameEn)}`),
        }, `${c.nameEn} ${c.nameAr} ${c.phone} ${c.phone.replace(/\D/g, '')} ${c.email}`);
      }

      for (const s of orders) {
        out.push({
          id: `o-${s.id}`, category: 'orders', icon: Receipt, title: s.invoiceNumber,
          subtitle: new Date(s.createdAt).toLocaleString(ar ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
          meta: (
            <span className="flex items-center gap-2">
              {s.status === 'voided' && <span className="rounded-full bg-danger-50 px-1.5 py-0.5 text-2xs font-medium text-danger-700">{t('sales.status.voided')}</span>}
              <span className="numeric text-sm font-semibold text-ink-900">{money(s.totalH)}</span>
            </span>
          ),
          score: 40,
          run: () => go(`${ROUTES.sales}?open=${s.id}`),
        });
      }

      for (const u of staff) {
        const alerts = alertsFor(u);
        const main = (u.documents ?? []).find((d) => d.kind === (u.nationality === 'SA' ? 'national_id' : 'iqama'));
        push({
          id: `s-${u.id}`, category: 'staff', icon: Users, title: name(u),
          subtitle: [u.nationality ? `${flagOf(u.nationality)} ${u.jobTitle ?? ''}`.trim() : u.jobTitle, main ? maskNumber(main.number) : null].filter(Boolean).join(' · ') || u.email,
          meta: alerts[0] ? (
            <span className="rounded-full bg-danger-50 px-1.5 py-0.5 text-2xs font-medium text-danger-700">
              {t(`staff.docs.${alerts[0].kind}.short`)} · {t(alerts[0].status === 'missing' ? 'staff.status.missing' : alerts[0].status === 'expired' ? 'search.expired' : 'search.expiring')}
            </span>
          ) : undefined,
          run: () => go(`/users/${u.id}/edit`),
        }, `${u.nameEn} ${u.nameAr} ${u.username} ${u.email} ${u.phone} ${u.employeeId} ${u.jobTitle ?? ''} ${(u.documents ?? []).map((d) => d.number).join(' ')}`);
      }
    }

    for (const a of HELP_ARTICLES) {
      if (a.permission && !can(a.permission)) continue;
      push({ id: `h-${a.id}`, category: 'help', icon: BookOpen, title: ar ? a.ar : a.en, article: a, run: () => setArticle(a) },
        `${a.en} ${a.ar} ${a.keywords}`, tokens.length ? -10 : 0);
    }

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, products, customers, staff, orders, language, permissions]);

  const order: Exclude<Category, 'all'>[] = ['actions', 'orders', 'products', 'customers', 'staff', 'pages', 'help'];
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of results) c[r.category] = (c[r.category] ?? 0) + 1;
    return c;
  }, [results]);

  /* Empty box: quick actions and popular help. With a query: best matches,
     grouped, capped per group under "All" so one kind cannot flood the list. */
  const shown = useMemo(() => {
    const empty = !query.trim();
    const pool = category === 'all' ? results : results.filter((r) => r.category === category);
    const filtered = empty && category === 'all' ? pool.filter((r) => r.category === 'actions' || r.category === 'help') : pool;
    const grouped = order.flatMap((cat) => {
      const rows = filtered.filter((r) => r.category === cat).sort((a, b) => b.score - a.score);
      return category === 'all' ? rows.slice(0, empty && cat === 'help' ? 4 : 5) : rows;
    });
    return grouped;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, category, query]);

  useEffect(() => setActive(0), [query, category]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const tabs: Category[] = ['all', ...order.filter((c) => c !== 'actions')];

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (article) setArticle(null);
      else onClose();
    } else if (article) {
      return;
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && shown[active]) {
      event.preventDefault();
      shown[active].run();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const i = tabs.indexOf(category);
      setCategory(tabs[(i + (event.shiftKey ? tabs.length - 1 : 1)) % tabs.length]);
    }
  }

  let lastCategory: string | null = null;

  return createPortal(
    <div className="fixed inset-0 z-modal flex items-start justify-center p-0 sm:p-4 sm:pt-[8vh]" onKeyDown={onKeyDown}>
      <div aria-hidden className="absolute inset-0 animate-fade-in bg-ink-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={t('search.title')}
        className="relative flex h-full w-full flex-col overflow-hidden border border-ink-200 bg-surface shadow-overlay animate-scale-in sm:h-auto sm:max-h-[80vh] sm:max-w-2xl sm:rounded-2xl">
        {/* Search field */}
        <div className="flex items-center gap-3 border-b border-ink-200 px-4">
          <Search aria-hidden className="h-5 w-5 shrink-0 text-ink-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setArticle(null); }}
            placeholder={t('search.placeholder')}
            aria-label={t('search.title')}
            className="h-14 min-w-0 flex-1 border-0 bg-transparent text-md text-ink-900 shadow-none outline-none ring-0 placeholder:text-ink-400 focus:outline-none focus:ring-0 focus-visible:outline-none"
          />
          {query && (
            <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label={t('search.clear')}
              className="grid h-8 w-8 place-items-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-900">
              <X className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-md border border-ink-200 px-2 py-1 text-2xs font-medium text-ink-500 hover:text-ink-900">
            Esc
          </button>
        </div>

        {/* Categories */}
        {!article && (
          <div className="flex gap-1.5 overflow-x-auto border-b border-ink-200 px-3 py-2">
            {tabs.map((cat) => {
              const Icon = cat === 'all' ? Search : CATEGORY_ICON[cat];
              const count = cat === 'all' ? null : counts[cat] ?? 0;
              const on = category === cat;
              return (
                <button key={cat} type="button" onClick={() => setCategory(cat)} aria-pressed={on}
                  className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition',
                    on ? 'bg-info-50 text-info-700 ring-1 ring-info-200' : 'text-ink-600 hover:bg-ink-100')}>
                  <Icon className="h-3.5 w-3.5" />
                  {t(`search.cat.${cat}`)}
                  {count !== null && query.trim() && count > 0 && (
                    <span className={cn('numeric rounded-full px-1.5 text-2xs', on ? 'bg-info-100' : 'bg-ink-100 text-ink-500')}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
          {article ? (
            <HelpView article={article} ar={ar} onBack={() => setArticle(null)} onGo={(to) => go(to)} />
          ) : (
            <>
              {!query.trim() && recent.length > 0 && category === 'all' && (
                <div className="mb-2 px-2 pt-1">
                  <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-400">{t('search.recent')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {recent.map((r) => (
                      <button key={r} type="button" onClick={() => setQuery(r)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-2.5 py-1 text-sm text-ink-700 hover:border-ink-900">
                        <Clock className="h-3 w-3 text-ink-400" /> {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {shown.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <p className="text-md font-medium text-ink-800">{t('search.nothing', { query })}</p>
                  <p className="mt-1 text-sm text-ink-500">{t('search.nothingHint')}</p>
                </div>
              ) : (
                <ul>
                  {shown.map((r, index) => {
                    const header = category === 'all' && r.category !== lastCategory;
                    lastCategory = r.category;
                    const Icon = r.icon;
                    return (
                      <li key={r.id}>
                        {header && (
                          <p className="px-2 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wider text-ink-400">{t(`search.cat.${r.category}`)}</p>
                        )}
                        <button type="button" data-index={index} onMouseMove={() => setActive(index)} onClick={r.run}
                          className={cn('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start transition-colors', index === active ? 'bg-ink-100' : 'hover:bg-ink-50')}>
                          <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                            r.category === 'help' ? 'bg-info-50 text-info-600' : r.category === 'actions' ? 'bg-info-50 text-info-600' : 'bg-ink-100 text-ink-600')}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink-900">{r.title}</span>
                            {r.subtitle && <span className="block truncate text-xs text-ink-500" dir="auto">{r.subtitle}</span>}
                          </span>
                          {r.meta && <span className="shrink-0">{r.meta}</span>}
                          {index === active && <CornerDownLeft aria-hidden className="h-4 w-4 shrink-0 text-ink-400" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Footer: how to drive it */}
        <div className="hidden items-center gap-4 border-t border-ink-200 px-4 py-2 text-2xs text-ink-500 sm:flex">
          <span><kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> {t('search.keys.move')}</span>
          <span><kbd className="kbd">Enter</kbd> {t('search.keys.open')}</span>
          <span><kbd className="kbd">Tab</kbd> {t('search.keys.category')}</span>
          <span className="ms-auto">{t('search.tip')}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function HelpView({ article, ar, onBack, onGo }: { article: HelpArticle; ar: boolean; onBack: () => void; onGo: (to: string) => void }) {
  const { t } = useTranslation();
  const steps = ar ? article.stepsAr : article.stepsEn;
  return (
    <div className="p-3">
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-900">
        <ArrowLeft className="flip-rtl h-4 w-4" /> {t('search.back')}
      </button>
      <h3 className="flex items-start gap-2.5 text-lg font-semibold text-ink-900">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-info-50 text-info-600"><BookOpen className="h-4.5 w-4.5" /></span>
        {ar ? article.ar : article.en}
      </h3>
      <ol className="mt-4 space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="numeric grid h-7 w-7 shrink-0 place-items-center rounded-full bg-info-50 text-xs font-semibold text-info-700">{i + 1}</span>
            <span className="pt-0.5 text-md leading-relaxed text-ink-800">{step}</span>
          </li>
        ))}
      </ol>
      {article.to && (
        <button type="button" onClick={() => onGo(article.to!)}
          className="mt-5 inline-flex min-h-[2.75rem] items-center gap-2 rounded-xl bg-info-600 px-4 text-sm font-semibold text-white hover:bg-info-700">
          {t('search.takeMe')} <ArrowRight className="flip-rtl h-4 w-4" />
        </button>
      )}
    </div>
  );
}
