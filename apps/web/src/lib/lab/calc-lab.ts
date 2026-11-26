import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import type { Lab } from './interp';
import { mat, num, toMat, type Value } from './values';
import { ros23, sample } from './sci-num';

// Hyperion's calculus in the language (M553): integral2 and integral3 (double and triple integrals over boxes or
// regions whose limits are functions, like MATLAB's) and pdepe (one-dimensional parabolic and elliptic-in-time
// partial differential equations by the method of lines, in slabs, cylinders or spheres, solved with a stiff solver).

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const sc = (v: Value, what: string) => { const m = toMat(v, what); if (m.d.length !== 1) throw new LabError(`${what} must be one number.`); return m.d[0]; };

// ——— Integrals: Gauss–Legendre with 10 and 20 points on each piece, split where they disagree ———
const gl = (n: number) => {
  // Nodes and weights by Newton's method on the Legendre polynomial.
  const x: number[] = [], w: number[] = [];
  for (let i = 1; i <= n; i++) {
    let z = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5)), dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1, p1 = z;
      for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
      dp = (n * (z * p1 - p0)) / (z * z - 1);
      const dz = p1 / dp;
      z -= dz;
      if (Math.abs(dz) < 1e-16) break;
    }
    x.push(z); w.push(2 / ((1 - z * z) * dp * dp));
  }
  return { x, w };
};
const G10 = gl(10), G20 = gl(20);
const rule = (f: (x: number) => number, a: number, b: number, g: { x: number[]; w: number[] }) => {
  const m = (a + b) / 2, r = (b - a) / 2;
  let s = 0;
  for (let i = 0; i < g.x.length; i++) s += g.w[i] * f(m + r * g.x[i]);
  return s * r;
};
/** ∫ f from a to b, to a relative tolerance, by splitting where the two rules disagree. */
export function integrate(f: (x: number) => number, a: number, b: number, tol = 1e-10, depth = 0): number {
  if (a === b) return 0;
  const hi = rule(f, a, b, G20), lo = rule(f, a, b, G10);
  if (Math.abs(hi - lo) <= tol * Math.max(1, Math.abs(hi)) || depth >= 12) return hi;
  const m = (a + b) / 2;
  return integrate(f, a, m, tol, depth + 1) + integrate(f, m, b, tol, depth + 1);
}

/** A limit: a number, or a function of the outer variables. */
const limit = (lab: Lab, v: Value, what: string) => (v.k === 'fn' ? (...xs: number[]) => sc(lab.callFn(v, xs.map(num))[0], what) : ((c: number) => () => c)(sc(v, what)));

def('integral2', (a, _n, lab) => {
  if (a.length < 5 || a[0].k !== 'fn') throw new LabError('integral2 needs a function and four limits: integral2(@(x, y) x.*y, 0, 1, 0, 2).');
  const f = a[0], x0 = sc(a[1], 'xmin'), x1 = sc(a[2], 'xmax'), y0 = limit(lab, a[3], 'ymin'), y1 = limit(lab, a[4], 'ymax');
  const at = (x: number, y: number) => sc(lab.callFn(f, [num(x), num(y)])[0], 'The function’s value');
  return [num(integrate((x) => integrate((y) => at(x, y), y0(x), y1(x), 1e-9), x0, x1, 1e-9))];
});
def('integral3', (a, _n, lab) => {
  if (a.length < 7 || a[0].k !== 'fn') throw new LabError('integral3 needs a function and six limits: integral3(@(x, y, z) x.*y.*z, 0, 1, 0, 1, 0, 1).');
  const f = a[0], x0 = sc(a[1], 'xmin'), x1 = sc(a[2], 'xmax'), y0 = limit(lab, a[3], 'ymin'), y1 = limit(lab, a[4], 'ymax'), z0 = limit(lab, a[5], 'zmin'), z1 = limit(lab, a[6], 'zmax');
  const at = (x: number, y: number, z: number) => sc(lab.callFn(f, [num(x), num(y), num(z)])[0], 'The function’s value');
  return [num(integrate((x) => integrate((y) => integrate((z) => at(x, y, z), z0(x, y), z1(x, y), 1e-7), y0(x), y1(x), 1e-7), x0, x1, 1e-7))];
});

