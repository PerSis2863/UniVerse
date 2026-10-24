// Maths for the instrument boards (src/components/instruments): summary numbers, a p95 from a
// histogram, and SVG paths for lines and areas. Kept free of React so it can be tested.

export interface Stats { last: number; avg: number; min: number; max: number; p95: number; total: number }

/** Last, average, lowest, highest, 95th percentile and total of a series (0s for an empty one). */
export function stats(values: number[]): Stats {
  if (!values.length) return { last: 0, avg: 0, min: 0, max: 0, p95: 0, total: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const total = values.reduce((s, v) => s + v, 0);
  return {
    last: values[values.length - 1],
    avg: total / values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p95: sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)],
    total,
  };
}

/** The bin index holding the given percentile of a histogram's counts (-1 when it's empty). */
export function percentileBin(bins: number[], p = 0.95): number {
  const total = bins.reduce((s, c) => s + c, 0);
  if (!total) return -1;
  let seen = 0;
  for (let i = 0; i < bins.length; i++) {
    seen += bins[i];
    if (seen >= total * p) return i;
  }
  return bins.length - 1;
}

/** Percent change from `before` to `now`, or null when there's nothing to compare with. */
export function change(now: number, before: number): number | null {
  if (!before) return null;
  return ((now - before) / before) * 100;
}

/** A round top for an axis ("nice" number at or above `max`) and evenly spaced ticks up to it. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => Math.round(i * step * 1e6) / 1e6);
}

/** Points of a series scaled into a w × h box (y grows down), between `lo` and `hi`. */
export function points(values: number[], w: number, h: number, lo = Math.min(0, ...values), hi = Math.max(...values, lo + 1)): [number, number][] {
  const span = hi - lo || 1;
  const dx = values.length > 1 ? w / (values.length - 1) : 0;
  return values.map((v, i) => [Math.round(i * dx * 10) / 10, Math.round((h - ((v - lo) / span) * h) * 10) / 10]);
}

/** A smooth line through the points (Catmull-Rom as cubic Béziers), as an SVG path. */
export function linePath(pts: [number, number][]): string {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1] ?? pts[i], pts[i], pts[i + 1], pts[i + 2] ?? pts[i + 1]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${r1(c1[0])},${r1(c1[1])} ${r1(c2[0])},${r1(c2[1])} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** The line closed down to the bottom of the box, for the soft fill under it. */
export function areaPath(pts: [number, number][], h: number): string {
  if (!pts.length) return '';
  return `${linePath(pts)} L${pts[pts.length - 1][0]},${h} L${pts[0][0]},${h} Z`;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** A number in the console's style: 1,172 / 4.7 / 0.31, short when large (12.4k). */
export function fmt(v: number, digits?: number): string {
  if (!Number.isFinite(v)) return '–';
  const abs = Math.abs(v);
  if (abs >= 10_000_000) return `${(v / 1e6).toFixed(0)}M`;
  if (abs >= 1_000_000) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 100_000) return `${(v / 1000).toFixed(0)}k`;
  if (abs >= 10_000) return `${(v / 1000).toFixed(1)}k`;
  const d = digits ?? (abs >= 100 || Number.isInteger(v) ? 0 : abs >= 10 ? 1 : 2);
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
