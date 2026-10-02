'use client';

import { useMemo } from 'react';
import { encodeQr, qrPath } from '@/lib/qr';

const MARGIN = 4; // the quiet zone scanners need around the code, in modules

/**
 * A QR code as an inline SVG. It always draws dark on white (even in dark mode), because
 * many phone scanners can't read inverted codes.
 */
export function QrCode({ value, size = 160, className, title }: { value: string; size?: number; className?: string; title?: string }) {
  const svg = useMemo(() => {
    try {
      const matrix = encodeQr(value);
      return { d: qrPath(matrix, MARGIN), dim: matrix.length + MARGIN * 2 };
    } catch {
      return null; // too long to encode; nothing sensible to draw
    }
  }, [value]);
  if (!svg) return null;
  return (
    <svg
      role="img"
      aria-label={title ?? 'QR code'}
      viewBox={`0 0 ${svg.dim} ${svg.dim}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={svg.dim} height={svg.dim} fill="#ffffff" />
      <path d={svg.d} fill="#0f172a" />
    </svg>
  );
}
