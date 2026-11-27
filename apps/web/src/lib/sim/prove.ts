import { chartStart, chartStep, evalExpr, parseExpr, type Assign, type Chart, type Expr } from './chart';

// Hyperion Simulate → Blocks → Verify → Prove (M573, M566's left-out: "formal proof, model checking every input").
// A Chart block's logic proved for EVERY value its inputs can take, at every step, forever, not only on the tests run:
//
//   • Abstract interpretation over intervals (the method behind Polyspace's proofs): each flat state keeps a box, a
//     range for each of the chart's variables that covers every value it can have there. From the start, each step
//     takes the inputs as anything in their ranges and time as any time, follows every transition that might fire
//     (refining the box by its condition) and the during actions otherwise, and joins what arrives, until nothing
//     grows (ranges that keep growing are widened to ±∞, so it always ends). What holds over these boxes holds on every
//     real run: a state with no box can never be reached, a transition whose condition is never possibly true can never
//     fire, a property true on every box is PROVED, and the outputs' ranges are proved bounds.
//   • When the boxes can't decide (they cover more than can really happen), a search tries real input sequences (the
//     inputs' ends, 0, the numbers the conditions compare with and just either side of them; small steps and long
//     waits for `after`) on the chart itself. A sequence that breaks a property is a counterexample: FALSIFIED, with the
//     steps to replay. Neither: "not decided", said plainly.
//
// Properties are conditions over the chart's outputs and own variables, `in(State)` (whether a state is active, also
// an outer or side-by-side one) and the inputs (anything in their ranges).

export type Iv = [number, number];
export type Verdict = 'proved' | 'falsified' | 'undecided';
export interface Step { inputs: Record<string, number>; t: number; state: string }
export interface Proof { text: string; verdict: Verdict; kind: 'always' | 'reach' | 'fire' | 'range'; trace?: Step[]; range?: Iv; name?: string }
export interface ProveResult { proofs: Proof[]; states: number; widened: boolean; tries: number }

