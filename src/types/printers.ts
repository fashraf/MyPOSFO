import type { ID } from './common';

/**
 * Receipt printers.
 *
 * How a printer is reached decides what works where:
 *
 *  - bluetooth  phone/tablet ↔ printer directly (Web Bluetooth, BLE). Needs no
 *               internet at all — the right choice on mobile data.
 *  - network    a LAN printer reached by its IP (Epson ePOS over HTTP, or a raw
 *               HTTP print bridge). Only works when the device is on the same
 *               Wi-Fi as the printer.
 *  - cloud      the printer polls the server for jobs (Star CloudPRNT, Epson
 *               Server Direct Print, or a Sunmi terminal running the POS). Works
 *               from anywhere, including a phone on 4G; jobs are tiny text.
 *  - system     the device's own print dialog: AirPrint, Mopria, or the Sunmi
 *               built-in printer when the POS runs on the terminal itself.
 *  - preview    shows the receipt on screen. For trying things out with no
 *               printer, and for checking a layout.
 */
export type PrinterConnection = 'bluetooth' | 'network' | 'cloud' | 'system' | 'preview';

/** What can be printed. */
export type PrintDocKind = 'receipt' | 'gift' | 'kitchen' | 'a4';

export const PRINT_DOC_KINDS: PrintDocKind[] = ['receipt', 'kitchen', 'gift', 'a4'];

/**
 * How the receipt is drawn for the printer:
 *  - text   ESC/POS text: smallest data and fastest, Latin characters only
 *  - image  the receipt drawn as a picture: any language (Arabic) and layout
 *  - auto   text when the receipt is all Latin, image otherwise
 */
export type RenderMode = 'auto' | 'text' | 'image';

export type NetworkProtocol = 'epos' | 'raw_http';

export interface PrinterConfig {
  id: ID;
  name: string;
  branchId: ID | null;
  connection: PrinterConnection;
  /** 58 mm (32 characters, 384 dots) or 80 mm (48 characters, 576 dots). A4 only via system. */
  paperWidth: 58 | 80;
  mode: RenderMode;
  /** Smaller output: no logo, compact spacing. Matters for cloud printing on mobile data. */
  dataSaver: boolean;
  copies: number;
  /** Documents this printer is allowed to print. */
  documents: PrintDocKind[];
  /** Documents for which this is the default printer. One default per document per branch. */
  defaultFor: PrintDocKind[];

  /* bluetooth */
  bluetoothId?: string;
  bluetoothName?: string;
  /** Bytes per write. BLE printers vary (20–512); 180 suits most. */
  chunkSize?: number;

  /* network */
  host?: string;
  port?: number;
  protocol?: NetworkProtocol;
  /** For raw_http: full URL of the print bridge. */
  url?: string;

  /* cloud */
  cloudId?: string;

  status: 'active' | 'inactive';
  lastUsedAt?: string;
  lastError?: string;
}

export interface PrintJob {
  id: ID;
  printerId: ID;
  printerName: string;
  document: PrintDocKind;
  reference: string;
  bytes: number;
  status: 'queued' | 'printing' | 'printed' | 'failed';
  createdAt: string;
  printedAt?: string;
  error?: string;
}

export interface PrintOutcome {
  ok: boolean;
  printer: PrinterConfig | null;
  /** Size of what was sent, so the screen can show how light a receipt is. */
  bytes: number;
  /** For preview printers: the receipt as an image. */
  previewUrl?: string;
  jobId?: string;
  error?: string;
  errorCode?: 'NO_PRINTER' | 'NEED_PAIRING' | 'BLUETOOTH_UNSUPPORTED' | 'NETWORK_UNREACHABLE' | 'MIXED_CONTENT' | 'FAILED';
}

export function charsPerLine(width: 58 | 80): number {
  return width === 58 ? 32 : 48;
}

export function dotsPerLine(width: 58 | 80): number {
  return width === 58 ? 384 : 576;
}
