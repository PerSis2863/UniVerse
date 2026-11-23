// Hyperion's power systems and mixed-signal (M426, the owner's list: "Power systems", "Mixed-signal"): load flow by
// Newton–Raphson (bus voltages and angles, line flows and losses, in per unit), a three-phase short circuit from the
// bus impedance matrix, an ADC and DAC with their quantisation noise, and a phase-locked loop. Our own code from the
// textbook methods.

type C = [number, number];
const cadd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]], csub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a: C, b: C): C => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const conj = (a: C): C => [a[0], -a[1]];
const polar = (m: number, t: number): C => [m * Math.cos(t), m * Math.sin(t)];

export type BusType = 'PQ' | 'PV' | 'slack';
export interface Bus { type: BusType; P: number; Q: number; V: number; angle: number }
export interface Line { from: number; to: number; r: number; x: number; b: number }

/** The bus admittance matrix (π model: half the line charging at each end). */
export function ybus(n: number, lines: Line[]): C[][] {
  const Y: C[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => [0, 0] as C));
  for (const l of lines) {
    const y = cdiv([1, 0], [l.r, l.x]), sh: C = [0, l.b / 2], i = l.from, j = l.to;
    Y[i][i] = cadd(cadd(Y[i][i], y), sh); Y[j][j] = cadd(cadd(Y[j][j], y), sh);
    Y[i][j] = csub(Y[i][j], y); Y[j][i] = csub(Y[j][i], y);
  }
  return Y;
}
function solveReal(A: number[][], b: number[]) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) throw new Error('The load flow is singular: an island of buses with no slack bus, or a line with no impedance.');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let k = i + 1; k < n; k++) s -= M[i][k] * x[k]; x[i] = s / M[i][i]; }
  return x;
}
/** Newton–Raphson load flow in polar form. P and Q are injections (generation − load), per unit; angles in radians. */
export function loadFlow(buses: Bus[], lines: Line[], tol = 1e-10, maxIter = 30) {
  const n = buses.length, Y = ybus(n, lines);
  if (buses.filter((b) => b.type === 'slack').length !== 1) throw new Error('A load flow needs exactly one slack bus (it holds the voltage and makes up the losses).');
  const V = buses.map((b) => (b.type === 'PQ' ? 1 : b.V)), th = buses.map((b) => (b.type === 'slack' ? b.angle : 0));
  const ang = buses.flatMap((b, i) => (b.type === 'slack' ? [] : [i])), mag = buses.flatMap((b, i) => (b.type === 'PQ' ? [i] : []));
  const inj = () => buses.map((_, i) => { let s: C = [0, 0]; for (let k = 0; k < n; k++) s = cadd(s, cmul(Y[i][k], polar(V[k], th[k]))); return cmul(polar(V[i], th[i]), conj(s)); });
  let it = 0, err = Infinity;
  for (; it < maxIter; it++) {
    const S = inj(), mis = [...ang.map((i) => buses[i].P - S[i][0]), ...mag.map((i) => buses[i].Q - S[i][1])];
    err = Math.max(0, ...mis.map(Math.abs));
    if (err < tol) break;
    // The Jacobian by its analytic entries: ∂P/∂θ, ∂P/∂V, ∂Q/∂θ, ∂Q/∂V.
    const G = (i: number, k: number) => Y[i][k][0], B = (i: number, k: number) => Y[i][k][1];
    const dPdT = (i: number, k: number) => (i === k ? -S[i][1] - B(i, i) * V[i] ** 2 : V[i] * V[k] * (G(i, k) * Math.sin(th[i] - th[k]) - B(i, k) * Math.cos(th[i] - th[k])));
    const dPdV = (i: number, k: number) => (i === k ? S[i][0] / V[i] + G(i, i) * V[i] : V[i] * (G(i, k) * Math.cos(th[i] - th[k]) + B(i, k) * Math.sin(th[i] - th[k])));
    const dQdT = (i: number, k: number) => (i === k ? S[i][0] - G(i, i) * V[i] ** 2 : -V[i] * V[k] * (G(i, k) * Math.cos(th[i] - th[k]) + B(i, k) * Math.sin(th[i] - th[k])));
    const dQdV = (i: number, k: number) => (i === k ? S[i][1] / V[i] - B(i, i) * V[i] : V[i] * (G(i, k) * Math.sin(th[i] - th[k]) - B(i, k) * Math.cos(th[i] - th[k])));
    const J = [...ang.map((i) => [...ang.map((k) => dPdT(i, k)), ...mag.map((k) => dPdV(i, k))]), ...mag.map((i) => [...ang.map((k) => dQdT(i, k)), ...mag.map((k) => dQdV(i, k))])];
    const dx = solveReal(J, mis);
    ang.forEach((i, q) => { th[i] += dx[q]; });
    mag.forEach((i, q) => { V[i] += dx[ang.length + q]; });
  }
  const S = inj(), flows = lines.map((l) => {
    const vi = polar(V[l.from], th[l.from]), vj = polar(V[l.to], th[l.to]), y = cdiv([1, 0], [l.r, l.x]);
    const iij = cadd(cmul(csub(vi, vj), y), cmul(vi, [0, l.b / 2])), iji = cadd(cmul(csub(vj, vi), y), cmul(vj, [0, l.b / 2]));
    const sij = cmul(vi, conj(iij)), sji = cmul(vj, conj(iji));
    return { from: l.from, to: l.to, P: sij[0], Q: sij[1], lossP: sij[0] + sji[0] };
  });
  return { V, angle: th, P: S.map((s) => s[0]), Q: S.map((s) => s[1]), flows, losses: flows.reduce((s, f) => s + f.lossP, 0), iterations: it, converged: err < tol };
}
/** Inverts a complex matrix (Gauss–Jordan). */
function cinv(A: C[][]): C[][] {
  const n = A.length, M = A.map((r, i) => [...r.map((v) => [...v] as C), ...Array.from({ length: n }, (_, j) => [i === j ? 1 : 0, 0] as C)]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.hypot(...M[r][c]) > Math.hypot(...M[p][c])) p = r;
    if (Math.hypot(...M[p][c]) < 1e-14) throw new Error('The network has a bus with no path to a source: no fault current can be found.');
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    M[c] = M[c].map((v) => cdiv(v, d));
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; M[r] = M[r].map((v, k) => csub(v, cmul(f, M[c][k]))); }
  }
  return M.map((r) => r.slice(n));
}
/** A bolted three-phase fault at bus k: sources' reactances to ground added to Ybus, Zbus = Ybus⁻¹, I = V/Z_kk, every
 * bus's voltage during the fault (pre-fault voltages 1 pu unless given). */
