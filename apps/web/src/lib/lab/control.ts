import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { mat, num, str, toMat, type Mat, type Struct, type Value } from './values';
import type { Lab } from './interp';
import { pade } from './pade';

// Hyperion's control systems toolbox (M414, the owner's MATLAB list, "Control Systems: design, test, and implement
// control systems"): transfer functions as values (tf, zpk, ss, pid; s = tf('s') then (s + 1)/(s^2 + 2*s + 1)) that add,
// multiply and close loops (feedback), and the classic tools on them: step, impulse and lsim (exact: each step by the
// matrix exponential of the state-space form), stepinfo, bode, margin, nyquist, rlocus, pole, zero, dcgain, damp,
// minreal. Our own code from the textbook methods; one input and one output (SISO), continuous time.

type Poly = number[];
export interface Tf { n: Poly; d: Poly }

const trim = (p: Poly): Poly => {
  const big = Math.max(...p.map(Math.abs), 0);
  let i = 0;
  while (i < p.length - 1 && Math.abs(p[i]) <= 1e-13 * big) i++;
  return p.slice(i);
};
const conv = (a: Poly, b: Poly): Poly => { const o = new Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { o[i + j] += x * y; })); return o; };
const add = (a: Poly, b: Poly): Poly => { const n = Math.max(a.length, b.length), o = new Array(n).fill(0); a.forEach((x, i) => { o[n - a.length + i] += x; }); b.forEach((x, i) => { o[n - b.length + i] += x; }); return o; };
const scale = (a: Poly, k: number) => a.map((x) => x * k);
/** p(re + i·im), by Horner. */
const at = (p: Poly, re: number, im: number): [number, number] => { let r = 0, i = 0; for (const c of p) { const nr = r * re - i * im + c, ni = r * im + i * re; r = nr; i = ni; } return [r, i]; };
const H = (t: Tf, w: number): [number, number] => { const [nr, ni] = at(t.n, 0, w), [dr, di] = at(t.d, 0, w), q = dr * dr + di * di; return [(nr * dr + ni * di) / q, (ni * dr - nr * di) / q]; };

export const isLti = (v: Value | undefined): v is Struct => !!v && v.k === 'struct' && !!v.lti;
const row = (p: Poly) => mat(1, p.length, p);
/** A transfer function value: polynomials trimmed, the denominator's first coefficient 1. */
export function makeTf(n: Poly, d: Poly): Struct {
  let N = trim(n), D = trim(d);
  if (D.length === 1 && D[0] === 0) throw new LabError('The denominator of a transfer function can’t be 0.');
  const lead = D[0];
  N = N.map((x) => x / lead); D = D.map((x) => x / lead);
  return { k: 'struct', lti: true, f: new Map<string, Value>([['num', row(N)], ['den', row(D)], ['Ts', num(0)]]) };
}
/** A value as a transfer function (a plain number counts as a gain). */
export function tfOf(v: Value, what = 'This'): Tf {
  if (isLti(v)) return { n: [...(v.f.get('num') as Mat).d], d: [...(v.f.get('den') as Mat).d] };
  const m = toMat(v, what);
  if (m.d.length !== 1 || m.im) throw new LabError(`${what} must be a transfer function or one number.`);
  return { n: [m.d[0]], d: [1] };
}
const out = (t: Tf) => makeTf(t.n, t.d);

