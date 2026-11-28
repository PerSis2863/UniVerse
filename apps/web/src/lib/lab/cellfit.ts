// Hyperion's battery systems (M570, the owner: MathWorks' battery-systems page): a cell as an equivalent circuit with
// one to three RC pairs whose values change with the state of charge (lookup tables, as a characterised cell is
// described), the hybrid pulse power characterisation test (HPPC) that measures it, and the fit that reads the tables
// back from a test's time, current and voltage. Written fresh.
//
// The fit (MathWorks' fitECM fits the relaxation, or load and relaxation): here each level's whole stretch, from its
// discharge pulse to the next level's, through the 10% discharge and the long rest, so slow pairs are seen. For given
// time constants the resistances are linear least squares (variable projection); τ is searched on a log grid, then
// refined by golden-section steps one at a time.

export interface EcmCell {
  capacity: number; // Ah
  soc: number[]; // the table's states of charge, rising (0–1)
  ocv: number[]; // V at each
  r0: number[]; // Ω at each
  r: number[][]; // r[i][k]: pair i's resistance (Ω) at soc[k]
  tau: number[][]; // tau[i][k]: pair i's time constant (s)
}

/** A table read at z, straight lines between its points, held flat past its ends. */
export function lookup(xs: number[], ys: number[], z: number) {
  if (z <= xs[0]) return ys[0];
  const n = xs.length;
  if (z >= xs[n - 1]) return ys[n - 1];
  let k = 1;
  while (xs[k] < z) k++;
  return ys[k - 1] + ((ys[k] - ys[k - 1]) * (z - xs[k - 1])) / (xs[k] - xs[k - 1]);
}

/** A 5 Ah NMC cell with two RC pairs, its values rising towards empty, as cells' do. */
export function sampleEcm(pairs = 2): EcmCell {
  const soc = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  const ocv = [3.0, 3.45, 3.55, 3.62, 3.67, 3.72, 3.78, 3.85, 3.93, 4.03, 4.2];
  const grow = (z: number) => 1 + 0.8 * Math.exp(-z / 0.12);
  const r = [0.006, 0.01, 0.014].slice(0, pairs), tau = [12, 120, 900].slice(0, pairs);
  return {
    capacity: 5, soc, ocv, r0: soc.map((z) => 0.012 * grow(z)),
    r: r.map((ri) => soc.map((z) => ri * grow(z))), tau: tau.map((ti) => soc.map((z) => ti * (1 + 0.3 * (1 - z)))),
  };
}

/** The cell under a current (A, + discharging) every dt s: terminal voltage, state of charge, each pair's voltage. */
export function ecmSim(c: EcmCell, current: ArrayLike<number>, dt: number, soc0 = 1) {
  const n = c.r.length, vr = new Array(n).fill(0), v: number[] = [], soc: number[] = [];
  let z = soc0;
  for (let k = 0; k < current.length; k++) {
    const I = current[k];
    let drop = I * lookup(c.soc, c.r0, z);
    for (let i = 0; i < n; i++) drop += vr[i];
    v.push(lookup(c.soc, c.ocv, z) - drop); soc.push(z);
    for (let i = 0; i < n; i++) {
      const a = Math.exp(-dt / lookup(c.soc, c.tau[i], z));
      vr[i] = a * vr[i] + lookup(c.soc, c.r[i], z) * (1 - a) * I;
    }
    z = Math.max(0, Math.min(1, z - (I * dt) / (3600 * c.capacity)));
  }
  return { v, soc };
}

export interface HppcOptions { pulseC: number; chargeC: number; stepC: number; pulse: number; rest: number; longRest: number; step: number; dt: number }
export const HPPC: HppcOptions = { pulseC: 1, chargeC: 0.75, stepC: 1, pulse: 10, rest: 40, longRest: 3600, step: 0.1, dt: 1 };

