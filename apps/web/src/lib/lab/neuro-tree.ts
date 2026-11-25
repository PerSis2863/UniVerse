// Hyperion's neuroscience, the left-outs of M514 (M517): neurons with branches read from SWC files (NeuroMorpho's
// format), solved by Hines' method (backward Euler on a tree: one sweep up, one down, as NEURON does), with HH channels
// where asked and synapses on any compartment; and cleaning a raw recording before spike sorting: Butterworth band-pass
// run forwards and backwards, a mains notch, the common average across channels. Pure.
import { HH, hhRest } from './neuro';
import { kernel } from './neuro-plus';

// ——— Morphology ———
export interface Tree {
  parent: Int32Array; len: Float64Array; diam: Float64Array; type: Int32Array;
  x: Float64Array; y: Float64Array; z: Float64Array; px: Float64Array; py: Float64Array; pz: Float64Array; id: Int32Array;
}
interface Sample { id: number; type: number; x: number; y: number; z: number; r: number; parent: number }
export const SWC_TYPES = ['undefined', 'soma', 'axon', 'basal dendrite', 'apical dendrite'];

export function parseSWC(text: string): Sample[] {
  const out: Sample[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const f = line.split(/\s+/).map(Number);
    if (f.length < 7 || f.slice(0, 7).some((v) => !Number.isFinite(v))) throw new Error(`An SWC line needs id, type, x, y, z, radius and parent: “${raw.trim()}”.`);
    out.push({ id: f[0], type: f[1], x: f[2], y: f[3], z: f[4], r: f[5], parent: f[6] });
  }
  if (!out.length) throw new Error('No SWC points.');
  return out;
}

/** The compartments: the root sample is a sphere (a cylinder as long as it is wide, the same area); every other sample
 * ends a piece from its parent, cut into pieces at most maxLen µm long. Ordered so each parent comes before its
 * children (what Hines' sweeps need). */
export function buildTree(s: Sample[], maxLen = 20, limit = 20000): Tree {
  const byId = new Map(s.map((p) => [p.id, p]));
  const roots = s.filter((p) => p.parent < 0 || !byId.has(p.parent));
  if (roots.length !== 1) throw new Error(`An SWC neuron has one root (a parent of -1); this file has ${roots.length}.`);
  const kids = new Map<number, Sample[]>();
  for (const p of s) if (p !== roots[0]) { const k = kids.get(p.parent) ?? []; k.push(p); kids.set(p.parent, k); }
  const P: number[] = [], L: number[] = [], D: number[] = [], T: number[] = [], X: number[][] = [], PX: number[][] = [], ID: number[] = [];
  const r0 = roots[0], dr = Math.max(2 * r0.r, 0.1);
  P.push(-1); L.push(dr); D.push(dr); T.push(r0.type); X.push([r0.x, r0.y, r0.z]); PX.push([r0.x, r0.y, r0.z]); ID.push(r0.id);
  const at = new Map<number, number>([[r0.id, 0]]), queue = [r0];
  for (let q = 0; q < queue.length; q++) {
    const par = queue[q];
    for (const c of kids.get(par.id) ?? []) {
      if (at.has(c.id)) throw new Error(`SWC point ${c.id} appears twice.`);
      const len = Math.hypot(c.x - par.x, c.y - par.y, c.z - par.z), pieces = Math.max(1, Math.ceil(len / maxLen - 1e-9));
      let up = at.get(par.id)!;
      for (let k = 1; k <= pieces; k++) {
        const a = (k - 1) / pieces, b = k / pieces;
        P.push(up); L.push(Math.max(len / pieces, 0.1)); D.push(Math.max(2 * c.r, 0.05)); T.push(c.type);
        PX.push([par.x + a * (c.x - par.x), par.y + a * (c.y - par.y), par.z + a * (c.z - par.z)]);
        X.push([par.x + b * (c.x - par.x), par.y + b * (c.y - par.y), par.z + b * (c.z - par.z)]); ID.push(c.id);
        up = P.length - 1;
        if (P.length > limit) throw new Error(`Over ${limit} compartments: raise 'MaxLength'.`);
      }
      at.set(c.id, up); queue.push(c);
    }
  }
  if (at.size !== s.length) throw new Error('Some SWC points never reach the root (a loop, or a missing parent).');
  const F = (v: number[]) => Float64Array.from(v);
  return { parent: Int32Array.from(P), len: F(L), diam: F(D), type: Int32Array.from(T), x: F(X.map((v) => v[0])), y: F(X.map((v) => v[1])), z: F(X.map((v) => v[2])), px: F(PX.map((v) => v[0])), py: F(PX.map((v) => v[1])), pz: F(PX.map((v) => v[2])), id: Int32Array.from(ID) };
}

