import { canon, chartOf, coeffs, KINDS, n, type Block, type Diagram } from './blocks';
import { boxes, join, mulIv, type Iv } from './prove';
import { chartStart } from './chart';

// Hyperion Simulate → Blocks → Verify → Prove, the rest of the diagram (M574, M573's left-out: "proofs cover only a
// chart's own logic, not the rest of the diagram"). A range for every signal in the diagram that holds at every
// instant of its run (0 … stop seconds), so a chart's inputs can be "whatever the diagram can really feed it" in place
// of "any number":
//
//   • sources give their own ranges (a step its two levels, a sine ±amplitude, a ramp from 0 to where it gets by the
//     end); gains, sums, products and saturations work on ranges;
//   • an integrator stays within its start plus the run's length times its input's range; a PID's integral likewise,
//     its filtered derivative between 0 and its input;
//   • a transfer function's output (from rest) is D·u plus the convolution of its impulse response h with u, so it lies
//     within D·[u] + ∫h⁺·[u] + ∫h⁻·[u] over the run (h worked out by a fine Runge–Kutta run, with a small margin);
//   • a delay gives back its start value or something its input had; a Chart block its outputs' proved ranges
//     (M573's boxes) for the ranges reaching its inputs;
//   • a board input (a real pin) can be anything.
//
// Loops are followed round until nothing grows (a range still growing after 12 rounds is opened to ±∞, so it ends):
// the result is sound, never claiming less than can happen, though a loop of continuous blocks with no saturation or
// chart in it usually ends unbounded.

export interface DiagramRanges { sig: Map<string, Iv>; widened: boolean; rounds: number }
const TOP: Iv = [-Infinity, Infinity];
const hull0 = (a: Iv): Iv => [Math.min(0, a[0]), Math.max(0, a[1])];
const add = (a: Iv, b: Iv): Iv => [a[0] + b[0], a[1] + b[1]];
const scale = (k: number, a: Iv): Iv => mulIv([k, k], a);
const fix = (a: Iv): Iv => [Number.isNaN(a[0]) ? -Infinity : a[0], Number.isNaN(a[1]) ? Infinity : a[1]];

