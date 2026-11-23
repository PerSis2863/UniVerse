// Hyperion Simulate → Circuits (M410, the owner's Ansys ask; Ansys has electronics too): a circuit simulator by
// modified nodal analysis, the method SPICE uses. Unknowns: every node's voltage (ground, node "0", is 0 V) and the
// current through every voltage source and inductor. Capacitors and inductors step in time by the trapezoidal rule
// (the first step by backward Euler, which damps a sudden start); diodes follow Shockley's law, solved by Newton's
// method with the voltage step limited each time (as SPICE does) so it never runs away.

export type Wave = 'dc' | 'sine' | 'square';
export type Part =
  | { id: string; kind: 'R'; a: string; b: string; value: number }
  | { id: string; kind: 'C'; a: string; b: string; value: number }
  | { id: string; kind: 'L'; a: string; b: string; value: number }
  /** A voltage source, + at a: dc `value` volts; sine: `value` volts peak at `freq` Hz; square: 0 to `value` volts. */
  | { id: string; kind: 'V'; a: string; b: string; value: number; wave: Wave; freq: number }
  /** A current source pushing `value` amps out at a (into the circuit), back in at b. */
  | { id: string; kind: 'I'; a: string; b: string; value: number }
  /** A diode, anode a, cathode b. */
  | { id: string; kind: 'D'; a: string; b: string }
  /** A switch driven by a PWM signal (a MOSFET with its gate driver, M424): on for `duty` of each period at `freq` Hz. */
  | { id: string; kind: 'S'; a: string; b: string; duty: number; freq: number }
  /** An n-channel MOSFET (M430): drain a, source b, gate g. It turns on above its threshold `vth` (volts); `k` (A/V²)
   * sets how hard (the on-resistance is about 1 / (k (Vgs − Vth))); `lambda` (1/V) lets the current rise a little
   * with Vds when saturated. A body diode runs from source to drain, as in every power MOSFET. */
  | { id: string; kind: 'M'; a: string; b: string; g: string; vth: number; k: number; lambda: number };

/** The square-law MOSFET: drain current and its slopes (gm = ∂I/∂Vgs, gds = ∂I/∂Vds) for Vds ≥ 0; for Vds < 0 the
 * drain and source swap roles (the device is symmetric). */
export function mosfet(vgs: number, vds: number, vth: number, k: number, lambda: number): { id: number; gm: number; gds: number } {
  if (vds < 0) {
    // With the ends swapped: Vgs' = Vgd = Vgs − Vds, Vds' = −Vds, and the current flows the other way.
    const r = mosfet(vgs - vds, -vds, vth, k, lambda);
    return { id: -r.id, gm: -r.gm, gds: r.gm + r.gds };
  }
  const vov = vgs - vth;
  if (vov <= 0) return { id: 0, gm: 0, gds: 0 };
  if (vds < vov) {
    // Triode: I = k (Vov Vds − Vds²/2)(1 + λVds).
    const f = 1 + lambda * vds, q = vov * vds - (vds * vds) / 2;
    return { id: k * q * f, gm: k * vds * f, gds: k * ((vov - vds) * f + q * lambda) };
  }
  // Saturated: I = k/2 Vov² (1 + λVds).
  return { id: (k / 2) * vov * vov * (1 + lambda * vds), gm: k * vov * (1 + lambda * vds), gds: (k / 2) * vov * vov * lambda };
}

const IS = 1e-14, VT = 0.025852, VCRIT = VT * Math.log(VT / (Math.SQRT2 * IS)), GMIN = 1e-12;
const diodeI = (v: number) => IS * (Math.exp(Math.min(v / VT, 80)) - 1);
/** The pn junctions in a circuit, as [anode, cathode]: each diode, and each MOSFET's body diode. */
const junctions = (parts: Part[]) => parts.flatMap((p): [string, string][] => (p.kind === 'D' ? [[p.a, p.b]] : p.kind === 'M' ? [[p.b, p.a]] : []));

