import QRCode from 'qrcode';
import type { Sale, SaleLine } from '@/types/sales';
import { lineGrossH } from '@/types/sales';
import type { CompanyProfile } from '@/types/company';
import type { PrintDocKind, RenderMode } from '@/types/printers';
import { charsPerLine, dotsPerLine } from '@/types/printers';

/**
 * Thermal receipts.
 *
 * One receipt model, two ways to put it on paper:
 *  - text:  ESC/POS commands — a whole receipt is ~1 KB, prints instantly,
 *           Latin characters only (thermal printers have no Arabic font).
 *  - image: the same rows drawn on a canvas and sent as a 1-bit raster — any
 *           language and right-to-left, ~15–40 KB, still well within Bluetooth.
 * Everything is generated on the device; nothing is downloaded to print.
 */

export type Row =
  | { t: 'text'; text: string; align?: 'start' | 'center' | 'end'; bold?: boolean; size?: 1 | 2 }
  | { t: 'pair'; left: string; right: string; bold?: boolean; size?: 1 | 2 }
  | { t: 'rule' }
  | { t: 'qr'; data: string }
  | { t: 'feed'; lines: number };

export interface ReceiptModel {
  rows: Row[];
  rtl: boolean;
}

export interface ThermalContext {
  sale: Sale;
  company: CompanyProfile;
  branchName: string;
  language: 'ar' | 'en';
  kind: Exclude<PrintDocKind, 'a4'>;
  dataSaver?: boolean;
  taxNumber?: string;
}

const L = {
  en: {
    simplified: 'SIMPLIFIED TAX INVOICE', receipt: 'RECEIPT', gift: 'GIFT RECEIPT', kitchen: 'KITCHEN', invoice: 'Invoice', date: 'Date',
    cashier: 'Cashier', subtotal: 'Subtotal (excl. tax)', discount: 'Discount', total: 'TOTAL', cash: 'Cash', card: 'Card', credit: 'On account',
    bank: 'Bank', tendered: 'Cash given', change: 'Change', thanks: 'Thank you for your visit', giftNote: 'Exchange within 7 days with this receipt',
    cancelled: '*** CANCELLED ***', items: 'items', order: 'Order', type: 'Type', incl: 'Prices include tax',
  },
  ar: {
    simplified: 'فاتورة ضريبية مبسطة', receipt: 'إيصال', gift: 'إيصال هدية', kitchen: 'المطبخ', invoice: 'الفاتورة', date: 'التاريخ',
    cashier: 'الكاشير', subtotal: 'المجموع قبل الضريبة', discount: 'الخصم', total: 'الإجمالي', cash: 'نقدًا', card: 'شبكة', credit: 'آجل',
    bank: 'تحويل', tendered: 'المستلم', change: 'الباقي', thanks: 'شكرًا لزيارتكم', giftNote: 'الاستبدال خلال ٧ أيام بهذا الإيصال',
    cancelled: '*** ملغاة ***', items: 'أصناف', order: 'الطلب', type: 'النوع', incl: 'الأسعار شاملة الضريبة',
  },
};

const money = (h: number) => (h / 100).toFixed(2);

function lineExtras(line: SaleLine, ar: boolean): string[] {
  const name = (e: { nameAr: string; nameEn: string }) => (ar ? e.nameAr : e.nameEn);
  const out: string[] = [];
  if (line.modifiers?.length) out.push(line.modifiers.map(name).join(', '));
  for (const c of line.components ?? []) {
    out.push(`${c.quantity > 1 ? `${c.quantity}x ` : ''}${name(c)}${c.modifiers?.length ? ` (${c.modifiers.map(name).join(', ')})` : ''}`);
  }
  return out;
}

