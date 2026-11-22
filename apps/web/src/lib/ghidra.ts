// Ghidra (M421): UniVerse's own GPT, run in the browser (on a background thread: ghidra.worker.ts). It was trained from
// nothing by scripts/ai/train-ghidra.py (nanoGPT's design: a character-level transformer) on UniVerse's own sentences and
// simple English stories. Nothing is sent anywhere: the weights (public/ai/ghidra.bin, one byte per number with a scale
// per row) come down once and every letter is worked out on this device.

export interface GhidraMeta {
  name: string; chars: string; layers: number; heads: number; embd: number; block: number;
  params: number; trainedOn: number; steps: number; valLoss: number;
  /** The questions it was taught to answer (scripts/ai/ghidra-qa.txt), for the honesty guard (`familiar`). */
  known?: string[];
  /** Each table: its name, shape and where it starts in the file. A 2-D table is a 32-bit scale per row, then a byte per number. */
  shapes: [string, number[], number][];
  check: { prompt: string; logits: number[] };
}

export interface Ghidra { meta: GhidraMeta; w: Record<string, Float32Array> }

/** The model from its two files' contents, its numbers unpacked to 32-bit floats. */
export function makeGhidra(meta: GhidraMeta, bin: ArrayBuffer): Ghidra {
  const w: Record<string, Float32Array> = {};
  for (const [name, shape, at] of meta.shapes) {
    if (shape.length === 1) { w[name] = new Float32Array(bin.slice(at, at + shape[0] * 4)); continue; }
    const [rows, cols] = shape, scale = new Float32Array(bin.slice(at, at + rows * 4)), q = new Int8Array(bin, at + rows * 4, rows * cols);
    const out = new Float32Array(rows * cols);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out[r * cols + c] = q[r * cols + c] * scale[r];
    w[name] = out;
  }
  const last = meta.shapes[meta.shapes.length - 1];
  if (!last || bin.byteLength < last[2] + last[1][0] * 4) throw new Error('Ghidra: the weights don’t match their description');
  return { meta, w };
}

/** Downloads the model (about 2.8 MB, then cached by the browser). */
export async function loadGhidra(): Promise<Ghidra> {
  const [meta, bin] = await Promise.all([fetch('/ai/ghidra.json').then((r) => r.json() as Promise<GhidraMeta>), fetch('/ai/ghidra.bin').then((r) => r.arrayBuffer())]);
  return makeGhidra(meta, bin);
}

const layerNorm = (x: Float32Array, g: Float32Array) => {
  let mean = 0; for (const v of x) mean += v; mean /= x.length;
  let vr = 0; for (const v of x) vr += (v - mean) ** 2; vr /= x.length;
  const k = 1 / Math.sqrt(vr + 1e-5), out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = (x[i] - mean) * k * g[i];
  return out;
};
/** y = W x, with W stored [out][in] as PyTorch keeps it. */
const matvec = (W: Float32Array, x: Float32Array, out: number) => {
  const n = x.length, y = new Float32Array(out);
  for (let o = 0; o < out; o++) { let s = 0; const r = o * n; for (let i = 0; i < n; i++) s += W[r + i] * x[i]; y[o] = s; }
  return y;
};
const gelu = (v: number) => 0.5 * v * (1 + erf(v / Math.SQRT2));
/** erf to about 1e-7 (Numerical Recipes' erfc fit), as PyTorch's exact GELU needs. */
function erf(x: number) {
  const t = 1 / (1 + 0.5 * Math.abs(x));
  const y = 1 - t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? y : -y;
}

/** A running conversation with the model: the keys and values it has already worked out, per layer. */
export class GhidraRun {
  private keys: Float32Array[][];
  private vals: Float32Array[][];
  constructor(private m: Ghidra) {
    this.keys = Array.from({ length: m.meta.layers }, () => []);
    this.vals = Array.from({ length: m.meta.layers }, () => []);
  }
  get length() { return this.keys[0]?.length ?? 0; }

  /** Feeds one character; returns the scores for the next one. */
  step(token: number): Float32Array {
    const { meta, w } = this.m, C = meta.embd, H = meta.heads, hs = C / H, pos = this.length;
    let x: Float32Array = new Float32Array(C);
    for (let i = 0; i < C; i++) x[i] = w.wte[token * C + i] + w.wpe[pos * C + i];
    for (let l = 0; l < meta.layers; l++) {
      const qkv = matvec(w[`h${l}.c_attn`], layerNorm(x, w[`h${l}.ln_1`]), 3 * C);
      const q = qkv.subarray(0, C), k = qkv.slice(C, 2 * C), v = qkv.slice(2 * C);
      this.keys[l].push(k); this.vals[l].push(v);
      const y = new Float32Array(C), T = this.keys[l].length;
      for (let h = 0; h < H; h++) {
        const att = new Float32Array(T); let top = -Infinity;
        for (let t = 0; t < T; t++) { let s = 0; const kt = this.keys[l][t]; for (let i = 0; i < hs; i++) s += q[h * hs + i] * kt[h * hs + i]; att[t] = s / Math.sqrt(hs); top = Math.max(top, att[t]); }
        let sum = 0; for (let t = 0; t < T; t++) { att[t] = Math.exp(att[t] - top); sum += att[t]; }
        for (let t = 0; t < T; t++) { const a = att[t] / sum, vt = this.vals[l][t]; for (let i = 0; i < hs; i++) y[h * hs + i] += a * vt[h * hs + i]; }
      }
      const a = matvec(w[`h${l}.attn_proj`], y, C);
      x = x.map((v2, i) => v2 + a[i]);
      const hid = matvec(w[`h${l}.c_fc`], layerNorm(x, w[`h${l}.ln_2`]), 4 * C).map(gelu);
      const f = matvec(w[`h${l}.c_proj`], hid, C);
      x = x.map((v2, i) => v2 + f[i]);
    }
    return matvec(w.wte, layerNorm(x, w.ln_f), meta.chars.length); // the output shares the input's table
  }
}

