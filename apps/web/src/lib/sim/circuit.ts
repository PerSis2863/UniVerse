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
  | { id: string; kind: 'D'; a: string; b: string };

const IS = 1e-14, VT = 0.025852, VCRIT = VT * Math.log(VT / (Math.SQRT2 * IS)), GMIN = 1e-12;

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
    for (const p of parts) { names.add(p.a); names.add(p.b); }
    names.delete('0');
    this.nodes = [...names].sort();
    this.nodes.forEach((n, i) => this.index.set(n, i));
    let k = this.nodes.length;
    for (const p of parts) if (p.kind === 'V' || p.kind === 'L') this.branch.set(p.id, k++);
    this.size = k;
    this.x = new Float64Array(k);
  }
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
    return IS * (Math.exp(Math.min(vd / VT, 80)) - 1);
  }

  /** One solve of the linearised circuit; mode: the DC operating point or a step of h seconds. */
  private solve(h: number | null, trap: boolean): Float64Array {
    const n = this.size, prev = this.x;
    let guess: Float64Array = Float64Array.from(prev);
    for (let iter = 0; iter < 100; iter++) {
      const A = Array.from({ length: n }, () => new Float64Array(n)), z = new Float64Array(n);
      const g = (a: number, b: number, G: number) => { if (a >= 0) A[a][a] += G; if (b >= 0) A[b][b] += G; if (a >= 0 && b >= 0) { A[a][b] -= G; A[b][a] -= G; } };
      const inj = (a: number, b: number, I: number) => { if (a >= 0) z[a] += I; if (b >= 0) z[b] -= I; };
      for (let i = 0; i < this.nodes.length; i++) A[i][i] += GMIN;
      for (const p of this.parts) {
        const a = this.at(p.a), b = this.at(p.b);
        const vPrev = (a >= 0 ? prev[a] : 0) - (b >= 0 ? prev[b] : 0);
        if (p.kind === 'R') g(a, b, 1 / Math.max(p.value, 1e-9));
        else if (p.kind === 'C') {
          if (h === null) continue; // open at DC
          const G = (trap ? 2 : 1) * p.value / h, Ieq = G * vPrev + (trap ? this.ic.get(p.id) ?? 0 : 0);
          g(a, b, G); inj(a, b, Ieq);
        } else if (p.kind === 'I') inj(a, b, p.value);
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
        } else {
          // Diode: Shockley's law, linearised at the guess.
          const vd = (a >= 0 ? guess[a] : 0) - (b >= 0 ? guess[b] : 0), e = Math.exp(Math.min(vd / VT, 80));
          const id = IS * (e - 1), gd = (IS / VT) * e + GMIN;
          g(a, b, gd); inj(a, b, -(id - gd * vd));
        }
      }
      const x = solveDense(A, z);
      if (!x) throw new CircuitError('The circuit can’t be solved: a voltage source or a coil is shorted by a wire, or two sources fight each other.');
      if (!this.parts.some((p) => p.kind === 'D')) return x;
      // Limit each diode's voltage change (SPICE's pnjlim) and stop once nothing moves.
      let moved = 0;
      for (const p of this.parts) {
        if (p.kind !== 'D') continue;
        const a = this.at(p.a), b = this.at(p.b);
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