/** The receipt as rows — shared by text and image output. */
export function buildReceiptModel(ctx: ThermalContext): ReceiptModel {
  const { sale, company, language, kind } = ctx;
  const ar = language === 'ar';
  const T = L[language];
  const name = (e: { nameAr: string; nameEn: string }) => (ar ? e.nameAr : e.nameEn);
  const rows: Row[] = [];
  const when = new Date(sale.soldAt).toLocaleString(ar ? 'ar-SA-u-nu-latn' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });

  if (kind === 'kitchen') {
    rows.push({ t: 'text', text: T.kitchen, align: 'center', bold: true, size: 2 });
    rows.push({ t: 'text', text: sale.orderNo ? `#${sale.orderNo}` : `#${sale.invoiceNumber}`, align: 'center', bold: true, size: 2 });
    rows.push({ t: 'pair', left: sale.invoiceNumber, right: when });
    if (sale.orderType) rows.push({ t: 'text', text: sale.orderType.replace('_', ' ').toUpperCase(), bold: true });
    rows.push({ t: 'rule' });
    for (const line of sale.lines) {
      rows.push({ t: 'text', text: `${line.quantity} x ${name(line)}`, bold: true, size: 2 });
      for (const extra of lineExtras(line, ar)) rows.push({ t: 'text', text: `  - ${extra}` });
    }
    rows.push({ t: 'rule' });
    rows.push({ t: 'text', text: `${ctx.branchName} · ${sale.cashierName}`, align: 'center' });
    rows.push({ t: 'feed', lines: 3 });
    return { rows, rtl: ar };
  }

  const tax = sale.tax ?? { enabled: true, inclusive: true, name: 'VAT', registrationLabel: ar ? 'الرقم الضريبي' : 'VAT No.', lines: [{ label: 'VAT 15%', name: 'VAT', percent: 15, taxableH: sale.subtotalH, taxH: sale.taxH }] };
  rows.push({ t: 'text', text: (ar ? company.nameAr : company.nameEn) || company.nameEn, align: 'center', bold: true, size: 2 });
  rows.push({ t: 'text', text: ctx.branchName, align: 'center' });
  if (tax.enabled) rows.push({ t: 'text', text: `${tax.registrationLabel}: ${ctx.taxNumber || company.vatNumber}`, align: 'center' });
  rows.push({ t: 'text', text: kind === 'gift' ? T.gift : tax.enabled ? T.simplified : T.receipt, align: 'center', bold: true });
  if (sale.orderNo) rows.push({ t: 'text', text: `${T.order} #${sale.orderNo}`, align: 'center', bold: true, size: 2 });
  if (sale.status === 'voided') rows.push({ t: 'text', text: T.cancelled, align: 'center', bold: true, size: 2 });
  rows.push({ t: 'rule' });
  rows.push({ t: 'pair', left: T.invoice, right: sale.invoiceNumber });
  rows.push({ t: 'pair', left: T.date, right: when });
  rows.push({ t: 'pair', left: T.cashier, right: sale.cashierName });
  rows.push({ t: 'rule' });

  for (const line of sale.lines) {
    if (kind === 'gift') {
      rows.push({ t: 'text', text: `${line.quantity} x ${name(line)}` });
    } else {
      rows.push({ t: 'pair', left: `${line.quantity} x ${name(line)}`, right: money(lineGrossH(line)) });
    }
    if (!ctx.dataSaver) for (const extra of lineExtras(line, ar)) rows.push({ t: 'text', text: `  ${extra}` });
  }
  rows.push({ t: 'rule' });

  if (kind === 'gift') {
    rows.push({ t: 'text', text: T.giftNote, align: 'center' });
  } else {
    if (sale.discountH > 0) rows.push({ t: 'pair', left: T.discount, right: `-${money(sale.discountH)}` });
    if (tax.enabled) {
      rows.push({ t: 'pair', left: T.subtotal, right: money(sale.subtotalH) });
      for (const l of tax.lines) rows.push({ t: 'pair', left: l.label, right: money(l.taxH) });
    }
    rows.push({ t: 'pair', left: T.total, right: money(sale.totalH), bold: true, size: 2 });
    rows.push({ t: 'rule' });
    for (const p of sale.payments) rows.push({ t: 'pair', left: T[p.method as 'cash' | 'card' | 'credit' | 'bank'] ?? p.method, right: money(p.amountH) });
    if (sale.tenderedH && sale.changeH > 0) {
      rows.push({ t: 'pair', left: T.tendered, right: money(sale.tenderedH) });
      rows.push({ t: 'pair', left: T.change, right: money(sale.changeH) });
    }
    if (sale.zatca && tax.enabled) rows.push({ t: 'qr', data: sale.zatca.qrBase64 });
  }
  rows.push({ t: 'text', text: T.thanks, align: 'center' });
  rows.push({ t: 'feed', lines: ctx.dataSaver ? 2 : 4 });
  return { rows, rtl: ar };
}

