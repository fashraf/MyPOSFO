import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { cn } from '@/lib/cn';

export interface ZatcaQrProps {
  /** Base64 TLV payload, exactly as ZATCA readers expect it. */
  payload: string;
  /** Rendered size in CSS pixels. */
  size?: number;
  className?: string;
}

/**
 * The receipt QR.
 *
 * Generated locally as SVG (no image service), so it works offline and prints
 * crisply on a 58mm thermal head. Error-correction M is what ZATCA's own
 * samples use: enough redundancy for a creased receipt, small enough to fit.
 */
export function ZatcaQr({ payload, size = 132, className }: ZatcaQrProps) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#111113', light: '#ffffff' } })
      .then((markup) => {
        if (!cancelled) setSvg(markup);
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  return (
    <div
      role="img"
      aria-label="ZATCA QR code"
      className={cn('overflow-hidden rounded-md bg-white [&>svg]:h-full [&>svg]:w-full', className)}
      style={{ width: size, height: size }}
      // The markup comes from the qrcode library, built from our own payload.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