/** A switch's resistance: 10 mΩ on, 10 MΩ off. */
export const RON = 0.01, ROFF = 1e7;
export const switchOn = (p: Extract<Part, { kind: 'S' }>, t: number) => ((t * p.freq) % 1 + 1) % 1 < p.duty;

export function sourceAt(p: Extract<Part, { kind: 'V' }>, t: number) {
  if (p.wave === 'sine') return p.value * Math.sin(2 * Math.PI * p.freq * t);
  if (p.wave === 'square') return (t * p.freq) % 1 < 0.5 ? p.value : 0;
  return p.value;
}

/** Solves A x = b in place (Gaussian elimination, partial pivoting); null when singular. */
export function solveDense(A: Float64Array[], b: Float64Array): Float64Array | null {
  const n = b.length;
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
    if (Math.abs(A[p][k]) < 1e-18) return null;
    if (p !== k) { [A[p], A[k]] = [A[k], A[p]]; [b[p], b[k]] = [b[k], b[p]]; }
    for (let i = k + 1; i < n; i++) {
      const f = A[i][k] / A[k][k];
      if (!f) continue;
      for (let j = k; j < n; j++) A[i][j] -= f * A[k][j];
      b[i] -= f * b[k];
    }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; }
  return x;
}

export class CircuitError extends Error {}

/** A circuit stepping through time (`step`), or settled at DC (`dc`). */
export class Circuit {
  readonly nodes: string[];
  private index = new Map<string, number>();
  private branch = new Map<string, number>();
  readonly size: number;
  t = 0;
  /** Node voltages and branch currents now. */
  x: Float64Array;
  /** Each capacitor's current now (for the trapezoidal rule), each part's current (a → b through it). */
  private ic = new Map<string, number>();
  private first = true;
  constructor(readonly parts: Part[]) {
    const names = new Set<string>();
    for (const p of parts) { names.add(p.a); names.add(p.b); if (p.kind === 'M') names.add(p.g); }
    names.delete('0');
    this.nodes = [...names].sort();
    this.nodes.forEach((n, i) => this.index.set(n, i));
    let k = this.nodes.length;
    for (const p of parts) if (p.kind === 'V' || p.kind === 'L') this.branch.set(p.id, k++);
    this.size = k;
    this.x = new Float64Array(k);
    this.pn = junctions(parts);
    this.nonlinear = parts.some((p) => p.kind === 'D' || p.kind === 'M');
  }
  private readonly pn: [string, string][];
  private readonly nonlinear: boolean;
  private at = (node: string) => (node === '0' ? -1 : this.index.get(node)!);
  /** The voltage of a node now. */
  v(node: string) { const i = this.at(node); return i < 0 ? 0 : this.x[i] ?? 0; }
  /** The current through a part now, from a to b inside it (A). */
  current(p: Part): number {
    const vd = this.v(p.a) - this.v(p.b);
    if (p.kind === 'R') return vd / p.value;
    if (p.kind === 'V' || p.kind === 'L') return this.x[this.branch.get(p.id)!];
    if (p.kind === 'C') return this.ic.get(p.id) ?? 0;
    if (p.kind === 'I') return -p.value;
    if (p.kind === 'S') return vd / (switchOn(p, this.t) ? RON : ROFF);
    if (p.kind === 'M') return mosfet(this.v(p.g) - this.v(p.b), vd, p.vth, p.k, p.lambda).id - diodeI(-vd);
    return diodeI(vd);
  }
  /** The power a part takes in now (W): positive for what it uses or stores, negative for what it gives (a source). */
  power(p: Part) { return (this.v(p.a) - this.v(p.b)) * this.current(p); }