export function threePhaseFault(n: number, lines: Line[], sources: { bus: number; x: number }[], k: number, pre?: number[]) {
  const Y = ybus(n, lines);
  for (const s of sources) Y[s.bus][s.bus] = cadd(Y[s.bus][s.bus], cdiv([1, 0], [0, s.x]));
  const Z = cinv(Y), v = pre ?? new Array(n).fill(1), If = cdiv([v[k], 0], Z[k][k]);
  return { current: Math.hypot(...If), zkk: Z[k][k], voltages: v.map((vi, i) => Math.hypot(...csub([vi, 0], cmul(Z[i][k], If)))) };
}

// ——— Mixed-signal ———
/** An N-bit converter over [lo, hi]: each sample's code (0 … 2ᴺ − 1, mid-tread) and the value it stands for. */
export function adc(x: number[], bits: number, lo = -1, hi = 1) {
  const levels = 2 ** bits, step = (hi - lo) / levels;
  const codes = x.map((v) => Math.min(levels - 1, Math.max(0, Math.floor((v - lo) / step))));
  return { codes, values: codes.map((c) => lo + (c + 0.5) * step), step };
}
export const dac = (codes: number[], bits: number, lo = -1, hi = 1) => { const step = (hi - lo) / 2 ** bits; return codes.map((c) => lo + (c + 0.5) * step); };
/** Signal-to-noise ratio (dB) of x against its error y − x. */
export const snrOf = (x: number[], y: number[]) => 10 * Math.log10(x.reduce((s, v) => s + v * v, 0) / y.reduce((s, v, i) => s + (v - x[i]) ** 2, 0));
/** A second-order (type II) phase-locked loop following an input frequency: a phase detector, a PI loop filter set by
 * the natural frequency and damping, and an oscillator. Its frequency and phase error, every sample. */
export function pll(fin: (t: number) => number, fs: number, n: number, o: { f0?: number; bandwidth?: number; damping?: number } = {}) {
  const f0 = o.f0 ?? fin(0), wn = 2 * Math.PI * (o.bandwidth ?? 50), z = o.damping ?? 0.707, dt = 1 / fs;
  // For an ideal detector giving sin(Δφ): Kp = 2ζωn, Ki = ωn² (rad/s per rad).
  const kp = 2 * z * wn, ki = wn * wn;
  let phIn = 0, phOut = 0, integ = 0;
  const freq: number[] = [], err: number[] = [];
  for (let k = 0; k < n; k++) {
    const e = Math.sin(phIn - phOut);
    integ += ki * e * dt;
    const w = 2 * Math.PI * f0 + kp * e + integ;
    freq.push(w / (2 * Math.PI)); err.push(e);
    phIn += 2 * Math.PI * fin(k * dt) * dt; phOut += w * dt;
  }
  return { freq, err };
}