// ——— Hines' method ———
export interface Synapse { node: number; times: number[]; gmax: number; rise: number; decay: number; E: number }
export interface TreeOpts {
  Ri: number; Cm: number; Rm: number; rest: number; celsius: number; T: number; dt: number;
  active: (type: number) => boolean; stim: { node: number; I: number; start: number; stop: number }[]; synapses: Synapse[]; record: number[];
}
export const TREE: Omit<TreeOpts, 'active' | 'stim' | 'synapses' | 'record'> = { Ri: 150, Cm: 1, Rm: 20000, rest: -65, celsius: 6.3, T: 50, dt: 0.025 };

const rates = (V: number, phi: number) => {
  const am = Math.abs(V + 40) < 1e-7 ? 1 : (0.1 * (V + 40)) / (1 - Math.exp(-(V + 40) / 10)), bm = 4 * Math.exp(-(V + 65) / 18);
  const ah = 0.07 * Math.exp(-(V + 65) / 20), bh = 1 / (1 + Math.exp(-(V + 35) / 10));
  const an = Math.abs(V + 55) < 1e-7 ? 0.1 : (0.01 * (V + 55)) / (1 - Math.exp(-(V + 55) / 10)), bn = 0.125 * Math.exp(-(V + 65) / 80);
  return [am * phi, bm * phi, ah * phi, bh * phi, an * phi, bn * phi];
};

/** Membrane areas (cm²) and axial conductances to the parent (mS). Lengths and diameters in µm, Ri in Ω·cm. */
export function cableTerms(t: Tree, Ri: number) {
  const n = t.parent.length, area = new Float64Array(n), gax = new Float64Array(n);
  const half = (i: number) => (Ri * (t.len[i] * 1e-4) / 2) / (Math.PI * (t.diam[i] * 1e-4 / 2) ** 2); // Ω
  for (let i = 0; i < n; i++) { area[i] = Math.PI * t.diam[i] * t.len[i] * 1e-8; if (t.parent[i] >= 0) gax[i] = 1000 / (half(i) + half(t.parent[i])); }
  return { area, gax };
}

/** Voltages over time (mV, ms; currents in nA, synaptic conductances in nS). Backward Euler for the voltages, solved
 * on the tree in two sweeps; HH's gates by exponential Euler where `active` says (else a passive leak of 1/Rm). */
export function treeNeuron(t: Tree, o: TreeOpts) {
  const n = t.parent.length, { dt } = o, par = t.parent, { area, gax } = cableTerms(t, o.Ri);
  const phi = 3 ** ((o.celsius - 6.3) / 10), act = Uint8Array.from(t.type, (ty) => (o.active(ty) ? 1 : 0));
  const V = new Float64Array(n), m = new Float64Array(n), h = new Float64Array(n), k = new Float64Array(n);
  const r0 = hhRest(o.rest);
  for (let i = 0; i < n; i++) { V[i] = act[i] ? r0[0] : o.rest; m[i] = r0[1]; h[i] = r0[2]; k[i] = r0[3]; }
  const nb = new Float64Array(n);
  for (let i = 1; i < n; i++) { nb[i] += gax[i]; nb[par[i]] += gax[i]; }
  const syn = o.synapses.map((s) => ({ ...s, f: kernel(s.rise, s.decay), sorted: [...s.times].sort((a, b) => a - b), reach: 20 * Math.max(s.rise, s.decay) }));
  const steps = Math.round(o.T / dt), every = Math.max(1, Math.ceil((steps * Math.max(1, o.record.length)) / 2e6), Math.ceil(steps / 20000));
  const d = new Float64Array(n), r = new Float64Array(n), peak = Float64Array.from(V), arrival = new Float64Array(n).fill(NaN);
  const t0: number[] = [0], rec: number[][] = [o.record.map((i) => V[i])];
  for (let s = 0; s < steps; s++) {
    const tn = (s + 1) * dt;
    for (let i = 0; i < n; i++) {
      const C = (o.Cm * area[i] * 1000) / dt; // µF → nF so currents are in nA, conductances in µS
      let g: number, ge: number;
      if (act[i]) {
        const [am, bm, ah, bh, an, bn] = rates(V[i], phi);
        const upd = (x: number, al: number, be: number) => { const tau = 1 / (al + be), inf = al * tau; return inf + (x - inf) * Math.exp(-dt / tau); };
        m[i] = upd(m[i], am, bm); h[i] = upd(h[i], ah, bh); k[i] = upd(k[i], an, bn);
        const gna = HH.gNa * m[i] ** 3 * h[i], gk = HH.gK * k[i] ** 4;
        g = (HH.gL + gna + gk) * area[i] * 1000; ge = (HH.gL * HH.eL + gna * HH.eNa + gk * HH.eK) * area[i] * 1000;
      } else { g = (1000 / o.Rm) * area[i] * 1000; ge = g * o.rest; }
      d[i] = C + g + nb[i] * 1000; r[i] = C * V[i] + ge;
    }
    for (const st of o.stim) if (tn > st.start && tn <= st.stop) r[st.node] += st.I;
    for (const sy of syn) {
      let gs = 0;
      for (const ts of sy.sorted) { if (ts > tn) break; if (ts >= tn - sy.reach) gs += sy.f(tn - ts); }
      if (gs) { const g = sy.gmax * 1e-3 * gs; d[sy.node] += g; r[sy.node] += g * sy.E; } // nS → µS
    }
    for (let i = n - 1; i > 0; i--) { const p = par[i], g = gax[i] * 1000, f = g / d[i]; d[p] -= g * f; r[p] += f * r[i]; }
    V[0] = r[0] / d[0];
    for (let i = 1; i < n; i++) {
      const prev = V[i];
      V[i] = (r[i] + gax[i] * 1000 * V[par[i]]) / d[i];
      if (Number.isNaN(arrival[i]) && prev < 0 && V[i] >= 0) arrival[i] = tn;
    }
    for (let i = 0; i < n; i++) if (V[i] > peak[i]) peak[i] = V[i];
    if ((s + 1) % every === 0 || s === steps - 1) { t0.push(tn); rec.push(o.record.map((i) => V[i])); }
  }
  return { t: t0, V: rec, peak: Array.from(peak), arrival: Array.from(arrival), final: Array.from(V) };
}