/** The scores for the character after `text` (the unit test compares them with Python's). */
export function nextScores(m: Ghidra, text: string): Float32Array {
  const run = new GhidraRun(m);
  let s: Float32Array = new Float32Array(0);
  for (const c of text.slice(-m.meta.block)) s = run.step(Math.max(0, m.meta.chars.indexOf(c)));
  return s;
}

/**
 * Writes on from `prompt`, a character at a time (`onChar` gets each), up to `max` characters or a blank line.
 * `heat` (0.1–1.5) is how adventurous it is; it picks among the 20 likeliest characters. When the model's window
 * fills, it starts again from the last half of the text (so it can write on past its window). `oneLine` stops at the
 * first line break (an answer).
 */
export async function write(m: Ghidra, prompt: string, onChar: (c: string) => void, { max = 300, heat = 0.8, signal, oneLine = false }: { max?: number; heat?: number; signal?: AbortSignal; oneLine?: boolean } = {}) {
  const chars = m.meta.chars, known = [...prompt].filter((c) => chars.includes(c)).join('') || chars[0];
  let text = known, run = new GhidraRun(m), scores: Float32Array = new Float32Array(0);
  const feed = (s: string) => { for (const c of s) scores = run.step(chars.indexOf(c)); };
  feed(text.slice(-m.meta.block));
  for (let n = 0; n < max && !signal?.aborted; n++) {
    const top = [...scores].map((s, i) => [s / heat, i] as const).sort((a, b) => b[0] - a[0]).slice(0, 20);
    const e = top.map(([s]) => Math.exp(s - top[0][0])), sum = e.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum, pick = top[0][1];
    for (let i = 0; i < top.length; i++) { r -= e[i]; if (r <= 0) { pick = top[i][1]; break; } }
    const c = chars[pick];
    if (c === '\n' && (oneLine || text.endsWith('\n') || n === 0)) break; // a blank line: the story or note has ended
    onChar(c);
    text += c;
    if (run.length >= m.meta.block) { run = new GhidraRun(m); feed(text.slice(-m.meta.block / 2)); } else scores = run.step(pick);
    if (n % 8 === 7) await new Promise((res) => setTimeout(res, 0)); // let the page breathe
  }
}

/** The prompt for a question, in the shape Ghidra learned answers in (scripts/ai/ghidra-qa.txt): "Q: …" then "A:". */
export const askPrompt = (question: string) => `Q: ${question.replace(/\s+/g, ' ').trim()}\nA:`;

// The honesty guard: Ghidra answers well only what it was taught, so a question far from all of those gets "I don't know
// that yet" instead of a made-up answer. Closeness: the groups of three letters in a question's meaningful words (so a
// typo still matches), shared with the closest taught question (Jaccard).
const SMALL = new Set('a an the is are am do does did i me my you your can could would should will to of in on for and or it this that what how where who why when which with be please hey hi'.split(' '));
function grams(q: string) {
  const words = q.toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter((w) => w && !SMALL.has(w));
  const out = new Set<string>();
  for (const w of words) { const p = ` ${w} `; for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3)); }
  return out;
}

/** How close (0–1) a question is to the nearest one Ghidra was taught. */
export function familiar(question: string, known: readonly string[]): number {
  const a = grams(question);
  if (!a.size) return known.some((k) => k.toLowerCase().replace(/[^a-z ]/g, '').trim() === question.toLowerCase().replace(/[^a-z ]/g, '').trim()) ? 1 : 0;
  let best = 0;
  for (const k of known) {
    const b = grams(k);
    let both = 0; for (const g of a) if (b.has(g)) both++;
    best = Math.max(best, both / (a.size + b.size - both || 1));
  }
  return best;
}

/** Below this, Ghidra says it doesn't know yet (set by ghidra.test.ts's examples). */
export const FAMILIAR = 0.35;
export const NOT_YET = 'I don’t know that yet. I am still learning: ask me about UniVerse and its apps, like Relief, Green, Travel or how to join a course.';
