// Ghidra 2 (M368): UniVerse's own chat model in the browser, after MiniMind's design (scripts/ai/ghidra2.py trains it).
// Word-pieces: byte-level BPE (GPT-2's way: the text's UTF-8 bytes, split into words, then merged by rank), so any
// language works. The model: RMSNorm, rotary positions, grouped-query attention, a SwiGLU feed-forward, the output tied
// to the input table. Weights: public/ai/ghidra2.bin (one byte per number, a scale per row). Nothing is sent anywhere.

export interface Ghidra2Meta {
  name: string; stage: string; steps: number; params: number;
  layers: number; dim: number; heads: number; kv: number; vocab: number; block: number; ffn: number; theta: number;
  vocabMap: Record<string, number>; merges: string[];
  special: Record<'<|endoftext|>' | '<|user|>' | '<|ghidra|>' | '<|end|>', number>;
  shapes: [string, number[], number][];
  check: { prompt: string; ids: number[]; logits: number[]; text: string; textIds: number[] };
}

// ─── Word-pieces ───────────────────────────────────────────────────────────────────────────────────
/** GPT-2's byte ↔ printable character table (every byte gets a visible stand-in). */
function byteTable() {
  const bs: number[] = [];
  for (let b = 33; b <= 126; b++) bs.push(b);
  for (let b = 161; b <= 172; b++) bs.push(b);
  for (let b = 174; b <= 255; b++) bs.push(b);
  const cs = [...bs];
  let n = 0;
  for (let b = 0; b < 256; b++) if (!bs.includes(b)) { bs.push(b); cs.push(256 + n++); }
  const enc = new Map<number, string>(), dec = new Map<string, number>();
  bs.forEach((b, i) => { enc.set(b, String.fromCharCode(cs[i])); dec.set(String.fromCharCode(cs[i]), b); });
  return { enc, dec };
}
const SPLIT = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

export class Pieces {
  private ranks = new Map<string, number>();
  private byId: string[] = [];
  private bytes = byteTable();
  private cache = new Map<string, number[]>();
  constructor(private m: Pick<Ghidra2Meta, 'vocabMap' | 'merges' | 'special'>) {
    m.merges.forEach((x, i) => this.ranks.set(x, i));
    for (const [t, id] of Object.entries(m.vocabMap)) this.byId[id] = t;
  }
  private word(w: string): number[] {
    const hit = this.cache.get(w);
    if (hit) return hit;
    let parts = [...new TextEncoder().encode(w)].map((b) => this.bytes.enc.get(b)!);
    for (;;) {
      let best = -1, at = -1;
      for (let i = 0; i < parts.length - 1; i++) {
        const r = this.ranks.get(`${parts[i]} ${parts[i + 1]}`);
        if (r !== undefined && (best < 0 || r < best)) { best = r; at = i; }
      }
      if (at < 0) break;
      const a = parts[at], b = parts[at + 1];
      const next: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        if (i < parts.length - 1 && parts[i] === a && parts[i + 1] === b) { next.push(a + b); i++; } else next.push(parts[i]);
      }
      parts = next;
    }
    const ids = parts.map((p) => this.m.vocabMap[p]).filter((x) => x !== undefined);
    if (this.cache.size < 20_000) this.cache.set(w, ids);
    return ids;
  }
  /** Text (special markers like <|user|> included) as word-piece numbers. */
  encode(text: string): number[] {
    const specials = Object.keys(this.m.special).map((s) => s.replace(/[|]/g, '\\|'));
    const out: number[] = [];
    for (const part of text.split(new RegExp(`(${specials.join('|')})`))) {
      if (!part) continue;
      const sp = this.m.special[part as keyof Ghidra2Meta['special']];
      if (sp !== undefined) { out.push(sp); continue; }
      for (const w of part.match(SPLIT) ?? []) out.push(...this.word(w));
    }
    return out;
  }
  /** Word-piece numbers back to text (special markers left out). */
  decode(ids: number[]): string {
    const specials = new Set(Object.values(this.m.special));
    const chars = ids.filter((i) => !specials.has(i)).map((i) => this.byId[i] ?? '').join('');
    const bytes = Uint8Array.from([...chars].map((c) => this.bytes.dec.get(c) ?? 63));
    return new TextDecoder().decode(bytes);
  }
}

