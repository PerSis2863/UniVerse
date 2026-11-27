import type { Analog } from './ibis-analog';
import { fftPow2 } from './fft';

// The channel driven and received by the chips' own buffers, in time (M585, the owner, 27 Nov: "do all of this" on
// M583's left-outs: the buffers' non-linear behaviour and the echoes between mismatched ends). As IBIS-AMI tools do,
// the analog channel is characterised by its step responses: the transmitter's [Pull-up] / [Pull-down] tables switched
// over its [Ramp] (rising: the pull-up turning on as the pull-down turns off, falling the reverse), its clamps, C_comp
// and package; the channel as its scattering responses (s11, s12, s21, s22 per sample), so whatever an end reflects
// travels back and forth; the receiver's clamps (its termination), C_comp and package; the receiver's pad voltage the
// result. Each step solved implicitly (backward Euler): the line seen from a pin is a conductance and a current from
// what is already travelling; the pad's voltage found by Newton's method on the buffer's curve (bisection if it
// stalls). The impulse response is the average of the rising and the falling edge's (the AMI flows are linear), both
// kept so their difference can be shown.

export interface Ports { s11: number[]; s12: number[]; s21: number[]; s22: number[] }

/** An I-V table read at v (linear between rows, the end segments carried on); 0 for an empty table. */
export function iv(t: number[][], v: number) {
  if (!t.length) return 0;
  if (t.length === 1) return t[0][1];
  let i = 1;
  while (i < t.length - 1 && t[i][0] < v) i++;
  const [v0, i0] = t[i - 1], [v1, i1] = t[i];
  return v1 === v0 ? i0 : i0 + ((i1 - i0) * (v - v0)) / (v1 - v0);
}
const sorted = (t: number[][]) => [...t].sort((a, b) => a[0] - b[0]);

/** An ideal end for the side without an IBIS buffer: a transmitter of z0 switching in one sample, or a receiver
 * terminated in z0 to half the supply; 1 V supplies, no pads or package. */
export function idealEnd(z0: number, role: 'tx' | 'rx'): Analog {
  // currents into the pin: a resistor to ground sinks I = V / r; one to the supply (its tables read from the supply)
  // sources, I = −V / r
  const line = (r: number) => [[-10, -10 / r], [10, 10 / r]], up = (r: number) => line(-r), tx = role === 'tx';
  return { type: 'ideal', corner: 'typ', rs: z0, rt: z0, cComp: 0, rPkg: 0, lPkg: 0, cPkg: 0, rise: 0, fall: 0, vcc: 1, pu: tx ? up(z0) : [], pd: tx ? line(z0) : [], gc: tx ? [] : line(2 * z0), pc: tx ? [] : up(2 * z0), notes: [] };
}

interface End { a: Analog; pu: number[][]; pd: number[][]; gc: number[][]; pc: number[][] }
/** The current the buffer pushes into its pad at pad voltage v (IBIS counts currents into the pin: hence the minus),
 * its driver's pull-up and pull-down weighted ku and kd. */
const push = (e: End, v: number, ku: number, kd: number) => -(ku * iv(e.pu, e.a.vcc - v) + kd * iv(e.pd, v) + iv(e.gc, v) + iv(e.pc, e.a.vcc - v));

/** One pin's state after a step: pad voltage vd, package current il, pin voltage vp. */
interface St { vd: number; il: number; vp: number }
/**
 * One end over one step of dt (dt = Infinity: the steady state): the line at the pin a conductance g and a current j
 * (I into the line = g·vp − j), the package's L and R from pad to pin, C_pkg at the pin, C_comp at the pad.
 */