/** A simple test page for a printer. */
export function testModel(printerName: string, width: 58 | 80, language: 'ar' | 'en'): ReceiptModel {
  const ar = language === 'ar';
  return {
    rtl: ar,
    rows: [
      { t: 'text', text: ar ? 'صفحة اختبار' : 'TEST PRINT', align: 'center', bold: true, size: 2 },
      { t: 'text', text: printerName, align: 'center' },
      { t: 'rule' },
      { t: 'pair', left: ar ? 'عرض الورق' : 'Paper', right: `${width} mm` },
      { t: 'pair', left: ar ? 'الوقت' : 'Time', right: new Date().toLocaleTimeString() },
      { t: 'text', text: 'PosComplete ✓', align: 'center', bold: true },
      { t: 'feed', lines: 3 },
    ],
  };
}

/** Typographic punctuation a thermal font lacks, mapped to plain ASCII. */
const ASCII_MAP: Record<string, string> = {
  '—': '-', '–': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '·': '-', '✓': '*', '×': 'x', '\u00a0': ' ',
};

export function toAsciiText(text: string): string {
  return text.replace(/[—–‘’“”…·✓×\u00a0]/g, (c) => ASCII_MAP[c] ?? c);
}

export function needsImage(model: ReceiptModel): boolean {
  const text = model.rows.map((r) => (r.t === 'text' ? r.text : r.t === 'pair' ? r.left + r.right : '')).join('');
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7E]/.test(toAsciiText(text));
}

export function chooseMode(mode: RenderMode, model: ReceiptModel): 'text' | 'image' {
  if (mode === 'text' || mode === 'image') return mode;
  return needsImage(model) ? 'image' : 'text';
}

/* ------------------------------------------------------------- ESC/POS */

const ESC = 0x1b;
const GS = 0x1d;

class Bytes {
  private parts: number[] = [];
  push(...b: number[]) {
    for (const x of b) this.parts.push(x & 0xff);
    return this;
  }
  ascii(s: string) {
    for (const ch of toAsciiText(s)) {
      const c = ch.charCodeAt(0);
      this.parts.push(c >= 0x20 && c < 0x7f ? c : ch === '·' ? 0x2d : ch === '✓' ? 0x2a : 0x3f);
    }
    return this;
  }
  get length() {
    return this.parts.length;
  }
  build() {
    return Uint8Array.from(this.parts);
  }
}

function qrCommand(b: Bytes, data: string) {
  const bytes = new TextEncoder().encode(data);
  const len = bytes.length + 3;
  b.push(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00); // model 2
  b.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, 5); // module size
  b.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31); // error correction M
  b.push(GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30, ...bytes);
  b.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30); // print
}

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > width) {
    let cut = rest.lastIndexOf(' ', width);
    if (cut <= 0) cut = width;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  out.push(rest);
  return out;
}

/** ESC/POS text output. */
export function renderText(model: ReceiptModel, width: 58 | 80): Uint8Array {
  const cols = charsPerLine(width);
  const b = new Bytes();
  b.push(ESC, 0x40); // init
  for (const row of model.rows) {
    if (row.t === 'rule') {
      b.push(ESC, 0x61, 0).ascii('-'.repeat(cols)).push(0x0a);
    } else if (row.t === 'feed') {
      b.push(ESC, 0x64, row.lines);
    } else if (row.t === 'qr') {
      b.push(ESC, 0x61, 1);
      qrCommand(b, row.data);
      b.push(0x0a);
    } else if (row.t === 'text') {
      const big = row.size === 2;
      b.push(ESC, 0x61, row.align === 'center' ? 1 : row.align === 'end' ? 2 : 0);
      b.push(ESC, 0x45, row.bold ? 1 : 0, GS, 0x21, big ? 0x11 : 0x00);
      for (const part of wrap(row.text, big ? Math.floor(cols / 2) : cols)) b.ascii(part).push(0x0a);
      b.push(ESC, 0x45, 0, GS, 0x21, 0);
    } else {
      const big = row.size === 2;
      const c = big ? Math.floor(cols / 2) : cols;
      b.push(ESC, 0x61, 0, ESC, 0x45, row.bold ? 1 : 0, GS, 0x21, big ? 0x11 : 0x00);
      const right = row.right;
      const leftWidth = Math.max(4, c - right.length - 1);
      const lines = wrap(row.left, leftWidth);
      lines.forEach((l, i) => {
        if (i === lines.length - 1) b.ascii(l + ' '.repeat(Math.max(1, c - l.length - right.length)) + right);
        else b.ascii(l);
        b.push(0x0a);
      });
      b.push(ESC, 0x45, 0, GS, 0x21, 0);
    }
  }
  b.push(GS, 0x56, 0x42, 0x00); // feed + partial cut
  return b.build();
}

