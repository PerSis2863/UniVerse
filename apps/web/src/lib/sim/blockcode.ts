import type { Diagram } from './blocks';
import { buildIr, chartAssigns, chartExpr, type E, type Ir } from './blockir';

// Hyperion Simulate → Blocks → Code (M565, the owner's picture: "automatically generating optimized C, C++,
// IEC 61131-3 Structured Text, … Verilog, or VHDL code directly from … Simulink"). Every language prints the same
// step (blockir.ts): the block outputs in order, the outputs, the derivatives, the states moved by dt, the charts, t.
// C and C++ and Structured Text compute in 64-bit floating point; Verilog and VHDL in signed 32-bit fixed point with
// 16 fraction bits (Q15.16: about ±32,768 with steps of 1/65,536), where sin, cos, exp, sqrt, floor and dividing by
// a signal have no meaning and are refused by name. Each comes with a small program (C, C++) or test bench (Verilog,
// VHDL) that runs it and prints the outputs; tests compile and run those and hold them against `emulate`.

export type Lang = 'c' | 'cpp' | 'st' | 'verilog' | 'vhdl';
export const LANGS: { id: Lang; name: string }[] = [{ id: 'c', name: 'C' }, { id: 'cpp', name: 'C++' }, { id: 'st', name: 'Structured Text (IEC 61131-3)' }, { id: 'verilog', name: 'Verilog' }, { id: 'vhdl', name: 'VHDL' }];
export interface CodeFile { name: string; text: string }

type Stmt = { k: 'set'; name: string; e: E } | { k: 'read'; name: string; buf: string } | { k: 'write'; buf: string; n: number; e: E } | { k: 'if'; arms: { c: E; body: Stmt[] }[]; other: Stmt[] } | { k: 'case'; name: string; arms: { v: number; body: Stmt[] }[] };
const V = (name: string): E => ({ k: 'var', name }), N = (v: number): E => ({ k: 'num', v });

/** The step as statements, the same for every language. */
function steps(ir: Ir): Stmt[] {
  const out: Stmt[] = [];
  for (const s of ir.signals) out.push(s.read ? { k: 'read', name: s.name, buf: s.read } : { k: 'set', name: s.name, e: s.e });
  for (const o of ir.outputs) out.push({ k: 'set', name: o.name, e: o.e });
  for (const d of ir.delays) out.push({ k: 'write', buf: d.buf, n: d.n, e: d.input });
  for (const s of ir.states) out.push({ k: 'set', name: `d_${s.name}`, e: s.d });
  for (const s of ir.states) out.push({ k: 'set', name: s.name, e: { k: 'bin', op: '+', a: V(s.name), b: { k: 'bin', op: '*', a: V('DT'), b: V(`d_${s.name}`) } } });
  for (const c of ir.charts) {
    c.ch.inputs.forEach((x, i) => out.push({ k: 'set', name: `${c.name}_${x}`, e: c.ins[i] }));
    const set = (list: { name: string; e: E }[]): Stmt[] => list.map((a) => ({ k: 'set', name: a.name, e: a.e }));
    out.push({
      k: 'case', name: `${c.name}_state`, arms: c.ch.states.map((st, i) => ({
        v: i,
        body: [{
          k: 'if',
          arms: c.ch.trans.filter((tr) => tr.from === i).map((tr) => ({
            c: tr.after > 0 ? { k: 'bin', op: '&&', a: { k: 'bin', op: '>=', a: { k: 'bin', op: '-', a: V('t'), b: V(`${c.name}_since`) }, b: N(tr.after - 1e-9) }, b: chartExpr(c, tr.cond) } : chartExpr(c, tr.cond),
            body: [...set(chartAssigns(c, st.exit)), ...set(chartAssigns(c, tr.action)), { k: 'set', name: `${c.name}_state`, e: N(tr.to) }, { k: 'set', name: `${c.name}_since`, e: V('t') }, ...set(chartAssigns(c, c.ch.states[tr.to].entry))],
          })),
          other: set(chartAssigns(c, st.during)),
        }],
      })),
    });
  }
  out.push({ k: 'set', name: 't', e: { k: 'bin', op: '+', a: V('t'), b: V('DT') } });
  return out;
}