/** G + H, G * H, G / H, G ^ k (k a whole number) and their mixes with numbers. */
export function ltiBinop(op: string, a: Value, b: Value): Value | null {
  if (!['+', '-', '*', '.*', '/', './', '^', '.^'].includes(op)) return null;
  if (op === '^' || op === '.^') {
    const k = toMat(b, 'The power').d[0];
    if (!Number.isInteger(k)) throw new LabError('A transfer function can only be raised to a whole number.');
    const g = tfOf(a);
    let r: Tf = { n: [1], d: [1] };
    for (let i = 0; i < Math.abs(k); i++) r = { n: conv(r.n, g.n), d: conv(r.d, g.d) };
    return out(k < 0 ? { n: r.d, d: r.n } : r);
  }
  const x = tfOf(a), y = tfOf(b);
  if (op === '*' || op === '.*') return out({ n: conv(x.n, y.n), d: conv(x.d, y.d) });
  if (op === '/' || op === './') { if (trim(y.n).every((c) => c === 0)) throw new LabError('Dividing by a zero transfer function.'); return out({ n: conv(x.n, y.d), d: conv(x.d, y.n) }); }
  const s = op === '-' ? -1 : 1;
  // Same denominators add their numerators (no needless growth).
  if (x.d.length === y.d.length && x.d.every((c, i) => Math.abs(c - y.d[i]) < 1e-12)) return out({ n: add(x.n, scale(y.n, s)), d: x.d });
  return out({ n: add(conv(x.n, y.d), scale(conv(y.n, x.d), s)), d: conv(x.d, y.d) });
}
export const ltiNeg = (a: Struct) => { const t = tfOf(a); return out({ n: scale(t.n, -1), d: t.d }); };

// ——— Roots, poles and zeros ———

/** The roots of a polynomial (complex ones in pairs), through Hyperion's roots. */
export function rootsOf(p: Poly): { re: number; im: number }[] {
  const q = trim(p);
  if (q.length < 2) return [];
  const r = BUILTINS.roots([row(q)], 1, undefined as unknown as Lab)[0] as Mat;
  return [...r.d].map((re, i) => ({ re, im: r.im ? r.im[i] : 0 }));
}
/** A polynomial (real) from roots and a gain. */
function fromRoots(roots: { re: number; im: number }[], k = 1): Poly {
  let pr: number[] = [1], pi: number[] = [0];
  for (const { re, im } of roots) {
    const nr = new Array(pr.length + 1).fill(0), ni = new Array(pr.length + 1).fill(0);
    for (let i = 0; i < pr.length; i++) { nr[i] += pr[i]; ni[i] += pi[i]; nr[i + 1] -= pr[i] * re - pi[i] * im; ni[i + 1] -= pr[i] * im + pi[i] * re; }
    pr = nr; pi = ni;
  }
  return pr.map((x) => x * k);
}
/** Common poles and zeros taken out (closer than tol). */
export function minreal(t: Tf, tol = 1e-6): Tf {
  const z = rootsOf(t.n), p = rootsOf(t.d), kz = trim(t.n)[0] / trim(t.d)[0];
  for (let i = z.length - 1; i >= 0; i--) {
    const j = p.findIndex((q) => Math.hypot(q.re - z[i].re, q.im - z[i].im) <= tol * Math.max(1, Math.hypot(q.re, q.im)));
    if (j >= 0) { p.splice(j, 1); z.splice(i, 1); }
  }
  return { n: fromRoots(z, kz), d: fromRoots(p) };
}

// ——— Time responses: the controllable canonical form, stepped exactly ———