function solveEnd(e: End, prev: St, dt: number, g: number, j: number, ku: number, kd: number): St {
  const cc = e.a.cComp / dt, cl = e.a.lPkg / dt, cp = e.a.cPkg / dt;
  const p1 = 1 / (cp + g), p0 = (j + cp * prev.vp) * p1;               // vp = p1·il + p0
  const al = 1 / (cl + e.a.rPkg + p1), be = (cl * prev.il - p0) * al;   // il = al·vd + be
  const F = (v: number) => cc * (v - prev.vd) - push(e, v, ku, kd) + al * v + be;
  let v = prev.vd, ok = false;
  for (let it = 0; it < 40; it++) {
    const f = F(v), d = (F(v + 1e-6) - f) / 1e-6;
    if (!(Math.abs(d) > 1e-15)) break;
    const nv = v - f / d;
    if (Math.abs(nv - v) < 1e-12) { v = nv; ok = true; break; }
    v = nv;
  }
  if (!ok || !Number.isFinite(v) || Math.abs(F(v)) > 1e-9) {
    let lo = -10 * (e.a.vcc + 1), hi = 10 * (e.a.vcc + 1);
    for (let it = 0; it < 200 && hi - lo > 1e-13; it++) { const m = (lo + hi) / 2; if (Math.sign(F(m)) === Math.sign(F(lo))) lo = m; else hi = m; }
    v = (lo + hi) / 2;
  }
  const il = al * v + be;
  return { vd: v, il, vp: p1 * il + p0 };
}

/** Index of the last sample worth keeping (the rest under 1e-9 of the peak), so the sums skip dead tails. */
const span = (s: number[]) => { const pk = Math.max(...s.map(Math.abs), 1e-300); let n = s.length; while (n > 1 && Math.abs(s[n - 1]) < 1e-9 * pk) n--; return n; };

// The sums over what has already travelled, Σ s[k]·a[t−k], are the cost: n² per response done sample by sample (M586,
// the owner, 27 Nov, M585's left-out "it can take a moment longer"). Split as audio engines do: the first B lags summed
// directly each step, the rest a block at a time by FFT (uniformly partitioned overlap-save), since the lags past B
// only reach samples from earlier blocks: about n·(B + 8L/B) work in place of n·L.

/** One port's ingoing wave over time and the spectra of its two-block windows, shared by every response reading it. */
class Input {
  readonly x: Float64Array; readonly wr: Float64Array[] = []; readonly wi: Float64Array[] = [];
  constructor(n: number, readonly B: number) { this.x = new Float64Array(n); }
  /** Block c starts: the window of blocks c − 2 and c − 1 (both known now) to the frequency domain. */
  window(c: number) {
    const B = this.B, re = new Float64Array(2 * B), im = new Float64Array(2 * B), s = (c - 2) * B;
    for (let i = 0; i < 2 * B; i++) { const k = s + i; if (k >= 0 && k < this.x.length) re[i] = this.x[k]; }
    fftPow2(re, im, false);
    this.wr[c - 1] = re; this.wi[c - 1] = im;
  }
}
/** One response s read against an input: y(t) = Σ_{k≥1} s[k]·x[t−k] (the k = 0 term is the caller's). */
class Past {
  readonly pr: Float64Array[] = []; readonly pi: Float64Array[] = []; readonly tail: Float64Array;
  private readonly ar: Float64Array; private readonly ai: Float64Array; private readonly head: number;
  constructor(readonly s: Float64Array, readonly inp: Input) {
    const B = inp.B;
    this.head = Math.min(B, s.length); this.tail = new Float64Array(B); this.ar = new Float64Array(2 * B); this.ai = new Float64Array(2 * B);
    for (let j = 0; (j + 1) * B < s.length; j++) {
      const re = new Float64Array(2 * B), im = new Float64Array(2 * B);
      for (let m = 0; m < B && (j + 1) * B + m < s.length; m++) re[m] = s[(j + 1) * B + m];
      fftPow2(re, im, false); this.pr.push(re); this.pi.push(im);
    }
  }
  /** Block c starts: the lags from B on for its B samples, from the windows before it. */
  block(c: number) {
    const B = this.inp.B, ar = this.ar.fill(0), ai = this.ai.fill(0);
    if (!this.pr.length) return;
    for (let j = 0; j < this.pr.length && c - j - 1 >= 0; j++) {
      const pr = this.pr[j], pi = this.pi[j], wr = this.inp.wr[c - j - 1], wi = this.inp.wi[c - j - 1];
      for (let i = 0; i < 2 * B; i++) { ar[i] += pr[i] * wr[i] - pi[i] * wi[i]; ai[i] += pr[i] * wi[i] + pi[i] * wr[i]; }
    }
    fftPow2(ar, ai, true);
    for (let i = 0; i < B; i++) this.tail[i] = ar[B + i] / (2 * B);
  }
  at(t: number) {
    const x = this.inp.x, s = this.s, top = Math.min(this.head - 1, t);
    let acc = this.tail[t % this.inp.B];
    for (let k = 1; k <= top; k++) acc += s[k] * x[t - k];
    return acc;
  }
}

