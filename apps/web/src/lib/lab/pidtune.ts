import { LabError } from './parse';
import { BUILTINS } from './builtins';
import { num, str, toMat, type Struct, type Value } from './values';
import { pade } from './pade';
import { autoFreq, isLti, makeTf, margin, rootsOf, stepinfo, tfOf, type Tf } from './control';

// Hyperion's PID tuner (M562, the owner's picture of MATLAB's PID Tuner: "automatically tune and optimize controllers
// to meet the performance requirements and stability constraints of your system"). A PID is chosen in the frequency
// domain: at the crossover frequency wc the loop C·G must have gain 1 and the wanted phase margin, which fixes two of
// its numbers; for a PID the third is fixed by Ti = 4·Td (the controller's two zeros together). With no wc given, the
// one that gives the most integral gain (the fastest rejection of a steady push) with that margin is chosen, as
// MATLAB's pidtune does (1/(s+1)³ as a PI: Kp 1.14, Ki 0.454 at 0.52 rad/s). The derivative's filter is folded in by
// correcting the target until C(jwc) is what it should be.

export type PidType = 'P' | 'I' | 'PI' | 'PD' | 'PID' | 'PIDF';
export const PID_TYPES: PidType[] = ['P', 'I', 'PI', 'PD', 'PID', 'PIDF'];
export interface Gains { Kp: number; Ki: number; Kd: number; Tf: number }

type Poly = number[];
const conv = (a: Poly, b: Poly): Poly => { const o = new Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { o[i + j] += x * y; })); return o; };
const add = (a: Poly, b: Poly): Poly => { const n = Math.max(a.length, b.length), o = new Array(n).fill(0); a.forEach((x, i) => { o[n - a.length + i] += x; }); b.forEach((x, i) => { o[n - b.length + i] += x; }); return o; };
const at = (p: Poly, w: number): [number, number] => { let r = 0, i = 0; for (const c of p) { const nr = -i * w + c, ni = r * w; r = nr; i = ni; } return [r, i]; };
/** G(jw) as [re, im]. */
export function freq(t: Tf, w: number): [number, number] { const [nr, ni] = at(t.n, w), [dr, di] = at(t.d, w), q = dr * dr + di * di; return [(nr * dr + ni * di) / q, (ni * dr - nr * di) / q]; }
const rad = Math.PI / 180;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Kp + Ki/s + Kd·s/(Tf·s + 1) over one denominator. */
export function pidTf(g: Gains): Tf {
  const { Kp, Ki, Kd, Tf } = g, f = Tf ? [Tf, 1] : [1];
  // With integral action: ((Kp s + Ki)(Tf s + 1) + Kd s²) / (s (Tf s + 1)); without: (Kp (Tf s + 1) + Kd s) / (Tf s + 1).
  const t = Ki ? { n: add(conv([Kp, Ki], f), [Kd, 0, 0]), d: conv([1, 0], f) } : { n: add(conv([Kp], f), [Kd, 0]), d: f };
  while (t.n.length > 1 && t.n[0] === 0) t.n.shift();
  return t;
}
const cAt = (g: Gains, w: number) => freq(pidTf(g), w);

/** The gains that put the loop's gain crossover at wc with phase margin pm (degrees); null when this type can't. */
export function designAt(G: Tf, type: PidType, wc: number, pm: number, N = 10): Gains | null {
  const [gr, gi] = freq(G, wc), Mg = Math.hypot(gr, gi);
  if (!(Mg > 0) || !Number.isFinite(Mg)) return null;
  const M = 1 / Mg, phi = wrap((-180 + pm) * rad - Math.atan2(gi, gr));
  const ok = (lo: number, hi: number) => phi > lo * rad && phi < hi * rad;
  switch (type) {
    case 'P': return { Kp: M, Ki: 0, Kd: 0, Tf: 0 };
    case 'I': return { Kp: 0, Ki: M * wc, Kd: 0, Tf: 0 };
    case 'PI': return ok(-89.5, -0.5) ? { Kp: M * Math.cos(phi), Ki: -M * Math.sin(phi) * wc, Kd: 0, Tf: 0 } : null;
    case 'PD': {
      if (!ok(0.5, 75)) return null;
      const Kp = M * Math.cos(phi), Kd = (M * Math.sin(phi)) / wc;
      return { Kp, Ki: 0, Kd, Tf: 0 };
    }
    case 'PID': case 'PIDF': {
      if (!ok(-85, 80)) return null;
      // Aim at a target, then (with a filter) nudge the target until the real C(jwc) lands on the wanted one.
      let aim = phi, mag = M, g: Gains = { Kp: 0, Ki: 0, Kd: 0, Tf: 0 };
      for (let it = 0; it < (type === 'PIDF' ? 30 : 1); it++) {
        if (Math.abs(aim) >= Math.PI / 2 - 0.01) return null;
        const Kp = mag * Math.cos(aim), S = mag * Math.sin(aim), z = (S + Math.sqrt(S * S + Kp * Kp)) / 2, Kd = z / wc;
        g = { Kp, Ki: (Kp * Kp) / (4 * Kd), Kd, Tf: type === 'PIDF' ? Kd / (Kp * N) : 0 };
        if (type !== 'PIDF') break;
        const [cr, ci] = cAt(g, wc), errA = phi - Math.atan2(ci, cr), errM = M / Math.hypot(cr, ci);
        if (Math.abs(errA) < 1e-9 && Math.abs(errM - 1) < 1e-9) break;
        aim = wrap(aim + errA); mag *= errM;
      }
      return g;
    }
  }
}