  /** One solve of the linearised circuit; mode: the DC operating point or a step of h seconds. */
  private solve(h: number | null, trap: boolean): Float64Array {
    const n = this.size, prev = this.x;
    let guess: Float64Array = Float64Array.from(prev);
    for (let iter = 0; iter < 100; iter++) {
      const A = Array.from({ length: n }, () => new Float64Array(n)), z = new Float64Array(n);
      const g = (a: number, b: number, G: number) => { if (a >= 0) A[a][a] += G; if (b >= 0) A[b][b] += G; if (a >= 0 && b >= 0) { A[a][b] -= G; A[b][a] -= G; } };
      const inj = (a: number, b: number, I: number) => { if (a >= 0) z[a] += I; if (b >= 0) z[b] -= I; };
      for (let i = 0; i < this.nodes.length; i++) A[i][i] += GMIN;
      // A pn junction (anode a, cathode b): Shockley's law, linearised at the guess.
      const diode = (a: number, b: number) => {
        const vd = (a >= 0 ? guess[a] : 0) - (b >= 0 ? guess[b] : 0), e = Math.exp(Math.min(vd / VT, 80));
        const id = IS * (e - 1), gd = (IS / VT) * e + GMIN;
        g(a, b, gd); inj(a, b, -(id - gd * vd));
      };
      for (const p of this.parts) {
        const a = this.at(p.a), b = this.at(p.b);
        const vPrev = (a >= 0 ? prev[a] : 0) - (b >= 0 ? prev[b] : 0);
        if (p.kind === 'R') g(a, b, 1 / Math.max(p.value, 1e-9));
        else if (p.kind === 'C') {
          if (h === null) continue; // open at DC
          const G = (trap ? 2 : 1) * p.value / h, Ieq = G * vPrev + (trap ? this.ic.get(p.id) ?? 0 : 0);
          g(a, b, G); inj(a, b, Ieq);
        } else if (p.kind === 'I') inj(a, b, p.value);
        else if (p.kind === 'S') g(a, b, 1 / (switchOn(p, h === null ? this.t : this.t + h) ? RON : ROFF));
        else if (p.kind === 'V' || p.kind === 'L') {
          const k = this.branch.get(p.id)!;
          if (a >= 0) { A[a][k] += 1; A[k][a] += 1; }
          if (b >= 0) { A[b][k] -= 1; A[k][b] -= 1; }
          if (p.kind === 'V') z[k] = sourceAt(p, h === null ? this.t : this.t + h);
          else if (h !== null) {
            // v = L di/dt: trapezoidal v¹ + v⁰ = (2L/h)(i¹ − i⁰); backward Euler v¹ = (L/h)(i¹ − i⁰).
            const R = (trap ? 2 : 1) * p.value / h;
            A[k][k] -= R; z[k] = -R * prev[k] - (trap ? vPrev : 0);
          }
        } else if (p.kind === 'M') {
          // The channel, linearised at the guess: I(d→s) ≈ I₀ + gm (Vgs − Vgs₀) + gds (Vds − Vds₀).
          const gi = this.at(p.g), vg = gi >= 0 ? guess[gi] : 0, vdd = (a >= 0 ? guess[a] : 0), vs = (b >= 0 ? guess[b] : 0);
          const m = mosfet(vg - vs, vdd - vs, p.vth, p.k, p.lambda);
          g(a, b, m.gds + GMIN);
          // gm (Vg − Vs) leaving the drain and entering the source.
          if (a >= 0) { if (gi >= 0) A[a][gi] += m.gm; if (b >= 0) A[a][b] -= m.gm; }
          if (b >= 0) { if (gi >= 0) A[b][gi] -= m.gm; A[b][b] += m.gm; }
          inj(a, b, -(m.id - m.gm * (vg - vs) - m.gds * (vdd - vs)));
          diode(b, a);
        } else diode(a, b);
      }
      const x = solveDense(A, z);
      if (!x) throw new CircuitError('The circuit can’t be solved: a voltage source or a coil is shorted by a wire, or two sources fight each other.');
      if (!this.nonlinear) return x;
      // Limit each junction's voltage change (SPICE's pnjlim), and each gate's to 2 V a step (as fetlim does), and
      // stop once nothing moves.
      let moved = 0;
      for (const p of this.parts) {
        if (p.kind !== 'M') continue;
        const gi = this.at(p.g), si = this.at(p.b), at = (v: Float64Array, i: number) => (i >= 0 ? v[i] : 0);
        const dv = at(x, gi) - at(x, si) - (at(guess, gi) - at(guess, si));
        if (Math.abs(dv) > 2) { const scale = 2 / Math.abs(dv); for (let i = 0; i < n; i++) x[i] = guess[i] + (x[i] - guess[i]) * scale; }
      }
      for (const [pa, pb] of this.pn) {
        const a = this.at(pa), b = this.at(pb);
        const vOld = (a >= 0 ? guess[a] : 0) - (b >= 0 ? guess[b] : 0), vNew = (a >= 0 ? x[a] : 0) - (b >= 0 ? x[b] : 0);
        if (vNew > VCRIT && Math.abs(vNew - vOld) > 2 * VT) {
          const lim = vOld > 0 ? vOld + VT * Math.log(Math.max(1e-12, 1 + (vNew - vOld) / VT)) : VT * Math.log(Math.max(1e-12, vNew / VT));
          const scale = (lim - vOld) / (vNew - vOld || 1);
          for (let i = 0; i < n; i++) x[i] = guess[i] + (x[i] - guess[i]) * scale;
        }
        moved = Math.max(moved, Math.abs(vNew - vOld));
      }
      let delta = 0;
      for (let i = 0; i < n; i++) delta = Math.max(delta, Math.abs(x[i] - guess[i]));
      guess = x;
      if (delta < 1e-9 && moved < 1e-6) return x;
    }
    return guess;
  }

