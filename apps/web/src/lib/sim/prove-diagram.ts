import { chartOf, KINDS, n, type Block, type Diagram } from './blocks';
import { boxes, join, mulIv, type Iv } from './prove';
import { chartStart } from './chart';
import { coefficients, isLinear, linearNet, type LinearNet } from './prove-linear';
import { loopRanges, type InputSource } from './prove-loop';

// Hyperion Simulate → Blocks → Verify → Prove, the rest of the diagram (M574, M573's left-out: "proofs cover only a
// chart's own logic, not the rest of the diagram"). A range for every signal in the diagram, so a chart's inputs can be
// "whatever the diagram can really feed it" in place of "any number":
//
//   • sources give their own ranges (a step its two levels, a sine ±amplitude, a ramp from 0 to where it gets by the
//     end); products and saturations work on ranges; a delay gives back its start value or something its input had; a
//     Chart block its outputs' proved ranges (M573's boxes); a board input (a real pin) can be anything;
//   • the linear blocks (gains, sums, integrators, transfer functions, PIDs) are one system, bounded through its impulse
//     responses (M575, `prove-linear.ts`): a stable loop keeps its signals close to where it holds them;
//   • a chart that drives part of that system and reads it back is proved together with it (M575, `prove-loop.ts`), so
//     a tank's level is bounded by the chart switching its pump, not by how long the run is.
//
// Everything is worked out twice: over the run (0 … stop s) and FOREVER (no ramps growing, only stable linear parts or
// a chart holding them). Loops are followed round until nothing grows (12 growths → opened to ±∞), then narrowed a few
// rounds: sound, never claiming less than can happen.

export interface DiagramRanges { sig: Map<string, Iv>; forever: Map<string, Iv>; widened: boolean; rounds: number }
const TOP: Iv = [-Infinity, Infinity];
const hull0 = (a: Iv): Iv => [Math.min(0, a[0]), Math.max(0, a[1])];
const add = (a: Iv, b: Iv): Iv => [a[0] + b[0], a[1] + b[1]];
const cap = (a: Iv, b: Iv | undefined): Iv => (b ? [Math.max(a[0], b[0]), Math.min(a[1], b[1])] : a);
const fix = (a: Iv): Iv => [Number.isNaN(a[0]) ? -Infinity : a[0], Number.isNaN(a[1]) ? Infinity : a[1]];

/** Every signal's range (`id#out`), over the run and forever. */
export function diagramRanges(dg: Diagram): DiagramRanges {
  const net = linearNet(dg);
  const run = solve(dg, net, dg.stop), ever = solve(dg, net, Infinity);
  const sig = new Map<string, Iv>();
  for (const [k, r] of run.sig) sig.set(k, cap(r, ever.sig.get(k)));
  return { sig, forever: ever.sig, widened: run.widened, rounds: run.rounds };
}

