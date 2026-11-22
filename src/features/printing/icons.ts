import { Bluetooth, Cloud, Eye, MonitorSmartphone, Wifi } from 'lucide-react';
import type { PrinterConnection } from '@/types/printers';

export const CONNECTION_ICON: Record<PrinterConnection, typeof Bluetooth> = {
  bluetooth: Bluetooth,
  network: Wifi,
  cloud: Cloud,
  system: MonitorSmartphone,
  preview: Eye,
};