type Mx = number[][];
const mul = (A: Mx, B: Mx): Mx => A.map((r) => B[0].map((_, j) => r.reduce((s, x, k) => s + x * B[k][j], 0)));
const ident = (n: number): Mx => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
/** e^M by scaling and squaring with a degree-6 Padé approximant. */
export function expm(M: Mx): Mx {
  const n = M.length, norm = Math.max(...M.map((r) => r.reduce((s, x) => s + Math.abs(x), 0)), 0);
  const s = Math.max(0, Math.ceil(Math.log2(norm || 1)) + 1), A = M.map((r) => r.map((x) => x / 2 ** s));
  const c = [1, 1 / 2, 5 / 44, 1 / 66, 1 / 792, 1 / 15840, 1 / 665280];
  let P = ident(n), Q = ident(n), X = ident(n);
  for (let k = 1; k <= 6; k++) {
    X = mul(A, X);
    P = P.map((r, i) => r.map((x, j) => x + c[k] * X[i][j]));
    Q = Q.map((r, i) => r.map((x, j) => x + (k % 2 ? -1 : 1) * c[k] * X[i][j]));
  }
  // E = Q⁻¹ P (Gauss–Jordan), then squared s times.
  const aug = Q.map((r, i) => [...r, ...P[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(aug[i][k]) > Math.abs(aug[p][k])) p = i;
    [aug[k], aug[p]] = [aug[p], aug[k]];
    const d = aug[k][k];
    for (let j = 0; j < 2 * n; j++) aug[k][j] /= d;
    for (let i = 0; i < n; i++) if (i !== k) { const f = aug[i][k]; if (f) for (let j = 0; j < 2 * n; j++) aug[i][j] -= f * aug[k][j]; }
  }
  let E = aug.map((r) => r.slice(n));
  for (let k = 0; k < s; k++) E = mul(E, E);
  return E;
}
/** x' = A x + B u, y = C x + D u (controllable canonical form). */
function stateSpace(t: Tf) {
  const d = trim(t.d), n = d.length - 1, b = [...new Array(Math.max(0, d.length - t.n.length)).fill(0), ...t.n].slice(-(n + 1));
  if (trim(t.n).length > d.length) throw new LabError('This transfer function has more zeros than poles (it isn’t proper), so it can’t be run in time.');
  const D = b[0], A: Mx = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === 0 ? -d[j + 1] : j === i - 1 ? 1 : 0)));
  const B = Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0)), C = Array.from({ length: n }, (_, k) => b[k + 1] - d[k + 1] * D);
  return { A, B, C, D, n };
}
/** The response to an input u (one value per step h), from a start state x0. */
export function simulate(t: Tf, h: number, u: number[], x0?: number[]): number[] {
  const { A, B, C, D, n } = stateSpace(t);
  if (n === 0) return u.map((v) => D * v);
  // [[A, B], [0, 0]]·h exponentiated gives Φ = e^{Ah} and Γ = ∫ e^{As} ds B together.
  const Mbig: Mx = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i < n ? (j < n ? A[i][j] * h : B[i] * h) : 0)));
  const E = expm(Mbig), Phi = E.slice(0, n).map((r) => r.slice(0, n)), Gam = E.slice(0, n).map((r) => r[n]);
  let x = x0 ? [...x0] : new Array(n).fill(0);
  return u.map((uk) => {
    const y = C.reduce((s, c, i) => s + c * x[i], 0) + D * uk;
    x = Phi.map((r, i) => r.reduce((s, v, j) => s + v * x[j], 0) + Gam[i] * uk);
    return y;
  });
}
/** A good time span: six times the slowest settling time (or ten over the fastest speed when not stable). */
export function autoTime(t: Tf): number {
  const p = rootsOf(t.d);
  if (!p.length) return 1;
  const stable = p.every((q) => q.re < -1e-9);
  if (stable) return Math.min(1e6, Math.max(1e-6, 6 / Math.min(...p.map((q) => -q.re))));
  const fast = Math.max(...p.map((q) => Math.hypot(q.re, q.im)), 0);
  return Math.min(1e6, fast > 1e-9 ? 20 / fast : 10);
}
export function stepOf(t: Tf, T = autoTime(t), N = 1001) {
  const h = T / (N - 1), time = Array.from({ length: N }, (_, i) => i * h);
  return { t: time, y: simulate(t, h, new Array(N).fill(1)) };
}
export function impulseOf(t: Tf, T = autoTime(t), N = 1001) {
  const h = T / (N - 1), time = Array.from({ length: N }, (_, i) => i * h), { B } = stateSpace(t);
  return { t: time, y: simulate(t, h, new Array(N).fill(0), B) };
}
export const dcgain = (t: Tf) => { const d0 = t.d[t.d.length - 1], n0 = t.n[t.n.length - 1]; return d0 === 0 ? (n0 === 0 ? NaN : Infinity) : n0 / d0; };