/** What each name is: an input, an output, kept from step to step, or worked out each step. */
function roles(ir: Ir) {
  const r = new Map<string, 'in' | 'out' | 'keep' | 'local' | 'int' | 'buf'>();
  for (const i of ir.inputs) r.set(i.name, 'in');
  for (const o of ir.outputs) r.set(o.name, 'out');
  for (const s of ir.signals) r.set(s.name, 'local');
  for (const s of ir.states) { r.set(s.name, 'keep'); r.set(`d_${s.name}`, 'local'); }
  r.set('t', 'keep');
  for (const d of ir.delays) { r.set(d.buf, 'buf'); r.set(`${d.buf}_k`, 'int'); }
  for (const c of ir.charts) { for (const x of [...c.vars, ...c.ch.inputs]) r.set(`${c.name}_${x}`, 'keep'); r.set(`${c.name}_since`, 'keep'); r.set(`${c.name}_state`, 'int'); }
  return r;
}
/** Statements printed with a language's own pieces. */
function printStmts(list: Stmt[], ind: string, p: { set: (name: string, e: E) => string; if: (c: E) => string; elif: (c: E) => string; else: string; endif: string; caseOpen: (n: string) => string; arm: (v: number) => string; armEnd: string; caseEnd: string; caseOther?: string; read: (name: string, buf: string) => string; write: (buf: string, n: number, e: E) => string }): string[] {
  const out: string[] = [];
  for (const s of list) {
    if (s.k === 'set') out.push(`${ind}${p.set(s.name, s.e)}`);
    else if (s.k === 'read') out.push(`${ind}${p.read(s.name, s.buf)}`);
    else if (s.k === 'write') out.push(...p.write(s.buf, s.n, s.e).split('\n').map((l) => `${ind}${l}`));
    else if (s.k === 'if') {
      if (!s.arms.length) { out.push(...printStmts(s.other, ind, p)); continue; }
      s.arms.forEach((a, i) => { out.push(`${ind}${i ? p.elif(a.c) : p.if(a.c)}`); out.push(...printStmts(a.body, `${ind}  `, p)); });
      if (s.other.length) { out.push(`${ind}${p.else}`); out.push(...printStmts(s.other, `${ind}  `, p)); }
      out.push(`${ind}${p.endif}`);
    } else {
      out.push(`${ind}${p.caseOpen(s.name)}`);
      for (const a of s.arms) { out.push(`${ind}  ${p.arm(a.v)}`); out.push(...printStmts(a.body, `${ind}    `, p)); if (p.armEnd) out.push(`${ind}    ${p.armEnd}`); }
      if (p.caseOther) out.push(`${ind}  ${p.caseOther}`);
      out.push(`${ind}${p.caseEnd}`);
    }
  }
  return out;
}

// ——— C and C++ (doubles) ———

const cNum = (v: number) => { const s = String(v); return /[.eE]/.test(s) || !Number.isFinite(v) ? (Number.isFinite(v) ? s : v > 0 ? 'HUGE_VAL' : '-HUGE_VAL') : `${s}.0`; };
function cExpr(e: E, ref: (n: string) => string): string {
  const r = (x: E) => cExpr(x, ref);
  switch (e.k) {
    case 'num': return e.v < 0 ? `(${cNum(e.v)})` : cNum(e.v);
    case 'var': return ref(e.name);
    case 'sel': return `(${r(e.c)} ? ${r(e.a)} : ${r(e.b)})`;
    case 'un': return e.op === '-' ? `(-${r(e.a)})` : `(!${r(e.a)})`;
    case 'bin': return e.op === '^' ? `pow(${r(e.a)}, ${r(e.b)})` : `(${r(e.a)} ${e.op} ${r(e.b)})`;
    case 'call': return `${({ min: 'fmin', max: 'fmax', abs: 'fabs' } as Record<string, string>)[e.fn] ?? e.fn}(${e.args.map(r).join(', ')})`;
  }
}
const cPieces = (ref: (n: string) => string) => ({
  set: (name: string, e: E) => `${ref(name)} = ${cExpr(e, ref)};`, if: (c: E) => `if (${cExpr(c, ref)}) {`, elif: (c: E) => `} else if (${cExpr(c, ref)}) {`, else: '} else {', endif: '}',
  caseOpen: (n: string) => `switch (${ref(n)}) {`, arm: (v: number) => `case ${v}:`, armEnd: 'break;', caseEnd: '}',
  read: (name: string, buf: string) => `${ref(name)} = ${ref(buf)}[${ref(`${buf}_k`)}];`,
  write: (buf: string, n: number, e: E) => `${ref(buf)}[${ref(`${buf}_k`)}] = ${cExpr(e, ref)};\n${ref(`${buf}_k`)} = (${ref(`${buf}_k`)} + 1) % ${n};`,
});