// ─── The model ─────────────────────────────────────────────────────────────────────────────────────
export interface Ghidra2 { meta: Ghidra2Meta; w: Record<string, Float32Array>; pieces: Pieces }

export function makeGhidra2(meta: Ghidra2Meta, bin: ArrayBuffer): Ghidra2 {
  const w: Record<string, Float32Array> = {};
  for (const [name, shape, at] of meta.shapes) {
    if (shape.length === 1) { w[name] = new Float32Array(bin.slice(at, at + shape[0] * 4)); continue; }
    const [rows, cols] = shape, scale = new Float32Array(bin.slice(at, at + rows * 4)), q = new Int8Array(bin, at + rows * 4, rows * cols);
    const out = new Float32Array(rows * cols);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out[r * cols + c] = q[r * cols + c] * scale[r];
    w[name] = out;
  }
  return { meta, w, pieces: new Pieces(meta) };
}

export async function loadGhidra2(): Promise<Ghidra2> {
  const [meta, bin] = await Promise.all([fetch('/ai/ghidra2.json').then((r) => r.json() as Promise<Ghidra2Meta>), fetch('/ai/ghidra2.bin').then((r) => r.arrayBuffer())]);
  return makeGhidra2(meta, bin);
}

const matvec = (W: Float32Array, x: Float32Array, out: number) => {
  const n = x.length, y = new Float32Array(out);
  for (let o = 0; o < out; o++) { let s = 0; const r = o * n; for (let i = 0; i < n; i++) s += W[r + i] * x[i]; y[o] = s; }
  return y;
};
const rms = (x: Float32Array, g: Float32Array) => {
  let s = 0; for (const v of x) s += v * v;
  const k = 1 / Math.sqrt(s / x.length + 1e-6), out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] * k * g[i];
  return out;
};

