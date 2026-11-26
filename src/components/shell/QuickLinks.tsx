import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { Dropdown } from '@/components/ui/Dropdown';
import { visibleNavigation, type NavItem } from '@/config/navigation';
import { ROUTES } from '@/routes/paths';
import { useSession } from '@/contexts/SessionContext';
import { useTranslation } from '@/i18n';

/** The pages people jump between all day, in this order. Only those the person may open are shown. */
const QUICK = ['pos', 'kitchen', 'collection', 'sales', 'restaurant', 'dashboard', 'catalog', 'inventory', 'discounts', 'customers', 'finance', 'settings'];

export function QuickLinks({ className }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { permissions } = useSession();

  const items = useMemo(() => {
    const allowed = new Map<string, NavItem>(
      visibleNavigation(permissions).flatMap((section) => section.items).map((item) => [item.id, item]),
    );
    return QUICK.flatMap((id) => {
      const item = allowed.get(id);
      if (!item) return [];
      const Icon = item.icon;
      const to = item.id === 'restaurant' ? ROUTES.restaurantSession : item.to;
      return [{
        key: item.id,
        label: t(item.labelKey as never),
        icon: Icon ? <Icon /> : undefined,
        onSelect: () => navigate(to),
      }];
    });
  }, [permissions, navigate, t]);

  if (items.length === 0) return null;

  return (
    <Dropdown
      align="end"
      className={className}
      panelClassName="max-h-[70vh] w-56 overflow-y-auto"
      trigger={
        <button
          type="button"
          data-testid="quick-links"
          aria-label={t('quickLinks.pages')}
          title={t('quickLinks.pages')}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-ink-200 bg-surface px-2.5 text-sm text-ink-600 shadow-xs transition-colors hover:border-ink-300 hover:text-ink-900 max-md:h-10 max-md:w-10 max-md:justify-center max-md:border-0 max-md:px-0 max-md:shadow-none"
        >
          <Zap aria-hidden className="h-4 w-4 shrink-0" />
          <span className="hidden lg:inline">{t('quickLinks.pages')}</span>
        </button>
      }
      items={items}
    />
  );
}