/** What a port's buffer does at step t (−1: before the edge): its pull-up and pull-down weights. */
type Drive = (t: number) => [number, number];
/** A [t ku kd] table read at time x, its ends held. */
function held(rows: number[][], col: number, x: number) {
  if (x <= rows[0][0]) return rows[0][col];
  const i = rows.findIndex((r) => r[0] >= x);
  if (i < 0) return rows[rows.length - 1][col];
  const a = rows[i - 1], b = rows[i];
  return b[0] === a[0] ? b[col] : a[col] + ((b[col] - a[col]) * (x - a[0])) / (b[0] - a[0]);
}
/** A transmitter's edge: from its waveform tables' weights when the file had them, else its [Ramp] switching the
 * pull-up on as the pull-down goes off (falling the reverse) linearly. */
function schedule(a: Analog, rising: boolean, dt: number): Drive {
  const k = rising ? a.kr : a.kf;
  if (k?.length) return (t) => { const x = t < 0 ? -Infinity : (t + 1) * dt; return [held(k, 1, x), held(k, 2, x)]; };
  const tr = rising ? a.rise : a.fall;
  return (t) => { const on = t < 0 ? 0 : tr > 0 ? Math.min(1, ((t + 1) * dt) / tr) : 1, ku = rising ? on : 1 - on; return [ku, 1 - ku]; };
}
const still = (d: Drive): Drive => { const v = d(-1); return () => v; };

/**
 * The ports' pad voltages over n samples (and before: the steady state). S[p][q] is the response from port q into p
 * (sampled every dt), ends[p] the buffer on port p, drive[p] its switching (null: a receiver), inject[p] a wave
 * emerging from the channel at port p from t = 0 (a coupled neighbour's). Each step the ports are solved together: a
 * port's own instant reflection implicitly, the others' instant couplings by sweeping the ports until their waves
 * agree (M587; M586 took a later port's a sample late).
 */