/** ∫h⁺ and ∫h⁻ (≤ 0) of a strictly proper transfer function's impulse response over [0, stop] (null: not worked out). */
export function impulseParts(c: ReturnType<typeof canon>, stop: number): [number, number] | null {
  if (!c.order) return [0, 0];
  const rho = 1 + Math.max(0, ...c.a.map(Math.abs)), steps = Math.ceil(Math.max(stop / Math.min(stop / 2000, 0.2 / rho), 1));
  if (steps > 400_000) return null;
  const h = stop / steps, N = c.order;
  const f = (x: Float64Array) => { const d = new Float64Array(N); d[0] = -c.a.reduce((s, a, k) => s + a * x[k], 0); for (let k = 1; k < N; k++) d[k] = x[k - 1]; return d; };
  const y = (x: Float64Array) => c.C.reduce((s, ck, k) => s + ck * x[k], 0);
  let x = new Float64Array(N); x[0] = 1;
  let pos = 0, neg = 0, prev = y(x), peak = Math.abs(prev);
  for (let i = 0; i < steps; i++) {
    const k1 = f(x), x2 = x.map((v, j) => v + (h / 2) * k1[j]), k2 = f(x2), x3 = x.map((v, j) => v + (h / 2) * k2[j]), k3 = f(x3), x4 = x.map((v, j) => v + h * k3[j]), k4 = f(x4);
    x = x.map((v, j) => v + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    const cur = y(x);
    // Trapezoid on each sign's part (a crossing split where the line meets 0).
    if ((prev >= 0) === (cur >= 0)) { if (prev >= 0) pos += (h * (prev + cur)) / 2; else neg += (h * (prev + cur)) / 2; }
    else { const z = (h * Math.abs(prev)) / (Math.abs(prev) + Math.abs(cur)); if (prev >= 0) { pos += (z * prev) / 2; neg += ((h - z) * cur) / 2; } else { neg += (z * prev) / 2; pos += ((h - z) * cur) / 2; } }
    prev = cur; peak = Math.max(peak, Math.abs(cur));
    if (!Number.isFinite(cur)) return null;
    if (i > 100 && peak > 0 && x.every((v) => Math.abs(v) < 1e-14 * peak)) break; // died away: the rest adds nothing
  }
  // A margin for the numerical integration (it is fine, but not exact).
  return [pos * (1 + 1e-4) + 1e-12, neg * (1 + 1e-4) - 1e-12];
}

/** Every signal's range over the diagram's run (`id#out`). */
export function diagramRanges(dg: Diagram): DiagramRanges {
  const byId = new Map(dg.blocks.map((b) => [b.id, b]));
  const into = new Map<string, string>();
  for (const w of dg.wires) if (byId.has(w.from) && byId.has(w.to)) into.set(`${w.to}:${w.in}`, `${w.from}#${w.out}`);
  const stop = dg.stop, sig = new Map<string, Iv>(), grew = new Map<string, number>();
  const tfParts = new Map<string, { c: ReturnType<typeof canon>; parts: [number, number] | null }>();
  for (const b of dg.blocks) if (b.kind === 'tf') { const c = canon(coeffs(b.p.num), coeffs(b.p.den)); tfParts.set(b.id, { c, parts: impulseParts(c, stop) }); }
  const chartCache = new Map<string, Iv[]>();
  /** An input's range now: unwired, 0; wired but nothing known yet, undefined. */
  const input = (b: Block, i: number): Iv | undefined => { const s = into.get(`${b.id}:${i}`); return s ? sig.get(s) : [0, 0]; };
  const outs = (b: Block): (Iv | undefined)[] | undefined => {
    const p = b.p, u = KINDS[b.kind].ins(p) ? input(b, 0) : undefined;
    switch (b.kind) {
      case 'step': return [[Math.min(n(p.before), n(p.after, 1)), Math.max(n(p.before), n(p.after, 1))]];
      case 'sine': { const a = Math.abs(n(p.amplitude, 1)); return [[-a, a]]; }
      case 'constant': return [[n(p.value, 1), n(p.value, 1)]];
      case 'pulse': return [hull0([n(p.amplitude, 1), n(p.amplitude, 1)])];
      case 'ramp': return [hull0([n(p.slope, 1) * Math.max(0, stop - n(p.start)), n(p.slope, 1) * Math.max(0, stop - n(p.start))])];
      case 'boardIn': return [TOP];
      case 'gain': return [u && scale(n(p.k, 1), u)];
      case 'sum': {
        let s: Iv = [0, 0];
        for (const [i, c] of [...String(p.signs ?? '+-')].entries()) { const x = input(b, i); if (!x) return [undefined]; s = add(s, c === '-' ? [-x[1], -x[0]] : x); }
        return [s];
      }
      case 'product': { const v = input(b, 1); return [u && v && mulIv(u, v)]; }
      case 'saturation': { const lo = n(p.lower, -1), hi = n(p.upper, 1); return [u && [Math.min(hi, Math.max(lo, u[0])), Math.min(hi, Math.max(lo, u[1]))]]; }
      case 'integrator': return [add([n(p.initial), n(p.initial)], scale(stop, hull0(u ?? [0, 0])))];
      case 'delay': return [join([n(p.initial), n(p.initial)], u ?? [n(p.initial), n(p.initial)])];
      case 'tf': {
        const { c, parts } = tfParts.get(b.id)!;
        if (!u) return [c.D === 0 ? [0, 0] : undefined];
        if (!parts) return [TOP];
        return [fix(add(add(scale(c.D, u), scale(parts[0], u)), scale(parts[1], u)))];
      }
      case 'pid': {
        if (!u) return [undefined];
        const e = u, I = scale(stop, hull0(e)), d: Iv = [e[0] - hull0(e)[1], e[1] - hull0(e)[0]];
        return [fix(add(add(scale(n(p.Kp, 1), e), scale(n(p.Ki), I)), scale(n(p.Kd) * n(p.N, 100), d)))];
      }
      case 'chart': {
        const ch = chartOf(b), ins = ch.inputs.map((_, i) => input(b, i));
        if (ins.some((x) => !x)) { const r = chartStart(ch, 0); return ch.outputs.map((o) => [r.vars[o], r.vars[o]] as Iv); }
        const key = `${b.id}|${ins.map((x) => x!.join(',')).join(';')}`;
        let got = chartCache.get(key);
        if (!got) {
          const { box } = boxes(ch, Object.fromEntries(ch.inputs.map((x, i) => [x, ins[i]!])), dg.dt);
          got = ch.outputs.map((o) => box.reduce<Iv | null>((acc, bx) => (bx ? (acc ? join(acc, bx[o]) : bx[o]) : acc), null) ?? TOP);
          chartCache.set(key, got);
        }
        return got;
      }
      default: return undefined;
    }
  };
  let widened = false, rounds = 0, changed = true;
  while (changed && rounds++ < 300) {
    changed = false;
    for (const b of dg.blocks) {
      const o = outs(b);
      if (!o) continue;
      o.forEach((v, k) => {
        if (!v) return;
        const key = `${b.id}#${k}`, old = sig.get(key);
        if (old && v[0] >= old[0] && v[1] <= old[1]) return;
        let next = old ? join(old, v) : v;
        if (old && (grew.set(key, (grew.get(key) ?? 0) + 1).get(key)! > 12)) { widened = true; next = [next[0] < old[0] ? -Infinity : old[0], next[1] > old[1] ? Infinity : old[1]]; }
        sig.set(key, next);
        changed = true;
      });
    }
  }
  return { sig, widened, rounds };
}

/** What the diagram can feed a chart block's inputs, by the chart's input names (unknown: any number). */
export function chartInputRanges(dg: Diagram, chartId: string, r = diagramRanges(dg)): Record<string, Iv> {
  const b = dg.blocks.find((x) => x.id === chartId);
  if (!b) return {};
  const ch = chartOf(b), out: Record<string, Iv> = {};
  ch.inputs.forEach((x, i) => {
    const w = dg.wires.find((wi) => wi.to === chartId && wi.in === i);
    out[x] = w ? r.sig.get(`${w.from}#${w.out}`) ?? TOP : [0, 0];
  });
  return out;
}
