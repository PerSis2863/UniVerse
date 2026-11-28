// Hyperion Simulate → Blocks → Chart (M568; the left-out of M565/M567: "supervisory mode logic"): a state chart as a
// block. Written fresh, as plain text a person types:
//
//   state Off = 0
//   state Heat = 1
//   Off -> Heat when u1 < 19
//   Heat -> Off when u1 > 21 or after(600)
//
// The first state is where it starts; the block's output is the active state's value. At each time step the active
// state's transitions are tried in the order written and the first one whose condition holds is taken (one a step).
// Conditions: numbers, u1…u4 (the inputs), t (time), after(s) (seconds in this state), abs / min / max, + − * /,
// < <= > >= == ~= !=, and / && , or / ||, not / ! / ~, brackets. chartToC writes the same chart as C99 for a
// microcontroller (no memory allocated, one step function).

export class ChartError extends Error {}

type Node =
  | { k: 'num'; v: number } | { k: 'in'; i: number } | { k: 't' } | { k: 'after'; a: Node }
  | { k: 'fn'; f: 'abs' | 'min' | 'max'; a: Node[] } | { k: 'neg' | 'not'; a: Node } | { k: 'bin'; op: string; a: Node; b: Node };
export interface ChartState { name: string; value: number }
export interface Transition { from: number; to: number; cond: Node; text: string }
export interface Chart { states: ChartState[]; trans: Transition[]; inputs: number }

const MAX_STATES = 24, MAX_TRANS = 64;

function parseCond(src: string, line: number): { node: Node; inputs: number } {
  const toks = src.match(/\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?|[A-Za-z_]\w*|<=|>=|==|~=|!=|&&|\|\||[-+*/()<>!~,]|\S/gi) ?? [];
  let p = 0, inputs = 0;
  const fail = (why: string): never => { throw new ChartError(`Line ${line}: ${why}`); };
  const peek = () => toks[p]?.toLowerCase();
  const eat = (t: string) => { if (peek() !== t) fail(`expected “${t}”${toks[p] ? ` before “${toks[p]}”` : ' at the end'}.`); p++; };
  const or = (): Node => { let a = and(); while (peek() === 'or' || peek() === '||') { p++; a = { k: 'bin', op: '||', a, b: and() }; } return a; };
  const and = (): Node => { let a = not(); while (peek() === 'and' || peek() === '&&') { p++; a = { k: 'bin', op: '&&', a, b: not() }; } return a; };
  const not = (): Node => { if (peek() === 'not' || peek() === '!' || peek() === '~') { p++; return { k: 'not', a: not() }; } return cmp(); };
  const cmp = (): Node => {
    const a = add(), op = peek();
    if (op && ['<', '<=', '>', '>=', '==', '~=', '!='].includes(op)) { p++; return { k: 'bin', op: op === '~=' ? '!=' : op, a, b: add() }; }
    return a;
  };
  const add = (): Node => { let a = mul(); while (peek() === '+' || peek() === '-') { const op = toks[p++]; a = { k: 'bin', op, a, b: mul() }; } return a; };
  const mul = (): Node => { let a = unary(); while (peek() === '*' || peek() === '/') { const op = toks[p++]; a = { k: 'bin', op, a, b: unary() }; } return a; };
  const unary = (): Node => (peek() === '-' ? (p++, { k: 'neg', a: unary() }) : peek() === '+' ? (p++, unary()) : atom());
  const atom = (): Node => {
    const t = toks[p], l = peek();
    if (t === undefined) return fail('the condition ends too soon.');
    p++;
    if (/^[\d.]/.test(t)) { const v = Number(t); if (!Number.isFinite(v)) fail(`“${t}” isn't a number.`); return { k: 'num', v }; }
    if (t === '(') { const a = or(); eat(')'); return a; }
    const u = /^u([1-4])$/i.exec(t);
    if (u) { inputs = Math.max(inputs, Number(u[1])); return { k: 'in', i: Number(u[1]) - 1 }; }
    if (l === 't') return { k: 't' };
    if (l === 'true' || l === 'false') return { k: 'num', v: l === 'true' ? 1 : 0 };
    if (l === 'after') { eat('('); const a = or(); eat(')'); return { k: 'after', a }; }
    if (l === 'abs' || l === 'min' || l === 'max') {
      eat('(');
      const args = [or()];
      while (peek() === ',') { p++; args.push(or()); }
      eat(')');
      if ((l === 'abs') !== (args.length === 1) || args.length > 2) fail(`${l} takes ${l === 'abs' ? 'one value' : 'two values'}.`);
      return { k: 'fn', f: l, a: args };
    }
    return fail(`“${t}” isn't known: use u1…u4, t, after(seconds), numbers, and, or, not.`);
  };
  const node = or();
  if (p < toks.length) fail(`“${toks[p]}” is left over.`);
  return { node, inputs };
}