/** An HPPC test's current (A, + discharging) for a cell of `capacity` Ah: at each level, a long rest, a discharge
 * pulse, a rest, a charge pulse, a rest, then a discharge of `step` of the capacity to the next level. */
export function hppcProfile(capacity: number, o: Partial<HppcOptions> = {}) {
  const p = { ...HPPC, ...o }, I: number[] = [], add = (amps: number, secs: number) => { for (let k = 0; k < Math.round(secs / p.dt); k++) I.push(amps); };
  const levels = Math.round(1 / p.step);
  for (let l = 0; l < levels; l++) {
    add(0, p.longRest);
    add(p.pulseC * capacity, p.pulse); add(0, p.rest);
    add(-p.chargeC * capacity, p.pulse); add(0, p.rest);
    add(p.stepC * capacity, (p.step * 3600) / p.stepC);
  }
  add(0, p.longRest);
  return I;
}

/** Each pair's voltage for 1 Ω under the current I (a first-order lag with time constant τ), from rest. */
function lagged(t: number[], I: number[], tau: number) {
  const out = new Array(t.length).fill(0);
  for (let k = 1; k < t.length; k++) { const a = Math.exp(-(t[k] - t[k - 1]) / tau); out[k] = a * out[k - 1] + (1 - a) * I[k - 1]; }
  return out;
}
/** For time constants τ, the resistances R ≥ 0 that best explain y ≈ Σ Rᵢ lagᵢ (least squares), and the squared error. */
function resist(t: number[], I: number[], y: number[], tau: number[]) {
  const B = tau.map((x) => lagged(t, I, x)), n = tau.length;
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => B[i].reduce((s, v, k) => s + v * B[j][k], 0) + (i === j ? 1e-12 : 0)));
  const b = B.map((bi) => bi.reduce((s, v, k) => s + v * y[k], 0));
  for (let c = 0; c < n; c++) for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let j = c; j < n; j++) A[r][j] -= f * A[c][j]; b[r] -= f * b[c]; }
  const R = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let v = b[r]; for (let j = r + 1; j < n; j++) v -= A[r][j] * R[j]; R[r] = v / A[r][r]; }
  let err = 0;
  for (let k = 0; k < t.length; k++) { let f = 0; for (let i = 0; i < n; i++) f += R[i] * B[i][k]; err += (y[k] - f) ** 2; }
  return { R, err: R.every((x) => x >= 0) && Number.isFinite(err) ? err : Infinity };
}
/** The time constants (rising) and resistances of n RC pairs carrying current I that leave the voltage y (V) across
 * them; τ on a log grid, then refined by golden-section steps one at a time. */
export function rcFit(t: number[], I: number[], y: number[], n: number) {
  const span = Math.max(t[t.length - 1] - t[0], 1), lo = Math.log(Math.max(t[1] - t[0], 1e-3)), hi = Math.log(span);
  const grid = Array.from({ length: 24 }, (_, i) => Math.exp(lo + ((hi - lo) * i) / 23));
  let best = { tau: grid.slice(0, n), err: Infinity };
  const search = (from: number, chosen: number[]) => {
    if (chosen.length === n) { const r = resist(t, I, y, chosen); if (r.err < best.err) best = { tau: [...chosen], err: r.err }; return; }
    for (let i = from; i < grid.length; i++) search(i + 2, [...chosen, grid[i]]);
  };
  search(0, []);
  let tau = best.tau;
  for (let sweep = 0; sweep < 5; sweep++) for (let i = 0; i < n; i++) {
    let a = Math.log(tau[i]) - 0.5, b = Math.log(tau[i]) + 0.5;
    const f = (u: number) => { const tt = [...tau]; tt[i] = Math.exp(u); return resist(t, I, y, tt).err; }, g = (Math.sqrt(5) - 1) / 2;
    for (let k = 0; k < 24; k++) { const c = b - g * (b - a), d = a + g * (b - a); if (f(c) < f(d)) b = d; else a = c; }
    tau = [...tau]; tau[i] = Math.exp((a + b) / 2);
  }
  const order = tau.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]).map(([, i]) => i), r = resist(t, I, y, tau);
  return { tau: order.map((i) => tau[i]), r: order.map((i) => r.R[i]), rms: Math.sqrt(r.err / t.length) };
}