const TOP: Iv = [-Infinity, Infinity];
export const join = (a: Iv, b: Iv): Iv => [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
const pt = (v: number): Iv => [v, v];
const B01: Iv = [0, 1], T: Iv = [1, 1], F: Iv = [0, 0];
const truth = (a: Iv): Iv => (a[0] > 0 || a[1] < 0 ? T : a[0] === 0 && a[1] === 0 ? F : B01);
export const mulIv = (a: Iv, b: Iv): Iv => { const p = [a[0] * b[0], a[0] * b[1], a[1] * b[0], a[1] * b[1]].map((x) => (Number.isNaN(x) ? 0 : x)); return [Math.min(...p), Math.max(...p)]; };
const mono = (f: (x: number) => number, a: Iv): Iv => [f(a[0]), f(a[1])];

/** An expression's range for any values in these ranges. */
export function ivOf(e: Expr, env: Record<string, Iv>): Iv {
  switch (e.k) {
    case 'num': return pt(e.v);
    case 'var': return env[e.name] ?? TOP;
    case 'un': { const a = ivOf(e.a, env); if (e.op === '-') return [-a[1], -a[0]]; const t = truth(a); return t === T ? F : t === F ? T : B01; }
    case 'call': {
      const a = e.args.map((x) => ivOf(x, env));
      switch (e.fn) {
        case 'abs': return a[0][0] >= 0 ? a[0] : a[0][1] <= 0 ? [-a[0][1], -a[0][0]] : [0, Math.max(-a[0][0], a[0][1])];
        case 'min': return [Math.min(a[0][0], a[1][0]), Math.min(a[0][1], a[1][1])];
        case 'max': return [Math.max(a[0][0], a[1][0]), Math.max(a[0][1], a[1][1])];
        case 'sqrt': return a[0][1] < 0 ? [NaN, NaN] : [Math.sqrt(Math.max(0, a[0][0])), Math.sqrt(a[0][1])];
        case 'exp': return mono(Math.exp, a[0]);
        case 'floor': return mono(Math.floor, a[0]);
        default: return a[0][1] - a[0][0] < Math.PI / 2 && Number.isFinite(a[0][0]) ? sampled(e.fn === 'sin' ? Math.sin : Math.cos, a[0]) : [-1, 1];
      }
    }
    case 'bin': {
      const a = ivOf(e.a, env), b = ivOf(e.b, env);
      switch (e.op) {
        case '+': return [a[0] + b[0], a[1] + b[1]];
        case '-': return [a[0] - b[1], a[1] - b[0]];
        case '*': return mulIv(a, b);
        case '/': return b[0] > 0 || b[1] < 0 ? mulIv(a, [1 / b[1], 1 / b[0]]) : TOP;
        case '^': return b[0] === b[1] && b[0] === 2 ? (a[0] >= 0 ? [a[0] ** 2, a[1] ** 2] : a[1] <= 0 ? [a[1] ** 2, a[0] ** 2] : [0, Math.max(a[0] ** 2, a[1] ** 2)]) : TOP;
        case '<': return a[1] < b[0] ? T : a[0] >= b[1] ? F : B01;
        case '<=': return a[1] <= b[0] ? T : a[0] > b[1] ? F : B01;
        case '>': return a[0] > b[1] ? T : a[1] <= b[0] ? F : B01;
        case '>=': return a[0] >= b[1] ? T : a[1] < b[0] ? F : B01;
        case '==': return a[0] === a[1] && b[0] === b[1] && a[0] === b[0] ? T : a[1] < b[0] || b[1] < a[0] ? F : B01;
        case '!=': { const q = ivOf({ ...e, op: '==' }, env); return q === T ? F : q === F ? T : B01; }
        case '&&': { const x = truth(a), y = truth(b); return x === F || y === F ? F : x === T && y === T ? T : B01; }
        case '||': { const x = truth(a), y = truth(b); return x === T || y === T ? T : x === F && y === F ? F : B01; }
      }
      return TOP;
    }
  }
}
/** sin or cos over a range shorter than a quarter turn: its ends and any turning point inside. */
function sampled(f: (x: number) => number, a: Iv): Iv {
  const xs = [a[0], a[1]];
  for (let k = Math.ceil(a[0] / (Math.PI / 2)); k * (Math.PI / 2) <= a[1]; k++) xs.push(k * (Math.PI / 2));
  const ys = xs.map(f);
  return [Math.min(...ys), Math.max(...ys)];
}

/** The ranges narrowed to where `e` is `want` (a variable compared with something; and, or, not). Null: impossible. */
function refine(e: Expr, env: Record<string, Iv>, want: boolean): Record<string, Iv> | null {
  const t = truth(ivOf(e, env));
  if (t === (want ? F : T)) return null;
  if (e.k === 'un' && e.op === '!') return refine(e.a, env, !want);
  if (e.k === 'bin' && (e.op === '&&' || e.op === '||')) {
    if ((e.op === '&&') === want) { const a = refine(e.a, env, want); return a && refine(e.b, a, want); }
    const a = refine(e.a, env, want), b = refine(e.b, env, want);
    if (!a) return b;
    if (!b) return a;
    return Object.fromEntries(Object.keys({ ...a, ...b }).map((k) => [k, join(a[k] ?? TOP, b[k] ?? TOP)]));
  }
  if (e.k === 'bin' && ['<', '<=', '>', '>=', '=='].includes(e.op)) {
    const flip: Record<string, string> = { '<': '>=', '<=': '>', '>': '<=', '>=': '<', '==': '==' };
    let op = want ? e.op : flip[e.op];
    if (!want && e.op === '==') return env; // "not equal" leaves an interval as it is
    const out = { ...env };
    const narrow = (name: string, o: string, other: Iv) => {
      const cur = out[name] ?? TOP;
      const next: Iv = o === '<' || o === '<=' ? [cur[0], Math.min(cur[1], other[1])] : o === '>' || o === '>=' ? [Math.max(cur[0], other[0]), cur[1]] : [Math.max(cur[0], other[0]), Math.min(cur[1], other[1])];
      out[name] = next;
      return next[0] <= next[1];
    };
    const swap: Record<string, string> = { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '==': '==' };
    if (e.a.k === 'var' && !narrow(e.a.name, op, ivOf(e.b, env))) return null;
    op = swap[op];
    if (e.b.k === 'var' && !narrow(e.b.name, op, ivOf(e.a, env))) return null;
    return out;
  }
  return env;
}

const runIv = (list: Assign[], env: Record<string, Iv>) => { const out = { ...env }; for (const a of list) out[a.name] = ivOf(a.e, out); return out; };

/** `in(State)` written as a name each flat state can answer. */
const IN = /\bin\s*\(\s*([A-Za-z_]\w*)\s*\)/g;
const inName = (s: string) => `__in_${s}`;
export function parseProperty(src: string): Expr { return parseExpr(src.replace(IN, (_, s: string) => inName(s))); }
const partsOf = (flatName: string) => new Set(flatName.split(/[.|\s]+/).filter(Boolean));

/** Every flat state's box: the ranges its variables can have there (null: never reached). */
export function boxes(ch: Chart, ranges: Record<string, Iv>, dtMin = 0) {
  const vars = [...ch.outputs, ...ch.locals], n = ch.states.length;
  const box: (Record<string, Iv> | null)[] = new Array(n).fill(null), grew = new Array<number>(n).fill(0);
  let widened = false;
  // The start as it really is (time 0): exact.
  const r0 = chartStart(ch, 0);
  box[0] = Object.fromEntries(vars.map((v) => [v, pt(r0.vars[v])]));
  const fire = ch.trans.map(() => false);
  const work = [0];
  const put = (s: number, b: Record<string, Iv>) => {
    const keep: Record<string, Iv> = Object.fromEntries(vars.map((v) => [v, b[v] ?? TOP]));
    const old = box[s];
    if (old && vars.every((v) => keep[v][0] >= old[v][0] && keep[v][1] <= old[v][1])) return;
    let next = old ? Object.fromEntries(vars.map((v) => [v, join(old[v], keep[v])])) as Record<string, Iv> : keep;
    if (old && ++grew[s] > 25) { widened = true; next = Object.fromEntries(vars.map((v) => [v, [next[v][0] < old[v][0] ? -Infinity : old[v][0], next[v][1] > old[v][1] ? Infinity : old[v][1]] as Iv])); }
    box[s] = next;
    if (!work.includes(s)) work.push(s);
  };
  let guard = 0;
  while (work.length && guard++ < 20_000) {
    const s = work.shift()!;
    const time: Iv = [dtMin, Infinity];
    let env: Record<string, Iv> | null = { ...box[s]!, ...Object.fromEntries(ch.inputs.map((x) => [x, ranges[x] ?? TOP])), t: time, time: [0, Infinity] };
    for (const p of partsOf(ch.states[s].name)) env[inName(p)] = T;
    for (let k = 0; k < ch.trans.length && env; k++) {
      const tr = ch.trans[k];
      if (tr.from !== s) continue;
      const yes = refine(tr.cond, env, true);
      if (yes) { fire[k] = true; put(tr.to, runIv([...ch.states[s].exit, ...tr.action, ...ch.states[tr.to].entry], { ...yes, t: pt(0) })); }
      // A transition with `after` might not have waited long enough, so the later ones stay possible.
      env = tr.after > 0 ? env : refine(tr.cond, env, false);
    }
    if (env) put(s, runIv(ch.states[s].during, env));
  }
  return { box, fire, widened };
}

/** Real runs of the chart: inputs from a few telling values, small steps and long waits. */
function search(ch: Chart, ranges: Record<string, Iv>, dt: number, goal: (vars: Record<string, number>, state: number, ins: Record<string, number>) => boolean, tries: number, seed: number): Step[] | null {
  const lits = new Set<number>([0]);
  const walk = (e: Expr) => { if (e.k === 'num') lits.add(e.v); else if (e.k === 'un') walk(e.a); else if (e.k === 'bin') { walk(e.a); walk(e.b); } else if (e.k === 'call') e.args.forEach(walk); };
  for (const tr of ch.trans) walk(tr.cond);
  const cands = Object.fromEntries(ch.inputs.map((x) => {
    const [lo, hi] = ranges[x] ?? TOP, vals = new Set<number>();
    for (const c of lits) for (const d of [0, 1e-3, -1e-3, 1, -1]) vals.add(c + d);
    vals.add(Number.isFinite(lo) ? lo : -1e3); vals.add(Number.isFinite(hi) ? hi : 1e3);
    return [x, [...vals].filter((v) => v >= lo && v <= hi)];
  }));
  const waits = [dt, dt, dt, Math.max(dt, ...ch.trans.map((tr) => tr.after)) + dt];
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  const pick = <X,>(a: X[]) => a[Math.floor(rnd() * a.length)];
  const r0 = chartStart(ch, 0);
  if (goal(r0.vars, 0, {})) return [{ inputs: {}, t: 0, state: ch.states[0].name }];
  for (let w = 0; w < tries; w++) {
    const r = chartStart(ch, 0), trace: Step[] = [];
    let t = 0, ins: Record<string, number> = {};
    for (let k = 0; k < 40; k++) {
      if (!k || rnd() < 0.5) ins = Object.fromEntries(ch.inputs.map((x) => [x, pick(cands[x])]));
      t += pick(waits);
      chartStep(ch, r, ins, t);
      trace.push({ inputs: { ...ins }, t: +t.toFixed(6), state: ch.states[r.active].name });
      if (goal(r.vars, r.active, ins)) return trace;
    }
  }
  return null;
}

/** Proves what can be proved about a chart: each state reached or never, each transition able to fire or dead, each
 * output's bounds, and the properties given (each must always hold). */
export function prove(ch: Chart, opts: { ranges?: Record<string, Iv>; props?: string[]; dt?: number; tries?: number; seed?: number } = {}): ProveResult {
  const ranges = opts.ranges ?? {}, dt = opts.dt ?? 0.01, tries = opts.tries ?? 400, seed = opts.seed ?? 7;
  const { box, fire, widened } = boxes(ch, ranges, dt);
  const proofs: Proof[] = [];
  let used = 0;
  const find = (goal: Parameters<typeof search>[3]) => { used += tries; return search(ch, ranges, dt, goal, tries, seed); };
  ch.states.forEach((st, i) => {
    if (!box[i]) { proofs.push({ kind: 'reach', name: st.name, text: `state ${st.name} can never be reached`, verdict: 'proved' }); return; }
    const trace = i === 0 ? [] : find((_, a) => a === i);
    proofs.push({ kind: 'reach', name: st.name, text: `state ${st.name} can be reached`, verdict: trace ? 'proved' : 'undecided', trace: trace ?? undefined });
  });
  ch.trans.forEach((tr, k) => {
    const what = `${ch.states[tr.from].name} → ${ch.states[tr.to].name}${tr.text ? ` [${tr.text}]` : ''}`;
    if (!fire[k]) proofs.push({ kind: 'fire', name: what, text: `${what} can never fire`, verdict: 'proved' });
  });
  for (const o of ch.outputs) {
    const r = box.reduce<Iv | null>((acc, b) => (b ? (acc ? join(acc, b[o]) : b[o]) : acc), null) ?? TOP;
    proofs.push({ kind: 'range', name: o, text: `${o} always stays within ${fmt(r[0])} … ${fmt(r[1])}`, verdict: Number.isFinite(r[0]) || Number.isFinite(r[1]) ? 'proved' : 'undecided', range: r });
  }
  for (const src of opts.props ?? []) {
    let e: Expr;
    try { e = parseProperty(src); } catch (err) { proofs.push({ kind: 'always', text: `${src}: ${(err as Error).message}`, verdict: 'undecided' }); continue; }
    // Over every reachable box, with the inputs anything in their ranges.
    const holds = box.every((b, i) => {
      if (!b) return true;
      const env: Record<string, Iv> = { ...b, ...Object.fromEntries(ch.inputs.map((x) => [x, ranges[x] ?? TOP])) };
      for (const st of ch.states) for (const p of partsOf(st.name)) env[inName(p)] = F;
      for (const p of partsOf(ch.states[i].name)) env[inName(p)] = T;
      return truth(ivOf(e, env)) === T;
    });
    if (holds) { proofs.push({ kind: 'always', text: `always ${src}`, verdict: 'proved' }); continue; }
    const trace = find((vars, a, ins) => {
      const env: Record<string, number> = { ...vars, ...ins };
      for (const st of ch.states) for (const p of partsOf(st.name)) env[inName(p)] = 0;
      for (const p of partsOf(ch.states[a].name)) env[inName(p)] = 1;
      return !evalExpr(e, env);
    });
    proofs.push({ kind: 'always', text: `always ${src}`, verdict: trace ? 'falsified' : 'undecided', trace: trace ?? undefined });
  }
  return { proofs, states: box.filter(Boolean).length, widened, tries: used };
}
const fmt = (v: number) => (v === Infinity ? '∞' : v === -Infinity ? '−∞' : String(+v.toPrecision(6)));
