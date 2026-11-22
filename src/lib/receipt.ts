import { activeTax } from '@/types/tax';
import QRCode from 'qrcode';
import type { Sale, SaleLine } from '@/types/sales';
import { lineGrossH } from '@/types/sales';
import type { CompanyProfile } from '@/types/company';
import type { Customer } from '@/types/sales';

/**
 * Printable documents for an order, rendered as HTML and sent to the browser's
 * print dialog (which the Sunmi WebView routes to the built-in thermal head).
 *
 * Four kinds, because a counter is asked for four different things:
 *   receipt  — simplified tax invoice with the ZATCA QR (what the customer gets)
 *   gift     — same order, no prices (for a present)
 *   kitchen  — big type, no prices, modifiers and meal contents spelled out
 *   a4       — standard tax invoice on A4, with the buyer's details (for companies)
 */

export type PrintKind = 'receipt' | 'gift' | 'kitchen' | 'a4';

export interface PrintContext {
  sale: Sale;
  company: CompanyProfile;
  branchName: string;
  customer: Customer | null;
  language: 'ar' | 'en';
  copies: number;
  /** Overrides the registration number from Settings & Tax. */
  taxNumber?: string;
}

const esc = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const sar = (h: number) => (h / 100).toFixed(2);

function bilingual(ar: string, en: string, language: 'ar' | 'en') {
  return language === 'ar' ? `${ar}<br><span class="sub">${esc(en)}</span>` : `${esc(en)}<br><span class="sub" dir="rtl">${ar}</span>`;
}

function lineDetails(line: SaleLine, language: 'ar' | 'en'): string {
  const name = (e: { nameAr: string; nameEn: string }) => esc(language === 'ar' ? e.nameAr : e.nameEn);
  const parts: string[] = [];
  if (line.modifiers?.length) parts.push(line.modifiers.map(name).join(', '));
  if (line.components?.length) {
    parts.push(
      ...line.components.map(
        (c) => `${c.quantity > 1 ? `${c.quantity}× ` : ''}${name(c)}${c.modifiers?.length ? ` (${c.modifiers.map(name).join(', ')})` : ''}`,
      ),
    );
  }
  return parts.map((p) => `<div class="mod">· ${p}</div>`).join('');
}

const LABELS = {
  en: {
    simplified: 'Simplified Tax Invoice', gift: 'Gift Receipt', kitchen: 'Kitchen Ticket', tax: 'Tax Invoice',
    invoice: 'Invoice', date: 'Date', cashier: 'Cashier', branch: 'Branch', vat: 'VAT No.', cr: 'CR No.',
    item: 'Item', qty: 'Qty', price: 'Price', total: 'Total', subtotal: 'Subtotal (excl. tax)', vatAmount: 'VAT 15%', receipt: 'Receipt', inclTax: 'Total (incl. tax)', noTax: 'Total',
    discount: 'Discount', grand: 'Total (incl. VAT)', taxNote: 'Prices include tax', addedNote: 'Tax added to prices', hsn: 'Tax summary', paid: 'Paid', cash: 'Cash', card: 'Card', credit: 'On account',
    tendered: 'Cash given', change: 'Change', refund: 'Refunded', buyer: 'Buyer', thanks: 'Thank you for your visit',
    giftNote: 'Prices are not shown. Exchange within 7 days with this receipt.', copy: 'Copy', cancelled: 'CANCELLED',
    replaces: 'Replaces invoice',
  },
  ar: {
    simplified: 'فاتورة ضريبية مبسطة', gift: 'إيصال هدية', kitchen: 'تذكرة المطبخ', tax: 'فاتورة ضريبية',
    invoice: 'رقم الفاتورة', date: 'التاريخ', cashier: 'الكاشير', branch: 'الفرع', vat: 'الرقم الضريبي', cr: 'السجل التجاري',
    item: 'الصنف', qty: 'الكمية', price: 'السعر', total: 'الإجمالي', subtotal: 'المجموع قبل الضريبة', vatAmount: 'ضريبة ١٥٪', receipt: 'إيصال', inclTax: 'الإجمالي شامل الضريبة', noTax: 'الإجمالي',
    discount: 'الخصم', grand: 'الإجمالي شامل الضريبة', taxNote: 'الأسعار شاملة الضريبة', addedNote: 'الضريبة مضافة على الأسعار', hsn: 'ملخص الضريبة', paid: 'المدفوع', cash: 'نقدًا', card: 'شبكة', credit: 'آجل',
    tendered: 'المبلغ المستلم', change: 'الباقي', refund: 'المبلغ المعاد', buyer: 'المشتري', thanks: 'شكرًا لزيارتكم',
    giftNote: 'الأسعار غير ظاهرة. الاستبدال خلال ٧ أيام بهذا الإيصال.', copy: 'نسخة', cancelled: 'ملغاة',
    replaces: 'تحل محل الفاتورة',
  },
};

