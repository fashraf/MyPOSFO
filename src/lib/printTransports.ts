import type { PrinterConfig } from '@/types/printers';
import { toHex } from './escpos';

/**
 * Getting bytes to a printer.
 *
 * Bluetooth uses Web Bluetooth (Chrome / Edge on Android, ChromeOS, Windows,
 * macOS; Bluefy on iOS). Most cheap 58/80 mm thermal printers expose a BLE
 * "serial" service that takes raw ESC/POS. Classic-only (SPP) printers need the
 * native wrapper — see the gaps document.
 */

/* Services that common BLE thermal printers expose (Xprinter, Rongta, Goojprt,
   MUNBYN, Sunmi cloud printers, Epson TM-P mobile, Star SM-L). */
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
];

/* Minimal Web Bluetooth typing — the DOM lib does not ship it. */
interface BtCharacteristic {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue(data: BufferSource): Promise<void>;
  writeValueWithoutResponse?(data: BufferSource): Promise<void>;
}
interface BtService {
  getCharacteristics(): Promise<BtCharacteristic[]>;
}
interface BtServer {
  connected: boolean;
  getPrimaryService(uuid: string): Promise<BtService>;
}
interface BtDevice {
  id: string;
  name?: string;
  gatt?: { connect(): Promise<BtServer>; connected: boolean };
}
interface BtApi {
  requestDevice(options: unknown): Promise<BtDevice>;
  getDevices?(): Promise<BtDevice[]>;
}

export class PrintError extends Error {
  constructor(public code: 'NEED_PAIRING' | 'BLUETOOTH_UNSUPPORTED' | 'NETWORK_UNREACHABLE' | 'MIXED_CONTENT' | 'FAILED', message: string) {
    super(message);
  }
}

function bluetooth(): BtApi | null {
  return (navigator as unknown as { bluetooth?: BtApi }).bluetooth ?? null;
}

export function bluetoothSupported(): boolean {
  return !!bluetooth();
}

const known = new Map<string, BtDevice>();
const writers = new Map<string, BtCharacteristic>();

/** Ask the user to pick a printer. Must be called from a tap. */
export async function pairBluetooth(): Promise<{ id: string; name: string }> {
  const bt = bluetooth();
  if (!bt) throw new PrintError('BLUETOOTH_UNSUPPORTED', 'This browser cannot use Bluetooth. Use Chrome on Android, or the system print option.');
  const device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES });
  known.set(device.id, device);
  return { id: device.id, name: device.name ?? 'Bluetooth printer' };
}

async function findWriter(device: BtDevice): Promise<BtCharacteristic> {
  const cached = writers.get(device.id);
  if (cached && device.gatt?.connected) return cached;
  const server = await device.gatt!.connect();
  for (const uuid of PRINTER_SERVICES) {
    try {
      const service = await server.getPrimaryService(uuid);
      const chars = await service.getCharacteristics();
      const writable = chars.find((c) => c.properties.writeWithoutResponse || c.properties.write);
      if (writable) {
        writers.set(device.id, writable);
        return writable;
      }
    } catch {
      /* not this service */
    }
  }
  throw new PrintError('FAILED', 'Connected, but this printer does not accept data over Bluetooth LE.');
}

async function deviceFor(printer: PrinterConfig): Promise<BtDevice> {
  const bt = bluetooth();
  if (!bt) throw new PrintError('BLUETOOTH_UNSUPPORTED', 'This browser cannot use Bluetooth.');
  const id = printer.bluetoothId ?? '';
  let device = known.get(id);
  if (!device && bt.getDevices) {
    device = (await bt.getDevices()).find((d) => d.id === id);
    if (device) known.set(id, device);
  }
  if (!device) throw new PrintError('NEED_PAIRING', `Tap "Connect" to pair ${printer.bluetoothName ?? printer.name} with this device.`);
  return device;
}

export async function sendBluetooth(printer: PrinterConfig, bytes: Uint8Array): Promise<void> {
  const device = await deviceFor(printer);
  const writer = await findWriter(device);
  const size = Math.max(20, Math.min(512, printer.chunkSize ?? 180));
  for (let i = 0; i < bytes.length; i += size) {
    const chunk = bytes.slice(i, i + size);
    if (writer.properties.writeWithoutResponse && writer.writeValueWithoutResponse) await writer.writeValueWithoutResponse(chunk);
    else await writer.writeValue(chunk);
    /* Give small printer buffers time to drain. */
    if (writer.properties.writeWithoutResponse) await new Promise((r) => setTimeout(r, 12));
  }
}

/** Epson ePOS-Print over HTTP(S), raw ESC/POS in a <command> element. */
export async function sendNetwork(printer: PrinterConfig, bytes: Uint8Array): Promise<void> {
  const secure = location.protocol === 'https:';
  if (printer.protocol === 'raw_http') {
    if (!printer.url) throw new PrintError('FAILED', 'Set the print bridge URL.');
    if (secure && printer.url.startsWith('http:')) throw new PrintError('MIXED_CONTENT', 'This page is secure (https) and the printer is not. Use cloud printing, or a printer with https.');
    await post(printer.url, bytes, 'application/octet-stream');
    return;
  }
  if (!printer.host) throw new PrintError('FAILED', 'Set the printer IP address.');
  const scheme = secure ? 'https' : 'http';
  const port = printer.port ? `:${printer.port}` : '';
  const url = `${scheme}://${printer.host}${port}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`;
  const body =
    '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' +
    `<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"><command>${toHex(bytes)}</command></epos-print>` +
    '</s:Body></s:Envelope>';
  await post(url, body, 'text/xml; charset=utf-8');
}

async function post(url: string, body: BodyInit, type: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': type }, signal: controller.signal });
    if (!res.ok) throw new PrintError('FAILED', `The printer answered ${res.status}.`);
  } catch (error) {
    if (error instanceof PrintError) throw error;
    throw new PrintError('NETWORK_UNREACHABLE', 'Could not reach the printer. Is this device on the same Wi-Fi? On mobile data, use cloud printing.');
  } finally {
    clearTimeout(timer);
  }
}