function solve(dg: Diagram, net: LinearNet, horizon: number) {
  const byId = new Map(dg.blocks.map((b) => [b.id, b]));
  const into = new Map<string, string>();
  for (const w of dg.wires) if (byId.has(w.from) && byId.has(w.to)) into.set(`${w.to}:${w.in}`, `${w.from}#${w.out}`);
  const span = Number.isFinite(horizon) ? horizon : Infinity;
  const coef = coefficients(net, horizon);
  const sig = new Map<string, Iv>(), grew = new Map<string, number>(), loop = new Map<string, Iv>();
  const chartCache = new Map<string, Iv[]>();
  const cutRanges = () => net.cuts.map((c) => sig.get(c));
  const linearSig = (i: number): Iv => {
    const c = coef[i], cu = cutRanges();
    let r: Iv = c ? [...c.free] : TOP;
    if (c) cu.forEach((u, j) => { if (u) for (const k of [c.D[j], c.P[j], c.N[j]]) if (k) r = add(r, mulIv([k, k], u)); });
    return cap(fix(r), loop.get(net.sigs[i]));
  };
  /** An input's range now: unwired, 0; wired but nothing known yet, undefined. */
  const input = (b: Block, i: number): Iv | undefined => { const s = into.get(`${b.id}:${i}`); return s ? sig.get(s) : [0, 0]; };
  const outs = (b: Block): (Iv | undefined)[] | undefined => {
    const p = b.p, u = KINDS[b.kind].ins(p) ? input(b, 0) : undefined;
    switch (b.kind) {
      case 'step': return [[Math.min(n(p.before), n(p.after, 1)), Math.max(n(p.before), n(p.after, 1))]];
      case 'sine': { const a = Math.abs(n(p.amplitude, 1)); return [[-a, a]]; }
      case 'constant': return [[n(p.value, 1), n(p.value, 1)]];
      case 'pulse': return [hull0([n(p.amplitude, 1), n(p.amplitude, 1)])];
      case 'ramp': { const k = n(p.slope, 1), far = Number.isFinite(span) ? k * Math.max(0, span - n(p.start)) : k === 0 ? 0 : k * Infinity; return [hull0([far, far])]; }
      case 'boardIn': return [TOP];
      case 'product': { const w = input(b, 1); return [u && w && mulIv(u, w)]; }
      case 'saturation': { const lo = n(p.lower, -1), hi = n(p.upper, 1); return [u && [Math.min(hi, Math.max(lo, u[0])), Math.min(hi, Math.max(lo, u[1]))]]; }
      case 'delay': return [join([n(p.initial), n(p.initial)], u ?? [n(p.initial), n(p.initial)])];
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
        return got.map((r, k) => cap(r, loop.get(`${b.id}#${k}`)));
      }
      default: return undefined;
    }
  };
  const others = dg.blocks.filter((b) => !isLinear(b));
  const setLinear = () => { let changed = false; net.sigs.forEach((s, i) => { const r = linearSig(i), old = sig.get(s); if (!old || r[0] !== old[0] || r[1] !== old[1]) { sig.set(s, r); changed = true; } }); return changed; };
  let widened = false, rounds = 0, changed = true;
  setLinear();
  while (changed && rounds++ < 300) {
    changed = false;
    for (const b of others) {
      (outs(b) ?? []).forEach((v, k) => {
        if (!v) return;
        const key = `${b.id}#${k}`, old = sig.get(key);
        if (old && v[0] >= old[0] && v[1] <= old[1]) return;
        let next = old ? join(old, v) : v;
        if (old && (grew.set(key, (grew.get(key) ?? 0) + 1).get(key)! > 12)) { widened = true; next = [next[0] < old[0] ? -Infinity : old[0], next[1] > old[1] ? Infinity : old[1]]; }
        sig.set(key, next);
        changed = true;
      });
    }
    if (setLinear()) changed = true;
  }
  // Charts with the plant they drive, proved together; then narrowing rounds with what they found.
  for (const b of dg.blocks) {
    if (b.kind !== 'chart') continue;
    let ch;
    try { ch = chartOf(b); } catch { continue; }
    const sources: InputSource[] = ch.inputs.map((_, i) => {
      const s = into.get(`${b.id}:${i}`);
      if (!s) return null;
      const row = net.row.get(s);
      return row ? { row } : { range: sig.get(s) ?? TOP };
    });
    const res = loopRanges(ch, b.id, net, sources, net.cuts.map((c) => sig.get(c) ?? TOP), dg.dt);
    if (!res) continue;
    ch.outputs.forEach((o, k) => loop.set(`${b.id}#${k}`, res.vars[o]));
    // Each linear signal from the plant's states (widened by one step's drift: the boxes hold at the steps).
    const S = Object.keys(res.states).map(Number), xs = new Map(S.map((k) => [k, res.states[k]]));
    const cu = net.cuts.map((c) => (c.startsWith(`${b.id}#`) ? res.vars[ch.outputs[Number(c.split('#')[1])]] : sig.get(c) ?? TOP));
    const drift = new Map(S.map((k) => {
      let d: Iv = [0, 0];
      net.A[k].forEach((a, l) => { if (a) d = add(d, mulIv([a, a], xs.get(l) ?? TOP)); });
      net.B[k].forEach((bb, j) => { if (bb) d = add(d, mulIv([bb, bb], cu[j])); });
      return [k, hull0(mulIv([dg.dt, dg.dt], fix(d)))] as const;
    }));
    net.sigs.forEach((s, i) => {
      if (net.C[i].some((c, k) => c && !xs.has(k))) return;
      let r: Iv = [0, 0];
      net.C[i].forEach((c, k) => { if (c) r = add(r, mulIv([c, c], add(xs.get(k)!, drift.get(k)!))); });
      net.D[i].forEach((d, j) => { if (d) r = add(r, mulIv([d, d], cu[j])); });
      const old = loop.get(s);
      loop.set(s, old ? cap(fix(r), old) : fix(r));
    });
  }
  if (loop.size) for (let k = 0; k < 6; k++) {
    for (const b of others) (outs(b) ?? []).forEach((v, q) => { const key = `${b.id}#${q}`; if (v) sig.set(key, cap(v, sig.get(key))); });
    net.sigs.forEach((s, i) => sig.set(s, cap(linearSig(i), sig.get(s))));
  }
  return { sig, widened, rounds };
}

/** What the diagram can feed a chart block's inputs, by the chart's input names (unknown: any number). */
export function chartInputRanges(dg: Diagram, chartId: string, r = diagramRanges(dg), which: 'sig' | 'forever' = 'sig'): Record<string, Iv> {
  const b = dg.blocks.find((x) => x.id === chartId);
  if (!b) return {};
  const ch = chartOf(b), out: Record<string, Iv> = {};
  ch.inputs.forEach((x, i) => {
    const w = dg.wires.find((wi) => wi.to === chartId && wi.in === i);
    out[x] = w ? r[which].get(`${w.from}#${w.out}`) ?? TOP : [0, 0];
  });
  return out;
}