function genC(ir: Ir, model: string): CodeFile[] {
  const r = roles(ir), keeps = [...r].filter(([, k]) => k === 'keep' || k === 'int'), locals = [...r].filter(([, k]) => k === 'local').map(([nm]) => nm);
  const ref = (nm: string) => (nm === 'DT' ? `${model.toUpperCase()}_DT` : ({ in: `in->${nm}`, out: `out->${nm}`, keep: `s->${nm}`, int: `s->${nm}`, buf: `s->${nm}` } as Record<string, string>)[r.get(nm) ?? ''] ?? nm);
  const p = cPieces(ref), init = [...initLines(ir).map(([nm, e]) => `  ${ref(nm)} = ${cExpr(e, ref)};`), ...ir.delays.map((d) => `  for (int i = 0; i < ${d.n}; i++) s->${d.buf}[i] = ${cNum(d.init)};`)];
  const h = `/* ${model}.h: made by Hyperion from a block diagram. One call of ${model}_step is one step of ${ir.dt} s. */
#ifndef ${model.toUpperCase()}_H
#define ${model.toUpperCase()}_H

#define ${model.toUpperCase()}_DT ${cNum(ir.dt)}

typedef struct {
${ir.inputs.map((i) => `  double ${i.name};`).join('\n') || '  char unused; /* this model has no inputs */'}
} ${model}_In;
typedef struct {
${ir.outputs.map((o) => `  double ${o.name};`).join('\n')}
} ${model}_Out;
typedef struct {
${keeps.map(([nm, k]) => `  ${k === 'int' ? 'int' : 'double'} ${nm};`).join('\n')}
${ir.delays.map((d) => `  double ${d.buf}[${d.n}];`).join('\n')}
} ${model}_State;

void ${model}_init(${model}_State *s);
void ${model}_step(${model}_State *s, const ${model}_In *in, ${model}_Out *out);

#endif
`;
  const c = `/* ${model}.c: made by Hyperion from a block diagram (fixed step ${ir.dt} s, forward Euler). */
#include <math.h>
#include "${model}.h"

void ${model}_init(${model}_State *s) {
${init.join('\n')}
}

void ${model}_step(${model}_State *s, const ${model}_In *in, ${model}_Out *out) {
${locals.length ? `  double ${locals.join(', ')};\n` : ''}${ir.inputs.length ? '' : '  (void)in;\n'}${printStmts(steps(ir), '  ', p).join('\n')}
}
`;
  const main = `/* main.c: runs ${model} for N steps (default 1000) and prints the outputs, one line a step. */
#include <stdio.h>
#include <stdlib.h>
#include "${model}.h"

int main(int argc, char **argv) {
  int n = argc > 1 ? atoi(argv[1]) : 1000;
  ${model}_State s; ${model}_In in = {0}; ${model}_Out out;
${ir.inputs.map((i) => `  in.${i.name} = ${cNum(i.test)};`).join('\n')}
  ${model}_init(&s);
  for (int k = 0; k < n; k++) {
    ${model}_step(&s, &in, &out);
    printf("${ir.outputs.map(() => '%.17g').join(' ')}\\n", ${ir.outputs.map((o) => `out.${o.name}`).join(', ')});
  }
  return 0;
}
`;
  return [{ name: `${model}.h`, text: h }, { name: `${model}.c`, text: c }, { name: 'main.c', text: main }];
}

function genCpp(ir: Ir, model: string): CodeFile[] {
  const r = roles(ir), keeps = [...r].filter(([, k]) => k === 'keep' || k === 'int'), locals = [...r].filter(([, k]) => k === 'local').map(([nm]) => nm);
  const cls = model[0].toUpperCase() + model.slice(1), ref = (nm: string) => (nm === 'DT' ? 'kDt' : nm);
  const p = cPieces(ref);
  const hpp = `// ${model}.hpp: made by Hyperion from a block diagram. Set the inputs, call step(), read the outputs.
#pragma once
#include <cmath>

class ${cls} {
 public:
  static constexpr double kDt = ${cNum(ir.dt)};  // seconds a step
${ir.inputs.map((i) => `  double ${i.name} = ${cNum(i.test)};  // input`).join('\n')}
${ir.outputs.map((o) => `  double ${o.name} = 0.0;  // output`).join('\n')}

  ${cls}() { reset(); }
  void reset() {
${initLines(ir).map(([nm, e]) => `    ${nm} = ${cExpr(e, ref)};`).join('\n')}
${ir.delays.map((d) => `    for (int i = 0; i < ${d.n}; i++) ${d.buf}[i] = ${cNum(d.init)};`).join('\n')}
  }
  void step() {
${locals.length ? `    double ${locals.join(', ')};\n` : ''}${printStmts(steps(ir), '    ', p).join('\n')}
  }

 private:
${keeps.map(([nm, k]) => `  ${k === 'int' ? 'int' : 'double'} ${nm} = 0;`).join('\n')}
${ir.delays.map((d) => `  double ${d.buf}[${d.n}] = {};`).join('\n')}
};
`;
  const main = `// main.cpp: runs ${cls} for N steps (default 1000) and prints the outputs.