export async function renderDocument(kind: PrintKind, ctx: PrintContext): Promise<string> {
  const { sale, company, language } = ctx;
  const L = LABELS[language];
  const dir = language === 'ar' ? 'rtl' : 'ltr';
  const when = new Date(sale.soldAt).toLocaleString(language === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', {
    dateStyle: 'medium', timeStyle: 'short',
  });
  const qr = sale.zatca && (sale.tax?.enabled ?? true) && kind !== 'kitchen' && kind !== 'gift'
    ? await QRCode.toString(sale.zatca.qrBase64, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
    : '';
  const cancelled = sale.status === 'voided' ? `<div class="stamp">${L.cancelled}</div>` : '';
  const name = (e: { nameAr: string; nameEn: string }) => esc(language === 'ar' ? e.nameAr : e.nameEn);
  /* Old sales predate the snapshot: they were Saudi VAT 15 % inclusive. */
  const tax = sale.tax ?? { enabled: true, inclusive: true, name: 'VAT', registrationLabel: L.vat, lines: [{ label: L.vatAmount, name: 'VAT', percent: 15, taxableH: sale.subtotalH, taxH: sale.taxH }] };
  const regLabel = sale.tax ? esc(tax.registrationLabel) : L.vat;

  if (kind === 'kitchen') {
    return page('80mm', dir, `
      <h1 class="big">${L.kitchen}</h1>
      <div class="row big"><span>#${esc(sale.invoiceNumber)}</span><span>${when}</span></div>
      <hr>
      ${sale.lines.map((line) => `
        <div class="kline"><b class="qty">${line.quantity}×</b> <b>${name(line)}</b>${lineDetails(line, language)}</div>`).join('')}
      <hr><div class="center sub">${esc(ctx.branchName)} · ${esc(sale.cashierName)}</div>`);
  }

  const header = `
    <div class="center">
      <h1>${bilingual(company.nameAr, company.nameEn, language)}</h1>
      <div class="sub">${esc(ctx.branchName)}</div>
      ${tax.enabled ? `<div class="sub">${regLabel}: ${esc(ctx.taxNumber ?? (activeTax().registrationNumber || company.vatNumber))}${company.crNumber ? ` · ${L.cr}: ${esc(company.crNumber)}` : ''}</div>` : company.crNumber ? `<div class="sub">${L.cr}: ${esc(company.crNumber)}</div>` : ''}
      <h2>${kind === 'gift' ? L.gift : !tax.enabled ? L.receipt : kind === 'a4' ? L.tax : L.simplified}</h2>
    </div>
    ${cancelled}
    ${sale.orderNo ? `<div class="center big"><b>#${sale.orderNo}</b></div>` : ''}
    <div class="row"><span>${L.invoice}</span><b>${esc(sale.invoiceNumber)}</b></div>
    <div class="row"><span>${L.date}</span><span>${when}</span></div>
    <div class="row"><span>${L.cashier}</span><span>${esc(sale.cashierName)}</span></div>
    ${sale.replacesInvoice ? `<div class="row"><span>${L.replaces}</span><span>${esc(sale.replacesInvoice)}</span></div>` : ''}
    ${kind === 'a4' && ctx.customer ? `<div class="row"><span>${L.buyer}</span><span>${name(ctx.customer)}</span></div>` : ''}`;

  const priced = kind !== 'gift';
  const rows = sale.lines.map((line) => `
    <tr>
      <td>${name(line)}${lineDetails(line, language)}</td>
      <td class="num">${line.quantity}</td>
      ${priced ? `<td class="num">${sar(line.unitPriceH)}</td><td class="num">${sar(lineGrossH(line))}</td>` : ''}
    </tr>`).join('');

  const table = `
    <table>
      <thead><tr><th>${L.item}</th><th class="num">${L.qty}</th>${priced ? `<th class="num">${L.price}</th><th class="num">${L.total}</th>` : ''}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  const cashH = sale.payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amountH, 0);
  const totals = priced ? `
    <hr>
    ${sale.discountH > 0 ? `<div class="row"><span>${L.discount}</span><span>-${sar(sale.discountH)}</span></div>` : ''}
    ${tax.enabled ? `<div class="row"><span>${L.subtotal}</span><span>${sar(sale.subtotalH)}</span></div>
    ${tax.lines.map((t) => `<div class="row"><span>${esc(t.label)}</span><span>${sar(t.taxH)}</span></div>`).join('')}` : ''}
    <div class="row grand"><span>${tax.enabled ? L.inclTax : L.noTax}</span><span>${sar(sale.totalH)}</span></div>
    ${tax.enabled ? `<div class="center sub">${tax.inclusive ? L.taxNote : L.addedNote}</div>` : ''}
    <hr>
    ${sale.payments.map((p) => `<div class="row"><span>${L[p.method]}</span><span>${sar(p.amountH)}</span></div>`).join('')}
    ${cashH > 0 && sale.tenderedH ? `<div class="row"><span>${L.tendered}</span><span>${sar(sale.tenderedH)}</span></div>
      <div class="row"><span>${L.change}</span><span>${sar(sale.changeH)}</span></div>` : ''}
    ${sale.refundH ? `<div class="row"><span>${L.refund}</span><span>${sar(sale.refundH)}</span></div>` : ''}` : `<p class="center sub">${L.giftNote}</p>`;

  const footer = `
    ${qr ? `<div class="qr">${qr}</div>` : ''}
    <p class="center">${L.thanks}</p>`;

  return page(kind === 'a4' ? 'A4' : '80mm', dir, header + table + totals + footer);
}

