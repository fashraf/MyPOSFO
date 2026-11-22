import { useSyncExternalStore } from 'react';
import { activeTax, onTaxChange, type TaxSettings } from '@/types/tax';

/** The live tax settings. Re-renders when Settings & Tax is saved. */
export function useTax(): TaxSettings {
  return useSyncExternalStore(onTaxChange, activeTax, activeTax);
}