/** Rise time (10 → 90 %), settling time (within 2 %), overshoot (%), peak and its time, the final value. */
export function stepinfo(t: Tf) {
  const { t: time, y } = stepOf(t, autoTime(t), 8001), yss = dcgain(t);
  const fin = Number.isFinite(yss) ? yss : y[y.length - 1];
  const s = Math.sign(fin) || 1, abs = y.map((v) => v * s), F = fin * s;
  const cross = (level: number) => { for (let i = 1; i < abs.length; i++) if (abs[i] >= level && abs[i - 1] < level) return time[i - 1] + ((level - abs[i - 1]) / (abs[i] - abs[i - 1])) * (time[i] - time[i - 1]); return NaN; };
  let pk = 0;
  for (let i = 1; i < abs.length; i++) if (abs[i] > abs[pk]) pk = i;
  let settle = 0;
  for (let i = abs.length - 1; i >= 0; i--) if (Math.abs(abs[i] - F) > 0.02 * Math.abs(F)) { settle = time[Math.min(i + 1, time.length - 1)]; break; }
  return { RiseTime: cross(0.9 * F) - cross(0.1 * F), SettlingTime: settle, Overshoot: Math.max(0, ((abs[pk] - F) / Math.abs(F)) * 100), Peak: Math.abs(y[pk]), PeakTime: time[pk], SteadyState: fin };
}

// ——— Frequency responses ———

/** A frequency range two decades either side of the poles' and zeros' speeds. */
export function autoFreq(t: Tf): [number, number] {
  const m = [...rootsOf(t.n), ...rootsOf(t.d)].map((q) => Math.hypot(q.re, q.im)).filter((x) => x > 1e-9);
  if (!m.length) return [0.1, 10];
  return [10 ** (Math.floor(Math.log10(Math.min(...m))) - 1), 10 ** (Math.ceil(Math.log10(Math.max(...m))) + 1)];
}
/** Magnitude (absolute) and phase (degrees, unwrapped) at each frequency. */
export function bodeOf(t: Tf, w: number[]) {
  const mag: number[] = [], phase: number[] = [];
  let prev = NaN;
  for (const x of w) {
    const [re, im] = H(t, x);
    mag.push(Math.hypot(re, im));
    let ph = (Math.atan2(im, re) * 180) / Math.PI;
    if (Number.isFinite(prev)) while (ph - prev > 180) ph -= 360;
    if (Number.isFinite(prev)) while (ph - prev < -180) ph += 360;
    phase.push(ph); prev = ph;
  }
  // An integrator's or a delay-free system's phase starts where the textbook draws it (−90° per pole at 0, …).
  const p0 = rootsOf(t.d).filter((q) => Math.hypot(q.re, q.im) < 1e-9).length - rootsOf(t.n).filter((q) => Math.hypot(q.re, q.im) < 1e-9).length;
  const want = -90 * p0 + (dcgain(t) < 0 ? -180 : 0), shift = Math.round((want - phase[0]) / 360) * 360;
  return { mag, phase: phase.map((x) => x + shift) };
}
const logspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => 10 ** (Math.log10(a) + ((Math.log10(b) - Math.log10(a)) * i) / (n - 1)));
/** Gain margin (absolute) at the phase crossover, phase margin (°) at the gain crossover, and those frequencies. */
export function margin(t: Tf) {
  const [a, b] = autoFreq(t), w = logspace(a / 10, b * 10, 6000), { mag, phase } = bodeOf(t, w);
  let Gm = Infinity, Wcg = NaN, Pm = Infinity, Wcp = NaN;
  for (let i = 1; i < w.length; i++) {
    // Phase crossover: the phase passes −180° (+ k·360°); refined where the response's imaginary part is 0.
    const k0 = Math.floor((phase[i - 1] + 180) / 360), k1 = Math.floor((phase[i] + 180) / 360);
    if (k0 !== k1 && !Number.isFinite(Wcg)) {
      let lo = w[i - 1], hi = w[i];
      const s0 = Math.sign(H(t, lo)[1]);
      for (let it = 0; it < 60; it++) { const m = Math.sqrt(lo * hi); if (Math.sign(H(t, m)[1]) === s0) lo = m; else hi = m; }
      Wcg = Math.sqrt(lo * hi); const [re, im] = H(t, Wcg); Gm = 1 / Math.hypot(re, im);
    }
    // Gain crossover: |H| passes 1.
    if ((mag[i - 1] - 1) * (mag[i] - 1) <= 0 && mag[i - 1] !== mag[i] && !Number.isFinite(Wcp)) {
      let lo = w[i - 1], hi = w[i];
      const up = mag[i - 1] > 1;
      for (let it = 0; it < 60; it++) { const m = Math.sqrt(lo * hi), [re, im] = H(t, m); if ((Math.hypot(re, im) > 1) === up) lo = m; else hi = m; }
      Wcp = Math.sqrt(lo * hi);
      const ph = phase[i - 1] + (phase[i] - phase[i - 1]) * (Math.log(Wcp / w[i - 1]) / Math.log(w[i] / w[i - 1]));
      Pm = ((((ph + 180) % 360) + 540) % 360) - 180;
    }
  }
  return { Gm, Pm, Wcg, Wcp };
}