function page(size: '80mm' | 'A4', dir: string, body: string): string {
  const width = size === 'A4' ? '190mm' : '72mm';
  return `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>Print</title><style>
    @page { size: ${size === 'A4' ? 'A4' : '80mm auto'}; margin: ${size === 'A4' ? '12mm' : '3mm'}; }
    * { box-sizing: border-box; }
    body { font-family: 'IBM Plex Sans Arabic', 'Inter', Arial, sans-serif; color: #000; margin: 0; width: ${width}; font-size: ${size === 'A4' ? '12px' : '11.5px'}; }
    h1 { font-size: 15px; margin: 0 0 2px; } h2 { font-size: 13px; margin: 6px 0; border: 1px solid #000; padding: 3px; }
    .big { font-size: 18px; } h1.big { font-size: 20px; text-align: center; border-bottom: 2px solid #000; }
    .sub { font-size: 10px; color: #333; } .center { text-align: center; }
    .row { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; }
    .grand { font-weight: 700; font-size: 14px; border-top: 1px dashed #000; margin-top: 3px; padding-top: 3px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { text-align: start; border-bottom: 1px solid #000; font-size: 10.5px; } td { vertical-align: top; padding: 3px 0; border-bottom: 1px dotted #999; }
    .num { text-align: end; white-space: nowrap; padding-inline-start: 6px; }
    .mod { font-size: 10px; color: #333; }
    .kline { font-size: 15px; padding: 5px 0; border-bottom: 1px dashed #000; } .qty { font-size: 18px; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .qr { width: 34mm; height: 34mm; margin: 8px auto 4px; } .qr svg { width: 100%; height: 100%; }
    .stamp { border: 3px double #000; text-align: center; font-weight: 800; font-size: 18px; margin: 6px 0; padding: 2px; }
  </style></head><body>${body}</body></html>`;
}

/** Send HTML to the print dialog through a hidden frame, once per copy. */
export async function printHtml(html: string, copies = 1): Promise<void> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  const match = html.match(/^([\s\S]*<body>)([\s\S]*)(<\/body>[\s\S]*)$/);
  const document_ = match
    ? match[1] + Array.from({ length: Math.max(1, copies) }, () => match[2]).join('<div style="page-break-after:always"></div>') + match[3]
    : html;
  doc.open();
  doc.write(document_);
  doc.close();
  await new Promise((resolve) => setTimeout(resolve, 250));
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  setTimeout(() => frame.remove(), 1500);
}