#include <cstdio>
#include <cstdlib>
#include "${model}.hpp"

int main(int argc, char **argv) {
  int n = argc > 1 ? std::atoi(argv[1]) : 1000;
  ${cls} m;
  for (int k = 0; k < n; k++) {
    m.step();
    std::printf("${ir.outputs.map(() => '%.17g').join(' ')}\\n", ${ir.outputs.map((o) => `m.${o.name}`).join(', ')});
  }
  return 0;
}
`;
  return [{ name: `${model}.hpp`, text: hpp }, { name: 'main.cpp', text: main }];
}

/** What every kept name starts at: states, the charts' first entry actions. */
function initLines(ir: Ir): [string, E][] {
  const out: [string, E][] = [['t', N(0)], ...ir.delays.map((d): [string, E] => [`${d.buf}_k`, N(0)])];
  for (const s of ir.states) out.push([s.name, N(s.init)]);
  for (const c of ir.charts) {
    for (const x of [...c.vars, ...c.ch.inputs]) out.push([`${c.name}_${x}`, N(0)]);
    out.push([`${c.name}_state`, N(0)], [`${c.name}_since`, N(0)]);
    for (const a of chartAssigns(c, c.ch.states[0].entry)) out.push([a.name, a.e]);
  }
  return out;
}

// ——— Structured Text (LREAL, BOOL where the language needs one) ———

type Typed = [string, 'n' | 'b'];
function stExpr(e: E): Typed {
  const num = (x: E) => { const [s, t] = stExpr(x); return t === 'n' ? s : `SEL(${s}, 0.0, 1.0)`; };
  const bool = (x: E) => { const [s, t] = stExpr(x); return t === 'b' ? s : `(${s} <> 0.0)`; };
  switch (e.k) {
    case 'num': return [e.v < 0 ? `(${cNum(e.v)})` : cNum(e.v), 'n'];
    case 'var': return [e.name === 'DT' ? 'DT' : e.name, 'n'];
    case 'sel': return [`SEL(${bool(e.c)}, ${num(e.b)}, ${num(e.a)})`, 'n'];
    case 'un': return e.op === '-' ? [`(-${num(e.a)})`, 'n'] : [`(NOT ${bool(e.a)})`, 'b'];
    case 'bin': {
      if (e.op === '&&' || e.op === '||') return [`(${bool(e.a)} ${e.op === '&&' ? 'AND' : 'OR'} ${bool(e.b)})`, 'b'];
      if (['<', '>', '<=', '>=', '==', '!='].includes(e.op)) return [`(${num(e.a)} ${({ '==': '=', '!=': '<>' } as Record<string, string>)[e.op] ?? e.op} ${num(e.b)})`, 'b'];
      if (e.op === '^') return [`EXPT(${num(e.a)}, ${num(e.b)})`, 'n'];
      return [`(${num(e.a)} ${e.op} ${num(e.b)})`, 'n'];
    }
    case 'call': {
      const a = e.args.map(num);
      if (e.fn === 'fmod') return [`(${a[0]} - ${a[1]} * DINT_TO_LREAL(TRUNC(${a[0]} / ${a[1]})))`, 'n'];
      if (e.fn === 'floor') return [`(DINT_TO_LREAL(TRUNC(${a[0]})) - SEL(${a[0]} < DINT_TO_LREAL(TRUNC(${a[0]})), 0.0, 1.0))`, 'n'];
      return [`${e.fn.toUpperCase()}(${a.join(', ')})`, 'n'];
    }
  }
}
function genSt(ir: Ir, model: string): CodeFile[] {
  const r = roles(ir), num = (e: E) => { const [s, t] = stExpr(e); return t === 'n' ? s : `SEL(${s}, 0.0, 1.0)`; }, bool = (e: E) => { const [s, t] = stExpr(e); return t === 'b' ? s : `(${s} <> 0.0)`; };
  const p = {
    set: (nm: string, e: E) => `${nm} := ${r.get(nm) === 'int' ? `LREAL_TO_DINT(${num(e)})` : num(e)};`, if: (c: E) => `IF ${bool(c)} THEN`, elif: (c: E) => `ELSIF ${bool(c)} THEN`, else: 'ELSE', endif: 'END_IF;',
    caseOpen: (nm: string) => `CASE ${nm} OF`, arm: (v: number) => `${v}:`, armEnd: '', caseEnd: 'END_CASE;',
    read: (nm: string, buf: string) => `${nm} := ${buf}[${buf}_k];`, write: (buf: string, n: number, e: E) => `${buf}[${buf}_k] := ${num(e)};\n${buf}_k := (${buf}_k + 1) MOD ${n};`,
  };
  const decl = (k: string) => [...r].filter(([, kk]) => kk === k).map(([nm]) => `    ${nm} : ${k === 'int' ? 'DINT' : 'LREAL'};`);
  const init = [...initLines(ir).map(([nm, e]) => `    ${p.set(nm, e)}`), ...ir.delays.map((d) => `    FOR i := 0 TO ${d.n - 1} DO ${d.buf}[i] := ${cNum(d.init)}; END_FOR;`)];
  const st = `(* ${model}.st: made by Hyperion from a block diagram. IEC 61131-3 Structured Text.
   Call it once every ${ir.dt} s (a cyclic task with that period); the first call sets it up. *)
