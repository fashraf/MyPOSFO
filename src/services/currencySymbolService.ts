import { applyCurrencySymbol, currencySymbol, DEFAULT_CURRENCY_SYMBOL, type CurrencySymbolSetting } from '@/lib/currencySymbol';
import { registerSlice, schedulePersist } from './mock/db';
import { invalidate } from './dataVersion';

/* Kept as its own module so every device picks it up through the server store. */
registerSlice('currencySymbol', {
  capture: () => currencySymbol(),
  restore: (snapshot: CurrencySymbolSetting) => {
    if (!snapshot || typeof snapshot !== 'object') throw new Error('currency symbol snapshot is malformed');
    applyCurrencySymbol(snapshot);
  },
  seed: () => applyCurrencySymbol({ ...DEFAULT_CURRENCY_SYMBOL }),
});

const MAX_IMAGE_BYTES = 60_000;

export const currencySymbolService = {
  get: (): CurrencySymbolSetting => currencySymbol(),
  async save(next: CurrencySymbolSetting): Promise<CurrencySymbolSetting> {
    if (next.mode === 'image' && !next.imageDataUrl) throw new Error('Choose an image first.');
    if (next.imageDataUrl && next.imageDataUrl.length > MAX_IMAGE_BYTES * 1.4) throw new Error('The image is too large. Use an SVG or a small PNG (under 60 KB).');
    if (next.mode === 'text' && !next.text.trim()) throw new Error('Type the label to show.');
    applyCurrencySymbol(next);
    schedulePersist();
    invalidate('sales', 'catalog');
    return currencySymbol();
  },
};
