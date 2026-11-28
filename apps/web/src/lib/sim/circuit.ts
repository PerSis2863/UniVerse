// Hyperion Simulate → Circuits (M410, the owner's Ansys ask; Ansys has electronics too): a circuit simulator by
// modified nodal analysis, the method SPICE uses. Unknowns: every node's voltage (ground, node "0", is 0 V) and the
// current through every voltage source and inductor. Capacitors and inductors step in time by the trapezoidal rule
// (the first step by backward Euler, which damps a sudden start); diodes follow Shockley's law, solved by Newton's
// method with the voltage step limited each time (as SPICE does) so it never runs away.

export type Wave = 'dc' | 'sine' | 'square';
/** A fault (M567, a virtual FMEA): from time `at` (s) the part stops working as itself and becomes an open circuit
 *  (10 MΩ) or a short (10 mΩ). */
export interface Fault { kind: 'open' | 'short'; at: number }
export type Part = { fault?: Fault } & (
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
  | { id: string; kind: 'S'; a: string; b: string; duty: number; freq: number; hold?: Hold; sine?: SinePwm; invert?: boolean }
  /** A DC motor (M432): armature resistance `r` (Ω) and inductance `l` (H), back-EMF and torque constant `k` (V·s/rad =
   * N·m/A), inertia `j` (kg·m²), friction `fric` (N·m·s/rad) and a load torque `load` (N·m) against its turning. */
  | { id: string; kind: 'Mo'; a: string; b: string; r: number; l: number; k: number; j: number; fric: number; load: number }
  /** An n-channel MOSFET (M430): drain a, source b, gate g. It turns on above its threshold `vth` (volts); `k` (A/V²)
   * sets how hard (the on-resistance is about 1 / (k (Vgs − Vth))); `lambda` (1/V) lets the current rise a little
   * with Vds when saturated. A body diode runs from source to drain, as in every power MOSFET. */
  | { id: string; kind: 'M'; a: string; b: string; g: string; vth: number; k: number; lambda: number });

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
export const switchOn = (p: Extract<Part, { kind: 'S' }>, t: number, duty = p.duty) => ((t * p.freq) % 1 + 1) % 1 < duty;
/** A PWM switch's next edge (turning on or off) after time t (M431). Steps are split there, so a duty isn't rounded to
 * whole time steps (that made a regulated output jump as rounding drifted). */
export function nextEdge(freq: number, duty: number, t: number) {
  const ph = t * freq, k = Math.floor(ph);
  for (const e of [k + duty, k + 1, k + 1 + duty]) if (e > ph + 1e-9) return e / freq;
  return Infinity;
}
/** A switch that holds a voltage (M431): once a period it reads `node` and moves its duty towards `target` volts by
 * an integral controller (duty changes by `gain` × the error as a share of the target, per second), from 0 with the
 * target ramped up over `soft` seconds so the start doesn't overshoot; the duty stays within 0 … `max`. */
export interface Hold { node: string; target: number; gain: number; soft: number; max: number }
export const HOLD = { gain: 150, soft: 2e-3, max: 0.9 };
/** Sine PWM (M432, an inverter's switch): each period's duty is ½(1 + m·sin(2πft + phase)), so the average voltage
 * follows a sine of `f` Hz; `invert` makes a switch the other half of a pair (on whenever its partner is off). */
