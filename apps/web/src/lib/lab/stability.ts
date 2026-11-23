// Hyperion's grid stability (M436, the owner: "how a grid sways after a disturbance"): the swing equation of a
// generator against a strong grid (single machine, infinite bus) with the equal-area criterion for the critical
// clearing angle and time, and the classical multi-machine model: generators behind their transient reactances, loads
// as fixed impedances from the load flow, the network reduced to the generators' internal nodes (Kron) before, during
// and after a fault, rotor angles stepped by Runge–Kutta. Our own code from the textbook methods.

import { loadFlow, ybus, type Bus, type Line } from './grid';

type C = [number, number];
const cadd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]], csub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a: C, b: C): C => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const conj = (a: C): C => [a[0], -a[1]];

/** One machine against an infinite bus: (2H/ωs)·δ'' = Pm − Pmax·sin δ − D·ω. `during` and `after` are Pmax during the
 * fault and once it's cleared at `clear` seconds. Angles in radians, ω the speed deviation in per unit. */
export function swing(o: { H: number; Pm: number; Pmax: number; during: number; after: number; clear: number; D?: number; f?: number; T?: number; dt?: number }) {
  const ws = 2 * Math.PI * (o.f ?? 50), dt = o.dt ?? 1e-3, T = o.T ?? 3, D = o.D ?? 0;
  if (!(o.Pm < o.Pmax)) throw new Error('Before the fault the machine must be able to carry its load: Pm < Pmax.');
  const d0 = Math.asin(o.Pm / o.Pmax);
  const f = (t: number, d: number, w: number): [number, number] => {
    const pmax = t < o.clear ? o.during : o.after;
    return [ws * w, (o.Pm - pmax * Math.sin(d) - D * w) / (2 * o.H)];
  };
  const t: number[] = [], delta: number[] = [], omega: number[] = [];
  let d = d0, w = 0, stable = true;
  for (let k = 0; k * dt <= T + 1e-12; k++) {
    const tk = k * dt;
    t.push(tk); delta.push(d); omega.push(w);
    if (d > Math.PI) stable = false;
    // RK4, the fault's state taken at the step's start (a step lands on the clearing time when dt divides it).
    const k1 = f(tk, d, w), k2 = f(tk, d + (dt / 2) * k1[0], w + (dt / 2) * k1[1]), k3 = f(tk, d + (dt / 2) * k2[0], w + (dt / 2) * k2[1]), k4 = f(tk, d + dt * k3[0], w + dt * k3[1]);
    d += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); w += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  }
  return { t, delta, omega, stable, delta0: d0 };
}
/** The equal-area criterion's critical clearing angle (radians): the angle by which the fault must be cleared so the
 * area that slows the rotor after it can still match the area that sped it up. */
export function criticalAngle(Pm: number, Pmax: number, during: number, after: number) {
  const d0 = Math.asin(Pm / Pmax);
  if (!(Pm < after)) return NaN; // after the fault it can't carry its load at all
  const dmax = Math.PI - Math.asin(Pm / after), c = (Pm * (dmax - d0) + after * Math.cos(dmax) - during * Math.cos(d0)) / (after - during);
  return Math.abs(c) <= 1 ? Math.acos(c) : NaN;
}
/** The critical clearing time: the longest fault the machine survives (bisection on the simulation, to 1 ms). */
export function criticalTime(o: { H: number; Pm: number; Pmax: number; during: number; after: number; D?: number; f?: number }) {
  const ok = (tc: number) => swing({ ...o, clear: tc, T: Math.max(2, tc + 1.5), dt: 5e-4 }).stable;
  if (!ok(0)) return 0;
  let lo = 0, hi = 0.05;
  while (ok(hi) && hi < 10) { lo = hi; hi *= 2; }
  if (hi >= 10) return Infinity;
  while (hi - lo > 1e-3) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  return lo;
}

// ——— Many machines ———
export interface Gen { bus: number; H: number; xd: number; D?: number }
/** Kron reduction to the generators' internal nodes of a network with loads as admittances; `fault` adds a bolted
 * short at that bus, `drop` removes a line (by index). */
