// Hyperion Simulate → Blocks → state charts (M563, the owner's picture: "develop and verify state machines for
// supervisory control and error handling; use graphical animation to analyze and debug supervisory logic while it is
// executing"). A Chart block holds a small state machine written in plain lines:
//
//   inputs: level
//   outputs: pump, alarm
//   state Filling
//     entry: pump = 1; alarm = 0
//   state Draining
//     entry: pump = 0
//   Filling -> Draining: level >= 2
//   Draining -> Filling: level <= 1 after 0.5 / alarm = 0
//
// The first state is where it starts. At each time step the transitions out of the active state are tried in the
// order written; the first whose condition holds (and, with `after T`, once the state has been active T seconds) fires:
// the old state's exit actions, the transition's actions (after `/`), the new state's entry actions. Otherwise the
// state's `during` actions run. Names that are assigned but neither inputs nor outputs are the chart's own variables
// (starting at 0). Expressions: numbers, names, + − * / ^, comparisons, && || !, abs min max sqrt sin cos exp floor,
// and `t`, the seconds the state has been active. `state Machine history` (M574) remembers which of its inner states was
// active when it was left, and going back into Machine resumes that one (its own inside starts afresh unless it has
// `history` too, as Stateflow's history junction does); `state Machine history deep` (M575) resumes the whole inside,
// every level down. The same tree is what the code generators print (M565).

export type Expr =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'un'; op: '-' | '!'; a: Expr }
  | { k: 'bin'; op: string; a: Expr; b: Expr }
  | { k: 'call'; fn: string; args: Expr[] };
export interface Assign { name: string; e: Expr }
export interface ChartState { name: string; entry: Assign[]; during: Assign[]; exit: Assign[]; line: number }
export interface Transition { from: number; to: number; cond: Expr; after: number; action: Assign[]; line: number; text: string }
/** `init`: what runs when the chart starts (a flattened chart's whole chain of entries, M569; otherwise the first
 * state's entry). `parents`: for a chart with states inside states, each leaf's outer states, outermost first. */
export interface Chart {
  inputs: string[]; outputs: string[]; locals: string[]; states: ChartState[]; trans: Transition[]; init?: Assign[]; parents?: string[][];
  /** States with `history` (M574): they resume their last inner state. */
  history?: string[];
  /** States with `history deep` (M575): everything inside them resumes as it was (their inner states are in `history` too). */
  deep?: string[];
  /** Side-by-side (parallel, AND) states (M570): the chart as written, for drawing. `leaves`: its innermost states
   * (full names); `active[i]`: which of them flat state i has active; `leafParents`: each leaf's outer states;
   * `parallel`: the states whose inside runs side by side; `src`: its transitions between leaves (or outer states);
   * `parts[k]`: which of them flat transition k fired. */
  written?: { leaves: string[]; active: number[][]; leafParents: string[][]; parallel: string[]; src: { from: string; to: string; text: string }[]; parts: number[][] };
}

export const FUNCS: Record<string, { n: number; f: (...a: number[]) => number }> = {
  abs: { n: 1, f: Math.abs }, min: { n: 2, f: Math.min }, max: { n: 2, f: Math.max }, sqrt: { n: 1, f: Math.sqrt },
  sin: { n: 1, f: Math.sin }, cos: { n: 1, f: Math.cos }, exp: { n: 1, f: Math.exp }, floor: { n: 1, f: Math.floor },
};
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED = new Set(['t', 'time', 'in', 'parallel', 'history', 'state', 'inputs', 'outputs', 'after', 'entry', 'during', 'exit', ...Object.keys(FUNCS)]);

