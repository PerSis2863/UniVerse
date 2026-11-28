import type { E, Ir } from './blockir';
import { cNum, initLines, roles, steps, type CodeFile, type Stmt } from './blockcode';

// Hyperion Simulate → Blocks → Code → Ladder Diagram (M571, the owner's left-out of M565: "Ladder Diagram, the
// graphical PLC language"). The same step as every other language (blockcode.ts `steps`), lowered to IEC 61131-3
// rungs: contacts in series (AND) and in parallel branches (OR) driving a coil, or a function box (ADD, MUL, GT, SEL,
// MOVE…) with its EN input on the rung. Arithmetic is broken into one box per operation into temporaries (t1, t2… LREAL;
// b1… BOOL; i1… DINT); a comparison is a box writing a BOOL, then a contact on it. An if / case becomes guard coils
// (g1, g2…) worked out before any of its actions run, and every action's box has its guard's contact in front.
//
// Two files: model_ladder.txt (the rungs drawn in text, to read) and model.xml (PLCopen TC6 XML 2.01, the exchange
// format CODESYS, TwinCAT, B&R, Siemens TIA's Openness and others import), a FUNCTION_BLOCK whose body is LD.
// `runLadder` steps the rungs themselves; the tests hold it against `emulate`.

/** A rung's left side: a contact on a BOOL (`neg`: normally closed), contacts in series, branches in parallel, or none. */
export type Net = { k: 'c'; v: string; neg?: boolean } | { k: 's'; a: Net[] } | { k: 'p'; a: Net[] } | { k: 'on' };
/** A box's operands: a name or a literal. */
export type Out = { k: 'coil'; v: string } | { k: 'box'; op: string; ins: string[]; out: string };
export interface Rung { net: Net; out: Out; note?: string }
export interface Ladder { rungs: Rung[]; vars: { name: string; type: 'LREAL' | 'BOOL' | 'DINT'; role: 'in' | 'out' | 'keep' | 'temp'; init?: string }[]; bufs: { name: string; n: number; init: number }[]; dt: number; init: Rung[] }