/** Reads a chart's text; a mistake is a ChartError naming its line. */
export function parseChart(text: string): Chart {
  const states: ChartState[] = [], pending: { from: string; to: string; cond: string; line: number }[] = [];
  let inputs = 1;
  text.replace(/\r/g, '').split('\n').forEach((raw, i) => {
    const l = raw.replace(/%.*$|\/\/.*$/, '').trim(), line = i + 1;
    if (!l) return;
    const s = /^state\s+([A-Za-z_]\w*)\s*(?:=\s*(\S+))?$/i.exec(l);
    if (s) {
      if (states.some((x) => x.name.toLowerCase() === s[1].toLowerCase())) throw new ChartError(`Line ${line}: there is already a state called ${s[1]}.`);
      const v = s[2] === undefined ? states.length : Number(s[2]);
      if (!Number.isFinite(v)) throw new ChartError(`Line ${line}: a state's value is a number (state ${s[1]} = 1).`);
      states.push({ name: s[1], value: v });
      return;
    }
    const t = /^([A-Za-z_]\w*)\s*->\s*([A-Za-z_]\w*)\s*(?:(?:when|if|:)\s*(.+))?$/i.exec(l);
    if (t) { pending.push({ from: t[1], to: t[2], cond: t[3] ?? 'true', line }); return; }
    throw new ChartError(`Line ${line}: write “state Name = value” or “From -> To when condition”.`);
  });
  if (!states.length) throw new ChartError('A chart needs at least one state: state Off = 0.');
  if (states.length > MAX_STATES) throw new ChartError(`A chart can have at most ${MAX_STATES} states.`);
  if (pending.length > MAX_TRANS) throw new ChartError(`A chart can have at most ${MAX_TRANS} transitions.`);
  const idx = (name: string, line: number) => {
    const k = states.findIndex((x) => x.name.toLowerCase() === name.toLowerCase());
    if (k < 0) throw new ChartError(`Line ${line}: there's no state called ${name}.`);
    return k;
  };
  const trans = pending.map((q) => { const c = parseCond(q.cond, q.line); inputs = Math.max(inputs, c.inputs); return { from: idx(q.from, q.line), to: idx(q.to, q.line), cond: c.node, text: q.cond }; });
  return { states, trans, inputs };
}

function evaluate(n: Node, u: ArrayLike<number>, t: number, inState: number): number {
  switch (n.k) {
    case 'num': return n.v;
    case 'in': return u[n.i] ?? 0;
    case 't': return t;
    case 'after': return inState >= evaluate(n.a, u, t, inState) - 1e-9 ? 1 : 0;
    case 'neg': return -evaluate(n.a, u, t, inState);
    case 'not': return evaluate(n.a, u, t, inState) ? 0 : 1;
    case 'fn': { const a = n.a.map((x) => evaluate(x, u, t, inState)); return n.f === 'abs' ? Math.abs(a[0]) : n.f === 'min' ? Math.min(a[0], a[1]) : Math.max(a[0], a[1]); }
    case 'bin': {
      const a = evaluate(n.a, u, t, inState);
      if (n.op === '&&') return a && evaluate(n.b, u, t, inState) ? 1 : 0;
      if (n.op === '||') return a || evaluate(n.b, u, t, inState) ? 1 : 0;
      const b = evaluate(n.b, u, t, inState);
      switch (n.op) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return a / b;
        case '<': return +(a < b); case '<=': return +(a <= b); case '>': return +(a > b); case '>=': return +(a >= b);
        case '==': return +(a === b); default: return +(a !== b);
      }
    }
  }
}