/** An expression read into a tree (precedence: || then && then comparisons then + − then * / then ^ then unary). */
export function parseExpr(src: string): Expr {
  const toks = src.match(/\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?|[A-Za-z_]\w*|&&|\|\||[<>=!~]=|[-+*/^()<>!,]|\S/gi) ?? [];
  let i = 0;
  const peek = () => toks[i], take = (t?: string) => { const x = toks[i++]; if (t && x !== t) throw new Error(`expected “${t}”${x ? ` before “${x}”` : ' at the end'}`); return x; };
  const bin = (next: () => Expr, ops: string[]) => () => {
    let a = next();
    while (ops.includes(peek())) { const op = take(); a = { k: 'bin', op: op === '~=' ? '!=' : op, a, b: next() }; }
    return a;
  };
  const unary = (): Expr => {
    if (peek() === '-' || peek() === '!' || peek() === '~') { const op = take() === '-' ? '-' : '!'; return { k: 'un', op, a: unary() }; }
    if (peek() === '+') { take(); return unary(); }
    return power();
  };
  const atom = (): Expr => {
    const x = take();
    if (x === undefined) throw new Error('something is missing at the end');
    if (x === '(') { const e = or(); take(')'); return e; }
    if (/^[\d.]/.test(x)) { const v = Number(x); if (!Number.isFinite(v)) throw new Error(`“${x}” isn’t a number`); return { k: 'num', v }; }
    if (/^true$/i.test(x)) return { k: 'num', v: 1 };
    if (/^false$/i.test(x)) return { k: 'num', v: 0 };
    if (NAME.test(x)) {
      if (peek() === '(') {
        const fn = FUNCS[x];
        if (!fn) throw new Error(`“${x}” isn’t a function here (${Object.keys(FUNCS).join(', ')})`);
        take('(');
        const args: Expr[] = [];
        if (peek() !== ')') { args.push(or()); while (peek() === ',') { take(); args.push(or()); } }
        take(')');
        if (args.length !== fn.n) throw new Error(`${x} takes ${fn.n} value${fn.n > 1 ? 's' : ''}`);
        return { k: 'call', fn: x, args };
      }
      return { k: 'var', name: x };
    }
    throw new Error(`“${x}” doesn’t belong there`);
  };
  const power = (): Expr => { const a = atom(); return peek() === '^' ? (take(), { k: 'bin', op: '^', a, b: unary() }) : a; };
  const mul = bin(unary, ['*', '/']), add = bin(mul, ['+', '-']), cmp = bin(add, ['<', '>', '<=', '>=', '==', '!=', '~=']), and = bin(cmp, ['&&']), or = bin(and, ['||']);
  if (!toks.length) throw new Error('an expression is empty');
  const e = or();
  if (i < toks.length) throw new Error(`“${toks[i]}” is left over`);
  return e;
}

/** The value of an expression with the names in `env`. */
export function evalExpr(e: Expr, env: Record<string, number>): number {
  switch (e.k) {
    case 'num': return e.v;
    case 'var': return env[e.name] ?? 0;
    case 'un': { const a = evalExpr(e.a, env); return e.op === '-' ? -a : a ? 0 : 1; }
    case 'call': return FUNCS[e.fn].f(...e.args.map((x) => evalExpr(x, env)));
    case 'bin': {
      const a = evalExpr(e.a, env), b = evalExpr(e.b, env);
      switch (e.op) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return a / b; case '^': return a ** b;
        case '<': return +(a < b); case '>': return +(a > b); case '<=': return +(a <= b); case '>=': return +(a >= b);
        case '==': return +(a === b); case '!=': return +(a !== b); case '&&': return +(!!a && !!b); case '||': return +(!!a || !!b);
      }
      return NaN;
    }
  }
}

const names = (e: Expr, out = new Set<string>()): Set<string> => {
  if (e.k === 'var') out.add(e.name);
  else if (e.k === 'un') names(e.a, out);
  else if (e.k === 'bin') { names(e.a, out); names(e.b, out); }
  else if (e.k === 'call') e.args.forEach((a) => names(a, out));
  return out;
};