// ——— pdepe ———
// c(x,t,u,uₓ)·∂u/∂t = x⁻ᵐ ∂/∂x (xᵐ f(x,t,u,uₓ)) + s(x,t,u,uₓ), m = 0 slab, 1 cylinder, 2 sphere; each end p + q·f = 0.
// Finite volumes around each mesh point (the flux at the midpoints from the two neighbours), an end whose q is 0 held
// at the value p = 0 asks for (an algebraic condition kept by a fast relaxation the stiff solver takes in its stride).
def('pdepe', (a, _n, lab) => {
  if (a.length < 6 || [1, 2, 3].some((i) => a[i].k !== 'fn')) throw new LabError('pdepe needs m, the equation, the start, the ends, xmesh and tspan: sol = pdepe(0, @pde, @ic, @bc, x, t).');
  const m = sc(a[0], 'm');
  if (![0, 1, 2].includes(m)) throw new LabError('m must be 0 (slab), 1 (cylinder) or 2 (sphere).');
  const xs = [...toMat(a[4], 'xmesh').d], ts = [...toMat(a[5], 'tspan').d], N = xs.length;
  if (N < 3) throw new LabError('xmesh needs at least 3 points.');
  if (ts.length < 2) throw new LabError('tspan needs at least 2 times.');
  for (let i = 1; i < N; i++) if (!(xs[i] > xs[i - 1])) throw new LabError('xmesh must increase.');
  const col = (v: number[]) => mat(v.length, 1, v);
  const ic = (x: number) => [...toMat(lab.callFn(a[2], [num(x)])[0], 'The start').d];
  const nc = ic(xs[0]).length;
  const pde = (x: number, t: number, u: number[], ux: number[]) => {
    const o = lab.callFn(a[1], [num(x), num(t), col(u), col(ux)], 3);
    return { c: [...toMat(o[0], 'c').d], f: [...toMat(o[1], 'f').d], s: [...toMat(o[2], 's').d] };
  };
  const bc = (ul: number[], ur: number[], t: number) => {
    const o = lab.callFn(a[3], [num(xs[0]), col(ul), num(xs[N - 1]), col(ur), num(t)], 4);
    return { pl: [...toMat(o[0], 'pl').d], ql: [...toMat(o[1], 'ql').d], pr: [...toMat(o[2], 'pr').d], qr: [...toMat(o[3], 'qr').d] };
  };
  const w = (x: number) => x ** m;
  // Each point's share of the slab, cylinder or sphere: ∫ xᵐ dx over its volume.
  const vol = xs.map((_, i) => {
    const lo = i ? (xs[i - 1] + xs[i]) / 2 : xs[0], hi = i < N - 1 ? (xs[i] + xs[i + 1]) / 2 : xs[N - 1];
    return (hi ** (m + 1) - lo ** (m + 1)) / (m + 1);
  });
  const U = (y: number[], i: number) => y.slice(i * nc, i * nc + nc);
  const RELAX = 1e-6;
  const rhs = (t: number, y: number[]) => {
    const out = new Array<number>(N * nc).fill(0), flux: number[][] = [];
    for (let i = 0; i < N - 1; i++) {
      const ul = U(y, i), ur = U(y, i + 1), dx = xs[i + 1] - xs[i], xm = (xs[i] + xs[i + 1]) / 2;
      flux.push(pde(xm, t, ul.map((v, k) => (v + ur[k]) / 2), ul.map((v, k) => (ur[k] - v) / dx)).f);
    }
    const b = bc(U(y, 0), U(y, N - 1), t);
    for (let i = 0; i < N; i++) {
      const u = U(y, i), ux = u.map((_, k) => (i === 0 ? U(y, 1)[k] - u[k] : i === N - 1 ? u[k] - U(y, N - 2)[k] : U(y, i + 1)[k] - U(y, i - 1)[k]) / (i === 0 ? xs[1] - xs[0] : i === N - 1 ? xs[N - 1] - xs[N - 2] : xs[i + 1] - xs[i - 1]));
      const { c, s } = pde(xs[i], t, u, ux);
      for (let k = 0; k < nc; k++) {
        const at = i * nc + k;
        if (i === 0 && b.ql[k] === 0) { out[at] = -b.pl[k] / RELAX; continue; }
        if (i === N - 1 && b.qr[k] === 0) { out[at] = -b.pr[k] / RELAX; continue; }
        if (!(c[k] > 0)) throw new LabError('Each equation needs c > 0 here (time-dependent): an equation with c = 0 isn’t supported yet.');
        const right = i < N - 1 ? w((xs[i] + xs[i + 1]) / 2) * flux[i][k] : w(xs[N - 1]) * (-b.pr[k] / b.qr[k]);
        const left = i > 0 ? w((xs[i - 1] + xs[i]) / 2) * flux[i - 1][k] : w(xs[0]) * (-b.pl[k] / b.ql[k]);
        out[at] = (right - left + s[k] * vol[i]) / (c[k] * vol[i]);
      }
    }
    return out;
  };
  const y0 = xs.flatMap(ic);
  const o = ros23(rhs, ts[0], ts[ts.length - 1], y0, 1e-5, 1e-8);
  const at = sample(o, ts);
  // sol(i, j, k): time i, point j, component k (one component: a times × points matrix).
  const out = mat(ts.length, N);
  if (nc > 1) { out.p = nc; out.d = new Float64Array(ts.length * N * nc); }
  at.forEach((y, i) => { for (let j = 0; j < N; j++) for (let k = 0; k < nc; k++) out.d[i + j * ts.length + k * ts.length * N] = y[j * nc + k]; });
  return [out];
});
