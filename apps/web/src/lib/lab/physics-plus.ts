// Hyperion's physics, the left-outs of M497 (M515): magnetic fields of currents (Biot–Savart, exact for straight
// pieces of wire) and field lines in 3D; optics by ray-transfer (ABCD) matrices and Gaussian beams; special
// relativity (Lorentz transformations, velocity addition, a relativistic Boris push); quantum mechanics in one
// dimension (finite-difference eigenstates, the finite square well, tunnelling by transfer matrices); rigid bodies
// spinning freely (Euler's equations) and hard disks colliding in a box (event by event). SI unless said; quantum in
// eV, nm and electron masses. Pure: no language values here.
import { rk45, root } from './sci-num';

export const MU0 = 4e-7 * Math.PI, C_LIGHT = 299_792_458;
type V3 = [number, number, number];
const sub = (a: number[], b: number[]): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: number[]) => Math.sqrt(dot(a, a));

// ——— Magnetism of currents ———
/** B at P from current I along the polyline `wire` (points [x y z]): each straight piece exactly,
 * μ0I/(4πd)·(sinβ₂ − sinβ₁) around it. Zero on the wire itself. */
export function biotSavart(wire: number[][], I: number, P: number[]): V3 {
  const B: V3 = [0, 0, 0];
  for (let k = 0; k + 1 < wire.length; k++) {
    const A = wire[k], L = sub(wire[k + 1], A), len = norm(L);
    if (!len) continue;
    const u = L.map((x) => x / len), r = sub(A, P), sA = dot(r, u), sB = sA + len, dv = r.map((x, i) => x - sA * u[i]), d = norm(dv);
    if (d < 1e-12 * (1 + len)) continue;
    const mag = ((MU0 * I) / (4 * Math.PI * d)) * (sB / Math.hypot(sB, d) - sA / Math.hypot(sA, d)), dir = cross(u, dv.map((x) => -x / d));
    for (let i = 0; i < 3; i++) B[i] += mag * dir[i];
  }
  return B;
}
/** E at P from point charges given as [x y z q] (zero inside a core of radius `core`). */
export function coulomb3(charges: number[][], P: number[], core = 0): V3 {
  const E: V3 = [0, 0, 0];
  for (const c of charges) {
    const r = sub(P, c), d = norm(r);
    if (d <= core || !d) continue;
    const s = (8.9875517923e9 * c[3]) / d ** 3;
    for (let i = 0; i < 3; i++) E[i] += s * r[i];
  }
  return E;
}
/** A field line from `seed`: RK4 along the field's direction in steps of h, until `n` steps, it leaves the box,
 * comes near a stop point, or the field vanishes. Both ways when `both`. */
