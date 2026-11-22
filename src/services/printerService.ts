import { USE_MOCKS } from '@/config/env';
import { api } from './apiClient';
import { clone, delay, nextId, timestamp } from './mock/store';
import { registerSlice, schedulePersist } from './mock/db';
import { seedFor } from './mock/seed';
import { companyService } from './companyService';
import { buildReceiptModel, renderReceipt, testModel, toBase64, type ReceiptModel } from '@/lib/escpos';
import { PrintError, sendBluetooth, sendNetwork } from '@/lib/printTransports';
import { printHtml, renderDocument } from '@/lib/receipt';
import type { Customer, Sale } from '@/types/sales';
import type { PrintDocKind, PrintJob, PrintOutcome, PrinterConfig } from '@/types/printers';

/**
 * Printers and print jobs.
 *
 * Printer settings live with the business (per branch). A Bluetooth pairing
 * belongs to the device that made it — another phone pairs again with one tap.
 */

let printers: PrinterConfig[] = [];
let jobs: PrintJob[] = [];

function seedPrinters(tenantId: string): PrinterConfig[] {
  const branches = seedFor(tenantId).branches;
  return branches.flatMap((b) => [
    {
      id: `prn_${b.id}_screen`, name: 'Screen preview', branchId: b.id, connection: 'preview' as const, paperWidth: 80 as const,
      mode: 'auto' as const, dataSaver: false, copies: 1, documents: ['receipt', 'gift', 'kitchen'] as PrintDocKind[],
      defaultFor: ['receipt'] as PrintDocKind[], status: 'active' as const,
    },
    {
      id: `prn_${b.id}_system`, name: 'Device print dialog (A4 / AirPrint / Sunmi)', branchId: b.id, connection: 'system' as const, paperWidth: 80 as const,
      mode: 'auto' as const, dataSaver: false, copies: 1, documents: ['receipt', 'gift', 'kitchen', 'a4'] as PrintDocKind[],
      defaultFor: ['a4'] as PrintDocKind[], status: 'active' as const,
    },
  ]);
}

registerSlice('printers', {
  capture: () => ({ printers, jobs }),
  restore: (snap: { printers: PrinterConfig[]; jobs: PrintJob[] }) => {
    if (!Array.isArray(snap.printers)) throw new Error('printers snapshot is malformed');
    printers = snap.printers;
    jobs = snap.jobs ?? [];
  },
  seed: (tenantId) => {
    printers = seedPrinters(tenantId);
    jobs = [];
  },
});

export interface PrintSaleInput {
  sale: Sale;
  kind: PrintDocKind;
  printerId?: string | null;
  branchName: string;
  customer?: Customer | null;
  language: 'ar' | 'en';
}

const forBranch = (branchId: string | null) => printers.filter((p) => !branchId || p.branchId === branchId || p.branchId === null);

/** Send a rendered model to a printer. */
async function deliver(printer: PrinterConfig, model: ReceiptModel, reference: string, kind: PrintDocKind): Promise<PrintOutcome> {
  const rendered = await renderReceipt(model, printer.paperWidth, printer.dataSaver && printer.connection === 'cloud' && printer.mode === 'auto' ? 'text' : printer.mode);
  const copies = Math.max(1, Math.min(5, printer.copies || 1));
  try {
    if (printer.connection === 'preview') {
      return { ok: true, printer, bytes: rendered.bytes.length, previewUrl: (rendered.canvas ?? (await renderReceipt(model, printer.paperWidth, 'image')).canvas)!.toDataURL('image/png') };
    }
    if (printer.connection === 'bluetooth') {
      for (let i = 0; i < copies; i++) await sendBluetooth(printer, rendered.bytes);
    } else if (printer.connection === 'network') {
      for (let i = 0; i < copies; i++) await sendNetwork(printer, rendered.bytes);
    } else if (printer.connection === 'cloud') {
      const job: PrintJob = {
        id: nextId('pjb'), printerId: printer.id, printerName: printer.name, document: kind, reference,
        bytes: rendered.bytes.length * copies, status: 'queued', createdAt: timestamp(),
      };
      if (!USE_MOCKS) {
        await api.post('/api/print-jobs', { printerId: printer.id, document: kind, reference, copies, payloadBase64: toBase64(rendered.bytes) });
      } else {
        jobs = [job, ...jobs].slice(0, 100);
        /* Demo: the printer picks the job up on its next poll. */
        setTimeout(() => {
          jobs = jobs.map((j) => (j.id === job.id ? { ...j, status: 'printed', printedAt: timestamp() } : j));
          schedulePersist();
        }, 2500);
      }
      touch(printer.id);
      return { ok: true, printer, bytes: job.bytes, jobId: job.id };
    }
    touch(printer.id);
    return { ok: true, printer, bytes: rendered.bytes.length * copies };
  } catch (error) {
    const code = error instanceof PrintError ? error.code : 'FAILED';
    const message = error instanceof Error ? error.message : String(error);
    printers = printers.map((p) => (p.id === printer.id ? { ...p, lastError: message } : p));
    schedulePersist();
    return { ok: false, printer, bytes: rendered.bytes.length, error: message, errorCode: code };
  }
}