/** Whether the closed loop C·G/(1 + C·G) is stable. */
export function closedStable(G: Tf, g: Gains): boolean {
  const C = pidTf(g), d = add(conv(C.d, G.d), conv(C.n, G.n));
  return rootsOf(d).every((q) => q.re < -1e-9);
}

const logspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => 10 ** (Math.log10(a) + ((Math.log10(b) - Math.log10(a)) * i) / (n - 1)));

/** The crossover frequency with no wc given: the most integral gain (PI, PID), the plant's own phase for P and I,
 * the most proportional gain for PD; each design checked stable. */
export function autoWc(G: Tf, type: PidType, pm: number, N = 10): number {
  const [lo, hi] = autoFreq(G), w = logspace(lo / 100, hi * 100, 700);
  if (type === 'P' || type === 'I') {
    // Where the plant's own phase gives the margin (I adds −90°).
    const want = (-180 + pm + (type === 'I' ? 90 : 0)) * rad;
    const err = (x: number) => { const [r, i] = freq(G, x); return wrap(Math.atan2(i, r) - want); };
    for (let k = 1; k < w.length; k++) {
      const e0 = err(w[k - 1]), e1 = err(w[k]);
      if (e0 > 0 && e1 <= 0 && e0 - e1 < Math.PI) {
        let a = w[k - 1], b = w[k];
        for (let it = 0; it < 60; it++) { const m = Math.sqrt(a * b); if (err(m) > 0) a = m; else b = m; }
        return Math.sqrt(a * b);
      }
    }
    throw new LabError(`The plant's phase never gives a ${pm}° margin for ${type === 'P' ? 'a P' : 'an I'} controller: try PI or PID.`);
  }
  // A controller at most ten times faster than the plant's own fastest pole or zero (a first-order plant would
  // otherwise take any speed, with gains to match).
  const speeds = [...rootsOf(G.n), ...rootsOf(G.d)].map((q) => Math.hypot(q.re, q.im)), fastest = Math.max(0, ...speeds.filter((v) => v > 1e-9)), cap = 10 * (fastest || 1);
  const score = (x: number) => {
    if (x > cap) return -Infinity;
    const g = designAt(G, type, x, pm, N);
    // The integral's corner at or below the crossover (its lag at most 45° there): more integral than that is a slow,
    // overshooting tail.
    return g && g.Kp >= 0 && g.Ki >= 0 && g.Kd >= 0 && g.Ki <= g.Kp * x * 1.0001 ? (type === 'PD' ? g.Kp : g.Ki) : -Infinity;
  };
  const ranked = w.map((x, i) => ({ x, i, s: score(x) })).filter((r) => r.s > -Infinity && Number.isFinite(r.s)).sort((a, b) => b.s - a.s);
  for (const r of ranked.slice(0, 40)) {
    // Refined between its neighbours (golden section), then checked.
    let a = w[Math.max(0, r.i - 1)], b = w[Math.min(w.length - 1, r.i + 1)];
    for (let it = 0; it < 40; it++) { const m1 = a * (b / a) ** 0.382, m2 = a * (b / a) ** 0.618; if (score(m1) > score(m2)) b = m2; else a = m1; }
    const x = Math.sqrt(a * b), g = designAt(G, type, x, pm, N);
    if (g && closedStable(G, g)) return x;
    if (closedStable(G, designAt(G, type, r.x, pm, N)!)) return r.x;
  }
  throw new LabError(`No ${type} controller gives this plant a ${pm}° phase margin and a stable loop: try another type, or a smaller margin.`);
}

/** pidtune: the gains for a type, a crossover frequency (auto when not given) and a phase margin (60° by default). */
export function tunePid(G: Tf, type: PidType, opts: { wc?: number; pm?: number; N?: number } = {}) {
  const pm = opts.pm ?? 60, N = opts.N ?? 10;
  if (!(pm > 0 && pm < 90)) throw new LabError('The phase margin is between 0 and 90 degrees.');
  const wc = opts.wc && opts.wc > 0 ? opts.wc : autoWc(G, type, pm, N);
  let g = designAt(G, type, wc, pm, N);
  if (!g) {
    // The wanted phase can't be had at this wc: the nearest the type can give.
    for (const p of [pm - 10, pm + 10, pm - 20, pm + 20, pm - 30, pm + 25, pm - 40]) { if (p > 0 && p < 90 && (g = designAt(G, type, wc, p, N))) break; }
    if (!g) throw new LabError(`A ${type} controller can't put the crossover at ${+wc.toPrecision(3)} rad/s for this plant: try another frequency or type.`);
  }
  return { gains: g, wc };
}