function reduced(n: number, lines: Line[], loads: C[], gens: Gen[], fault: number | null, drop: number | null) {
  const Y = ybus(n, lines.filter((_, i) => i !== drop));
  loads.forEach((y, i) => { Y[i][i] = cadd(Y[i][i], y); });
  gens.forEach((g) => { Y[g.bus][g.bus] = cadd(Y[g.bus][g.bus], cdiv([1, 0], [0, g.xd])); });
  if (fault !== null) Y[fault][fault] = cadd(Y[fault][fault], [1e7, 0]);
  // Y_red = Y_gg − Y_gn·Y_nn⁻¹·Y_ng, with Y_gg = y_i on the diagonal and Y_gn = −y_i at the gen's bus.
  const m = gens.length, inv = invert(Y), yg = gens.map((g) => cdiv([1, 0], [0, g.xd]));
  return Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => {
    const corr = cmul(cmul(yg[i], yg[j]), inv[gens[i].bus][gens[j].bus]);
    return csub(i === j ? yg[i] : [0, 0], corr);
  }));
}
function invert(A: C[][]): C[][] {
  const n = A.length, M = A.map((r, i) => [...r.map((v) => [...v] as C), ...Array.from({ length: n }, (_, j) => [i === j ? 1 : 0, 0] as C)]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.hypot(...M[r][c]) > Math.hypot(...M[p][c])) p = r;
    if (Math.hypot(...M[p][c]) < 1e-14) throw new Error('The network falls apart (a bus with no path to the rest).');
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    M[c] = M[c].map((v) => cdiv(v, d));
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f[0] || f[1]) M[r] = M[r].map((v, k) => csub(v, cmul(f, M[c][k]))); }
  }
  return M.map((r) => r.slice(n));
}
/** A fault at bus `fault` cleared after `clear` seconds (optionally tripping line `trip`): every generator's rotor angle
 * (degrees, against the centre of inertia) and speed, and whether they stay together (no angle beyond 180°). */
export function transient(buses: Bus[], lines: Line[], gens: Gen[], fault: number, clear: number, o: { trip?: number | null; T?: number; dt?: number; f?: number } = {}) {
  const lf = loadFlow(buses, lines);
  if (!lf.converged) throw new Error('The load flow before the fault didn’t converge.');
  const n = buses.length, ws = 2 * Math.PI * (o.f ?? 50), dt = o.dt ?? 1e-3, T = o.T ?? 3;
  const V: C[] = lf.V.map((v, i) => [v * Math.cos(lf.angle[i]), v * Math.sin(lf.angle[i])]);
  const genAt = new Set(gens.map((g) => g.bus));
  // Loads as admittances y = conj(S_load)/|V|² (a bus with a generator keeps only what's left after it).
  const loads: C[] = V.map((v, i) => { if (genAt.has(i) && lf.P[i] >= 0) return [0, 0]; const s: C = [-lf.P[i], -lf.Q[i]]; return cdiv(conj(s), [v[0] * v[0] + v[1] * v[1], 0]); });
  // Each generator's internal voltage E' = V + j·x'd·I, I = conj(S/V).
  const E = gens.map((g) => { const s: C = [lf.P[g.bus], lf.Q[g.bus]], I = conj(cdiv(s, V[g.bus])); return cadd(V[g.bus], cmul([0, g.xd], I)); });
  const Emag = E.map((e) => Math.hypot(...e)), d0 = E.map((e) => Math.atan2(e[1], e[0]));
  const pre = reduced(n, lines, loads, gens, null, null), dur = reduced(n, lines, loads, gens, fault, null), post = reduced(n, lines, loads, gens, null, o.trip ?? null);
  const Pe = (Y: C[][], d: number[]) => d.map((di, i) => d.reduce((s, dj, j) => s + Emag[i] * Emag[j] * (Y[i][j][0] * Math.cos(di - dj) + Y[i][j][1] * Math.sin(di - dj)), 0));
  const Pm = Pe(pre, d0), m = gens.length;
  const rhs = (t: number, d: number[], w: number[]) => {
    const pe = Pe(t < clear ? dur : post, d);
    return { dd: w.map((x) => ws * x), dw: gens.map((g, i) => (Pm[i] - pe[i] - (g.D ?? 0) * w[i]) / (2 * g.H)) };
  };
  let d = [...d0], w = new Array(m).fill(0), stable = true;
  const t: number[] = [], angles: number[][] = gens.map(() => []), speeds: number[][] = gens.map(() => []), Hs = gens.reduce((s, g) => s + g.H, 0);
  for (let k = 0; k * dt <= T + 1e-12; k++) {
    const tk = k * dt, coi = d.reduce((s, x, i) => s + gens[i].H * x, 0) / Hs;
    t.push(tk);
    d.forEach((x, i) => { angles[i].push(((x - coi) * 180) / Math.PI); speeds[i].push(w[i]); if (Math.abs(x - coi) > Math.PI) stable = false; });
    const add = (a: number[], b: number[], h: number) => a.map((x, i) => x + h * b[i]);
    const k1 = rhs(tk, d, w), k2 = rhs(tk, add(d, k1.dd, dt / 2), add(w, k1.dw, dt / 2)), k3 = rhs(tk, add(d, k2.dd, dt / 2), add(w, k2.dw, dt / 2)), k4 = rhs(tk, add(d, k3.dd, dt), add(w, k3.dw, dt));
    d = d.map((x, i) => x + (dt / 6) * (k1.dd[i] + 2 * k2.dd[i] + 2 * k3.dd[i] + k4.dd[i]));
    w = w.map((x, i) => x + (dt / 6) * (k1.dw[i] + 2 * k2.dw[i] + 2 * k3.dw[i] + k4.dw[i]));
  }
  return { t, angles, speeds, stable, E: Emag, Pm };
}