const assigns = (src: string, line: number): Assign[] => src.split(';').map((s) => s.trim()).filter(Boolean).map((s) => {
  const m = /^([A-Za-z_]\w*)\s*=(?!=)\s*(.+)$/.exec(s);
  if (!m) throw new Error(`Line ${line}: “${s}” should be a name = a value.`);
  try { return { name: m[1], e: parseExpr(m[2]) }; } catch (err) { throw new Error(`Line ${line}: ${(err as Error).message}.`); }
});

/** A chart read from its text; errors name the line. */
export function parseChart(text: string): Chart {
  const inputs: string[] = [], outputs: string[] = [], states: ChartState[] = [], raw: { from: string; to: string; cond: Expr; after: number; action: Assign[]; line: number; text: string }[] = [];
  let cur: ChartState | null = null;
  const parentOf = new Map<string, string>(), parallel = new Set<string>(), history = new Set<string>(), deep = new Set<string>();
  text.split('\n').forEach((full, idx) => {
    const line = idx + 1, s = full.replace(/%.*$|\/\/.*$/, '').trim();
    if (!s) return;
    let m: RegExpExecArray | null;
    if ((m = /^(inputs|outputs)\s*:\s*(.*)$/i.exec(s))) {
      const list = m[2].split(',').map((x) => x.trim()).filter(Boolean);
      for (const n of list) if (!NAME.test(n) || RESERVED.has(n)) throw new Error(`Line ${line}: “${n}” can’t be a name here.`);
      (m[1].toLowerCase() === 'inputs' ? inputs : outputs).push(...list);
      cur = null;
    } else if ((m = /^state\s+([A-Za-z_]\w*)(?:\s+in\s+([A-Za-z_]\w*))?((?:\s+\(?(?:parallel|history|deep)\)?)*)\s*$/i.exec(s))) {
      if (states.some((st) => st.name === m![1])) throw new Error(`Line ${line}: there are two states called ${m[1]}.`);
      if (RESERVED.has(m[1])) throw new Error(`Line ${line}: “${m[1]}” can’t be a state's name.`);
      if (m[2] && !states.some((st) => st.name === m![2])) throw new Error(`Line ${line}: ${m[2]} has to come before the states inside it.`);
      cur = { name: m[1], entry: [], during: [], exit: [], line };
      states.push(cur);
      parentOf.set(m[1], m[2] ?? '');
      if (/parallel/i.test(m[3] ?? '')) parallel.add(m[1]);
      if (/history/i.test(m[3] ?? '')) history.add(m[1]);
      if (/deep/i.test(m[3] ?? '')) { if (!history.has(m[1])) throw new Error(`Line ${line}: “deep” goes with history: state ${m[1]} history deep.`); deep.add(m[1]); }
      if (parallel.has(m[1]) && history.has(m[1])) throw new Error(`Line ${line}: ${m[1]} runs its inside side by side, so all of it is always active: it has nothing to remember.`);
    } else if ((m = /^(entry|during|exit)\s*:\s*(.*)$/i.exec(s))) {
      if (!cur) throw new Error(`Line ${line}: ${m[1]} actions go under a “state” line.`);
      (cur as ChartState)[m[1].toLowerCase() as 'entry' | 'during' | 'exit'].push(...assigns(m[2], line));
    } else if ((m = /^([A-Za-z_]\w*)\s*->\s*([A-Za-z_]\w*)\s*(?::\s*(.*))?$/.exec(s))) {
      let rest = (m[3] ?? '').trim(), action: Assign[] = [], after = 0;
      const slash = rest.indexOf('/');
      if (slash >= 0) { action = assigns(rest.slice(slash + 1), line); rest = rest.slice(0, slash).trim(); }
      const a = /^(.*?)\s*\bafter\s+([\d.]+(?:e[+-]?\d+)?)\s*$/i.exec(rest);
      if (a) { after = Number(a[2]); rest = a[1].trim(); }
      let cond: Expr;
      try { cond = rest ? parseExpr(rest) : { k: 'num', v: 1 }; } catch (err) { throw new Error(`Line ${line}: ${(err as Error).message}.`); }
      raw.push({ from: m[1], to: m[2], cond, after, action, line, text: (m[3] ?? '').trim() });
      cur = null;
    } else throw new Error(`Line ${line}: “${s.slice(0, 40)}” isn’t a chart line (inputs:, outputs:, state Name [in Outer] [parallel | history [deep]], entry:, during:, exit:, or A -> B: condition).`);
  });
  if (!states.length) throw new Error('A chart needs at least one “state Name” line.');
  if (states.length > 30) throw new Error('A chart can have at most 30 states.');
  if (inputs.length > 6 || outputs.length > 6) throw new Error('A chart can have at most 6 inputs and 6 outputs.');
  const index = (n: string, line: number) => { const k = states.findIndex((st) => st.name === n); if (k < 0) throw new Error(`Line ${line}: there’s no state called ${n}.`); return k; };
  const trans = raw.map((r) => ({ ...r, from: index(r.from, r.line), to: index(r.to, r.line) }));
  // The chart's own variables: assigned, not an input or output. Inputs can't be assigned.
  const assigned = new Set<string>(), used = new Set<string>();
  for (const st of states) for (const a of [...st.entry, ...st.during, ...st.exit]) { assigned.add(a.name); names(a.e, used); }
  for (const tr of trans) { names(tr.cond, used); for (const a of tr.action) { assigned.add(a.name); names(a.e, used); } }
  for (const n of assigned) if (inputs.includes(n)) throw new Error(`The chart sets ${n}, but it’s an input.`);
  for (const n of assigned) if (n === 't' || FUNCS[n]) throw new Error(`“${n}” can’t be set.`);
  const locals = [...assigned].filter((n) => !outputs.includes(n));
  for (const n of used) if (n !== 't' && n !== 'time' && !inputs.includes(n) && !outputs.includes(n) && !locals.includes(n)) throw new Error(`The chart uses ${n}, but it’s not an input, an output or something it sets.`);
  const ch: Chart = { inputs, outputs, locals, states, trans };
  for (const st of parallel) if (![...parentOf.values()].includes(st)) throw new Error(`Line ${states.find((x) => x.name === st)!.line}: ${st} runs its inside side by side, but nothing is inside it.`);
  for (const st of history) if (![...parentOf.values()].includes(st)) throw new Error(`Line ${states.find((x) => x.name === st)!.line}: ${st} remembers its inner state, but nothing is inside it.`);
  // `history deep` (M575): every state inside that has states of its own remembers too, all the way down (a parallel
  // one has nothing to remember, its regions inside do), so coming back restores the whole inside as it was left.
  const inside = (anc: string, x: string): boolean => { for (let p = parentOf.get(x); p; p = parentOf.get(p)) if (p === anc) return true; return false; };
  for (const d of deep) for (const st of states) if (inside(d, st.name) && !parallel.has(st.name) && [...parentOf.values()].includes(st.name)) history.add(st.name);
  const flat = [...parentOf.values()].some(Boolean) ? flatten(ch, parentOf, parallel, history) : ch;
  return deep.size ? { ...flat, deep: [...deep] } : flat;
}