export interface ChartRun { active: number; since: number }
export const chartStart = (): ChartRun => ({ active: 0, since: 0 });

/** One step at time t with inputs u: the first transition out of the active state that holds is taken. */
export function chartStep(c: Chart, run: ChartRun, t: number, u: ArrayLike<number>): ChartRun {
  for (const tr of c.trans) if (tr.from === run.active && evaluate(tr.cond, u, t, t - run.since)) return { active: tr.to, since: t };
  return run;
}

const cNum = (v: number) => { const s = String(v); return /[.e]/.test(s) ? s : `${s}.0`; };
function toC(n: Node): string {
  switch (n.k) {
    case 'num': return cNum(n.v);
    case 'in': return `u[${n.i}]`;
    case 't': return 's->t';
    case 'after': return `(s->timer >= ${toC(n.a)} - 1e-9)`;
    case 'neg': return `(-${toC(n.a)})`;
    case 'not': return `(!${toC(n.a)})`;
    case 'fn': return n.f === 'abs' ? `fabs(${toC(n.a[0])})` : `${n.f === 'min' ? 'fmin' : 'fmax'}(${toC(n.a[0])}, ${toC(n.a[1])})`;
    case 'bin': return `(${toC(n.a)} ${n.op} ${toC(n.b)})`;
  }
}

/** The chart as C99: name_init(&s) once, then y = name_step(&s, dt, u) every sample period. */
export function chartToC(c: Chart, rawName = 'chart'): string {
  const name = (rawName.replace(/\W/g, '_').replace(/^(\d)/, '_$1') || 'chart').toLowerCase(), up = name.toUpperCase();
  const st = (k: number) => `${up}_${c.states[k].name.toUpperCase()}`;
  const out: string[] = [
    `/* ${name}: a state chart from Hyperion Simulate → Blocks. Plain C99, no memory allocated. */`,
    '#include <math.h>', '',
    `typedef enum { ${c.states.map((_, k) => st(k)).join(', ')} } ${name}_mode;`,
    `typedef struct { ${name}_mode mode; double timer; double t; } ${name}_state;`, '',
    `static const double ${name}_value[${c.states.length}] = { ${c.states.map((s) => cNum(s.value)).join(', ')} };`, '',
    `void ${name}_init(${name}_state *s) { s->mode = ${st(0)}; s->timer = 0.0; s->t = 0.0; }`, '',
    `/* u: the ${c.inputs} input${c.inputs > 1 ? 's' : ''} (u[0] is u1). Returns the active state's value. */`,
    `double ${name}_step(${name}_state *s, double dt, const double u[${c.inputs}]) {`,
    `  ${name}_mode next = s->mode;`,
    '  switch (s->mode) {',
  ];
  c.states.forEach((_, k) => {
    const mine = c.trans.filter((tr) => tr.from === k);
    if (!mine.length) return;
    out.push(`  case ${st(k)}:`);
    mine.forEach((tr, j) => out.push(`    ${j ? 'else ' : ''}if (${toC(tr.cond)}) next = ${st(tr.to)};`));
    out.push('    break;');
  });
  out.push('  default: break;', '  }',
    '  if (next != s->mode) { s->mode = next; s->timer = 0.0; }',
    `  s->t += dt; s->timer += dt;`,
    `  return ${name}_value[s->mode];`, '}');
  return out.join('\n');
}

export const CHART_EXAMPLE = `state Off = 0
state Heat = 1
state Rest = 0
Off -> Heat when u1 < 19
Heat -> Rest when u1 > 21
Rest -> Off when after(20)`;
