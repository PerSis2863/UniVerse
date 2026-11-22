// Ghidra 2 (M368–M369): UniVerse's own chat model in the browser: MiniMind-3 (64 M numbers, Apache-2.0, Qwen3's design)
// taught to be Ghidra (scripts/ai/ghidra2.py adopt + sft), or one trained by the same recipe. Word-pieces: byte-level BPE
// (GPT-2's way: the text's UTF-8 bytes, split into words, then merged by rank), so any language works. The model:
// RMSNorm, rotary positions, grouped-query attention (each head's query and key normalised, as Qwen3 does), a SwiGLU
// feed-forward, the output tied to the input table. Weights: public/ai/ghidra2-0.bin, -1… (one byte per number, a scale
// per row), multiplied straight from the bytes. Nothing is sent anywhere.

export interface Ghidra2Meta {
  name: string; stage: string; steps: number; params: number;
  layers: number; dim: number; heads: number; kv: number; vocab: number; block: number; ffn: number; theta: number;
  headDim?: number; qkNorm?: boolean; chat?: 'qwen' | 'ghidra'; parts?: number[];
  vocabMap: Record<string, number>; merges: string[];
  /** Every special marker and its number (<|endoftext|>, <|im_start|>… or <|user|>…). */
  special: Record<string, number>;
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
  private splitter = new RegExp(`(${Object.keys(this.m.special).sort((a, b) => b.length - a.length).map((s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|')})`);
  encode(text: string): number[] {
    const out: number[] = [];
    for (const part of text.split(this.splitter)) {
      if (!part) continue;
      const sp = this.m.special[part];
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
/** A table kept as its bytes: row r is q[r*cols…] × scale[r]. */
interface Table { q: Int8Array; scale: Float32Array; cols: number }
export interface Ghidra2 { meta: Ghidra2Meta; t: Record<string, Table>; v: Record<string, Float32Array>; pieces: Pieces }

/** The model from its JSON and its parts' bytes (in order). */
export function makeGhidra2(meta: Ghidra2Meta, parts: ArrayBuffer | ArrayBuffer[]): Ghidra2 {
  const list = Array.isArray(parts) ? parts : [parts];
  const all = new Uint8Array(list.reduce((n, p) => n + p.byteLength, 0));
  let o = 0;
  for (const p of list) { all.set(new Uint8Array(p), o); o += p.byteLength; }
  const bin = all.buffer;
  const t: Record<string, Table> = {}, v: Record<string, Float32Array> = {};
  for (const [name, shape, at] of meta.shapes) {
    if (shape.length === 1) { v[name] = new Float32Array(bin.slice(at, at + shape[0] * 4)); continue; }
    const [rows, cols] = shape;
    t[name] = { scale: new Float32Array(bin.slice(at, at + rows * 4)), q: new Int8Array(bin, at + rows * 4, rows * cols), cols };
  }
  return { meta, t, v, pieces: new Pieces(meta) };
}

/** Downloads the model once (about 65 MB in four parts; the browser keeps them). */
export async function loadGhidra2(): Promise<Ghidra2> {
  const meta = (await fetch('/ai/ghidra2.json').then((r) => r.json())) as Ghidra2Meta;
  const names = (meta.parts ?? [0]).map((_, i) => (meta.parts ? `/ai/ghidra2-${i}.bin` : '/ai/ghidra2.bin'));
  return makeGhidra2(meta, await Promise.all(names.map((n) => fetch(n).then((r) => r.arrayBuffer()))));
}

/** y = W x straight from the bytes: each row's sum, times its scale. */
const matvec = (W: Table, x: Float32Array, out: number) => {
  const n = W.cols, y = new Float32Array(out), q = W.q;
  for (let o = 0; o < out; o++) { let s = 0; const r = o * n; for (let i = 0; i < n; i++) s += q[r + i] * x[i]; y[o] = s * W.scale[o]; }
  return y;
};
const row = (W: Table, r: number) => { const out = new Float32Array(W.cols), k = W.scale[r]; for (let i = 0; i < W.cols; i++) out[i] = W.q[r * W.cols + i] * k; return out; };
const rms = (x: Float32Array, g: Float32Array) => {
  let s = 0; for (const v of x) s += v * v;
  const k = 1 / Math.sqrt(s / x.length + 1e-6), out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] * k * g[i];
  return out;
};
/** RMSNorm of each head's slice in place (Qwen3's query and key norms). */
const rmsHeads = (x: Float32Array, heads: number, hd: number, g: Float32Array) => {
  for (let h = 0; h < heads; h++) {
    let s = 0; for (let i = 0; i < hd; i++) s += x[h * hd + i] ** 2;
    const k = 1 / Math.sqrt(s / hd + 1e-6);
    for (let i = 0; i < hd; i++) x[h * hd + i] *= k * g[i];
  }
};

/** One conversation's memory: each layer's keys and values so far. */
export class Ghidra2Run {
  private keys: Float32Array[][]; private vals: Float32Array[][];
  private cos: Float32Array; private sin: Float32Array;
  constructor(private m: Ghidra2) {
    const { layers, dim, heads, theta, block } = m.meta, hd = m.meta.headDim ?? dim / heads, half = hd / 2;
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
    const { t, v: n } = this.m, meta = this.m.meta, { dim, heads, kv, ffn, layers, vocab } = meta, hd = meta.headDim ?? dim / heads, pos = this.length, group = heads / kv;
    let x = row(t.tok, token);
    for (let l = 0; l < layers; l++) {
      const y = rms(x, n[`b${l}.attn_norm`]);
      const q = matvec(t[`b${l}.wq`], y, heads * hd), k = matvec(t[`b${l}.wk`], y, kv * hd), v = matvec(t[`b${l}.wv`], y, kv * hd);
      if (meta.qkNorm) { rmsHeads(q, heads, hd, n[`b${l}.q_norm`]); rmsHeads(k, kv, hd, n[`b${l}.k_norm`]); }
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
      const o = matvec(t[`b${l}.wo`], att, dim);
      x = x.map((v2, i) => v2 + o[i]);
      const y2 = rms(x, n[`b${l}.mlp_norm`]);
      const a1 = matvec(t[`b${l}.w1`], y2, ffn), a3 = matvec(t[`b${l}.w3`], y2, ffn);
      for (let i = 0; i < ffn; i++) a1[i] = (a1[i] / (1 + Math.exp(-a1[i]))) * a3[i];
      const f = matvec(t[`b${l}.w2`], a1, dim);
      x = x.map((v2, i) => v2 + f[i]);
    }
    return matvec(t.tok, rms(x, n.norm), vocab);
  }
}

/** The scores after a list of word-pieces (the unit test compares them with Python's). */
export function scoresAfter(m: Ghidra2, ids: number[]): Float32Array {
  const run = new Ghidra2Run(m);
  let s = new Float32Array(0) as Float32Array;
  for (const id of ids) s = run.step(id);
  return s;
}

/** Word-pieces it said lately score lower (the usual repetition penalty: a positive score divided, a negative one
 *  multiplied), so a small model can't get stuck saying one word over and over (M369). Changes `scores` in place. */
export function damp(scores: Float32Array, recent: Iterable<number>, by = 1.1) {
  for (const id of new Set(recent)) { const s = scores[id]; if (s !== undefined) scores[id] = s > 0 ? s / by : s * by; }
  return scores;
}

/**
 * Ghidra 2 answers a question (the chat shape it learned: <|user|>…<|end|><|ghidra|>), a few letters at a time
 * (`onText` gets the answer so far), stopping at <|end|>, at `max` word-pieces or at its window.
 */
export async function answer(m: Ghidra2, question: string, onText: (sofar: string) => void, { max = 300, heat = 0.6, signal }: { max?: number; heat?: number; signal?: AbortSignal } = {}) {
  const { special, block } = m.meta, q = question.replace(/<\|?\/?[a-z_]+\|?>/g, '').trim();
  const prompt = m.meta.chat === 'qwen' ? `<|im_start|>user\n${q}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n` : `<|user|>${q}<|end|><|ghidra|>`;
  const ids = m.pieces.encode(prompt).slice(-Math.floor(block / 2));
  const stops = new Set(['<|end|>', '<|im_end|>', '<|endoftext|>'].map((k) => special[k]).filter((x) => x !== undefined));
  const run = new Ghidra2Run(m);
  let scores = new Float32Array(0) as Float32Array;
  for (const id of ids) scores = run.step(id);
  const said: number[] = [];
  for (let n = 0; n < max && run.length < block && !signal?.aborted; n++) {
    damp(scores, said.slice(-64));
    const top = [...scores].map((s, i) => [s / heat, i] as const).sort((a, b) => b[0] - a[0]).slice(0, 30);
    const e = top.map(([s]) => Math.exp(s - top[0][0])), sum = e.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum, pick = top[0][1];
    for (let i = 0; i < top.length; i++) { r -= e[i]; if (r <= 0) { pick = top[i][1]; break; } }
    if (stops.has(pick)) break;
    said.push(pick);
    onText(m.pieces.decode(said));
    scores = run.step(pick);
    if (n % 4 === 3) await new Promise((res) => setTimeout(res, 0));
  }
  return m.pieces.decode(said).trim();
}
