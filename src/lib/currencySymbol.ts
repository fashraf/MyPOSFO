/**
 * How money is labelled everywhere: "SAR 12.00", "12.00 ر.س", the Riyal sign, or the business's own image.
 * Set in Settings → Currency; shared by every device (server store).
 */
export type CurrencySymbolMode = 'code' | 'arabic' | 'unicode' | 'image' | 'text';

export interface CurrencySymbolSetting {
  mode: CurrencySymbolMode;
  position: 'before' | 'after';
  /** mode "text": the business's own label. */
  text: string;
  /** mode "image": a small image (data URL), e.g. the official Saudi Riyal symbol. */
  imageDataUrl: string | null;
}

export const DEFAULT_CURRENCY_SYMBOL: CurrencySymbolSetting = { mode: 'code', position: 'before', text: '', imageDataUrl: null };
/** U+20C1 SAUDI RIYAL SIGN (Unicode 17). Shown where the device's font has it. */
export const RIYAL_SIGN = '⃁';

let current: CurrencySymbolSetting = { ...DEFAULT_CURRENCY_SYMBOL };
const listeners = new Set<() => void>();

export function currencySymbol(): CurrencySymbolSetting {
  return current;
}

export function applyCurrencySymbol(next: CurrencySymbolSetting): void {
  current = { ...DEFAULT_CURRENCY_SYMBOL, ...next };
  listeners.forEach((l) => l());
}

export function onCurrencySymbolChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The label as text. An image cannot be text, so text-only places (receipts, messages) fall back to the code. */
export function symbolText(code: string, setting = current): string {
  switch (setting.mode) {
    case 'arabic': return 'ر.س';
    case 'unicode': return RIYAL_SIGN;
    case 'text': return setting.text.trim() || code;
    default: return code;
  }
}