/** One conversation's memory: each layer's keys and values so far. */
export class Ghidra2Run {
  private keys: Float32Array[][]; private vals: Float32Array[][];
  private cos: Float32Array; private sin: Float32Array;
  constructor(private m: Ghidra2) {
    const { layers, dim, heads, theta, block } = m.meta, hd = dim / heads, half = hd / 2;
    this.keys = Array.from({ length: layers }, () => []); this.vals = Array.from({ length: layers }, () => []);
    this.cos = new Float32Array(block * half); this.sin = new Float32Array(block * half);
    for (let p = 0; p < block; p++) for (let i = 0; i < half; i++) {
      const a = p / theta ** ((2 * i) / hd);
      this.cos[p * half + i] = Math.cos(a); this.sin[p * half + i] = Math.sin(a);
    }
  }
  get length() { return this.keys[0].length; }
  private turn(v: Float32Array, heads: number, hd: number, pos: number) {
    const half = hd / 2;
    for (let h = 0; h < heads; h++) {
      const o = h * hd;
      for (let i = 0; i < half; i++) {
        const c = this.cos[pos * half + i], s = this.sin[pos * half + i], a = v[o + i], b = v[o + half + i];
        v[o + i] = a * c - b * s; v[o + half + i] = b * c + a * s;
      }
    }
  }
  /** Feeds one word-piece; returns the scores for the next. */
  step(token: number): Float32Array {
    const { meta, w } = this.m, { dim, heads, kv, ffn, layers, vocab } = meta, hd = dim / heads, pos = this.length, group = heads / kv;
    let x = w.tok.slice(token * dim, token * dim + dim);
    for (let l = 0; l < layers; l++) {
      const y = rms(x, w[`b${l}.attn_norm`]);
      const q = matvec(w[`b${l}.wq`], y, heads * hd), k = matvec(w[`b${l}.wk`], y, kv * hd), v = matvec(w[`b${l}.wv`], y, kv * hd);
      this.turn(q, heads, hd, pos); this.turn(k, kv, hd, pos);
      this.keys[l].push(k); this.vals[l].push(v);
      const att = new Float32Array(heads * hd), T = this.keys[l].length, sc = new Float32Array(T);
      for (let h = 0; h < heads; h++) {
        const g = Math.floor(h / group) * hd, qo = h * hd;
        let top = -Infinity;
        for (let t = 0; t < T; t++) { let s = 0; const kt = this.keys[l][t]; for (let i = 0; i < hd; i++) s += q[qo + i] * kt[g + i]; sc[t] = s / Math.sqrt(hd); if (sc[t] > top) top = sc[t]; }
        let sum = 0; for (let t = 0; t < T; t++) { sc[t] = Math.exp(sc[t] - top); sum += sc[t]; }
        for (let t = 0; t < T; t++) { const a = sc[t] / sum, vt = this.vals[l][t]; for (let i = 0; i < hd; i++) att[qo + i] += a * vt[g + i]; }
      }
      const o = matvec(w[`b${l}.wo`], att, dim);
      x = x.map((v2, i) => v2 + o[i]);
      const y2 = rms(x, w[`b${l}.mlp_norm`]);
      const a1 = matvec(w[`b${l}.w1`], y2, ffn), a3 = matvec(w[`b${l}.w3`], y2, ffn);
      for (let i = 0; i < ffn; i++) a1[i] = (a1[i] / (1 + Math.exp(-a1[i]))) * a3[i];
      const f = matvec(w[`b${l}.w2`], a1, dim);
      x = x.map((v2, i) => v2 + f[i]);
    }
    return matvec(w.tok, rms(x, w.norm), vocab);
  }
}

/** The scores after a list of word-pieces (the unit test compares them with Python's). */
export function scoresAfter(m: Ghidra2, ids: number[]): Float32Array {
  const run = new Ghidra2Run(m);
  let s = new Float32Array(0) as Float32Array;
  for (const id of ids) s = run.step(id);
  return s;
}

/**
 * Ghidra 2 answers a question (the chat shape it learned: <|user|>…<|end|><|ghidra|>), a few letters at a time
 * (`onText` gets the answer so far), stopping at <|end|>, at `max` word-pieces or at its window.
 */
export async function answer(m: Ghidra2, question: string, onText: (sofar: string) => void, { max = 300, heat = 0.6, signal }: { max?: number; heat?: number; signal?: AbortSignal } = {}) {
  const { special, block } = m.meta;
  const ids = m.pieces.encode(`<|user|>${question.replace(/<\|[a-z]+\|>/g, '').trim()}<|end|><|ghidra|>`).slice(-Math.floor(block / 2));
  const run = new Ghidra2Run(m);
  let scores = new Float32Array(0) as Float32Array;
  for (const id of ids) scores = run.step(id);
  const said: number[] = [];
  for (let n = 0; n < max && run.length < block && !signal?.aborted; n++) {
    const top = [...scores].map((s, i) => [s / heat, i] as const).sort((a, b) => b[0] - a[0]).slice(0, 30);
    const e = top.map(([s]) => Math.exp(s - top[0][0])), sum = e.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum, pick = top[0][1];
    for (let i = 0; i < top.length; i++) { r -= e[i]; if (r <= 0) { pick = top[i][1]; break; } }
    if (pick === special['<|end|>'] || pick === special['<|endoftext|>']) break;
    said.push(pick);
    onText(m.pieces.decode(said));
    scores = run.step(pick);
    if (n % 4 === 3) await new Promise((res) => setTimeout(res, 0));
  }
  return m.pieces.decode(said).trim();
}
