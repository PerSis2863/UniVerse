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
/** A line or transformer between buses (per unit). `tap` (M435): a transformer's off-nominal ratio on the `from` side
 * (1 = none). `x0`, `r0`: its zero-sequence impedance for unbalanced faults (3 × x and r unless given). */
export interface Line { from: number; to: number; r: number; x: number; b: number; tap?: number; x0?: number; r0?: number }

/** The bus admittance matrix (π model: half the line charging at each end). */
export function ybus(n: number, lines: Line[]): C[][] {
  const Y: C[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => [0, 0] as C));
  for (const l of lines) {
    // With a tap t on the from side: Y_ff = y/t², Y_ft = Y_tf = −y/t, Y_tt = y (and half the charging at each end).
    const y = cdiv([1, 0], [l.r, l.x]), sh: C = [0, l.b / 2], i = l.from, j = l.to, t = l.tap || 1;
    Y[i][i] = cadd(cadd(Y[i][i], [y[0] / (t * t), y[1] / (t * t)]), sh); Y[j][j] = cadd(cadd(Y[j][j], y), sh);
    Y[i][j] = csub(Y[i][j], [y[0] / t, y[1] / t]); Y[j][i] = csub(Y[j][i], [y[0] / t, y[1] / t]);
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
    const t = l.tap || 1, vi = polar(V[l.from], th[l.from]), vj = polar(V[l.to], th[l.to]), y = cdiv([1, 0], [l.r, l.x]);
    // The tapped π model: the from end sees vi/t through the series admittance.
    const vit: C = [vi[0] / t, vi[1] / t];
    const iij = cadd(cmul(csub(vit, vj), [y[0] / t, y[1] / t]), cmul(vi, [0, l.b / 2])), iji = cadd(cmul(csub(vj, vit), y), cmul(vj, [0, l.b / 2]));
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

// ——— Unbalanced faults (M435) ———
/** One sequence network's bus impedance matrix: lines (zero sequence: r0, x0, or 3 × r and x; transformers' zero
 * sequence is taken as passing, an assumption), and each source's reactance to ground in that sequence. */
function zbusSeq(n: number, lines: Line[], shunts: { bus: number; x: number }[], zero: boolean) {
  const Y = ybus(n, lines.map((l) => (zero ? { ...l, r: l.r0 ?? 3 * l.r, x: l.x0 ?? 3 * l.x, tap: 1 } : { ...l, tap: 1 })));
  for (const s of shunts) if (Number.isFinite(s.x) && s.x > 0) Y[s.bus][s.bus] = cadd(Y[s.bus][s.bus], cdiv([1, 0], [0, s.x]));
  return cinv(Y);
}
export type FaultKind = '3P' | 'LG' | 'LL' | 'LLG';
export interface Source { bus: number; x1: number; x2?: number; x0?: number }
const A: C = [-0.5, Math.sqrt(3) / 2], A2: C = [-0.5, -Math.sqrt(3) / 2];
/** A fault at bus k by symmetrical components: three-phase, line to ground (phase a), line to line (b–c) or double
 * line to ground (b–c–ground), through a fault impedance zf; the sequence and phase currents at the fault and every
 * bus's three phase voltages during it (pre-fault 1 pu). An ungrounded source has x0 = Infinity. */
export function unbalancedFault(n: number, lines: Line[], sources: Source[], k: number, kind: FaultKind, zf: C = [0, 0]) {
  const Z1 = zbusSeq(n, lines, sources.map((s) => ({ bus: s.bus, x: s.x1 })), false);
  const Z2 = zbusSeq(n, lines, sources.map((s) => ({ bus: s.bus, x: s.x2 ?? s.x1 })), false);
  let Z0: C[][] | null = null;
  try { Z0 = zbusSeq(n, lines, sources.map((s) => ({ bus: s.bus, x: s.x0 ?? s.x1 })), true); } catch { Z0 = null; }
  const z1 = Z1[k][k], z2 = Z2[k][k], z0: C = Z0 ? Z0[k][k] : [Infinity, 0], vf: C = [1, 0], zf3: C = [3 * zf[0], 3 * zf[1]];
  let i1: C, i2: C = [0, 0], i0: C = [0, 0];
  if (kind === '3P') i1 = cdiv(vf, cadd(z1, zf));
  else if (kind === 'LG') {
    if (!Z0) throw new Error('A line-to-ground fault needs a grounded source (a zero-sequence path); none is grounded.');
    i1 = cdiv(vf, cadd(cadd(z1, z2), cadd(z0, zf3))); i2 = i1; i0 = i1;
  } else if (kind === 'LL') { i1 = cdiv(vf, cadd(cadd(z1, z2), zf)); i2 = [-i1[0], -i1[1]]; }
  else {
    // Double line to ground: Z2 in parallel with Z0 + 3Zf.
    const z0f = Z0 ? cadd(z0, zf3) : null;
    if (!z0f) { i1 = cdiv(vf, cadd(z1, z2)); i2 = [-i1[0], -i1[1]]; }
    else {
      const par = cdiv(cmul(z2, z0f), cadd(z2, z0f));
      i1 = cdiv(vf, cadd(z1, par));
      i2 = cmul([-i1[0], -i1[1]], cdiv(z0f, cadd(z2, z0f)));
      i0 = cmul([-i1[0], -i1[1]], cdiv(z2, cadd(z2, z0f)));
    }
  }
  const phases = (x0: C, x1: C, x2: C): [C, C, C] => [cadd(cadd(x0, x1), x2), cadd(cadd(x0, cmul(A2, x1)), cmul(A, x2)), cadd(cadd(x0, cmul(A, x1)), cmul(A2, x2))];
  const [ia, ib, ic] = phases(i0, i1, i2);
  const voltages = Array.from({ length: n }, (_, i) => {
    const v1 = csub([1, 0], cmul(Z1[i][k], i1)), v2: C = [-cmul(Z2[i][k], i2)[0], -cmul(Z2[i][k], i2)[1]], v0: C = Z0 ? [-cmul(Z0[i][k], i0)[0], -cmul(Z0[i][k], i0)[1]] : [0, 0];
    return phases(v0, v1, v2).map((v) => Math.hypot(...v)) as [number, number, number];
  });
  return { seq: [i0, i1, i2].map((c) => Math.hypot(...c)) as [number, number, number], phase: [ia, ib, ic].map((c) => Math.hypot(...c)) as [number, number, number], voltages, z: [z0, z1, z2] };
}

/** A load flow with on-load tap changers: each named transformer (a line index) moves its tap in steps (5/8 % by
 * default, within ±10 %) until the bus it watches is within half a step of its target voltage. */
export function loadFlowTaps(buses: Bus[], lines: Line[], control: { line: number; bus: number; target: number }[], step = 0.00625, range = 0.1) {
  const ls = lines.map((l) => ({ ...l, tap: l.tap || 1 }));
  let r = loadFlow(buses, ls);
  // Which way each tap moves its bus: found by trying one step (a bus beyond the far side falls as the tap rises; one
  // on the near side rises).
  const way = control.map((c) => {
    const l = ls[c.line], keep = l.tap;
    l.tap = keep + step;
    const up = loadFlow(buses, ls);
    l.tap = keep;
    return Math.sign(up.V[c.bus] - r.V[c.bus]) || -1;
  });
  for (let round = 0; round < 40; round++) {
    let moved = false;
    control.forEach((c, i) => {
      const err = r.V[c.bus] - c.target;
      if (Math.abs(err) <= step / 2) return;
      const l = ls[c.line], next = Math.max(1 - range, Math.min(1 + range, l.tap - way[i] * Math.sign(err) * step));
      if (Math.abs(next - l.tap) > 1e-12) { l.tap = Math.round(next / step) * step; moved = true; }
    });
    if (!moved) break;
    r = loadFlow(buses, ls);
  }
  return { ...r, taps: ls.map((l) => l.tap) };
}