function touch(id: string) {
  printers = printers.map((p) => (p.id === id ? { ...p, lastUsedAt: timestamp(), lastError: undefined } : p));
  schedulePersist();
}

export const printerService = {
  async list(branchId: string | null): Promise<PrinterConfig[]> {
    if (!USE_MOCKS) return api.get('/api/printers', { query: { branchId: branchId ?? undefined } });
    await delay(60);
    return clone(forBranch(branchId));
  },

  /** The default printer for a document at a branch, if one is set. */
  async defaultFor(kind: PrintDocKind, branchId: string | null): Promise<PrinterConfig | null> {
    const list = await printerService.list(branchId);
    return list.find((p) => p.status === 'active' && p.defaultFor.includes(kind)) ?? null;
  },

  async save(printer: Omit<PrinterConfig, 'id'> & { id?: string }): Promise<PrinterConfig> {
    if (!printer.name.trim()) throw new Error('Give the printer a name.');
    if (printer.documents.length === 0) throw new Error('Pick at least one document this printer prints.');
    if (!USE_MOCKS) return api.put('/api/printers', printer);
    await delay(120);
    const saved: PrinterConfig = { ...clone(printer), id: printer.id ?? nextId('prn'), defaultFor: printer.defaultFor.filter((k) => printer.documents.includes(k)) };
    /* One default per document per branch. */
    printers = printers.map((p) =>
      p.id !== saved.id && p.branchId === saved.branchId ? { ...p, defaultFor: p.defaultFor.filter((k) => !saved.defaultFor.includes(k)) } : p,
    );
    printers = printers.some((p) => p.id === saved.id) ? printers.map((p) => (p.id === saved.id ? saved : p)) : [...printers, saved];
    return clone(saved);
  },

  async setDefault(printerId: string, kind: PrintDocKind): Promise<void> {
    await delay(60);
    const target = printers.find((p) => p.id === printerId);
    if (!target) return;
    printers = printers.map((p) => {
      if (p.branchId !== target.branchId) return p;
      if (p.id === printerId) return { ...p, defaultFor: [...new Set([...p.defaultFor, kind])], documents: [...new Set([...p.documents, kind])] };
      return { ...p, defaultFor: p.defaultFor.filter((k) => k !== kind) };
    });
  },

  async remove(id: string): Promise<void> {
    await delay(80);
    printers = printers.filter((p) => p.id !== id);
  },

  async jobs(): Promise<PrintJob[]> {
    await delay(40);
    return clone(jobs);
  },

  /** Print an order on a printer (or the document's default). */
  async printSale(input: PrintSaleInput): Promise<PrintOutcome> {
    const branchId = input.sale.branchId;
    const list = forBranch(branchId);
    const printer =
      (input.printerId ? list.find((p) => p.id === input.printerId) : undefined) ??
      list.find((p) => p.status === 'active' && p.defaultFor.includes(input.kind)) ??
      null;
    if (!printer) return { ok: false, printer: null, bytes: 0, error: 'No printer is set for this document.', errorCode: 'NO_PRINTER' };

    const company = await companyService.get();

    /* A4 and the device dialog use the HTML layouts. */
    if (input.kind === 'a4' || printer.connection === 'system') {
      const html = await renderDocument(input.kind === 'a4' ? 'a4' : input.kind, {
        sale: input.sale, company, branchName: input.branchName, customer: input.customer ?? null, language: input.language, copies: printer.copies,
      });
      await printHtml(html, printer.copies);
      touch(printer.id);
      return { ok: true, printer, bytes: html.length };
    }

    const model = buildReceiptModel({
      sale: input.sale, company, branchName: input.branchName, language: input.language,
      kind: input.kind, dataSaver: printer.dataSaver,
    });
    return deliver(printer, model, input.sale.invoiceNumber, input.kind);
  },

  async testPrint(printer: PrinterConfig, language: 'ar' | 'en'): Promise<PrintOutcome> {
    if (printer.connection === 'system') {
      await printHtml(`<!doctype html><html><body style="font-family:sans-serif;text-align:center"><h2>TEST PRINT</h2><p>${printer.name}</p></body></html>`);
      return { ok: true, printer, bytes: 0 };
    }
    return deliver(printer, testModel(printer.name, printer.paperWidth, language), 'TEST', 'receipt');
  },
};