function run(S: number[][][], n: number, dt: number, z0: number, ends: End[], drive: (Drive | null)[], inject: (number | null)[] = []) {
  const N = ends.length, norton = (s0: number, K: number) => ({ g: (1 - s0) / ((1 + s0) * z0), j: (2 * K) / ((1 + s0) * z0) });
  const R = S.map((r) => r.map((s) => Float64Array.from(s.slice(0, span(s)))));
  const sums = R.map((r) => r.map((s) => s.reduce((a, b) => a + b, 0)));
  const ku = (p: number, t: number) => drive[p]?.(t) ?? [0, 0];
  // the steady state before the edge: capacitors open, inductors shorted, the line at DC (its responses summed)
  const st: St[] = ends.map((e) => ({ vd: e.a.vcc / 2, il: 0, vp: e.a.vcc / 2 })), dc = new Array(N).fill(0);
  for (let it = 0; it < 400; it++) {
    let moved = 0;
    for (let p = 0; p < N; p++) {
      let K = 0; for (let q = 0; q < N; q++) if (q !== p) K += sums[p][q] * dc[q];
      const nt = norton(sums[p][p], K), [u, d] = ku(p, -1);
      st[p] = solveEnd(ends[p], st[p], Infinity, nt.g, nt.j, u, d);
      const a = (st[p].vp - K) / (1 + sums[p][p]); moved += Math.abs(a - dc[p]); dc[p] = a;
    }
    if (moved < 1e-14) break;
  }
  const v0 = st.map((s) => s.vd), Lmax = Math.max(...R.flat().map((s) => s.length));
  const B = Math.min(256, Math.max(16, 2 ** Math.round(Math.log2(Math.sqrt(2 * Lmax)))));
  const inp = ends.map(() => new Input(n, B)), past = R.map((r) => r.map((s, q) => new Past(s, inp[q])));
  const T = R.map((r) => r.map((s) => { const t = new Float64Array(s.length + 1); for (let k = s.length - 1; k >= 0; k--) t[k] = t[k + 1] + s[k]; return t; }));
  const vd = ends.map(() => new Float64Array(n));
  const s0 = R.map((r) => r.map((s) => s[0] ?? 0)), coupled = s0.some((r, p) => r.some((v, q) => q !== p && v !== 0));
  const base = new Float64Array(N), nst = st.slice();
  for (let t = 0; t < n; t++) {
    if (t && t % B === 0) { const c = t / B; inp.forEach((i) => i.window(c)); past.forEach((r) => r.forEach((x) => x.block(c))); }
    // what has travelled (all but this step's instant cross terms) once per port; then the ports solved together:
    // the instant couplings s_pq[0]·x_q[t] between them (the two legs at one end, M587) iterated to agreement
    for (let p = 0; p < N; p++) {
      let K = inject[p] ?? 0;
      for (let q = 0; q < N; q++) K += past[p][q].at(t) + (t + 1 < T[p][q].length ? T[p][q][t + 1] * dc[q] : 0);   // before the edge the waves held their steady values
      base[p] = K;
      inp[p].x[t] = t ? inp[p].x[t - 1] : dc[p];
    }
    for (let it = 0; it < 60; it++) {
      let moved = 0;
      for (let p = 0; p < N; p++) {
        let K = base[p];
        for (let q = 0; q < N; q++) if (q !== p) K += s0[p][q] * inp[q].x[t];
        const nt = norton(s0[p][p], K), [u, d] = ku(p, t);
        nst[p] = solveEnd(ends[p], st[p], dt, nt.g, nt.j, u, d);
        const x = (nst[p].vp - K) / (1 + s0[p][p]);
        moved = Math.max(moved, Math.abs(x - inp[p].x[t])); inp[p].x[t] = x;
      }
      if (!coupled || moved < 1e-13) break;
    }
    for (let p = 0; p < N; p++) { st[p] = nst[p]; vd[p][t] = st[p].vd; }
  }
  return { vd, v0 };
}

const endOf = (a: Analog): End => ({ a, pu: sorted(a.pu), pd: sorted(a.pd), gc: sorted(a.gc), pc: sorted(a.pc) });
/** The ports as a matrix: a 2-port's four responses, or a 4-port's sixteen single-ended ones (ports 1, 2 the driven
 * pair, 3, 4 the received). */
const matrix = (p: Ports | number[][][]) => ('s11' in p ? [[p.s11, p.s12], [p.s21, p.s22]] : p);

/**
 * The analog channel's impulse responses (V/s every dt, scaled so an ideal matched pair gives s21 / dt): rising,
 * falling and their average, from the two edges' step responses divided by half the transmitter's supply (what an
 * ideal driver puts on a matched line). A 4-port (M586): each leg of the pair its own non-linear buffer, the
 * transmitter's legs switching opposite ways, the receiver's two pads read as their difference (scaled by the whole
 * supply, the differential swing of an ideal pair).
 */
export function analogImpulse(p: Ports | number[][][], n: number, dt: number, z0: number, txA: Analog, rxA: Analog) {
  const S = matrix(p), four = S.length === 4, tx = endOf(txA), rx = endOf(rxA), scale = 1 / ((four ? txA.vcc : txA.vcc / 2) * dt);
  const edge = (rising: boolean) => {
    const r = four
      ? run(S, n, dt, z0, [tx, tx, rx, rx], [schedule(txA, rising, dt), schedule(txA, !rising, dt), null, null])
      : run(S, n, dt, z0, [tx, rx], [schedule(txA, rising, dt), null]);
    const out = four ? 2 : 1, d0 = four ? r.v0[2] - r.v0[3] : r.v0[1];
    return Array.from(r.vd[out], (v, k) => (four ? v - r.vd[3][k] : v) - d0);
  };
  const d = (s: number[], sign: number) => s.map((v, k) => sign * (v - (k ? s[k - 1] : 0)) * scale);
  const rise = d(edge(true), 1), fall = d(edge(false), -1);
  return { rise, fall, h: rise.map((v, k) => (v + fall[k]) / 2) };
}

