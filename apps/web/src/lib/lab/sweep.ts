import { stepDecimals, type Control } from './controls';

// Hyperion's Sweep (M402, the owner's 20 big features: "combine 2 features into one"): a live slider run through its
// whole range at once. The script runs once per value (each in a fresh workspace), every run's figure becomes a frame of
// a film you can play and save as a GIF, and every number it leaves behind goes in a table that says where each result
// is largest, smallest and where it changes sign: a parameter study and an animation in one.

export interface SweepFrame { value: number; light: string; dark: string; outs: Record<string, number>; error?: string }
/** The most frames a sweep makes. */
export const MAX_FRAMES = 48;

/** `n` values from `from` to `to`, both ends kept, snapped to the slider's step and written as the script will hold them;
 *  repeats (a coarse step) are dropped. */
export function sweepValues(c: Control, from: number, to: number, n: number): number[] {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return [];
  const count = Math.max(2, Math.min(MAX_FRAMES, Math.round(n) || 2)), dec = stepDecimals(c.step), out: number[] = [];
  for (let k = 0; k < count; k++) {
    const raw = from + ((to - from) * k) / (count - 1);
    // The ends stay exactly as typed; the values between land on the slider's own steps.
    const v = k === 0 ? from : k === count - 1 ? to : c.min + Math.round((raw - c.min) / c.step) * c.step;
    const w = +v.toFixed(Math.max(dec, decimalsOf(from), decimalsOf(to)));
    if (!out.includes(w)) out.push(w);
  }
  return out;
}
const decimalsOf = (x: number) => { const m = /\.(\d+)$/.exec(String(x)); return m ? Math.min(10, m[1].length) : 0; };

/** One script per value, the slider's value written in (exactly: a typed end may have more decimals than the step). */
export const sweepCodes = (code: string, c: Control, values: number[]) => values.map((v) => code.slice(0, c.from) + String(v) + code.slice(c.to));

export interface Column {
  name: string;
  values: (number | null)[];
  /** The frames where it is largest and smallest. */
  max: number; min: number;
  /** It changes sign between this frame and the next (or is 0 here), or null. */
  zero: number | null;
}

/** The numbers worth a column: those the runs left behind that change from one value to the next (at most `most`). */
export function sweepColumns(frames: (SweepFrame | undefined)[], swept: string, most = 8): Column[] {
  const names: string[] = [];
  for (const f of frames) for (const n of Object.keys(f?.outs ?? {})) if (n !== swept && !names.includes(n)) names.push(n);
  const cols: Column[] = [];
  for (const name of names) {
    const values = frames.map((f) => { const v = f?.outs[name]; return v === undefined || !Number.isFinite(v) ? null : v; });
    const real = values.filter((v): v is number => v !== null);
    if (real.length < 2) continue;
    const lo = Math.min(...real), hi = Math.max(...real);
    if (hi - lo <= 1e-12 * Math.max(1, Math.abs(hi))) continue; // the same every time
    let zero: number | null = null;
    for (let k = 0; k < values.length && zero === null; k++) {
      const a = values[k], b = values[k + 1];
      if (a === 0) zero = k;
      else if (a !== null && b !== undefined && b !== null && Math.sign(a) !== Math.sign(b) && b !== 0) zero = k;
    }
    cols.push({ name, values, max: values.indexOf(hi), min: values.indexOf(lo), zero });
    if (cols.length >= most) break;
  }
  return cols;
}

/** A number for a table: up to 5 significant figures. */
export const num = (v: number | null) => (v === null ? '–' : Math.abs(v) >= 1e6 || (v !== 0 && Math.abs(v) < 1e-4) ? v.toExponential(3) : String(+v.toPrecision(5)));

/** What the table shows, in sentences: "x is largest at theta = 45 (40.8)". */
export function findings(cols: Column[], swept: string, values: number[]): string[] {
  return cols.flatMap((c) => {
    const out = [`${c.name} is largest at ${swept} = ${num(values[c.max])} (${num(c.values[c.max])}) and smallest at ${swept} = ${num(values[c.min])} (${num(c.values[c.min])}).`];
    if (c.zero !== null) out.push(c.values[c.zero] === 0 ? `${c.name} is 0 at ${swept} = ${num(values[c.zero])}.` : `${c.name} changes sign between ${swept} = ${num(values[c.zero])} and ${num(values[c.zero + 1])}.`);
    return out;
  });
}

/** The table as CSV (the swept value first). */
export function sweepCsv(cols: Column[], swept: string, values: number[]): string {
  const rows = [[swept, ...cols.map((c) => c.name)].join(',')];
  values.forEach((v, k) => rows.push([v, ...cols.map((c) => c.values[k] ?? '')].join(',')));
  return `${rows.join('\n')}\n`;
}