/** A chart's running state: the active state, when it was entered, every variable's value. */
/** `cond`: per transition, how often its condition was tried and found false, and true (decision coverage, M566). */
export interface ChartRun { active: number; since: number; vars: Record<string, number>; fired: number[]; visits: number[]; cond: [number, number][] }

const run = (list: Assign[], env: Record<string, number>) => { for (const a of list) env[a.name] = evalExpr(a.e, env); };

export function chartStart(ch: Chart, t = 0): ChartRun {
  const vars: Record<string, number> = {};
  for (const n of [...ch.outputs, ...ch.locals]) vars[n] = 0;
  const r: ChartRun = { active: 0, since: t, vars, fired: ch.trans.map(() => 0), visits: ch.states.map((_, i) => (i === 0 ? 1 : 0)), cond: ch.trans.map(() => [0, 0]) };
  r.vars = withT(ch, r, {}, t, (env) => run(ch.init ?? ch.states[0].entry, env));
  return r;
}
/** Runs `fn` with the inputs and t visible, then keeps only the chart's own names. */
function withT(ch: Chart, r: ChartRun, ins: Record<string, number>, t: number, fn: (env: Record<string, number>) => void) {
  const env: Record<string, number> = { ...r.vars, ...ins, t: t - r.since, time: t };
  fn(env);
  const out: Record<string, number> = {};
  for (const n of [...ch.outputs, ...ch.locals]) out[n] = env[n];
  return out;
}

