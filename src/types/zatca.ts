import type { ID } from './common';

/**
 * ZATCA Phase 2 (Fatoora) e-invoice metadata attached to every sale.
 *
 * A simplified tax invoice (B2C) is generated and stamped on the device, shown
 * to the customer as a QR, and reported to ZATCA within 24 hours. The fields
 * below are what an auditor asks for: the invoice's identity (UUID), its place
 * in the device's sequence (ICV), and the hash chain that proves no invoice was
 * removed or edited after the fact (each invoice carries its predecessor's hash).
 */

export type ZatcaReportingStatus = 'reported' | 'pending' | 'warning' | 'rejected';

export interface ZatcaInvoiceMeta {
  /** RFC 4122 v4, unique per invoice. */
  uuid: string;
  /** Invoice Counter Value — monotonic per device/EGS unit, never reset. */
  icv: number;
  /** Base64 SHA-256 of this invoice's canonical content. */
  invoiceHash: string;
  /** Hash of the previous invoice from the same EGS unit (PIH). */
  previousInvoiceHash: string;
  /** Base64 TLV payload rendered as the receipt QR code. */
  qrBase64: string;
  /** Simplified tax invoice (B2C, reported) or standard (B2B, cleared). */
  invoiceType: 'simplified' | 'standard';
  /** Which EGS unit (device) stamped it. */
  egsUnitId: string;
  reportingStatus: ZatcaReportingStatus;
  reportedAt: string | null;
  /** Validation messages returned by the reporting API, if any. */
  messages: string[];
}

export interface ZatcaLogEntry {
  saleId: ID;
  invoiceNumber: string;
  branchId: ID | null;
  totalH: number;
  taxH: number;
  issuedAt: string;
  zatca: ZatcaInvoiceMeta;
}