/** Path length (µm) from the root to each compartment's far end. */
export function pathLength(t: Tree) {
  const out = new Float64Array(t.parent.length);
  for (let i = 1; i < out.length; i++) out[i] = out[t.parent[i]] + t.len[i];
  return Array.from(out);
}

// ——— Cleaning a recording ———
type Bq = [number, number, number, number, number];
function rbj(kind: 'low' | 'high' | 'notch', f: number, fs: number, Q: number): Bq {
  const w = (2 * Math.PI * f) / fs, c = Math.cos(w), al = Math.sin(w) / (2 * Q), a0 = 1 + al;
  const b = kind === 'low' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : kind === 'high' ? [(1 + c) / 2, -(1 + c), (1 + c) / 2] : [1, -2 * c, 1];
  return [b[0] / a0, b[1] / a0, b[2] / a0, (-2 * c) / a0, (1 - al) / a0];
}
/** Butterworth sections of an even order: Q = 1/(2 cos((2k − 1)π/(2N))). */
export function butterSections(kind: 'low' | 'high', f: number, fs: number, order: number): Bq[] {
  return Array.from({ length: order / 2 }, (_, k) => rbj(kind, f, fs, 1 / (2 * Math.cos(((2 * k + 1) * Math.PI) / (2 * order)))));
}
export const notchSection = (f: number, fs: number, Q = 30) => rbj('notch', f, fs, Q);
function run(x: Float64Array, [b0, b1, b2, a1, a2]: Bq) {
  let x1 = x[0], x2 = x[0];
  const g = (b0 + b1 + b2) / (1 + a1 + a2), y0 = Number.isFinite(g) ? g * x[0] : 0;
  let y1 = y0, y2 = y0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; x[i] = v; }
}
/** Forwards then backwards (no delay, the response squared), with the ends extended by odd reflection as filtfilt does. */
export function zeroPhase(x: ArrayLike<number>, stages: Bq[], pad: number) {
  const n = x.length, p = Math.max(0, Math.min(n - 1, pad)), y = new Float64Array(n + 2 * p);
  for (let i = 0; i < p; i++) { y[i] = 2 * x[0] - x[p - i]; y[n + p + i] = 2 * x[n - 1] - x[n - 2 - i]; }
  for (let i = 0; i < n; i++) y[p + i] = x[i];
  for (const s of stages) run(y, s);
  y.reverse();
  for (const s of stages) run(y, s);
  y.reverse();
  return y.subarray(p, p + n);
}
export interface Clean { band?: [number, number]; notch?: number; order: number }
/** Band-pass (or high-pass when the top edge is at or past Nyquist), then a notch at the mains and its harmonics below
 * the band's top. */
export function cleanRecording(x: ArrayLike<number>, fs: number, c: Clean) {
  const st: Bq[] = [];
  if (c.band) {
    const [lo, hi] = c.band;
    if (lo > 0) st.push(...butterSections('high', lo, fs, c.order));
    if (hi < fs / 2) st.push(...butterSections('low', hi, fs, c.order));
  }
  if (c.notch) for (let f = c.notch; f < Math.min(fs / 2, c.band ? c.band[1] : fs / 2) && f <= 5 * c.notch; f += c.notch) st.push(notchSection(f, fs));
  // Long enough for the filters to settle: three periods of the low edge, five time constants of the notch.
  const pad = Math.max(c.band?.[0] ? (3 * fs) / c.band[0] : 0, c.notch ? (5 * 30 * fs) / (Math.PI * c.notch) : 0);
  return zeroPhase(x, st, Math.round(pad));
}
/** Each sample less the median across the channels (rows are samples, one array per channel). */
export function commonAverage(ch: number[][]) {
  const n = ch[0]?.length ?? 0, out = ch.map(() => new Float64Array(n)), tmp = new Float64Array(ch.length);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch.length; c++) tmp[c] = ch[c][i];
    const s = Float64Array.from(tmp).sort(), m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    for (let c = 0; c < ch.length; c++) out[c][i] = ch[c][i] - m;
  }
  return out.map((v) => Array.from(v));
}