/** One step at time t with these input values: a transition fires, or the state's during actions run. */
export function chartStep(ch: Chart, r: ChartRun, ins: Record<string, number>, t: number): number {
  let fired = -1;
  r.vars = withT(ch, r, ins, t, (env) => {
    for (let k = 0; k < ch.trans.length; k++) {
      const tr = ch.trans[k];
      if (tr.from !== r.active || t - r.since < tr.after - 1e-12) continue;
      const ok = !!evalExpr(tr.cond, env);
      r.cond[k][ok ? 1 : 0]++;
      if (!ok) continue;
      run(ch.states[r.active].exit, env);
      run(tr.action, env);
      env.t = 0;
      run(ch.states[tr.to].entry, env);
      fired = k;
      return;
    }
    run(ch.states[r.active].during, env);
  });
  if (fired >= 0) { r.active = ch.trans[fired].to; r.since = t; r.fired[fired]++; r.visits[r.active]++; }
  return fired;
}

// ——— States inside states (M569) ———

/** An expression with `t` (time in its own state) written for a flat chart: an outer state's t is the absolute time
 * since it was entered (`time − _since_X`), a state just entered has t = 0. */
function retime(e: Expr, t: Expr): Expr {
  switch (e.k) {
    case 'num': return e;
    case 'var': return e.name === 't' ? t : e;
    case 'un': return { ...e, a: retime(e.a, t) };
    case 'bin': return { ...e, a: retime(e.a, t), b: retime(e.b, t) };
    case 'call': return { ...e, args: e.args.map((a) => retime(a, t)) };
  }
}
const sinceOf = (name: string): Expr => ({ k: 'bin', op: '-', a: { k: 'var', name: 'time' }, b: { k: 'var', name: `_since_${name}` } });

/** Every name in `e` replaced by what `acts` (run in order) left in it: a condition tried after those actions, read
 * as one on the values before them. */
function subst(e: Expr, acts: Assign[]): Expr {
  if (!acts.length) return e;
  const now = new Map<string, Expr>();
  for (const a of acts) now.set(a.name, swap(a.e, now));
  return swap(e, now);
}
function swap(e: Expr, now: Map<string, Expr>): Expr {
  switch (e.k) {
    case 'num': return e;
    case 'var': return now.get(e.name) ?? e;
    case 'un': return { ...e, a: swap(e.a, now) };
    case 'bin': return { ...e, a: swap(e.a, now), b: swap(e.b, now) };
    case 'call': return { ...e, args: e.args.map((a) => swap(a, now)) };
  }
}
const TRUE: Expr = { k: 'num', v: 1 };
const isTrue = (e: Expr) => e.k === 'num' && e.v === 1;
const and = (a: Expr, b: Expr): Expr => (isTrue(a) ? b : isTrue(b) ? a : { k: 'bin', op: '&&', a, b });

/** One way a step can go: its condition (on the values at the step's start), the actions in order, whether a
 * transition fired, the states left (`exits`: the topmost one left, per transition) and the leaves entered. */
