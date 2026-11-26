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
// and `t`, the seconds the state has been active. The same tree is what the code generators print (M565).

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
export interface Chart { inputs: string[]; outputs: string[]; locals: string[]; states: ChartState[]; trans: Transition[]; init?: Assign[]; parents?: string[][] }

export const FUNCS: Record<string, { n: number; f: (...a: number[]) => number }> = {
  abs: { n: 1, f: Math.abs }, min: { n: 2, f: Math.min }, max: { n: 2, f: Math.max }, sqrt: { n: 1, f: Math.sqrt },
  sin: { n: 1, f: Math.sin }, cos: { n: 1, f: Math.cos }, exp: { n: 1, f: Math.exp }, floor: { n: 1, f: Math.floor },
};
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED = new Set(['t', 'time', 'in', 'state', 'inputs', 'outputs', 'after', 'entry', 'during', 'exit', ...Object.keys(FUNCS)]);

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
  const parentOf = new Map<string, string>();
  text.split('\n').forEach((full, idx) => {
    const line = idx + 1, s = full.replace(/%.*$|\/\/.*$/, '').trim();
    if (!s) return;
    let m: RegExpExecArray | null;
    if ((m = /^(inputs|outputs)\s*:\s*(.*)$/i.exec(s))) {
      const list = m[2].split(',').map((x) => x.trim()).filter(Boolean);
      for (const n of list) if (!NAME.test(n) || RESERVED.has(n)) throw new Error(`Line ${line}: “${n}” can’t be a name here.`);
      (m[1].toLowerCase() === 'inputs' ? inputs : outputs).push(...list);
      cur = null;
    } else if ((m = /^state\s+([A-Za-z_]\w*)(?:\s+in\s+([A-Za-z_]\w*))?\s*$/i.exec(s))) {
      if (states.some((st) => st.name === m![1])) throw new Error(`Line ${line}: there are two states called ${m[1]}.`);
      if (RESERVED.has(m[1])) throw new Error(`Line ${line}: “${m[1]}” can’t be a state's name.`);
      if (m[2] && !states.some((st) => st.name === m![2])) throw new Error(`Line ${line}: ${m[2]} has to come before the states inside it.`);
      cur = { name: m[1], entry: [], during: [], exit: [], line };
      states.push(cur);
      parentOf.set(m[1], m[2] ?? '');
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
    } else throw new Error(`Line ${line}: “${s.slice(0, 40)}” isn’t a chart line (inputs:, outputs:, state Name [in Outer], entry:, during:, exit:, or A -> B: condition).`);
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
  return [...parentOf.values()].some(Boolean) ? flatten(ch, parentOf) : ch;
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

/** A chart with states inside states turned into a flat one over its innermost states, so running, coverage and the
 * code generators need nothing new. Entering an outer state enters its first inner state (and so on down); its
 * transitions are tried before an inner state's (outermost first) and leave whichever inner state is active; its
 * during actions run before the inner state's. A transition exits from the active innermost state up to (not
 * including) the deepest state holding both ends, then enters down to the target's first innermost state. Outer
 * states keep when they were entered in a hidden variable, for their `after` and `t`. */
function flatten(ch: Chart, parentOf: Map<string, string>): Chart {
  const byName = new Map(ch.states.map((st) => [st.name, st]));
  const path = (name: string): string[] => { const out: string[] = []; for (let x = name; x; x = parentOf.get(x) ?? '') out.unshift(x); return out; };
  const kids = (name: string) => ch.states.filter((st) => parentOf.get(st.name) === name).map((st) => st.name);
  const leafOf = (name: string): string => { const k = kids(name); return k.length ? leafOf(k[0]) : name; };
  const leaves = ch.states.filter((st) => !kids(st.name).length).map((st) => st.name);
  const outer = (name: string) => kids(name).length > 0;
  const at = (list: Assign[], t: Expr): Assign[] => list.map((a) => ({ name: a.name, e: retime(a.e, t) }));
  const own = (name: string, leaf: string): Expr => (name === leaf ? { k: 'var', name: 't' } : sinceOf(name));
  /** Entering `names` in order (outermost first): the outer ones note the time, every entry action with t = 0. */
  const enter = (names: string[]): Assign[] => names.flatMap((x) => [...(outer(x) ? [{ name: `_since_${x}`, e: { k: 'var', name: 'time' } as Expr }] : []), ...at(byName.get(x)!.entry, { k: 'num', v: 0 })]);
  const downTo = (target: string) => { const leaf = leafOf(target), p = path(leaf); return p.slice(p.indexOf(target)); };
  const trans: Transition[] = [];
  const states: ChartState[] = leaves.map((leaf) => {
    const p = path(leaf);
    return { name: p.join('.'), entry: [], exit: [], line: byName.get(leaf)!.line, during: p.flatMap((x) => at(byName.get(x)!.during, own(x, leaf))) };
  });
  leaves.forEach((leaf, li) => {
    const p = path(leaf);
    for (const src of p) for (const tr of ch.trans) {
      if (ch.states[tr.from].name !== src) continue;
      const dst = ch.states[tr.to].name, dp = path(dst);
      // The deepest state holding both ends (a transition to itself, or into or out of its own inside, leaves it too).
      let common = 0;
      while (common < Math.min(p.indexOf(src) + 1, dp.length) && p[common] === dp[common] && p[common] !== src && dp[common] !== dst) common++;
      const exits = p.slice(common).reverse(), entries = [...dp.slice(common), ...downTo(dst).slice(1)];
      const t = own(src, leaf), afterHere = src === leaf;
      trans.push({
        from: li, to: leaves.indexOf(leafOf(dst)), line: tr.line, text: src === leaf ? tr.text : `${tr.text} (from ${src})`,
        after: afterHere ? tr.after : 0,
        cond: afterHere || !tr.after ? retime(tr.cond, t) : { k: 'bin', op: '&&', a: { k: 'bin', op: '>=', a: sinceOf(src), b: { k: 'num', v: tr.after - 1e-9 } }, b: retime(tr.cond, t) },
        action: [...exits.flatMap((x) => at(byName.get(x)!.exit, own(x, leaf))), ...at(tr.action, t), ...enter(entries)],
      });
    }
  });
  const hidden = ch.states.filter((st) => outer(st.name)).map((st) => `_since_${st.name}`);
  return { ...ch, states, trans, locals: [...ch.locals, ...hidden], init: enter(downTo(ch.states.find((st) => !parentOf.get(st.name))!.name)), parents: leaves.map((leaf) => path(leaf).slice(0, -1)) };
}