/** The closed loop's poles for gains K (each column one gain), branches kept in order. */
export function rlocusOf(t: Tf, K: number[]) {
  const cols: { re: number; im: number }[][] = [];
  for (const k of K) {
    const r = rootsOf(add(t.d, scale(t.n, k)));
    const last = cols[cols.length - 1];
    if (last && last.length === r.length) {
      // Match each branch to the nearest root of the next gain.
      const left = [...r], next = last.map((q) => { let b = 0; left.forEach((x, i) => { if (Math.hypot(x.re - q.re, x.im - q.im) < Math.hypot(left[b].re - q.re, left[b].im - q.im)) b = i; }); return left.splice(b, 1)[0]; });
      cols.push(next);
    } else cols.push(r);
  }
  return cols;
}

// ——— The functions in the language ———

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const vec = (v: Value, what: string): Poly => [...toMat(v, what).d];
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const text = (lab: Lab, title: string, x: string, y: string) => { call(lab, 'title', str(title)); call(lab, 'xlabel', str(x)); call(lab, 'ylabel', str(y)); call(lab, 'grid', str('on')); };
/** The systems among the inputs, and a time or frequency span given after them. */
const systems = (a: Value[]) => { const s = a.filter(isLti).map((x) => tfOf(x)); if (!s.length) throw new LabError('Give a transfer function, like tf(1, [1 2 1]).'); const rest = a.filter((x) => !isLti(x)); return { s, rest }; };
const struct = (o: Record<string, number>): Struct => ({ k: 'struct', f: new Map(Object.entries(o).map(([k, v]) => [k, num(v)])) });