/**
 * How the receiver hears a wave arriving at its pin from the line (M586: a neighbour's near-end crosstalk, with the
 * echoes it makes between the two mismatched ends): its (differential) pad voltage per unit incoming wave, every dt
 * (an ideal matched receiver gives one sample of 1 / dt). The buffers held still at either level, the small-signal
 * answers averaged. On a pair, `side` is where the neighbour sits (M587): 0 a neighbouring pair, arriving on both legs
 * as a differential wave; 1 beside the first leg, −1 beside the second, arriving on that leg alone (its common part
 * bouncing and converting through the ends as it will), signed so an ideal end hears the same differential wave.
 */
export function arrivalResponse(p: Ports | number[][][], n: number, dt: number, z0: number, txA: Analog, rxA: Analog, side: 0 | 1 | -1 = 0) {
  const S = matrix(p), four = S.length === 4, tx = endOf(txA), rx = endOf(rxA), eps = 1e-3, out = new Array(n).fill(0);
  for (const rising of [true, false]) {
    const r = four
      ? run(S, n, dt, z0, [tx, tx, rx, rx], [still(schedule(txA, rising, dt)), still(schedule(txA, !rising, dt)), null, null], [null, null, side < 0 ? null : side ? eps : eps / 2, side > 0 ? null : side ? -eps : -eps / 2])
      : run(S, n, dt, z0, [tx, rx], [still(schedule(txA, rising, dt)), null], [null, eps]);
    const y = Array.from(r.vd[four ? 2 : 1], (v, k) => (four ? v - r.vd[3][k] - (r.v0[2] - r.v0[3]) : v - r.v0[1]));
    for (let k = 0; k < n; k++) out[k] += (y[k] - (k ? y[k - 1] : 0)) / (2 * eps * dt);
  }
  return out;
}

/** a ∗ b by FFT, the first len samples. */
export function convolve(a: number[], b: number[], len: number) {
  let N = 1; while (N < a.length + b.length) N <<= 1;
  const ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N);
  ar.set(a); br.set(b); fftPow2(ar, ai, false); fftPow2(br, bi, false);
  for (let k = 0; k < N; k++) { const r = ar[k] * br[k] - ai[k] * bi[k]; ai[k] = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = r; }
  fftPow2(ar, ai, true);
  return Array.from(ar.subarray(0, len), (v) => v / N);
}

/** A [Rising Waveform] or [Falling Waveform] table: its fixture (r ohms to v volts, L_fixture l and C_fixture c), the
 * package it was measured through (R_dut rd, L_dut ld, C_dut cd; 0 when absent) and [t V] rows at the corner. */
export interface Wave { r: number; v: number; rows: number[][]; l?: number; c?: number; rd?: number; ld?: number; cd?: number }
/**
 * The current the fixture and package push into the die over an edge, its die voltage V(t) given (M587: IBIS measures
 * the tables at the die pad, so the network between is de-embedded exactly by solving it driven by V): die, R_dut and
 * L_dut to node b (C_dut there), L_fixture to node c (C_fixture there), R_fixture to V_fixture. Backward Euler on the
 * table's grid; a missing L a short, a missing C open. Starts in its DC state at V(0).
 */
