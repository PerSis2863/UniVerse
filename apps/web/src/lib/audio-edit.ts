// The Studio audio editor (Stage 5 · B9.15): edits on raw sound (one Float32Array per channel, -1..1),
// each returning new arrays so undo keeps the old ones. Times are in samples.

export type Channels = Float32Array[];
export interface Range { start: number; end: number }

const clampRange = (r: Range, n: number): Range => ({ start: Math.max(0, Math.min(n, Math.round(Math.min(r.start, r.end)))), end: Math.max(0, Math.min(n, Math.round(Math.max(r.start, r.end)))) });

/** Only the selected part. */
export function trim(ch: Channels, r: Range): Channels {
  const { start, end } = clampRange(r, ch[0]?.length ?? 0);
  return ch.map((c) => c.slice(start, end));
}

/** Everything but the selected part. */
export function cut(ch: Channels, r: Range): Channels {
  const { start, end } = clampRange(r, ch[0]?.length ?? 0);
  return ch.map((c) => { const out = new Float32Array(c.length - (end - start)); out.set(c.subarray(0, start), 0); out.set(c.subarray(end), start); return out; });
}

/** A fade over the selected part: in (silence → full) or out (full → silence). */
export function fade(ch: Channels, r: Range, dir: 'in' | 'out'): Channels {
  const { start, end } = clampRange(r, ch[0]?.length ?? 0);
  const len = Math.max(1, end - start);
  return ch.map((c) => { const out = c.slice(); for (let i = start; i < end; i++) { const t = (i - start) / len; out[i] = c[i] * (dir === 'in' ? t : 1 - t); } return out; });
}

/** Louder or quieter by some decibels (on the selected part, or all), clipped to -1..1. */
export function gain(ch: Channels, db: number, r?: Range): Channels {
  const k = Math.pow(10, db / 20);
  const { start, end } = r ? clampRange(r, ch[0]?.length ?? 0) : { start: 0, end: ch[0]?.length ?? 0 };
  return ch.map((c) => { const out = c.slice(); for (let i = start; i < end; i++) out[i] = Math.max(-1, Math.min(1, c[i] * k)); return out; });
}

/** The loudest sample (0..1). */
export function peak(ch: Channels) {
  let p = 0;
  for (const c of ch) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > p) p = a; }
  return p;
}

/** As loud as it can be without clipping (the loudest moment at `target`). */
export function normalize(ch: Channels, target = 0.95): Channels {
  const p = peak(ch);
  if (p < 1e-6) return ch.map((c) => c.slice());
  const k = target / p;
  return ch.map((c) => c.map((v) => v * k));
}

/**
 * Quieter background hiss: a gate that turns down stretches (10 ms windows) quieter than the
 * threshold, with short ramps so it doesn't click.
 */
export function reduceNoise(ch: Channels, sampleRate: number, threshold = 0.02, floor = 0.1): Channels {
  const n = ch[0]?.length ?? 0, win = Math.max(1, Math.round(sampleRate * 0.01));
  const gains = new Float32Array(Math.ceil(n / win));
  for (let w = 0; w < gains.length; w++) {
    let sum = 0, count = 0;
    for (const c of ch) for (let i = w * win; i < Math.min(n, (w + 1) * win); i++) { sum += c[i] * c[i]; count++; }
    gains[w] = Math.sqrt(sum / Math.max(1, count)) < threshold ? floor : 1;
  }
  // Smooth the window gains so changes are gradual.
  const smooth = gains.map((g, w) => (g + (gains[w - 1] ?? g) + (gains[w + 1] ?? g)) / 3);
  return ch.map((c) => c.map((v, i) => v * smooth[Math.floor(i / win)]));
}

/** One peak value per pixel column, for drawing the waveform. */
export function peaks(ch: Channels, columns: number): Float32Array {
  const n = ch[0]?.length ?? 0, out = new Float32Array(Math.max(0, columns));
  if (!n || columns <= 0) return out;
  const per = n / columns;
  for (let x = 0; x < columns; x++) {
    let p = 0;
    const from = Math.floor(x * per), to = Math.min(n, Math.max(from + 1, Math.floor((x + 1) * per)));
    for (const c of ch) for (let i = from; i < to; i++) { const a = Math.abs(c[i]); if (a > p) p = a; }
    out[x] = p;
  }
  return out;
}

/** "1:05.3" for a number of seconds. */
export const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

/** The selected part made silent. */
export function silence(ch: Channels, r: Range): Channels {
  const { start, end } = clampRange(r, ch[0]?.length ?? 0);
  return ch.map((c) => { const out = c.slice(); out.fill(0, start, end); return out; });
}

/** The same sound with `count` channels: mono copied to each, or everything mixed into one. */
export function matchChannels(ch: Channels, count: number): Channels {
  if (ch.length === count || !ch.length) return ch;
  if (count === 1) return [toMono(ch)];
  return Array.from({ length: count }, (_, i) => (ch[i] ?? ch[0]).slice());
}

/** All channels mixed into one. */
export function toMono(ch: Channels): Float32Array {
  const n = ch[0]?.length ?? 0, out = new Float32Array(n);
  for (const c of ch) for (let i = 0; i < n; i++) out[i] += c[i] / ch.length;
  return out;
}

/** Another sound put in at a sample (it takes on this sound's channel count). */
export function insert(ch: Channels, at: number, other: Channels): Channels {
  const add = matchChannels(other, ch.length || other.length), n = ch[0]?.length ?? 0;
  const pos = Math.max(0, Math.min(n, Math.round(at)));
  if (!ch.length) return add.map((c) => c.slice());
  return ch.map((c, k) => { const o = add[k], out = new Float32Array(c.length + o.length); out.set(c.subarray(0, pos), 0); out.set(o, pos); out.set(c.subarray(pos), pos + o.length); return out; });
}

/** A different sample rate (straight-line in-between values; fine for voice). */
export function resample(c: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return c.slice();
  const n = Math.max(1, Math.round((c.length * to) / from)), out = new Float32Array(n), step = from / to;
  for (let i = 0; i < n; i++) { const p = i * step, a = Math.floor(p), t = p - a; out[i] = (c[a] ?? 0) * (1 - t) + (c[Math.min(c.length - 1, a + 1)] ?? 0) * t; }
  return out;
}

/** How many steps of undo to keep: fewer for long recordings, so memory stays reasonable. */
export const undoDepth = (samples: number) => Math.max(2, Math.min(20, Math.floor(120_000_000 / Math.max(1, samples))));