def('tf', (a) => {
  if (a.length === 1 && a[0].k === 'str') { if (a[0].v !== 's') throw new LabError("tf('s') makes the Laplace variable s."); return [makeTf([1, 0], [1])]; }
  if (a.length === 1 && isLti(a[0])) return [a[0]];
  if (a.length < 2) throw new LabError('tf needs a numerator and a denominator, like tf(1, [1 2 1]).');
  // M567: 'InputDelay', 'OutputDelay' or 'IODelay' (seconds): the delay folded in as its 4th-order Padé approximation (6th orders
  // make polynomials whose roots Hyperion's eig can't always settle).
  let L = 0;
  for (let i = 2; i + 1 < a.length; i += 2) {
    const k = a[i], v = a[i + 1];
    if (k.k !== 'str' || !/^(input|output|io)delay$/i.test(k.v)) throw new LabError("tf's options are 'InputDelay', 'OutputDelay' and 'IODelay' (seconds).");
    L += toMat(v).d[0];
  }
  const p = pade(L, 4);
  return [makeTf(conv(vec(a[0], 'The numerator'), p.n), conv(vec(a[1], 'The denominator'), p.d))];
});
def('zpk', (a) => {
  const z = toMat(a[0] ?? mat(0, 0)), p = toMat(a[1] ?? mat(0, 0)), k = a[2] ? toMat(a[2]).d[0] : 1;
  const list = (m: Mat) => [...m.d].map((re, i) => ({ re, im: m.im ? m.im[i] : 0 }));
  return [makeTf(fromRoots(list(z), k), fromRoots(list(p)))];
});
def('ss', (a) => {
  // ss(A, B, C, D) for one input and one output: its transfer function C (sI − A)⁻¹ B + D.
  if (a.length === 1 && isLti(a[0])) return [a[0]];
  const A = toMat(a[0], 'A'), B = toMat(a[1], 'B'), C = toMat(a[2], 'C'), D = a[3] ? toMat(a[3], 'D').d[0] ?? 0 : 0, n = A.r;
  if (A.c !== n || B.d.length !== n || C.d.length !== n) throw new LabError('ss needs A (n×n), B (n×1), C (1×n) and D (1×1).');
  const charPoly = fromRoots(eigs(A));
  // The numerator by evaluating C adj(sI − A) B at n + 1 points and fitting (exact for a polynomial of degree n).
  const xs = Array.from({ length: n + 1 }, (_, i) => i + 1), ys = xs.map((s) => {
    const M = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? s : 0) - A.d[i + j * n]));
    const v = solveSmall(M, Array.from({ length: n }, (_, i) => B.d[i]));
    return v.reduce((acc, x, i) => acc + C.d[i] * x, 0) * at(charPoly, s, 0)[0];
  });
  const numer = fitPoly(xs, ys, n);
  return [makeTf(add(numer, scale(charPoly, D)), charPoly)];
});
def('pid', (a) => {
  const [Kp, Ki, Kd, Tf] = [0, 1, 2, 3].map((i) => (a[i] ? toMat(a[i]).d[0] : 0));
  // Kp + Ki/s + Kd·s/(Tf·s + 1), over one denominator.
  const g = ltiBinop('+', ltiBinop('+', makeTf([Kp], [1]), makeTf([Ki], [1, 0]))!, makeTf([Kd, 0], Tf ? [Tf, 1] : [1]))!;
  return [g];
});
def('feedback', (a) => {
  const g = tfOf(a[0], 'The plant'), h = a[1] ? tfOf(a[1], 'The feedback') : { n: [1], d: [1] }, sign = a[2] ? toMat(a[2]).d[0] : -1;
  return [out({ n: conv(g.n, h.d), d: add(conv(g.d, h.d), scale(conv(g.n, h.n), -sign)) })];
});
def('series', (a) => [ltiBinop('*', a[0], a[1])!]);
def('parallel', (a) => [ltiBinop('+', a[0], a[1])!]);
def('minreal', (a) => [out(minreal(tfOf(a[0]), a[1] ? toMat(a[1]).d[0] : 1e-6))]);
const complexCol = (r: { re: number; im: number }[]) => { const m = mat(r.length, 1, r.map((q) => q.re)); if (r.some((q) => q.im !== 0)) m.im = Float64Array.from(r.map((q) => q.im)); return m; };
def('pole', (a) => [complexCol(rootsOf(tfOf(a[0]).d))]);
def('zero tzero', (a) => [complexCol(rootsOf(tfOf(a[0]).n))]);
def('dcgain', (a) => [num(dcgain(tfOf(a[0])))]);
def('isstable', (a) => [mat(1, 1, [rootsOf(tfOf(a[0]).d).every((q) => q.re < 0) ? 1 : 0], true)]);
def('damp', (a, nout, lab) => {
  const p = rootsOf(tfOf(a[0]).d), wn = p.map((q) => Math.hypot(q.re, q.im)), z = p.map((q, i) => (wn[i] ? -q.re / wn[i] : -1));
  if (nout === 0) { lab.host.out(`${['      Pole              Damping   Frequency (rad/s)', ...p.map((q, i) => `  ${`${+q.re.toPrecision(4)}${q.im ? ` ${q.im < 0 ? '-' : '+'} ${+Math.abs(q.im).toPrecision(4)}i` : ''}`.padEnd(18)} ${String(+z[i].toPrecision(4)).padEnd(9)} ${+wn[i].toPrecision(4)}`)].join('\n')}\n`); return []; }
  return [mat(wn.length, 1, wn), mat(z.length, 1, z), complexCol(p)];
});
def('stepinfo', (a) => [struct(stepinfo(tfOf(a[0])))]);
const timeAxis = (s: Tf[], rest: Value[]) => { const T = rest[0] ? toMat(rest[0], 'The time') : null; return T && T.d.length > 1 ? { T: T.d[T.d.length - 1], N: T.d.length } : { T: T ? T.d[0] : Math.max(...s.map((x) => autoTime(x))), N: 1001 }; };
for (const [name, fn, label] of [['step', stepOf, 'Step response'], ['impulse', impulseOf, 'Impulse response']] as const) {
  def(name, (a, nout, lab) => {
    const { s, rest } = systems(a), { T, N } = timeAxis(s, rest), runs = s.map((x) => fn(x, T, N));
    if (nout > 0) return [mat(N, 1, runs[0].y), mat(N, 1, runs[0].t)];
    call(lab, 'hold', str('on'));
    for (const r of runs) call(lab, 'plot', mat(1, N, r.t), mat(1, N, r.y));
    call(lab, 'hold', str('off'));
    text(lab, label, 'Time (seconds)', 'Amplitude');
    return [];
  });
}
def('lsim', (a, nout, lab) => {
  const g = tfOf(a[0]), u = [...toMat(a[1], 'The input').d], t = [...toMat(a[2], 'The time').d];
  if (u.length !== t.length || t.length < 2) throw new LabError('lsim needs an input and its times of the same length.');
  const y = simulate(g, t[1] - t[0], u);
  if (nout > 0) return [mat(y.length, 1, y), mat(t.length, 1, t)];
  call(lab, 'plot', mat(1, t.length, t), mat(1, u.length, u), str('--'));
  call(lab, 'hold', str('on')); call(lab, 'plot', mat(1, t.length, t), mat(1, y.length, y)); call(lab, 'hold', str('off'));
  call(lab, 'legend', str('input'), str('output'));
  text(lab, 'Response to the input', 'Time (seconds)', 'Amplitude');
  return [];
});
const freqs = (s: Tf[], rest: Value[]) => {
  if (rest[0]) { const w = toMat(rest[0], 'The frequencies'); if (w.d.length > 2) return [...w.d]; if (w.d.length === 2) return logspace(w.d[0], w.d[1], 500); }
  const lo = Math.min(...s.map((x) => autoFreq(x)[0])), hi = Math.max(...s.map((x) => autoFreq(x)[1]));
  return logspace(lo, hi, 500);
};
def('bode', (a, nout, lab) => {
  const { s, rest } = systems(a), w = freqs(s, rest), r = s.map((x) => bodeOf(x, w));
  if (nout > 0) return [mat(w.length, 1, r[0].mag), mat(w.length, 1, r[0].phase), mat(w.length, 1, w)];
  drawBode(lab, w, r, 'Bode diagram');
  return [];
});
function drawBode(lab: Lab, w: number[], r: { mag: number[]; phase: number[] }[], title: string) {
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'hold', str('on'));
  for (const x of r) call(lab, 'semilogx', mat(1, w.length, w), mat(1, w.length, x.mag.map((m) => 20 * Math.log10(m))));
  call(lab, 'hold', str('off')); text(lab, title, '', 'Magnitude (dB)');
  call(lab, 'subplot', num(2), num(1), num(2)); call(lab, 'hold', str('on'));
  for (const x of r) call(lab, 'semilogx', mat(1, w.length, w), mat(1, w.length, x.phase));
  call(lab, 'hold', str('off')); text(lab, '', 'Frequency (rad/s)', 'Phase (deg)');
}
def('margin', (a, nout, lab) => {
  const g = tfOf(a[0]), m = margin(g);
  if (nout > 0) return [num(m.Gm), num(m.Pm), num(m.Wcg), num(m.Wcp)];
  const [lo, hi] = autoFreq(g), w = logspace(lo, hi, 500);
  const fmt = (x: number, d = 3) => (Number.isFinite(x) ? String(+x.toPrecision(d)) : 'Inf');
  const at = (x: number) => (Number.isFinite(x) ? ` (at ${fmt(x)} rad/s)` : '');
  drawBode(lab, w, [bodeOf(g, w)], `Gm = ${fmt(20 * Math.log10(m.Gm))} dB${at(m.Wcg)}, Pm = ${fmt(m.Pm)}°${at(m.Wcp)}`);
  return [];
});
def('nyquist', (a, nout, lab) => {
  const { s, rest } = systems(a), w = freqs(s, rest), g = s[0], pts = w.map((x) => H(g, x));
  if (nout > 0) return [mat(w.length, 1, pts.map((p) => p[0])), mat(w.length, 1, pts.map((p) => p[1])), mat(w.length, 1, w)];
  const re = pts.map((p) => p[0]), im = pts.map((p) => p[1]);
  call(lab, 'plot', mat(1, re.length, re), mat(1, im.length, im));
  call(lab, 'hold', str('on'));
  call(lab, 'plot', mat(1, re.length, re), mat(1, im.length, im.map((x) => -x)), str('--'));
  call(lab, 'plot', num(-1), num(0), str('r+'));
  call(lab, 'hold', str('off'));
  text(lab, 'Nyquist diagram', 'Real axis', 'Imaginary axis');
  return [];
});
def('rlocus', (a, nout, lab) => {
  const g = tfOf(a[0]), k0 = Math.abs(trim(g.d)[0] / (trim(g.n)[0] || 1)) || 1;
  const K = a[1] ? [...toMat(a[1], 'The gains').d] : [0, ...logspace(k0 * 1e-4, k0 * 1e4, 400)], cols = rlocusOf(g, K);
  if (nout > 0) {
    const n = cols[0]?.length ?? 0, R = mat(n, K.length), I = new Float64Array(n * K.length);
    cols.forEach((c, j) => c.forEach((q, i) => { R.d[i + j * n] = q.re; I[i + j * n] = q.im; }));
    if (I.some((x) => x !== 0)) R.im = I;
    return [R, mat(1, K.length, K)];
  }
  call(lab, 'hold', str('on'));
  const n = cols[0]?.length ?? 0;
  for (let b = 0; b < n; b++) { const re = cols.map((c) => c[b]?.re ?? NaN), im = cols.map((c) => c[b]?.im ?? NaN); call(lab, 'plot', mat(1, re.length, re), mat(1, im.length, im)); }
  const p = rootsOf(g.d), z = rootsOf(g.n);
  if (p.length) call(lab, 'plot', mat(1, p.length, p.map((q) => q.re)), mat(1, p.length, p.map((q) => q.im)), str('x'));
  if (z.length) call(lab, 'plot', mat(1, z.length, z.map((q) => q.re)), mat(1, z.length, z.map((q) => q.im)), str('o'));
  call(lab, 'hold', str('off'));
  text(lab, 'Root locus', 'Real axis', 'Imaginary axis');
  return [];
});