/** What a controller does with the plant: closed-loop step numbers, margins and stability. */
export function pidReport(G: Tf, g: Gains) {
  // Every transfer function made monic (the time responses step the controllable canonical form, which needs it).
  const monic = (n: Poly, d: Poly): Tf => { let i = 0; while (i < d.length - 1 && d[i] === 0) i++; const k = d[i]; return { n: n.map((v) => v / k), d: d.slice(i).map((v) => v / k) }; };
  const C = pidTf(g), L = monic(conv(C.n, G.n), conv(C.d, G.d)), cl = add(L.d, L.n);
  const stable = rootsOf(cl).every((q) => q.re < -1e-9);
  const m = margin(L);
  const info = stable ? stepinfo({ n: L.n, d: cl }) : null;
  return { stable, info, Gm: m.Gm, Wcg: m.Wcg, Pm: m.Pm, Wcp: m.Wcp, track: { n: L.n, d: cl }, disturb: monic(conv(G.n, C.d), add(conv(C.d, G.d), conv(C.n, G.n))), effort: monic(conv(C.n, G.d), add(conv(C.d, G.d), conv(C.n, G.n))), loop: L };
}

// ——— The functions in the language ———

const def = (names: string, fn: (a: Value[], nout: number) => Value[]) => { for (const n of names.split(' ')) BUILTINS[n] = fn as (typeof BUILTINS)[string]; };
const optsOf = (v: Value | undefined) => {
  if (!v || v.k !== 'struct') return {};
  const f = (k: string) => { const x = v.f.get(k); return x ? toMat(x).d[0] : undefined; };
  return { pm: f('PhaseMargin'), N: f('N') };
};

def('pidtuneOptions', (a) => {
  const s: Struct = { k: 'struct', f: new Map([['PhaseMargin', num(60)], ['N', num(10)]]) };
  for (let i = 0; i + 1 < a.length; i += 2) {
    const ai = a[i], k = ai.k === 'str' ? String(ai.v) : '', key = ['PhaseMargin', 'N'].find((x) => x.toLowerCase() === k.toLowerCase());
    if (!key) throw new LabError(`pidtuneOptions takes 'PhaseMargin' (degrees) and 'N' (the derivative filter), not '${k}'.`);
    s.f.set(key, num(toMat(a[i + 1]).d[0]));
  }
  return [s];
});
def('pidtune', (a, nout) => {
  if (!isLti(a[0])) throw new LabError("pidtune needs a plant's transfer function first, like pidtune(tf(1, [1 3 3 1]), 'PI').");
  const t = a[1], G = tfOf(a[0], 'The plant'), raw = t?.k === 'str' ? String(t.v).toUpperCase() : 'PI';
  const type = PID_TYPES.find((t) => t === raw);
  if (!type) throw new LabError(`pidtune's types are ${PID_TYPES.join(', ')}.`);
  const rest = a.slice(2), wcV = rest.find((v) => v.k !== 'struct'), o = optsOf(rest.find((v) => v.k === 'struct'));
  const { gains, wc } = tunePid(G, type, { wc: wcV ? toMat(wcV).d[0] : undefined, pm: o.pm, N: o.N });
  const C = pidTf(gains), r = pidReport(G, gains);
  const out: Value[] = [makeTf(C.n, C.d)];
  if (nout > 1) out.push({ k: 'struct', f: new Map<string, Value>([['Kp', num(gains.Kp)], ['Ki', num(gains.Ki)], ['Kd', num(gains.Kd)], ['Tf', num(gains.Tf)], ['CrossoverFrequency', num(wc)], ['PhaseMargin', num(r.Pm)], ['Stable', { ...num(r.stable ? 1 : 0) }], ['Type', str(type)]]) });
  return out;
});

def('pade', (a) => {
  // pade(T, N): a delay of T seconds as a transfer function of order N (M567); pade(G, N) isn't needed here: tf's
  // 'InputDelay' already folds the delay in.
  const T = a[0] ? toMat(a[0]).d[0] : NaN, N = a[1] ? Math.round(toMat(a[1]).d[0]) : 4;
  if (!(T >= 0) || !(N >= 1 && N <= 10)) throw new LabError('pade(T, N) needs a delay T ≥ 0 seconds and an order N from 1 to 10.');
  const p = pade(T, N);
  return [makeTf(p.n, p.d)];
});