  /** The DC operating point: capacitors open, coils shorted, sources at their value at time t. */
  dc() { this.x = this.solve(null, false); for (const p of this.parts) if (p.kind === 'C') this.ic.set(p.id, 0); return this; }

  /** Moves on by h seconds. */
  step(h: number) {
    const prev = this.x, trap = !this.first;
    const x = this.solve(h, trap);
    // Each capacitor's current for the next step: i = G(v¹ − v⁰) − i⁰ (trapezoidal) or C(v¹ − v⁰)/h.
    for (const p of this.parts) {
      if (p.kind !== 'C') continue;
      const a = this.at(p.a), b = this.at(p.b);
      const v1 = (a >= 0 ? x[a] : 0) - (b >= 0 ? x[b] : 0), v0 = (a >= 0 ? prev[a] : 0) - (b >= 0 ? prev[b] : 0);
      this.ic.set(p.id, trap ? ((2 * p.value) / h) * (v1 - v0) - (this.ic.get(p.id) ?? 0) : (p.value / h) * (v1 - v0));
    }
    this.x = x; this.t += h; this.first = false;
    return this;
  }
}

/** A value with an SI prefix: 4.7k, 2.2µ, 10m (and parses them back: "4k7" isn't read). */
const PREFIX: [number, string][] = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
export function si(v: number, unit: string): string {
  if (v === 0 || !Number.isFinite(v)) return `0 ${unit}`;
  const [f, p] = PREFIX.find(([f]) => Math.abs(v) >= f * 0.9995) ?? PREFIX[PREFIX.length - 1];
  return `${+(v / f).toPrecision(3)} ${p}${unit}`;
}
export function parseSi(text: string): number | null {
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*([GMkKmuµnp]?)/i.exec(text);
  if (!m) return null;
  const mult: Record<string, number> = { G: 1e9, M: 1e6, k: 1e3, K: 1e3, m: 1e-3, u: 1e-6, µ: 1e-6, n: 1e-9, p: 1e-12, '': 1 };
  return Number(m[1]) * (mult[m[2]] ?? 1);
}