// ——— Small helpers for ss ———
function eigs(A: Mat): { re: number; im: number }[] {
  const e = BUILTINS.eig([A], 1, undefined as unknown as Lab)[0] as Mat;
  return [...e.d].map((re, i) => ({ re, im: e.im ? e.im[i] : 0 }));
}
function solveSmall(M: number[][], b: number[]): number[] {
  const n = b.length, A = M.map((r, i) => [...r, b[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
    [A[k], A[p]] = [A[p], A[k]];
    for (let i = k + 1; i < n; i++) { const f = A[i][k] / A[k][k]; for (let j = k; j <= n; j++) A[i][j] -= f * A[k][j]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = A[i][n]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; }
  return x;
}
/** The polynomial of degree < n + 1 through the points (Newton's divided differences, then expanded). */
function fitPoly(xs: number[], ys: number[], deg: number): Poly {
  const n = xs.length, c = [...ys];
  for (let j = 1; j < n; j++) for (let i = n - 1; i >= j; i--) c[i] = (c[i] - c[i - 1]) / (xs[i] - xs[i - j]);
  let p: Poly = [c[n - 1]];
  for (let i = n - 2; i >= 0; i--) p = add(conv(p, [1, -xs[i]]), [c[i]]);
  const q = p.map((x) => (Math.abs(x) < 1e-9 * Math.max(1, ...p.map(Math.abs)) ? 0 : x));
  return q.slice(Math.max(0, q.length - (deg + 1)));
}