FUNCTION_BLOCK ${model}
  VAR_INPUT
${decl('in').join('\n') || '    (* no inputs *)'}
  END_VAR
  VAR_OUTPUT
${decl('out').join('\n')}
  END_VAR
  VAR
    started : BOOL := FALSE;
${ir.delays.length ? '    i : DINT;\n' : ''}${ir.delays.map((d) => `    ${d.buf} : ARRAY[0..${d.n - 1}] OF LREAL;\n`).join('')}${decl('keep').join('\n')}
${decl('int').join('\n')}
${decl('local').join('\n')}
  END_VAR
  VAR CONSTANT
    DT : LREAL := ${cNum(ir.dt)};
  END_VAR

  IF NOT started THEN
${init.join('\n')}
    started := TRUE;
  END_IF;
${printStmts(steps(ir), '  ', p).join('\n')}
END_FUNCTION_BLOCK
`;
  return [{ name: `${model}.st`, text: st }];
}

// ——— Verilog and VHDL (Q15.16 fixed point) ———

const FRAC = 16, ONE = 1 << FRAC;
function q(v: number) {
  const x = Math.round(v * ONE);
  if (Math.abs(x) >= 2 ** 31) throw new Error(`${v} is too big for the fixed-point numbers Verilog and VHDL use here (at most ±32,767): scale the model, or use C or Structured Text.`);
  return x;
}
const noHdl = (what: string) => new Error(`${what} has no fixed-point version here: use C, C++ or Structured Text for this diagram, or take it out.`);
interface Hdl { lit: (v: number) => string; mul: (a: string, b: string) => string; sel: (c: string, a: string, b: string) => string; toBool: (s: string) => string; toNum: (s: string) => string; not: string; and: string; or: string; eq: string; ne: string; min: (a: string, b: string) => string; max: (a: string, b: string) => string; abs: (a: string) => string; mod: (a: string, b: string) => string; neg: (a: string) => string; ref: (n: string) => string }
function hdlExpr(e: E, h: Hdl): Typed {
  const num = (x: E) => { const [s, t] = hdlExpr(x, h); return t === 'n' ? s : h.toNum(s); }, bool = (x: E) => { const [s, t] = hdlExpr(x, h); return t === 'b' ? s : h.toBool(s); };
  switch (e.k) {
    case 'num': return [h.lit(q(e.v)), 'n'];
    case 'var': return [h.ref(e.name), 'n'];
    case 'sel': return [h.sel(bool(e.c), num(e.a), num(e.b)), 'n'];
    case 'un': return e.op === '-' ? [h.neg(num(e.a)), 'n'] : [`(${h.not}${bool(e.a)})`, 'b'];
    case 'bin': {
      if (e.op === '&&' || e.op === '||') return [`(${bool(e.a)} ${e.op === '&&' ? h.and : h.or} ${bool(e.b)})`, 'b'];
      if (['<', '>', '<=', '>='].includes(e.op)) return [`(${num(e.a)} ${e.op} ${num(e.b)})`, 'b'];
      if (e.op === '==' || e.op === '!=') return [`(${num(e.a)} ${e.op === '==' ? h.eq : h.ne} ${num(e.b)})`, 'b'];
      if (e.op === '*') return [h.mul(num(e.a), num(e.b)), 'n'];
      if (e.op === '/') { if (e.b.k !== 'num' || !e.b.v) throw noHdl('Dividing by a signal'); return [h.mul(num(e.a), h.lit(q(1 / e.b.v))), 'n']; }
      if (e.op === '^') {
        if (e.b.k !== 'num' || ![2, 3].includes(e.b.v)) throw noHdl('A power other than ^2 or ^3');
        const a = num(e.a);
        return [e.b.v === 2 ? h.mul(a, a) : h.mul(h.mul(a, a), a), 'n'];
      }
      return [`(${num(e.a)} ${e.op} ${num(e.b)})`, 'n'];
    }
    case 'call': {
      const a = e.args.map(num);
      if (e.fn === 'min') return [h.min(a[0], a[1]), 'n'];
      if (e.fn === 'max') return [h.max(a[0], a[1]), 'n'];
      if (e.fn === 'abs') return [h.abs(a[0]), 'n'];
      if (e.fn === 'fmod') return [h.mod(a[0], a[1]), 'n'];
      throw noHdl(`${e.fn}()${e.fn === 'sin' ? ' (a Sine wave block)' : ''}`);
    }
  }
}
const vLit = (x: number) => (x < 0 ? `(-32'sd${-x})` : `32'sd${x}`);
function genVerilog(ir: Ir, model: string): CodeFile[] {
  const r = roles(ir);
  const h: Hdl = {
    lit: vLit, mul: (a, b) => `qmul(${a}, ${b})`, sel: (c, a, b) => `(${c} ? ${a} : ${b})`, toBool: (s) => `(${s} != 32'sd0)`, toNum: (s) => `(${s} ? ONE : 32'sd0)`,
    not: '!', and: '&&', or: '||', eq: '==', ne: '!=', min: (a, b) => `qmin(${a}, ${b})`, max: (a, b) => `qmax(${a}, ${b})`, abs: (a) => `qabs(${a})`, mod: (a, b) => `(${a} % ${b})`, neg: (a) => `(-${a})`, ref: (nm) => nm,
  };
  const num = (e: E) => { const [s, t] = hdlExpr(e, h); return t === 'n' ? s : h.toNum(s); }, bool = (e: E) => { const [s, t] = hdlExpr(e, h); return t === 'b' ? s : h.toBool(s); };
  const p = {
    set: (nm: string, e: E) => (r.get(nm) === 'int' ? `${nm} = ${e.k === 'num' ? e.v : 0};` : `${nm} = ${num(e)};`), if: (c: E) => `if (${bool(c)}) begin`, elif: (c: E) => `end else if (${bool(c)}) begin`, else: 'end else begin', endif: 'end',
    caseOpen: (nm: string) => `case (${nm})`, arm: (v: number) => `${v}: begin`, armEnd: 'end', caseEnd: 'endcase',
    read: (nm: string, buf: string) => `${nm} = ${buf}[${buf}_k];`, write: (buf: string, n: number, e: E) => `${buf}[${buf}_k] = ${num(e)};\n${buf}_k = (${buf}_k == ${n - 1}) ? 0 : ${buf}_k + 1;`,
  };
  const stepBody = printStmts(steps(ir), '      ', p);
  const regs = [...r].filter(([, k]) => k !== 'in' && k !== 'out' && k !== 'int' && k !== 'buf').map(([nm]) => nm);
  const v = `// ${model}.v: made by Hyperion from a block diagram. Signed fixed point Q15.16 (32 bits, 16 after the point).
// Every rising clock edge with en high is one step of ${ir.dt} s; rst sets it back to the start.
module ${model} (
  input wire clk,
  input wire rst,
  input wire en${ir.inputs.map((i) => `,\n  input wire signed [31:0] ${i.name}`).join('')}${ir.outputs.map((o) => `,\n  output reg signed [31:0] ${o.name}`).join('')}
);
  localparam signed [31:0] ONE = 32'sd${ONE};
  localparam signed [31:0] DT = ${vLit(q(ir.dt))};
${regs.map((nm) => `  reg signed [31:0] ${nm};`).join('\n')}
${[...r].filter(([, k]) => k === 'int').map(([nm]) => `  integer ${nm};`).join('\n')}
${ir.delays.map((d) => `  reg signed [31:0] ${d.buf} [0:${d.n - 1}];`).join('\n')}${ir.delays.length ? '\n  integer i;' : ''}

  function signed [31:0] qmul(input signed [31:0] a, input signed [31:0] b);
    reg signed [63:0] p;
    begin p = a * b; qmul = p >>> ${FRAC}; end
  endfunction
  function signed [31:0] qmin(input signed [31:0] a, input signed [31:0] b); qmin = a < b ? a : b; endfunction
  function signed [31:0] qmax(input signed [31:0] a, input signed [31:0] b); qmax = a > b ? a : b; endfunction
  function signed [31:0] qabs(input signed [31:0] a); qabs = a < 0 ? -a : a; endfunction

  always @(posedge clk) begin
    if (rst) begin
${initLines(ir).map(([nm, e]) => `      ${p.set(nm, e)}`).join('\n')}
${ir.delays.map((d) => `      for (i = 0; i < ${d.n}; i = i + 1) ${d.buf}[i] = ${vLit(q(d.init))};`).join('\n')}
${ir.outputs.map((o) => `      ${o.name} = 32'sd0;`).join('\n')}
    end else if (en) begin
${stepBody.join('\n')}
    end
  end
endmodule
`;
  const tb = `// ${model}_tb.v: runs ${model} for 1000 steps and prints the outputs (as Q15.16 whole numbers) each step.
\`timescale 1ns/1ps
module ${model}_tb;
  reg clk = 0, rst = 1, en = 0;
${ir.inputs.map((i) => `  reg signed [31:0] ${i.name} = ${vLit(q(i.test))};`).join('\n')}
${ir.outputs.map((o) => `  wire signed [31:0] ${o.name};`).join('\n')}
  ${model} dut (.clk(clk), .rst(rst), .en(en)${ir.inputs.map((i) => `, .${i.name}(${i.name})`).join('')}${ir.outputs.map((o) => `, .${o.name}(${o.name})`).join('')});
  always #5 clk = ~clk;
  integer k;
  initial begin
    @(posedge clk); #1 rst = 0; en = 1;
    for (k = 0; k < 1000; k = k + 1) begin
      @(posedge clk); #1 $display("${ir.outputs.map(() => '%0d').join(' ')}", ${ir.outputs.map((o) => o.name).join(', ')});
    end
    $finish;
  end
endmodule
`;
  return [{ name: `${model}.v`, text: v }, { name: `${model}_tb.v`, text: tb }];
}