export function fixtureCurrent(x: Wave, V: number[], h: number): number[] {
  if (!(x.l || x.c || x.rd || x.ld || x.cd)) return V.map((v) => (x.v - v) / x.r);
  const BIG = 1e6, grd = 1 / Math.max(x.rd ?? 0, 1 / BIG), grf = 1 / x.r, ld = x.ld ?? 0, lf = x.l ?? 0, cd = (x.cd ?? 0) / h, cf = (x.c ?? 0) / h;
  const gd = ld > 0 ? h / ld : BIG, gf = lf > 0 ? h / lf : BIG;
  const i0 = (x.v - V[0]) / (x.r + (x.rd ?? 0));
  let id = i0, iF = i0, vb = V[0] + i0 * (x.rd ?? 0), vc = vb;
  return V.map((v, n) => {
    if (!n) return i0;
    // currents toward the die: id = hd + gd·(vb − va) through L_dut, iF = hf + gf·(vc − vb) through L_fixture
    const hd = ld > 0 ? id : 0, hf = lf > 0 ? iF : 0;
    // tridiagonal in va, vb, vc (Thomas)
    const a = [0, -gd, -gf], b = [grd + gd, gd + gf + cd, grf + gf + cf], c = [-gd, -gf, 0], d = [grd * v + hd, hf - hd + cd * vb, grf * x.v - hf + cf * vc];
    for (let i = 1; i < 3; i++) { const m = a[i] / b[i - 1]; b[i] -= m * c[i - 1]; d[i] -= m * d[i - 1]; }
    const nc = d[2] / b[2], nb = (d[1] - c[1] * nc) / b[1], na = (d[0] - c[0] * nb) / b[0];
    id = hd + gd * (nb - na); iF = hf + gf * (nc - nb); vb = nb; vc = nc;
    return grd * (na - v);
  });
}
/**
 * The pull-up and pull-down weights over an edge from its waveform tables (IBIS's usual extraction): at each moment the
 * pad's voltage into each fixture fixes the driver's current, ku·Ipu(Vcc − V) + kd·Ipd(V) = I_fixture − C_comp·dV/dt
 * − the clamps' currents (I_fixture through the fixture's R, L and C and the package it names, `fixtureCurrent`); two
 * fixtures give both weights, one gives ku with kd = 1 − ku. Rows [t ku kd].
 */
export function switching(a: Analog, waves: Wave[]): number[][] | null {
  let w = waves.filter((x) => x.r > 0 && Number.isFinite(x.v) && x.rows.length >= 2);
  if (!w.length) return null;
  if (w.length > 2) { const by = [...w].sort((x, y) => x.v - y.v); w = [by[0], by[by.length - 1]]; }
  if (w.length === 2 && Math.abs(w[0].v - w[1].v) < 1e-9) w = [w[0]];
  const e = endOf(a), t1 = Math.max(...w.map((x) => x.rows[x.rows.length - 1][0])), m = Math.min(400, Math.max(50, 4 * Math.max(...w.map((x) => x.rows.length))));
  const V = (x: Wave, t: number) => held(x.rows, 1, t), h = t1 / (m - 1), out: number[][] = [];
  const I = w.map((x) => fixtureCurrent(x, Array.from({ length: m }, (_, i) => V(x, i * h)), h));
  let ku = 0, kd = 1;
  for (let i = 0; i < m; i++) {
    const t = i * h, eq = w.map((x, wi) => {
      const v = V(x, t), dv = (V(x, Math.min(t1, t + h)) - V(x, Math.max(0, t - h))) / (Math.min(t1, t + h) - Math.max(0, t - h));
      return { A: iv(e.pu, a.vcc - v), Bd: iv(e.pd, v), r: I[wi][i] - a.cComp * dv - iv(e.gc, v) - iv(e.pc, a.vcc - v) };
    });
    if (eq.length === 2) {
      const [p, q] = eq, det = p.A * q.Bd - q.A * p.Bd;
      if (Math.abs(det) > 1e-9 * (Math.abs(p.A * q.Bd) + Math.abs(q.A * p.Bd)) && det !== 0) { ku = (p.r * q.Bd - q.r * p.Bd) / det; kd = (p.A * q.r - q.A * p.r) / det; }
    } else {
      const d = eq[0].A - eq[0].Bd;
      if (Math.abs(d) > 1e-15) { ku = (eq[0].r - eq[0].Bd) / d; kd = 1 - ku; }
    }
    const c = (k: number) => Math.min(1.2, Math.max(-0.2, k));
    out.push([t, c(ku), c(kd)]);
  }
  return out;
}