export function fieldLine(F: (p: number[]) => number[], seed: number[], h: number, n: number, box: number, stops: number[][] = [], both = true): number[][] {
  const dir = (p: number[], s: number) => { const f = F(p), m = norm(f); return m > 0 && Number.isFinite(m) ? f.map((x) => (s * x) / m) : null; };
  const go = (s: number) => {
    const out = [seed.slice()];
    let p = seed.slice();
    for (let k = 0; k < n; k++) {
      const k1 = dir(p, s); if (!k1) break;
      const k2 = dir(p.map((x, i) => x + (h / 2) * k1[i]), s); if (!k2) break;
      const k3 = dir(p.map((x, i) => x + (h / 2) * k2[i]), s); if (!k3) break;
      const k4 = dir(p.map((x, i) => x + h * k3[i]), s); if (!k4) break;
      p = p.map((x, i) => x + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
      out.push(p.slice());
      if (p.some((x) => Math.abs(x) > box) || stops.some((q) => norm(sub(p, q)) < h)) break;
      if (k > 10 && norm(sub(p, seed)) < h / 2) break; // a closed loop
    }
    return out;
  };
  return both ? [...go(-1).reverse(), ...go(1).slice(1)] : go(1);
}

// ——— Optics ———
export type Element = { kind: 'd' | 'f' | 's' | 'm'; a: number; n1?: number; n2?: number };
/** 'd 100; f 50; s 20 1 1.5; m -200': free space, a thin lens of focal length f, a spherical surface of radius R
 * from index n1 to n2 (R Inf: flat), a mirror of radius R (the path unfolded). */
export function parseOptics(text: string): Element[] {
  const out: Element[] = [];
  for (const part of text.split(/[;\n]/).map((s) => s.trim()).filter(Boolean)) {
    const [k, ...v] = part.split(/[\s,]+/), x = v.map((s) => (/^-?inf$/i.test(s) ? (s.startsWith('-') ? -Infinity : Infinity) : Number(s)));
    const kind = k.toLowerCase();
    if (kind === 'd' || kind === 'f' || kind === 'm') { if (x.length !== 1 || Number.isNaN(x[0])) throw new Error(`“${part}”: ${kind} takes one number.`); out.push({ kind, a: x[0] }); }
    else if (kind === 's') { if (x.length !== 3 || x.some(Number.isNaN) || !(x[1] > 0 && x[2] > 0)) throw new Error(`“${part}”: s takes the radius and the two indices.`); out.push({ kind, a: x[0], n1: x[1], n2: x[2] }); }
    else throw new Error(`“${part}”: an element is d (distance), f (thin lens), s (surface) or m (mirror).`);
  }
  if (!out.length) throw new Error('The system has no elements.');
  return out;
}
export type M2 = [number, number, number, number];
const mul = (p: M2, q: M2): M2 => [p[0] * q[0] + p[1] * q[2], p[0] * q[1] + p[1] * q[3], p[2] * q[0] + p[3] * q[2], p[2] * q[1] + p[3] * q[3]];
export const elementMatrix = (e: Element): M2 =>
  e.kind === 'd' ? [1, e.a, 0, 1] : e.kind === 'f' ? [1, 0, -1 / e.a, 1] : e.kind === 'm' ? [1, 0, -2 / e.a, 1] : [1, 0, (e.n1! - e.n2!) / (e.n2! * e.a), e.n1! / e.n2!];
/** The system's matrix [A B; C D] (rays as [height; angle]), its focal length −1/C, back and front focal distances
 * −A/C and −D/C. */
export function system(els: Element[]) {
  const M = els.reduce<M2>((acc, e) => mul(elementMatrix(e), acc), [1, 0, 0, 1]), [A, B, C, D] = M;
  return { M, efl: -1 / C, bfl: -A / C, ffl: -D / C, image: (so: number) => { const si = -(A * so + B) / (C * so + D); return { si, mag: A + si * C }; }, det: A * D - B * C, B };
}
/** Heights of rays (y0, θ0) at the start and after every element; z positions along the axis. */
export function traceRays(els: Element[], rays: [number, number][]) {
  const z = [0];
  els.forEach((e) => z.push(z[z.length - 1] + (e.kind === 'd' ? e.a : 0)));
  const ys = rays.map(([y, t]) => {
    let v: [number, number] = [y, t];
    const out = [y];
    for (const e of els) { const m = elementMatrix(e); v = [m[0] * v[0] + m[1] * v[1], m[2] * v[0] + m[3] * v[1]]; out.push(v[0]); }
    return out;
  });
  return { z, ys };
}
/** A Gaussian beam with its waist w0 at the start (wavelength λ, the same length unit): its radius along the system,
 * by q' = (Aq + B)/(Cq + D), sampled `per` times in each stretch of free space. */
export function gaussianBeam(els: Element[], w0: number, lambda: number, per = 100) {
  let q: [number, number] = [0, (Math.PI * w0 * w0) / lambda]; // re, im
  const z: number[] = [0], w: number[] = [w0], width = (qq: [number, number]) => { const d = qq[0] ** 2 + qq[1] ** 2, inv = -qq[1] / d; return Math.sqrt(-lambda / (Math.PI * inv)); };
  let zz = 0;
  for (const e of els) {
    if (e.kind === 'd') {
      for (let k = 1; k <= per; k++) { const s = (e.a * k) / per; z.push(zz + s); w.push(width([q[0] + s, q[1]])); }
      q = [q[0] + e.a, q[1]]; zz += e.a;
    } else {
      const [A, B, C, D] = elementMatrix(e), nr = [A * q[0] + B, A * q[1]], dr = [C * q[0] + D, C * q[1]], dd = dr[0] ** 2 + dr[1] ** 2;
      q = [(nr[0] * dr[0] + nr[1] * dr[1]) / dd, (nr[1] * dr[0] - nr[0] * dr[1]) / dd];
      z.push(zz); w.push(width(q));
    }
  }
  // The waist after the last element: q = z' + i zR' → it sits −Re q further on.
  return { z, w, waistAt: zz - q[0], waistRadius: Math.sqrt((lambda * q[1]) / Math.PI) };
}

// ——— Relativity ———
export const gammaOf = (beta: number) => 1 / Math.sqrt(1 - beta * beta);
export const lorentz = (beta: number, ct: number, x: number) => { const g = gammaOf(beta); return [g * (ct - beta * x), g * (x - beta * ct)]; };
export const addVelocity = (u: number, v: number, c = C_LIGHT) => (u + v) / (1 + (u * v) / (c * c));
/** The Boris push with u = γv (Vay's form of the rotation), so no speed ever reaches c. */
export function relativisticParticle(q: number, m: number, E: number[], B: number[], r0: number[], v0: number[], T: number, dt: number, c = C_LIGHT) {
  const steps = Math.round(T / dt), r = r0.slice(), g0 = 1 / Math.sqrt(1 - dot(v0, v0) / (c * c));
  if (!Number.isFinite(g0)) throw new Error('The starting speed must be below the speed of light.');
  let u = v0.map((x) => g0 * x);
  const qm = (q / m) * (dt / 2), out = [r.slice()], ts = [0], speed = [norm(v0)];
  for (let s = 1; s <= steps; s++) {
    const um = u.map((x, i) => x + qm * E[i]), gm = Math.sqrt(1 + dot(um, um) / (c * c)), t = B.map((b) => (qm * b) / gm), t2 = dot(t, t), sv = t.map((x) => (2 * x) / (1 + t2));
    const up = um.map((x, i) => x + cross(um, t)[i]), uplus = um.map((x, i) => x + cross(up, sv)[i]);
    u = uplus.map((x, i) => x + qm * E[i]);
    const g = Math.sqrt(1 + dot(u, u) / (c * c));
    for (let i = 0; i < 3; i++) r[i] += (dt * u[i]) / g;
    out.push(r.slice()); ts.push(s * dt); speed.push(norm(u) / g);
  }
  return { t: ts, r: out, speed };
}

// ——— Quantum mechanics in one dimension ———
/** ħ²/(2 m_e) in eV·nm². */
export const HB2M = 0.0380998212;
/** The lowest `count` eigenvalues and eigenvectors of the symmetric tridiagonal matrix (diag a, off-diagonal b), by
 * Sturm-sequence bisection and inverse iteration. */
export function tridiagEigen(a: number[], b: number[], count: number) {
  const n = a.length, below = (x: number) => { let c = 0, q = a[0] - x; if (q < 0) c++; for (let i = 1; i < n; i++) { q = a[i] - x - (b[i - 1] * b[i - 1]) / (q || 1e-300); if (q < 0) c++; } return c; };
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { const r = (i ? Math.abs(b[i - 1]) : 0) + (i < n - 1 ? Math.abs(b[i]) : 0); lo = Math.min(lo, a[i] - r); hi = Math.max(hi, a[i] + r); }
  const values: number[] = [], vectors: number[][] = [];
  for (let k = 0; k < Math.min(count, n); k++) {
    let l = lo, h = hi;
    for (let it = 0; it < 200 && h - l > 1e-14 * Math.max(1, Math.abs(l), Math.abs(h)); it++) { const m = (l + h) / 2; if (below(m) > k) h = m; else l = m; }
    const lam = (l + h) / 2;
    values.push(lam);
    // Inverse iteration with (T − λ'I), λ' a hair off λ.
    const shift = lam + 1e-10 * Math.max(1, Math.abs(lam)) * (k % 2 ? 1 : -1);
    let v = Array.from({ length: n }, (_, i) => 1 + 0.01 * Math.sin(i * 1.3 + k));
    for (let it = 0; it < 4; it++) {
      const c = new Array(n), d = v.slice();
      let den = a[0] - shift;
      c[0] = b[0] / den; d[0] /= den;
      for (let i = 1; i < n; i++) { den = a[i] - shift - b[i - 1] * c[i - 1]; c[i] = i < n - 1 ? b[i] / den : 0; d[i] = (d[i] - b[i - 1] * d[i - 1]) / den; }
      for (let i = n - 2; i >= 0; i--) d[i] -= c[i] * d[i + 1];
      const s = Math.sqrt(d.reduce((p, x) => p + x * x, 0));
      v = d.map((x) => x / s);
    }
    vectors.push(v);
  }
  return { values, vectors };
}
/** Bound states of −(ħ²/2m)ψ'' + Vψ = Eψ on an even grid x (nm; ψ = 0 just beyond its ends), V in eV, the mass in
 * electron masses: energies and wave functions normalised so ∫ψ² dx = 1, each starting positive. */
export function schrodinger(x: number[], V: number[], mass: number, count: number) {
  const dx = x[1] - x[0], t = HB2M / (mass * dx * dx), r = tridiagEigen(V.map((v) => v + 2 * t), new Array(x.length - 1).fill(-t), count);
  const psi = r.vectors.map((v) => { const s = 1 / Math.sqrt(dx), first = v.find((y) => Math.abs(y) > 1e-6) ?? 1; return v.map((y) => Math.sign(first) * y * s); });
  return { E: r.values, psi };
}
/** The finite square well: V = 0 for |x| < a/2, V0 outside. Its bound states from z tan z = √(z0² − z²) (even) and
 * −z cot z = √(z0² − z²) (odd), z = k a/2, z0 = (a/2)√(2mV0)/ħ. Energies in eV, lowest first. */
export function finiteWell(V0: number, a: number, mass: number) {
  const z0 = (a / 2) * Math.sqrt((mass * V0) / HB2M), E: number[] = [];
  for (let n = 0; n * (Math.PI / 2) < z0; n++) {
    const lo = n * (Math.PI / 2) + 1e-12, hi = Math.min((n + 1) * (Math.PI / 2) - 1e-12, z0);
    const g = n % 2 === 0 ? (z: number) => z * Math.tan(z) - Math.sqrt(Math.max(0, z0 * z0 - z * z)) : (z: number) => -z / Math.tan(z) - Math.sqrt(Math.max(0, z0 * z0 - z * z));
    if (hi > lo && g(lo) * g(hi) <= 0) { const z = root(g, lo, hi, 1e-14); E.push(((2 * z) / a) ** 2 * (HB2M / mass)); }
  }
  return E;
}
/** Transmission through a rectangular barrier V0 (eV) of width a (nm) at energy E, in closed form. */
export function barrier(E: number, V0: number, a: number, mass: number) {
  if (E <= 0) return 0;
  if (Math.abs(E - V0) < 1e-12 * Math.max(1, V0)) return 1 / (1 + (mass * a * a * V0) / (4 * HB2M));
  if (E < V0) { const k = Math.sqrt((mass * (V0 - E)) / HB2M) * a, s = Math.sinh(k); return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (V0 - E))); }
  const k = Math.sqrt((mass * (E - V0)) / HB2M) * a, s = Math.sin(k);
  return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (E - V0)));
}
type Cx = [number, number];
const cm = (p: Cx, q: Cx): Cx => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
const cd = (p: Cx, q: Cx): Cx => { const d = q[0] * q[0] + q[1] * q[1]; return [(p[0] * q[0] + p[1] * q[1]) / d, (p[1] * q[0] - p[0] * q[1]) / d]; };
const ca = (p: Cx, q: Cx): Cx => [p[0] + q[0], p[1] + q[1]];
const cexp = (p: Cx): Cx => { const e = Math.exp(p[0]); return [e * Math.cos(p[1]), e * Math.sin(p[1])]; };
/** Transmission through any potential, sampled V(x) (eV on a grid in nm, piecewise constant, the ends extended as
 * leads), by transfer matrices; works above and below the barriers. */