interface Outcome { guard: Expr; acts: Assign[]; fired: boolean; moves: { top: string; entered: string[] }[]; after: number; parts: number[] }

const MAX_FLAT = 64, MAX_TRANS = 600;

/** A chart with states inside states, and states whose inside runs side by side (`parallel`, M570), turned into a
 * flat one over its configurations (which innermost states are active together), so running, coverage, Verify and
 * the code generators need nothing new.
 *
 * At each step, from the outermost active state down: its transitions are tried in the order written (the first that
 * holds fires: exits from the active innermost states up to, not including, the deepest state holding both ends, the
 * transition's actions, entries down to the target's first inner state, and into every region of a parallel state on
 * the way); if none fires, its during actions run and then its inside takes its turn: the active inner state, or each
 * region of a parallel state in the order written, each region able to fire one transition per step and seeing what
 * the regions before it did. A transition can't go between two regions of the same parallel state. States inside a
 * parallel state, and outer states, keep when they were entered in hidden variables, for their `after` and `t`. */
function flatten(ch: Chart, parentOf: Map<string, string>, parallel: Set<string>, history: Set<string>): Chart {
  const byName = new Map(ch.states.map((st) => [st.name, st]));
  const path = (name: string): string[] => { const out: string[] = []; for (let x = name; x; x = parentOf.get(x) ?? '') out.unshift(x); return out; };
  const kidsOf = new Map<string, string[]>([['', []]]);
  for (const st of ch.states) { kidsOf.set(st.name, []); }
  for (const st of ch.states) kidsOf.get(parentOf.get(st.name) ?? '')!.push(st.name);
  const kids = (n: string) => kidsOf.get(n)!;
  const leaves = ch.states.filter((st) => !kids(st.name).length).map((st) => st.name);
  const under = (n: string, anc: string) => n === anc || path(n).includes(anc);
  const andAbove = (n: string) => path(n).slice(0, -1).some((x) => parallel.has(x));
  const timed = (n: string) => kids(n).length > 0 || andAbove(n);
  const own = (n: string): Expr => (timed(n) ? sinceOf(n) : { k: 'var', name: 't' });
  const at = (list: Assign[], t: Expr): Assign[] => list.map((a) => ({ name: a.name, e: retime(a.e, t) }));
  // A state with `history` (M574) keeps which of its inner states was active last in `_h_<name>` (0: the first, so a
  // first visit starts at the first inner state as usual); entering it without a path down resumes that one.
  const hist = (n: string) => `_h_${n}`;
  const entryOf = (n: string): Assign[] => {
    const up = parentOf.get(n) ?? '';
    return [
      ...(timed(n) ? [{ name: `_since_${n}`, e: { k: 'var', name: 'time' } as Expr }] : []),
      ...(history.has(up) ? [{ name: hist(up), e: { k: 'num', v: kids(up).indexOf(n) } as Expr }] : []),
      ...at(byName.get(n)!.entry, { k: 'num', v: 0 }),
    ];
  };

  /** The ways of entering `n` and, below it, `rest` (a path down) or its first inner states (every region of a parallel
   * one; the remembered one of a history state, one way per inner state, each with its condition on `_h_`). */
  type Entry = { guard: Expr; acts: Assign[]; got: string[] };
  const enterTo = (n: string, rest: string[]): Entry[] => {
    const mine = entryOf(n), k = kids(n);
    if (!k.length) return [{ guard: TRUE, acts: mine, got: [n] }];
    let subs: Entry[];
    if (parallel.has(n)) {
      subs = [{ guard: TRUE, acts: [], got: [] }];
      for (const r of k) {
        const e = enterTo(r, r === rest[0] ? rest.slice(1) : []);
        subs = subs.flatMap((a) => e.map((b) => ({ guard: and(a.guard, subst(b.guard, a.acts)), acts: [...a.acts, ...b.acts], got: [...a.got, ...b.got] })));
      }
    } else if (rest.length) subs = enterTo(rest[0], rest.slice(1));
    else if (history.has(n)) subs = k.flatMap((c, j) => enterTo(c, []).map((b) => ({ ...b, guard: and({ k: 'bin', op: '==', a: { k: 'var', name: hist(n) }, b: { k: 'num', v: j } }, b.guard) })));
    else subs = enterTo(k[0], []);
    return subs.map((b) => ({ ...b, guard: subst(b.guard, mine), acts: [...mine, ...b.acts] }));
  };
  /** Leaving `n` with these leaves active: innermost first (a parallel state's regions last to first), then n. */
  const exitOrder = (n: string, cfg: string[]): string[] => {
    const k = kids(n);
    if (!k.length) return [n];
    const inside = parallel.has(n) ? [...k].reverse() : k.filter((x) => cfg.some((l) => under(l, x)));
    return [...inside.flatMap((x) => exitOrder(x, cfg)), n];
  };
  // Where each transition starts its exits and entries (checked once: no transition between regions).
  const plan = ch.trans.map((tr) => {
    const src = ch.states[tr.from].name, dst = ch.states[tr.to].name, p = path(src), dp = path(dst);
    let common = 0;
    while (common < Math.min(p.length, dp.length) && p[common] === dp[common] && p[common] !== src && dp[common] !== dst) common++;
    const lca = common ? p[common - 1] : '';
    if (parallel.has(lca)) throw new Error(`Line ${tr.line}: ${src} and ${dst} run side by side inside ${lca}; a transition can’t go from one to the other.`);
    return { src, top: p[common], down: dp.slice(common) };
  });

  /** What the active state `n` can do this step (`cfg`: the active leaves), in the order they're tried; the last one
   * always holds. */
  const options = (n: string, cfg: string[]): Outcome[] => {
    const out: Outcome[] = [];
    ch.trans.forEach((tr, k) => {
      if (plan[k].src !== n) return;
      const exits = exitOrder(plan[k].top, cfg).flatMap((x) => at(byName.get(x)!.exit, own(x)));
      const flatAfter = !timed(n);
      const cond = retime(tr.cond, own(n)), before = [...exits, ...at(tr.action, own(n))];
      const guard = flatAfter || !tr.after ? cond : and({ k: 'bin', op: '>=', a: sinceOf(n), b: { k: 'num', v: tr.after - 1e-9 } }, cond);
      for (const ent of enterTo(plan[k].down[0], plan[k].down.slice(1))) {
        out.push({
          guard: and(guard, subst(ent.guard, before)),
          acts: [...before, ...ent.acts], fired: true, moves: [{ top: plan[k].top, entered: ent.got }], after: flatAfter ? tr.after : 0, parts: [k],
        });
      }
    });
    const during = at(byName.get(n)!.during, own(n)), k = kids(n);
    let inner: Outcome[];
    if (!k.length) inner = [{ guard: TRUE, acts: [], fired: false, moves: [], after: 0, parts: [] }];
    else if (!parallel.has(n)) inner = options(k.find((x) => cfg.some((l) => under(l, x)))!, cfg);
    else {
      // Regions in turn: each later region's options follow each earlier outcome that stayed inside its own region.
      inner = [{ guard: TRUE, acts: [], fired: false, moves: [], after: 0, parts: [] }];
      for (const r of k) {
        inner = inner.flatMap((o) => {
          if (o.moves.some((mv) => !k.some((x) => under(mv.top, x)))) return [o];
          return options(r, cfg).map((o2) => ({
            guard: and(o.guard, subst(o2.guard, o.acts)), acts: [...o.acts, ...o2.acts], fired: o.fired || o2.fired,
            moves: [...o.moves, ...o2.moves], after: Math.max(o.after, o2.after), parts: [...o.parts, ...o2.parts],
          }));
        });
        if (inner.length > MAX_TRANS) throw new Error(`The chart has too many ways to move at once (over ${MAX_TRANS}); split it into fewer side-by-side states.`);
      }
    }
    out.push(...inner.map((o) => ({ ...o, guard: subst(o.guard, during), acts: [...during, ...o.acts] })));
    return out;
  };

  const key = (cfg: string[]) => [...cfg].sort((a, b) => leaves.indexOf(a) - leaves.indexOf(b)).join('|');
  const apply = (cfg: string[], moves: Outcome['moves']) => {
    let c = cfg;
    for (const mv of moves) c = [...c.filter((l) => !under(l, mv.top)), ...mv.entered];
    return c.sort((a, b) => leaves.indexOf(a) - leaves.indexOf(b));
  };
  // At the start every `_h_` is 0: the way in whose condition holds then.
  const begin = enterTo(kids('')[0], []).find((e) => !!evalExpr(e.guard, { time: 0 }))!;
  const initActs = begin.acts, start = begin.got;
  // Without parallel states every leaf is a flat state (in the order written, the starting one first), so Verify
  // still sees a state nothing leads to; with them, only the combinations that can be reached.
  const cfgs: string[][] = parallel.size ? [apply(start, [])] : [start, ...leaves.filter((l) => l !== start[0]).map((l) => [l])];
  const index = new Map(cfgs.map((c, i) => [key(c), i]));
  const states: ChartState[] = [], trans: Transition[] = [], parts: number[][] = [];
  for (let i = 0; i < cfgs.length; i++) {
    const cfg = cfgs[i], outs = options(kids('').find((x) => cfg.some((l) => under(l, x)))!, cfg);
    const rest = outs.filter((o) => !o.fired);
    states.push({ name: cfg.map((l) => path(l).join('.')).join(' | '), entry: [], exit: [], line: byName.get(cfg[0])!.line, during: rest[0]?.acts ?? [] });
    for (const o of outs) {
      if (!o.fired) continue;
      const next = apply(cfg, o.moves), kk = key(next);
      if (!index.has(kk)) {
        if (cfgs.length >= MAX_FLAT) throw new Error(`The chart has more than ${MAX_FLAT} combinations of active states; split it into fewer side-by-side states.`);
        index.set(kk, cfgs.length); cfgs.push(next);
      }
      const first = ch.trans[o.parts[0]], text = o.parts.map((k) => { const tr = ch.trans[k], src = plan[k].src; return cfg.includes(src) || o.parts.length > 1 ? tr.text : `${tr.text} (from ${src})`; }).join(' + ');
      trans.push({ from: i, to: index.get(kk)!, cond: o.guard, after: o.after, action: o.acts, line: first.line, text: o.parts.length === 1 && !cfg.includes(plan[o.parts[0]].src) ? `${first.text} (from ${plan[o.parts[0]].src})` : text });
      parts.push(o.parts);
      if (trans.length > MAX_TRANS) throw new Error(`The chart has too many ways to move (over ${MAX_TRANS}); split it into fewer side-by-side states.`);
    }
  }
  const hidden = [...ch.states.filter((st) => timed(st.name)).map((st) => `_since_${st.name}`), ...[...history].map(hist)];
  const flat: Chart = { ...ch, states, trans, locals: [...ch.locals, ...hidden], init: initActs, ...(history.size ? { history: [...history] } : {}) };
  if (!parallel.size) return { ...flat, parents: cfgs.map((c) => path(c[0]).slice(0, -1)) };
  return {
    ...flat,
    written: {
      leaves: leaves.map((l) => path(l).join('.')), active: cfgs.map((c) => c.map((l) => leaves.indexOf(l))), leafParents: leaves.map((l) => path(l).slice(0, -1)),
      parallel: [...parallel], src: ch.trans.map((tr, k) => ({ from: plan[k].src, to: ch.states[tr.to].name, text: tr.text })), parts,
    },
  };
}