const BOOL_OPS: Record<string, string> = { '<': 'LT', '>': 'GT', '<=': 'LE', '>=': 'GE', '==': 'EQ', '!=': 'NE' };
const NUM_OPS: Record<string, string> = { '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '^': 'EXPT' };
const ON: Net = { k: 'on' };
const series = (...a: Net[]): Net => { const x = a.filter((n) => n.k !== 'on').flatMap((n) => (n.k === 's' ? n.a : [n])); return !x.length ? ON : x.length === 1 ? x[0] : { k: 's', a: x }; };

/** The step as rungs. */
export function lowerLadder(ir: Ir): Ladder {
  const r = roles(ir), rungs: Rung[] = [], init: Rung[] = [];
  const vars: Ladder['vars'] = [];
  const typeOf = (k: string) => (k === 'int' ? 'DINT' : 'LREAL') as 'DINT' | 'LREAL';
  for (const [name, k] of r) if (k !== 'buf') vars.push({ name, type: typeOf(k), role: k === 'in' ? 'in' : k === 'out' ? 'out' : 'keep' });
  vars.push({ name: 'started', type: 'BOOL', role: 'keep', init: 'FALSE' }, { name: 'first', type: 'BOOL', role: 'temp' });
  const count = { t: 0, b: 0, i: 0, g: 0 };
  const temp = (kind: 't' | 'b' | 'i' | 'g') => { const name = `${kind}${++count[kind]}`; vars.push({ name, type: kind === 't' ? 'LREAL' : kind === 'i' ? 'DINT' : 'BOOL', role: 'temp' }); return name; };
  let into = rungs;
  const box = (op: string, ins: string[], kind: 't' | 'b' | 'i' = 't') => { const out = temp(kind); into.push({ net: ON, out: { k: 'box', op, ins, out } }); return out; };
  const lit = (v: number) => (v < 0 ? `-${cNum(-v)}` : cNum(v));
  const ref = (name: string) => (name === 'DT' ? 'DT' : name);

  /** A number's operand: a name, a literal, or a temporary its boxes leave it in. */
  const num = (e: E): string => {
    switch (e.k) {
      case 'num': return lit(e.v);
      case 'var': return ref(e.name);
      case 'sel': return box('SEL', [coilOf(bool(e.c)), num(e.b), num(e.a)]);
      case 'un': return e.op === '-' ? box('SUB', ['0.0', num(e.a)]) : box('SEL', [coilOf(bool(e)), '0.0', '1.0']);
      case 'bin': {
        if (NUM_OPS[e.op]) return box(NUM_OPS[e.op], [num(e.a), num(e.b)]);
        return box('SEL', [coilOf(bool(e)), '0.0', '1.0']);
      }
      case 'call': {
        const a = e.args.map(num);
        if (e.fn === 'fmod') return box('SUB', [a[0], box('MUL', [a[1], box('DINT_TO_LREAL', [box('TRUNC', [box('DIV', [a[0], a[1]])], 'i')])])]);
        if (e.fn === 'floor') { const tr = box('DINT_TO_LREAL', [box('TRUNC', [a[0]], 'i')]); return box('SUB', [tr, box('SEL', [box('LT', [a[0], tr], 'b'), '0.0', '1.0'])]); }
        return box(e.fn.toUpperCase(), a);
      }
    }
  };
  /** A condition as contacts (comparisons first worked out by boxes into BOOLs). */
  const bool = (e: E, neg = false): Net => {
    if (e.k === 'un' && e.op === '!') return bool(e.a, !neg);
    if (e.k === 'bin' && (e.op === '&&' || e.op === '||')) {
      const parts = [bool(e.a, neg), bool(e.b, neg)];
      // De Morgan: NOT (a AND b) = NOT a OR NOT b.
      return (e.op === '&&') !== neg ? series(...parts) : { k: 'p', a: parts.flatMap((n) => (n.k === 'p' ? n.a : [n])) };
    }
    if (e.k === 'bin' && BOOL_OPS[e.op]) return { k: 'c', v: box(BOOL_OPS[e.op], [num(e.a), num(e.b)], 'b'), neg };
    if (e.k === 'num') return e.v !== 0 !== neg ? ON : { k: 'c', v: 'FALSE' };
    return { k: 'c', v: box('NE', [num(e), '0.0'], 'b'), neg };
  };
  /** A network's value kept in a BOOL (for a SEL's selector). */
  const coilOf = (n: Net): string => {
    if (n.k === 'c' && !n.neg) return n.v;
    const b = temp('b');
    into.push({ net: n, out: { k: 'coil', v: b } });
    return b;
  };
  const guarded = (g: Net, name: string, e: E) => {
    const v = num(e), int = r.get(name) === 'int';
    into.push({ net: g, out: { k: 'box', op: int ? 'LREAL_TO_DINT' : 'MOVE', ins: [v], out: name } });
  };
  const lower = (list: Stmt[], g: Net) => {
    for (const s of list) {
      if (s.k === 'set') guarded(g, s.name, s.e);
      else if (s.k === 'read') into.push({ net: g, out: { k: 'box', op: 'MOVE', ins: [`${s.buf}[${s.buf}_k]`], out: s.name } });
      else if (s.k === 'write') {
        into.push({ net: g, out: { k: 'box', op: 'MOVE', ins: [num(s.e)], out: `${s.buf}[${s.buf}_k]` } });
        const up = box('ADD', [`${s.buf}_k`, '1'], 'i');
        into.push({ net: g, out: { k: 'box', op: 'MOD', ins: [up, String(s.n)], out: `${s.buf}_k` } });
      } else {
        // Every arm's guard first (before any arm's actions can change what the later ones read), then the actions.
        const conds: E[] = s.k === 'if' ? s.arms.map((a) => a.c) : s.arms.map((a) => ({ k: 'bin', op: '==', a: { k: 'var', name: s.name }, b: { k: 'num', v: a.v } }));
        const bodies = s.k === 'if' ? [...s.arms.map((a) => a.body), s.other] : s.arms.map((a) => a.body);
        const guards: string[] = [];
        conds.forEach((c, i) => {
          const gv = temp('g');
          into.push({ net: series(g, ...guards.map((x): Net => ({ k: 'c', v: x, neg: true })), bool(c)), out: { k: 'coil', v: gv }, note: i ? undefined : (s.k === 'case' ? `which state ${s.name} is in` : 'which way the if goes') });
          guards.push(gv);
        });
        if (s.k === 'if' && s.other.length) {
          const gv = temp('g');
          into.push({ net: series(g, ...guards.map((x): Net => ({ k: 'c', v: x, neg: true }))), out: { k: 'coil', v: gv } });
          guards.push(gv);
        }
        bodies.forEach((b, i) => { if (b.length && guards[i]) lower(b, { k: 'c', v: guards[i] }); });
      }
    }
  };
  // The first call sets everything up (as the Structured Text's `IF NOT started`).
  into = init;
  init.push({ net: { k: 'c', v: 'started', neg: true }, out: { k: 'coil', v: 'first' }, note: 'the first call sets everything up' });
  for (const [name, e] of initLines(ir)) guarded({ k: 'c', v: 'first' }, name, e);
  init.push({ net: { k: 'c', v: 'first' }, out: { k: 'box', op: 'MOVE', ins: ['TRUE'], out: 'started' } });
  into = rungs;
  lower(steps(ir), ON);
  return { rungs, init, vars, bufs: ir.delays.map((d) => ({ name: d.buf, n: d.n, init: d.init })), dt: ir.dt };
}

// ——— Running the rungs (for the tests, and as the meaning the files carry) ———

const BOX: Record<string, (a: number[]) => number> = {
  ADD: (a) => a[0] + a[1], SUB: (a) => a[0] - a[1], MUL: (a) => a[0] * a[1], DIV: (a) => a[0] / a[1], EXPT: (a) => a[0] ** a[1], MOD: (a) => a[0] % a[1],
  LT: (a) => +(a[0] < a[1]), GT: (a) => +(a[0] > a[1]), LE: (a) => +(a[0] <= a[1]), GE: (a) => +(a[0] >= a[1]), EQ: (a) => +(a[0] === a[1]), NE: (a) => +(a[0] !== a[1]),
  SEL: (a) => (a[0] ? a[2] : a[1]), MOVE: (a) => a[0], TRUNC: (a) => Math.trunc(a[0]), DINT_TO_LREAL: (a) => a[0], LREAL_TO_DINT: (a) => Math.round(a[0]),
  ABS: (a) => Math.abs(a[0]), SQRT: (a) => Math.sqrt(a[0]), SIN: (a) => Math.sin(a[0]), COS: (a) => Math.cos(a[0]), EXP: (a) => Math.exp(a[0]), MIN: (a) => Math.min(a[0], a[1]), MAX: (a) => Math.max(a[0], a[1]),
};
/** Runs the ladder `steps` times with these inputs; each output's values, step by step. */
export function runLadder(ld: Ladder, inputs: Record<string, number>, count: number): Record<string, number[]> {
  const env: Record<string, number> = { TRUE: 1, FALSE: 0, DT: ld.dt, ...inputs };
  for (const v of ld.vars) if (!(v.name in env)) env[v.name] = 0;
  for (const b of ld.bufs) for (let i = 0; i < b.n; i++) env[`${b.name}[${i}]`] = b.init;
  const at = (x: string) => { const m = /^(\w+)\[(\w+)\]$/.exec(x); return m ? `${m[1]}[${env[m[2]]}]` : x; };
  const val = (x: string) => (/^-?[\d.]/.test(x) ? Number(x) : env[at(x)] ?? 0);
  const power = (n: Net): boolean => (n.k === 'on' ? true : n.k === 'c' ? !!val(n.v) !== !!n.neg : n.k === 's' ? n.a.every(power) : n.a.some(power));
  const rung = (r: Rung) => {
    const p = power(r.net);
    if (r.out.k === 'coil') env[r.out.v] = +p;
    else if (p) env[at(r.out.out)] = BOX[r.out.op](r.out.ins.map(val));
  };
  const outs = ld.vars.filter((v) => v.role === 'out'), res: Record<string, number[]> = Object.fromEntries(outs.map((v) => [v.name, []]));
  for (let k = 0; k < count; k++) {
    ld.init.forEach(rung);
    ld.rungs.forEach(rung);
    for (const v of outs) res[v.name].push(env[v.name]);
  }
  return res;
}

// ——— Drawn in text ———

/** A network drawn as rows of text, all one width; row 0 carries the rung's wire. */
function draw(n: Net): string[] {
  if (n.k === 'on') return ['--'];
  if (n.k === 'c') return [`--[${n.neg ? '/' : ' '}${n.v} ]--`];
  if (n.k === 's') {
    const parts = n.a.map(draw), h = Math.max(...parts.map((p) => p.length));
    return Array.from({ length: h }, (_, row) => parts.map((p) => p[row] ?? ' '.repeat(p[0].length)).join(''));
  }
  const parts = n.a.map(draw), w = Math.max(...parts.map((p) => p[0].length)), out: string[] = [];
  parts.forEach((p, i) => p.forEach((line, row) => {
    const fill = row === 0 ? '-' : ' ', last = i === parts.length - 1, edge = row === 0 ? '+' : last ? ' ' : '|';
    out.push(`${edge}${line.padEnd(w, fill)}${edge}`);
  }));
  return out;
}
const outText = (o: Out) => (o.k === 'coil' ? `( ${o.v} )` : `[ ${o.out} := ${o.op}(${o.ins.join(', ')}) ]`);

function ladderText(ld: Ladder, model: string): string {
  const lines = [
    `(* ${model}_ladder.txt: made by Hyperion from a block diagram. IEC 61131-3 Ladder Diagram, drawn in text.`,
    `   --[ x ]-- a contact (closed when x is TRUE), --[/x ]-- normally closed, branches between + are in parallel (OR),`,
    `   ( x ) a coil, [ y := OP(a, b) ] a function box run when its rung has power. Call it once every ${ld.dt} s.`,
    `   ${model}.xml holds the same rungs in PLCopen XML to import into a PLC tool. *)`, '',
  ];
  let k = 0;
  for (const r of [...ld.init, ...ld.rungs]) {
    k++;
    if (r.note) lines.push(`(* ${r.note} *)`);
    const rows = draw(r.net), head = `${String(k).padStart(4)} |`;
    rows.forEach((row, i) => lines.push(`${i ? '     |' : head}${row}${i ? '' : `--${outText(r.out)}`}`));
  }
  return lines.join('\n') + '\n';
}

// ——— PLCopen TC6 XML 2.01 ———

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ARGS: Record<string, string[]> = { SEL: ['G', 'IN0', 'IN1'], MOVE: ['IN'], TRUNC: ['IN'], DINT_TO_LREAL: ['IN'], LREAL_TO_DINT: ['IN'], ABS: ['IN'], SQRT: ['IN'], SIN: ['IN'], COS: ['IN'], EXP: ['IN'] };

function ladderXml(ld: Ladder, model: string): string {
  let id = 0;
  const body: string[] = [], next = () => ++id;
  const pos = (x: number, y: number) => `<position x="${x}" y="${y}"/>`;
  const conn = (from: number[]) => `<connectionPointIn>${from.map((f) => `<connection refLocalId="${f}"/>`).join('')}</connectionPointIn>`;
  let y = 20;
  for (const r of [...ld.init, ...ld.rungs]) {
    const left = next();
    body.push(`<leftPowerRail localId="${left}" height="40" width="10">${pos(10, y)}<connectionPointOut formalParameter=""/></leftPowerRail>`);
    let x = 60;
    /** Lays a network out after the elements `from`; gives the elements its right side leaves from. */
    const net = (n: Net, from: number[]): number[] => {
      if (n.k === 'on') return from;
      if (n.k === 'c') {
        const c = next();
        body.push(`<contact localId="${c}" height="20" width="30" negated="${n.neg ? 'true' : 'false'}">${pos(x, y)}${conn(from)}<connectionPointOut/><variable>${xml(n.v)}</variable></contact>`);
        x += 50;
        return [c];
      }
      if (n.k === 's') return n.a.reduce((f, part) => net(part, f), from);
      const x0 = x, ends: number[] = [];
      let xm = x0;
      for (const part of n.a) { x = x0; ends.push(...net(part, from)); xm = Math.max(xm, x); y += 30; }
      x = xm;
      return ends;
    };
    const ends = net(r.net, [left]);
    if (r.out.k === 'coil') {
      const c = next(), right = next();
      body.push(`<coil localId="${c}" height="20" width="30">${pos(x, y)}${conn(ends)}<connectionPointOut/><variable>${xml(r.out.v)}</variable></coil>`);
      body.push(`<rightPowerRail localId="${right}" height="40" width="10">${pos(x + 60, y)}${conn([c])}</rightPowerRail>`);
    } else {
      const names = ARGS[r.out.op] ?? r.out.ins.map((_, i) => `IN${i + 1}`), b = next(), ins = r.out.ins.map(() => next()), out = next();
      r.out.ins.forEach((v, i) => body.push(`<inVariable localId="${ins[i]}" height="20" width="60">${pos(x, y + 30 + i * 25)}<connectionPointOut/><expression>${xml(v)}</expression></inVariable>`));
      body.push(`<block localId="${b}" typeName="${r.out.op}" height="${40 + 25 * names.length}" width="80">${pos(x + 80, y)}<inputVariables><variable formalParameter="EN">${conn(ends)}</variable>${names.map((nm, i) => `<variable formalParameter="${nm}">${conn([ins[i]])}</variable>`).join('')}</inputVariables><inOutVariables/><outputVariables><variable formalParameter="ENO"><connectionPointOut/></variable><variable formalParameter="OUT"><connectionPointOut/></variable></outputVariables></block>`);
      body.push(`<outVariable localId="${out}" height="20" width="60">${pos(x + 200, y + 30)}<connectionPointIn><connection refLocalId="${b}" formalParameter="OUT"/></connectionPointIn><expression>${xml(r.out.out)}</expression></outVariable>`);
      y += 25 * names.length;
    }
    y += 70;
  }
  const decl = (role: string) => ld.vars.filter((v) => v.role === role).map((v) => `<variable name="${v.name}"><type><${v.type}/></type>${v.init ? `<initialValue><simpleValue value="${v.init}"/></initialValue>` : ''}</variable>`).join('');
  const bufs = ld.bufs.map((b) => `<variable name="${b.name}"><type><array><dimension lower="0" upper="${b.n - 1}"/><baseType><LREAL/></baseType></array></type><initialValue><arrayValue><value repetitionValue="${b.n}"><simpleValue value="${cNum(b.init)}"/></value></arrayValue></initialValue></variable>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- ${model}.xml: made by Hyperion from a block diagram. PLCopen TC6 XML 2.01: a FUNCTION_BLOCK in Ladder Diagram.
     Import it into a PLC tool, then call ${model} once every ${ld.dt} s from a cyclic task. -->
<project xmlns="http://www.plcopen.org/xml/tc6_0201">
  <fileHeader companyName="Hyperion" productName="${model}" productVersion="1" creationDateTime="2026-01-01T00:00:00"/>
  <contentHeader name="${model}"><coordinateInfo><fbd><scaling x="1" y="1"/></fbd><ld><scaling x="1" y="1"/></ld><sfc><scaling x="1" y="1"/></sfc></coordinateInfo></contentHeader>
  <types><dataTypes/><pous>
    <pou name="${model}" pouType="functionBlock">
      <interface>
        <inputVars>${decl('in')}</inputVars>
        <outputVars>${decl('out')}</outputVars>
        <localVars>${decl('keep')}${bufs}${decl('temp')}</localVars>
        <localVars constant="true"><variable name="DT"><type><LREAL/></type><initialValue><simpleValue value="${cNum(ld.dt)}"/></initialValue></variable></localVars>
      </interface>
      <body><LD>
${body.map((l) => `        ${l}`).join('\n')}
      </LD></body>
    </pou>
  </pous></types>
  <instances><configurations/></instances>
</project>
`;
}

export function genLadder(ir: Ir, model: string): CodeFile[] {
  const ld = lowerLadder(ir);
  return [{ name: `${model}_ladder.txt`, text: ladderText(ld, model) }, { name: `${model}.xml`, text: ladderXml(ld, model) }];
}