export function transmission(x: number[], V: number[], E: number, mass: number) {
  // Regions: the left lead, one per sample (boundaries half way between samples), the right lead.
  const bounds = x.slice(1).map((v, i) => (v + x[i]) / 2), pot = V.slice(), widths = bounds.slice(1).map((b, i) => b - bounds[i]);
  const kOf = (v: number): Cx => { let e = E - v; if (Math.abs(e) < 1e-12) e = 1e-12; const s = Math.sqrt((mass * Math.abs(e)) / HB2M); return e > 0 ? [s, 0] : [0, s]; };
  // Coefficients (A, B) of ψ = A e^{ik(x − x_j)} + B e^{−ik(x − x_j)}, x_j each region's left boundary. Start with the
  // outgoing wave in the right lead and walk left, matching ψ and ψ' at every boundary.
  let A: Cx = [1, 0], B: Cx = [0, 0];
  for (let j = pot.length - 1; j >= 1; j--) {
    const kR = kOf(pot[j]), kL = kOf(pot[j - 1]), len = j - 1 >= 1 ? widths[j - 2] : 0;
    // At the boundary: right side at local 0 gives ψ = A + B, ψ' = ik(A − B).
    const psi = ca(A, B), dpsi = cm(cm([0, 1], kR), ca(A, [-B[0], -B[1]]));
    // Left region at its local x = len: ψ = A' e^{ik len} + B' e^{−ik len}.
    const e = cexp(cm([0, 1], [kL[0] * len, kL[1] * len])), einv = cd([1, 0], e), ikL = cm([0, 1], kL), r = cd(dpsi, ikL);
    A = cm(cd(ca(psi, r), [2, 0]), einv);
    B = cm(cd(ca(psi, [-r[0], -r[1]]), [2, 0]), e);
  }
  const k0 = kOf(pot[0]), kN = kOf(pot[pot.length - 1]);
  if (!(k0[0] > 0 && kN[0] > 0)) return 0;
  return kN[0] / k0[0] / (A[0] * A[0] + A[1] * A[1]);
}