function genVhdl(ir: Ir, model: string): CodeFile[] {
  const r = roles(ir), lit = (x: number) => `to_signed(${x}, 32)`;
  const h: Hdl = {
    lit, mul: (a, b) => `qmul(${a}, ${b})`, sel: (c, a, b) => `qsel(${c}, ${a}, ${b})`, toBool: (s) => `(${s} /= 0)`, toNum: (s) => `qsel(${s}, ONE, ZERO)`,
    not: 'not ', and: 'and', or: 'or', eq: '=', ne: '/=', min: (a, b) => `qsel(${a} < ${b}, ${a}, ${b})`, max: (a, b) => `qsel(${a} > ${b}, ${a}, ${b})`, abs: (a) => `abs(${a})`, mod: (a, b) => `(${a} rem ${b})`, neg: (a) => `(-${a})`, ref: (nm) => nm,
  };
  const num = (e: E) => { const [s, t] = hdlExpr(e, h); return t === 'n' ? s : h.toNum(s); }, bool = (e: E) => { const [s, t] = hdlExpr(e, h); return t === 'b' ? s : h.toBool(s); };
  const p = {
    set: (nm: string, e: E) => (r.get(nm) === 'int' ? `${nm} := ${e.k === 'num' ? e.v : 0};` : r.get(nm) === 'out' ? `${nm} <= ${num(e)};` : `${nm} := ${num(e)};`),
    if: (c: E) => `if ${bool(c)} then`, elif: (c: E) => `elsif ${bool(c)} then`, else: 'else', endif: 'end if;',
    caseOpen: (nm: string) => `case ${nm} is`, arm: (v: number) => `when ${v} =>`, armEnd: '', caseEnd: 'end case;', caseOther: 'when others => null;',
    read: (nm: string, buf: string) => `${nm} := ${buf}(${buf}_k);`, write: (buf: string, n: number, e: E) => `${buf}(${buf}_k) := ${num(e)};\nif ${buf}_k = ${n - 1} then ${buf}_k := 0; else ${buf}_k := ${buf}_k + 1; end if;`,
  };
  // Outputs are read back in the step (a scope input is often a signal too), so a variable keeps each one.
  const vars = [...r].filter(([, k]) => k !== 'in' && k !== 'out' && k !== 'int' && k !== 'buf').map(([nm]) => nm);
  const body = printStmts(steps(ir), '        ', p);
  const vhd = `-- ${model}.vhd: made by Hyperion from a block diagram. Signed fixed point Q15.16 (32 bits, 16 after the point).
-- Every rising clock edge with en = '1' is one step of ${ir.dt} s; rst = '1' sets it back to the start.
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity ${model} is
  port (
    clk : in std_logic;
    rst : in std_logic;
    en : in std_logic${ir.inputs.map((i) => `;\n    ${i.name} : in signed(31 downto 0)`).join('')}${ir.outputs.map((o) => `;\n    ${o.name} : out signed(31 downto 0)`).join('')}
  );
end entity;

architecture rtl of ${model} is
  constant ONE : signed(31 downto 0) := to_signed(${ONE}, 32);
  constant ZERO : signed(31 downto 0) := to_signed(0, 32);
  constant DT : signed(31 downto 0) := ${lit(q(ir.dt))};
  function qmul(a, b : signed(31 downto 0)) return signed is
    variable p : signed(63 downto 0);
  begin
    p := a * b;
    return p(${31 + FRAC} downto ${FRAC});
  end function;
  function qsel(c : boolean; a, b : signed(31 downto 0)) return signed is
  begin
    if c then return a; else return b; end if;
  end function;
begin
  process (clk)
${vars.map((nm) => `    variable ${nm} : signed(31 downto 0) := ZERO;`).join('\n')}
${[...r].filter(([, k]) => k === 'int').map(([nm]) => `    variable ${nm} : integer := 0;`).join('\n')}
${ir.delays.map((d) => `    type ${d.buf}_t is array (0 to ${d.n - 1}) of signed(31 downto 0);\n    variable ${d.buf} : ${d.buf}_t := (others => ${lit(q(d.init))});`).join('\n')}
  begin
    if rising_edge(clk) then
      if rst = '1' then
${initLines(ir).map(([nm, e]) => `        ${p.set(nm, e)}`).join('\n')}
${ir.delays.map((d) => `        ${d.buf} := (others => ${lit(q(d.init))});`).join('\n')}
${ir.outputs.map((o) => `        ${o.name} <= ZERO;`).join('\n')}
      elsif en = '1' then
${body.join('\n')}
      end if;
    end if;
  end process;
end architecture;
`;
  // The step reads outputs only through the expressions they were made from, so outputs are never read back.
  const tb = `-- ${model}_tb.vhd: runs ${model} for 1000 steps and prints the outputs (as Q15.16 whole numbers) each step.
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
use std.textio.all;

entity ${model}_tb is
end entity;

architecture sim of ${model}_tb is
  signal clk : std_logic := '0';
  signal rst : std_logic := '1';
  signal en : std_logic := '0';
${ir.inputs.map((i) => `  signal ${i.name} : signed(31 downto 0) := ${lit(q(i.test))};`).join('\n')}
${ir.outputs.map((o) => `  signal ${o.name} : signed(31 downto 0);`).join('\n')}
begin
  dut : entity work.${model} port map (clk => clk, rst => rst, en => en${ir.inputs.map((i) => `, ${i.name} => ${i.name}`).join('')}${ir.outputs.map((o) => `, ${o.name} => ${o.name}`).join('')});
  clk <= not clk after 5 ns;
  process
    variable l : line;
  begin
    wait until rising_edge(clk);
    wait for 1 ns;
    rst <= '0';
    en <= '1';
    for k in 0 to 999 loop
      wait until rising_edge(clk);
      wait for 1 ns;
${ir.outputs.map((o, i) => `      write(l, integer'image(to_integer(${o.name})));${i < ir.outputs.length - 1 ? ` write(l, string'(" "));` : ''}`).join('\n')}
      writeline(output, l);
    end loop;
    std.env.finish;
  end process;
end architecture;
`;
  return [{ name: `${model}.vhd`, text: vhd }, { name: `${model}_tb.vhd`, text: tb }];
}

/** The diagram's code in a language: its files, or an error saying in words what stops it. */
export function generateCode(dg: Diagram, lang: Lang, model = 'model'): CodeFile[] {
  const ir = buildIr(dg);
  if (lang === 'c') return genC(ir, model);
  if (lang === 'cpp') return genCpp(ir, model);
  if (lang === 'st') return genSt(ir, model);
  if (lang === 'verilog') return genVerilog(ir, model);
  return genVhdl(ir, model);
}