export interface SinePwm { m: number; f: number; phase: number }

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
    for (const p of parts) if (p.kind === 'V' || p.kind === 'L' || p.kind === 'Mo') this.branch.set(p.id, k++);
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
  /** Whether a part's fault has happened by time t. */
  failed = (p: Part, t: number) => !!p.fault && t >= p.fault.at;
  /** The current through a part now, from a to b inside it (A). */
  current(p: Part): number {
    const vd = this.v(p.a) - this.v(p.b);
    if (this.failed(p, this.t)) return p.kind === 'V' || p.kind === 'L' || p.kind === 'Mo' ? this.x[this.branch.get(p.id)!] : vd / (p.fault!.kind === 'short' ? RON : ROFF);
    if (p.kind === 'R') return vd / p.value;
    if (p.kind === 'V' || p.kind === 'L' || p.kind === 'Mo') return this.x[this.branch.get(p.id)!];
    if (p.kind === 'C') return this.ic.get(p.id) ?? 0;
    if (p.kind === 'I') return -p.value;
    if (p.kind === 'S') return vd / (this.isOn(p, this.t - this.lastH / 2) ? RON : ROFF);
    if (p.kind === 'M') return mosfet(this.v(p.g) - this.v(p.b), vd, p.vth, p.k, p.lambda).id - diodeI(-vd);
    return diodeI(vd);
  }
  /** Regulated switches' duty now and the period it was last set in. */
  private held = new Map<string, { duty: number; period: number }>();
  private lastH = 0;
  private swState = new Map<string, boolean>();
  /** A switch's duty now (its own, or what its controller or its sine has set). */
  dutyOf(p: Extract<Part, { kind: 'S' }>) { return p.hold || p.sine ? this.held.get(p.id)?.duty ?? (p.sine ? 0.5 : 0) : p.duty; }
  /** Whether a switch is on at time t (an inverted one is on when its partner would be off). */
  isOn(p: Extract<Part, { kind: 'S' }>, t: number) { return switchOn(p, t, this.dutyOf(p)) !== !!p.invert; }
  /** Each motor's speed now (rad/s). */
  private speeds = new Map<string, number>();
  speedOf(p: Part) { return this.speeds.get(p.id) ?? 0; }
  /** Each regulated switch, at the start of a new period, reads its node and moves its duty. */
  private regulate() {
    for (const p of this.parts) {
      if (p.kind !== 'S' || !(p.hold || p.sine)) continue;
      const period = Math.floor(this.t * p.freq + 1e-9), st = this.held.get(p.id) ?? { duty: 0, period: -1 };
      if (period !== st.period && p.sine) {
        // Sampled at the start of each period (regular-sampled sine PWM).
        const s = p.sine;
        st.duty = Math.max(0, Math.min(1, 0.5 * (1 + s.m * Math.sin(2 * Math.PI * s.f * (period / p.freq) + s.phase))));
        st.period = period;
        this.held.set(p.id, st);
      } else if (period !== st.period && p.hold) {
        const h = p.hold, target = h.target * Math.min(1, this.t / h.soft), sign = Math.sign(h.target) || 1;
        const e = (sign * (target - this.v(h.node))) / Math.max(1e-9, Math.abs(h.target));
        st.duty = Math.max(0, Math.min(h.max, st.duty + (h.gain * e) / p.freq));
        st.period = period;
        this.held.set(p.id, st);
      }
    }
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
      const tNow = h === null ? this.t : this.t + h;
      for (const p of this.parts) {
        const a = this.at(p.a), b = this.at(p.b);
        const vPrev = (a >= 0 ? prev[a] : 0) - (b >= 0 ? prev[b] : 0);
        if (this.failed(p, tNow)) {
          // A failed part: its branch (a source's, a coil's, a motor's) carries what a 10 mΩ short or a 10 MΩ open
          // would; any other part is that resistance between its ends.
          const R = p.fault!.kind === 'short' ? RON : ROFF;
          if (p.kind === 'V' || p.kind === 'L' || p.kind === 'Mo') {
            const k = this.branch.get(p.id)!;
            if (a >= 0) { A[a][k] += 1; A[k][a] += 1; }
            if (b >= 0) { A[b][k] -= 1; A[k][b] -= 1; }
            A[k][k] -= R;
          } else g(a, b, 1 / R);
          continue;
        }
        if (p.kind === 'R') g(a, b, 1 / Math.max(p.value, 1e-9));
        else if (p.kind === 'C') {
          if (h === null) continue; // open at DC
          const G = (trap ? 2 : 1) * p.value / h, Ieq = G * vPrev + (trap ? this.ic.get(p.id) ?? 0 : 0);
          g(a, b, G); inj(a, b, Ieq);
        } else if (p.kind === 'I') inj(a, b, p.value);
        else if (p.kind === 'S') g(a, b, 1 / (this.isOn(p, h === null ? this.t : this.t + h / 2) ? RON : ROFF));
        else if (p.kind === 'Mo') {
          // A motor's winding: v = r·i + l·di/dt + k·ω, the coil by backward Euler (ω from the last step).
          const k = this.branch.get(p.id)!, e = p.k * this.speedOf(p);
          if (a >= 0) { A[a][k] += 1; A[k][a] += 1; }
          if (b >= 0) { A[b][k] -= 1; A[k][b] -= 1; }
          const R = p.r + (h === null ? 0 : p.l / h);
          A[k][k] -= R; z[k] = e - (h === null ? 0 : (p.l / h) * prev[k]);
        } else if (p.kind === 'V' || p.kind === 'L') {
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
    // Split the step at any switch's edge inside it. Edges closer than a millionth of the step to either end are
    // left out (a near-zero step makes the trapezoidal rule ring), and the clock lands exactly on each piece's end.
    const end = this.t + h, tol = h * 1e-6;
    for (let guard = 0; guard < 64 && end - this.t > tol; guard++) {
      this.regulate();
      let next = end;
      for (const p of this.parts) if (p.kind === 'S') { const e = nextEdge(p.freq, this.dutyOf(p), this.t + tol); if (e < next - tol) next = e; }
      // Right after a switch flips, one backward-Euler step (as SPICE does at a breakpoint) so nothing rings.
      for (const p of this.parts) {
        if (p.kind !== 'S') continue;
        const on = this.isOn(p, (this.t + next) / 2);
        if (this.swState.get(p.id) !== on) { if (this.swState.has(p.id)) this.first = true; this.swState.set(p.id, on); }
      }
      this.advance(next - this.t);
      this.t = next;
    }
    this.t = end;
    return this;
  }
  private advance(h: number) {
    const prev = this.x, trap = !this.first;
    const x = this.solve(h, trap);
    // Each capacitor's current for the next step: i = G(v¹ − v⁰) − i⁰ (trapezoidal) or C(v¹ − v⁰)/h.
    for (const p of this.parts) {
      if (p.kind !== 'C') continue;
      if (this.failed(p, this.t + h)) { this.ic.set(p.id, 0); continue; }
      const a = this.at(p.a), b = this.at(p.b);
      const v1 = (a >= 0 ? x[a] : 0) - (b >= 0 ? x[b] : 0), v0 = (a >= 0 ? prev[a] : 0) - (b >= 0 ? prev[b] : 0);
      this.ic.set(p.id, trap ? ((2 * p.value) / h) * (v1 - v0) - (this.ic.get(p.id) ?? 0) : (p.value / h) * (v1 - v0));
    }
    this.x = x; this.t += h; this.first = false; this.lastH = h;
    // Each motor's shaft: J dω/dt = k·i − fric·ω − load (the load only once it turns, as friction does).
    for (const p of this.parts) {
      if (p.kind !== 'Mo') continue;
      const w = this.speedOf(p), i = x[this.branch.get(p.id)!], drive = p.k * i - p.fric * w;
      const load = Math.abs(w) > 1e-6 ? Math.sign(w) * p.load : Math.sign(drive) * Math.min(Math.abs(drive), p.load);
      this.speeds.set(p.id, w + (h * (drive - load)) / p.j);
    }
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