// ——— Rigid bodies and collisions ———
/** A body spinning freely with principal moments I: Euler's equations I₁ω₁' = (I₂ − I₃)ω₂ω₃ (and round), reported at
 * `at`; the energy and |L| are returned as checks. */
export function eulerSpin(I: number[], w0: number[], at: number[]) {
  const f = (_: number, w: number[]) => [((I[1] - I[2]) * w[1] * w[2]) / I[0], ((I[2] - I[0]) * w[2] * w[0]) / I[1], ((I[0] - I[1]) * w[0] * w[1]) / I[2]];
  const r = rk45(f, at[0], at[at.length - 1], w0, 1e-10, 1e-12, 500_000, { at });
  const energy = r.y.map((w) => 0.5 * w.reduce((s, x, i) => s + I[i] * x * x, 0)), L = r.y.map((w) => Math.hypot(...w.map((x, i) => I[i] * x)));
  return { t: r.t, w: r.y, energy, L };
}
/** One-dimensional collision with restitution e: the velocities after. */
export const collide1d = (m1: number, m2: number, u1: number, u2: number, e: number) => {
  const p = m1 * u1 + m2 * u2, M = m1 + m2;
  return [(p + m2 * e * (u2 - u1)) / M, (p + m1 * e * (u1 - u2)) / M];
};
/** Hard disks in the box [0, W] × [0, H], event by event (the next wall or pair contact found exactly, then
 * resolved along the line of centres with restitution e); positions at each frame time. */
