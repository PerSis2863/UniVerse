'use client';

import { useMemo } from 'react';
import { canEncode128, code128 } from '@/lib/code128';

/** A Code 128 barcode as an inline SVG (Stage 5 · Q22): black on white in any theme, so scanners read it. */
export function Barcode({ value, height = 48, className, title }: { value: string; height?: number; className?: string; title?: string }) {
  const bars = useMemo(() => {
    if (!canEncode128(value)) return null;
    const w = code128(value);
    const out: { x: number; w: number }[] = [];
    let x = 10;
    w.forEach((n, i) => { if (i % 2 === 0) out.push({ x, w: n }); x += n; });
    return { out, total: x + 10 };
  }, [value]);
  if (!bars) return null;
  return (
    <svg role="img" aria-label={title ?? `Barcode ${value}`} viewBox={`0 0 ${bars.total} 40`} preserveAspectRatio="none" height={height} className={className} shapeRendering="crispEdges">
      <rect width={bars.total} height={40} fill="#fff" />
      <g fill="#000">{bars.out.map((b) => <rect key={b.x} x={b.x} y={0} width={b.w} height={40} />)}</g>
    </svg>
  );
}