export interface HppcFit { cell: EcmCell; rms: number; pulses: number }

/** Reads an HPPC test (time s, current A + discharging, voltage V) back into an EcmCell with `pairs` RC pairs. OCV
 * from the voltage at the end of each long rest, R0 from the jump when each discharge pulse starts, and the pairs
 * from the whole stretch from that pulse to the next level's (its load and relaxation) with R0 and OCV taken off. */
export function hppcFit(time: number[], current: number[], voltage: number[], capacity: number, pairs = 2): HppcFit {
  if (time.length !== current.length || time.length !== voltage.length) throw new Error('Time, current and voltage need the same length.');
  if (!(pairs >= 1 && pairs <= 3)) throw new Error('One to three RC pairs.');
  const N = time.length, still = (k: number) => Math.abs(current[k]) < 1e-6 * capacity + 1e-9;
  const soc = [1];
  for (let k = 1; k < N; k++) soc.push(soc[k - 1] - (current[k - 1] * (time[k] - time[k - 1])) / (3600 * capacity));
  // The discharge pulses: after a rest, short (≤ 2 min), with a rest after.
  const starts: { k: number; I: number; r0: number }[] = [];
  for (let k = 1; k < N; k++) {
    if (!(current[k] > 0 && still(k - 1))) continue;
    let e = k;
    while (e < N && Math.abs(current[e] - current[k]) < 1e-9 * Math.max(1, current[k])) e++;
    if (e < N && still(e) && time[e] - time[k] <= 120) starts.push({ k, I: current[k], r0: (voltage[k - 1] - voltage[k]) / current[k] });
    k = e;
  }
  if (starts.length < 2) throw new Error('Fewer than two discharge pulses with rests around them were found: is the current + while discharging?');
  // OCV(soc): the rested voltage before each pulse, and at the very end.
  const pts = starts.map((p) => [soc[p.k - 1], voltage[p.k - 1]] as [number, number]);
  if (still(N - 1) && soc[N - 1] < pts[pts.length - 1][0] - 0.02) pts.push([soc[N - 1], voltage[N - 1]]);
  pts.sort((p, q) => p[0] - q[0]);
  const ocvAt = (z: number) => lookup(pts.map((p) => p[0]), pts.map((p) => p[1]), z);
  const rows = starts.map((p, j) => {
    const end = j + 1 < starts.length ? starts[j + 1].k - 1 : N;
    const t = time.slice(p.k, end), I = current.slice(p.k, end);
    const y = I.map((i, k) => ocvAt(soc[p.k + k]) - i * p.r0 - voltage[p.k + k]);
    const f = rcFit(t, I, y, pairs);
    return { z: soc[p.k - 1], ocv: voltage[p.k - 1], r0: p.r0, r: f.r, tau: f.tau, rms: f.rms };
  }).sort((p, q) => p.z - q.z);
  const ends = pts[0][0] < rows[0].z - 0.02 ? [{ ...rows[0], z: pts[0][0], ocv: pts[0][1] }] : [];
  const all = [...ends, ...rows];
  const cell: EcmCell = {
    capacity, soc: all.map((r) => r.z), ocv: all.map((r) => r.ocv), r0: all.map((r) => r.r0),
    r: Array.from({ length: pairs }, (_, i) => all.map((r) => r.r[i])), tau: Array.from({ length: pairs }, (_, i) => all.map((r) => r.tau[i])),
  };
  return { cell, rms: Math.sqrt(rows.reduce((s, r) => s + r.rms ** 2, 0) / rows.length), pulses: rows.length };
}