export function disks(pos: number[][], vel: number[][], r: number[], m: number[], W: number, H: number, frames: number[], e = 1, maxEvents = 200_000) {
  const n = pos.length, p = pos.map((x) => x.slice()), v = vel.map((x) => x.slice());
  for (let i = 0; i < n; i++) {
    if (p[i][0] < r[i] - 1e-12 || p[i][0] > W - r[i] + 1e-12 || p[i][1] < r[i] - 1e-12 || p[i][1] > H - r[i] + 1e-12) throw new Error(`Disk ${i + 1} starts outside the box.`);
    for (let j = 0; j < i; j++) if (Math.hypot(p[i][0] - p[j][0], p[i][1] - p[j][1]) < r[i] + r[j] - 1e-12) throw new Error(`Disks ${j + 1} and ${i + 1} start overlapping.`);
  }
  const out: number[][][] = [], hits = { walls: 0, pairs: 0 };
  let t = 0, f = 0, events = 0;
  while (f < frames.length && frames[f] <= 0) { out.push(p.map((x) => x.slice())); f++; }
  const move = (dt: number) => { for (let i = 0; i < n; i++) { p[i][0] += v[i][0] * dt; p[i][1] += v[i][1] * dt; } t += dt; };
  while (f < frames.length) {
    let best = Infinity, kind = 0, a = -1, b = -1;
    for (let i = 0; i < n; i++) {
      for (const [ax, lim] of [[0, W], [1, H]] as const) {
        const vv = v[i][ax];
        const dt = vv > 0 ? (lim - r[i] - p[i][ax]) / vv : vv < 0 ? (r[i] - p[i][ax]) / vv : Infinity;
        if (dt >= -1e-12 && dt < best) { best = Math.max(0, dt); kind = 1; a = i; b = ax; }
      }
      for (let j = i + 1; j < n; j++) {
        const dx = p[j][0] - p[i][0], dy = p[j][1] - p[i][1], dvx = v[j][0] - v[i][0], dvy = v[j][1] - v[i][1], bb = dx * dvx + dy * dvy;
        if (bb >= 0) continue;
        const vv = dvx * dvx + dvy * dvy, s = r[i] + r[j], cc = dx * dx + dy * dy - s * s, disc = bb * bb - vv * cc;
        if (disc < 0) continue;
        const dt = (-bb - Math.sqrt(disc)) / vv;
        if (dt >= -1e-12 && dt < best) { best = Math.max(0, dt); kind = 2; a = i; b = j; }
      }
    }
    const at = t + best;
    while (f < frames.length && frames[f] <= at) { move(frames[f] - t); out.push(p.map((x) => x.slice())); f++; }
    if (f >= frames.length || !Number.isFinite(best)) { while (f < frames.length) { move(frames[f] - t); out.push(p.map((x) => x.slice())); f++; } break; }
    move(at - t);
    if (kind === 1) { v[a][b] = -v[a][b]; hits.walls++; }
    else {
      // Along the line of centres: J = −(1 + e)(Δv·n) / (1/mᵢ + 1/mⱼ).
      const dx = p[b][0] - p[a][0], dy = p[b][1] - p[a][1], d = Math.hypot(dx, dy), nx = dx / d, ny = dy / d;
      const rel = (v[b][0] - v[a][0]) * nx + (v[b][1] - v[a][1]) * ny, J = (-(1 + e) * rel) / (1 / m[a] + 1 / m[b]);
      v[a][0] -= (J / m[a]) * nx; v[a][1] -= (J / m[a]) * ny; v[b][0] += (J / m[b]) * nx; v[b][1] += (J / m[b]) * ny;
      hits.pairs++;
    }
    if (++events > maxEvents) throw new Error('Too many collisions (with restitution below 1 disks can collide endlessly): a shorter time or fewer disks.');
  }
  return { frames: out, hits, velocities: v };
}
