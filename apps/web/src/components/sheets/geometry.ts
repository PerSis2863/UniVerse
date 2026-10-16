import type { Area } from '@/lib/sheet/refs';

// Where rows and columns are on screen (Office suite · spreadsheets): running totals of their sizes,
// so the grid draws only what's in view and finds the cell under the pointer quickly. Hidden rows
// and columns have size 0.

export const HEADER_H = 24, ROWHEAD_W = 48;

export class Axis {
  readonly starts: Float64Array;
  constructor(readonly n: number, size: (i: number) => number) {
    this.starts = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) this.starts[i + 1] = this.starts[i] + size(i);
  }
  pos(i: number) { return this.starts[Math.max(0, Math.min(this.n, i))]; }
  size(i: number) { return i < 0 || i >= this.n ? 0 : this.starts[i + 1] - this.starts[i]; }
  get total() { return this.starts[this.n]; }
  /** The index at a position (the last one if past the end); hidden ones are skipped. */
  at(px: number): number {
    if (px <= 0) { let i = 0; while (i < this.n - 1 && this.size(i) === 0) i++; return i; }
    let lo = 0, hi = this.n - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.starts[mid] <= px) lo = mid; else hi = mid - 1; }
    while (lo > 0 && this.size(lo) === 0) lo--;
    return lo;
  }
  /** The span of an area along this axis. */
  span(a: number, b: number) { return this.pos(b + 1) - this.pos(a); }
}

/** Visible index range (with a few extra each side), never inside the frozen part. */
export function windowOf(axis: Axis, frozen: number, scroll: number, view: number, header: number, extra = 3): [number, number] {
  const frozenSize = axis.pos(frozen);
  const first = Math.max(frozen, axis.at(scroll + frozenSize) - extra);
  const last = Math.min(axis.n - 1, axis.at(scroll + view - header) + extra);
  return [first, Math.max(first, last)];
}

export const areaKeyBox = (rows: Axis, cols: Axis, a: Area) => ({ top: rows.pos(a.r1), left: cols.pos(a.c1), height: rows.span(a.r1, a.r2), width: cols.span(a.c1, a.c2) });
