import {
  Boxes,
  Briefcase,
  ChefHat,
  Crown,
  Landmark,
  ShoppingCart,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import type { PersonaIcon as PersonaIconKind } from '@/services/mock/tenants';
import { cn } from '@/lib/cn';

const ICONS: Record<PersonaIconKind, LucideIcon> = {
  owner: Crown,
  manager: UserCog,
  cashier: ShoppingCart,
  kitchen: ChefHat,
  finance: Landmark,
  director: Briefcase,
  stock: Boxes,
};

/** The glyph for a persona, in a quiet rounded tile. */
export function PersonaIcon({ kind, className }: { kind: PersonaIconKind; className?: string }) {
  const Icon = ICONS[kind];
  return (
    <span
      className={cn(
        'grid h-9 w-9 shrink-0 place-items-center rounded-md border border-ink-200 bg-ink-50 text-ink-700',
        className,
      )}
    >
      <Icon aria-hidden className="h-4 w-4" />
    </span>
  );
}