/* ------------------------------------------------------------ raster */

const FONT = "'IBM Plex Sans Arabic', 'Inter', Arial, sans-serif";

/** Draw the receipt on a canvas, width = printer dots. */
export async function drawReceipt(model: ReceiptModel, width: 58 | 80): Promise<HTMLCanvasElement> {
  const W = dotsPerLine(width);
  const pad = 8;
  const base = width === 58 ? 20 : 24;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = 4000;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, canvas.height);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';
  ctx.direction = model.rtl ? 'rtl' : 'ltr';
  let y = 6;
  const start = model.rtl ? W - pad : pad;
  const end = model.rtl ? pad : W - pad;

  const wrapPx = (text: string, max: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(next).width > max && cur) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    }
    lines.push(cur);
    return lines;
  };

  for (const row of model.rows) {
    if (row.t === 'rule') {
      ctx.fillRect(pad, y + 6, W - pad * 2, 2);
      y += 16;
    } else if (row.t === 'feed') {
      y += row.lines * 10;
    } else if (row.t === 'qr') {
      const q = document.createElement('canvas');
      await QRCode.toCanvas(q, row.data, { margin: 0, width: Math.round(W * 0.45), errorCorrectionLevel: 'M' });
      ctx.drawImage(q, (W - q.width) / 2, y + 6);
      y += q.height + 14;
    } else if (row.t === 'text') {
      const size = row.size === 2 ? base * 1.45 : base;
      ctx.font = `${row.bold ? 700 : 400} ${size}px ${FONT}`;
      for (const line of wrapPx(row.text, W - pad * 2)) {
        if (row.align === 'center') {
          ctx.textAlign = 'center';
          ctx.fillText(line, W / 2, y);
        } else {
          ctx.textAlign = row.align === 'end' ? 'end' : 'start';
          ctx.fillText(line, row.align === 'end' ? end : start, y);
        }
        y += size * 1.3;
      }
    } else {
      const size = row.size === 2 ? base * 1.35 : base;
      ctx.font = `${row.bold ? 700 : 400} ${size}px ${FONT}`;
      const rightW = ctx.measureText(row.right).width;
      const lines = wrapPx(row.left, W - pad * 2 - rightW - 12);
      lines.forEach((line, i) => {
        ctx.textAlign = 'start';
        ctx.fillText(line, start, y);
        if (i === lines.length - 1) {
          ctx.textAlign = 'end';
          ctx.fillText(row.right, end, y);
        }
        y += size * 1.3;
      });
    }
  }
  const out = document.createElement('canvas');
  out.width = W;
  out.height = Math.ceil(y + 10);
  out.getContext('2d')!.drawImage(canvas, 0, 0);
  return out;
}

/** 1-bit raster (GS v 0) in bands, so small printer buffers keep up. */
export function canvasToRaster(canvas: HTMLCanvasElement): Uint8Array {
  const { width, height } = canvas;
  const data = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
  const bytesPerRow = Math.ceil(width / 8);
  const b = new Bytes();
  b.push(ESC, 0x40);
  const band = 128;
  for (let top = 0; top < height; top += band) {
    const h = Math.min(band, height - top);
    b.push(GS, 0x76, 0x30, 0, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff);
    for (let yy = top; yy < top + h; yy++) {
      for (let xb = 0; xb < bytesPerRow; xb++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = xb * 8 + bit;
          if (x >= width) continue;
          const i = (yy * width + x) * 4;
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (lum < 160) byte |= 0x80 >> bit;
        }
        b.push(byte);
      }
    }
  }
  b.push(ESC, 0x64, 3, GS, 0x56, 0x42, 0x00);
  return b.build();
}

export interface RenderedReceipt {
  bytes: Uint8Array;
  mode: 'text' | 'image';
  canvas?: HTMLCanvasElement;
}

export async function renderReceipt(model: ReceiptModel, width: 58 | 80, mode: RenderMode): Promise<RenderedReceipt> {
  const chosen = chooseMode(mode, model);
  if (chosen === 'text') return { bytes: renderText(model, width), mode: 'text' };
  const canvas = await drawReceipt(model, width);
  return { bytes: canvasToRaster(canvas), mode: 'image', canvas };
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
