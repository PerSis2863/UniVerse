import type { Expr, Program, Stmt } from './parse';
import { HELP } from './help';

// Hyperion explains a script line by line (M399, the owner's 20 big features: "combine 2 features into one"): the help
// line of every function joined with the values written in the code, in plain words beside each line.

const PREC: Record<string, number> = { '||': 1, '&&': 2, '|': 3, '&': 4, '==': 5, '~=': 5, '<': 5, '<=': 5, '>': 5, '>=': 5, '+': 7, '-': 7, '*': 8, '/': 8, '.*': 8, './': 8, '\\': 8, '.\\': 8, '^': 10, '.^': 10 };
const precOf = (e: Expr) => (e.k === 'bin' ? PREC[e.op] ?? 6 : e.k === 'range' ? 6 : e.k === 'un' ? 9 : 11);
/** An expression written out again as code. */
export function exprText(e: Expr): string {
  const wrap = (x: Expr, p: number) => (precOf(x) < p ? `(${exprText(x)})` : exprText(x));
  switch (e.k) {
    case 'num': return `${e.v}${e.imag ? 'i' : ''}`;
    case 'str': return e.dq ? `"${e.v}"` : `'${e.v}'`;
    case 'id': return e.name;
    case 'colon': return ':';
    case 'end': return 'end';
    case 'bin': { const p = PREC[e.op] ?? 6; const spaced = p <= 7; return `${wrap(e.a, p)}${spaced ? ` ${e.op} ` : e.op}${wrap(e.b, p + 1)}`; }
    case 'un': return `${e.op}${wrap(e.a, 9)}`;
    case 'post': return `${wrap(e.a, 11)}${e.op}`;
    case 'range': return [e.from, e.step, e.to].filter((x): x is Expr => !!x).map((x) => wrap(x, 7)).join(':');
    case 'index': return `${exprText(e.of)}${e.brace ? '{' : '('}${e.args.map(exprText).join(', ')}${e.brace ? '}' : ')'}`;
    case 'field': return `${exprText(e.of)}.${typeof e.name === 'string' ? e.name : `(${exprText(e.name)})`}`;
    case 'matrix': return `${e.cell ? '{' : '['}${e.rows.map((r) => r.map(exprText).join(', ')).join('; ')}${e.cell ? '}' : ']'}`;
    case 'lambda': return `@${e.src}`;
    case 'handle': return `@${e.name}`;
  }
}

/** A function's parameter names from its help syntax ("linspace(a, b, n)" → a, b, n). */
function params(name: string): string[] {
  const syntax = HELP.get(name)?.syntax ?? '';
  const at = syntax.indexOf(`${name}(`);
  if (at < 0) return [];
  let depth = 0, end = at + name.length;
  for (let i = end; i < syntax.length; i++) { if (syntax[i] === '(') depth++; else if (syntax[i] === ')' && --depth === 0) { end = i; break; } }
  return syntax.slice(at + name.length + 1, end).split(',').map((p) => p.trim());
}
const sentence = (t: string) => t.replace(/\.?\s*$/, '');
/** What a call does: its help line, then the values given for its inputs. */
function callText(name: string, args: Expr[]): string | null {
  const e = HELP.get(name);
  if (!e) return null;
  const ps = params(name);
  const given = args.map((a, i) => ({ p: ps[i], v: exprText(a) })).filter((x) => x.p && /^[A-Za-z]\w*$/.test(x.p) && x.p !== x.v && x.v.length <= 40);
  return `${sentence(e.text)}${given.length ? ` (${given.map((x) => `${x.p} = ${x.v}`).join(', ')})` : ''}`;
}

/** What an expression gives, in words. `isFn` tells a function from a variable. */
function what(e: Expr, isFn: (n: string) => boolean): string {
  switch (e.k) {
    case 'num': return `the number ${exprText(e)}`;
    case 'str': return `the text ${exprText(e)}`;
    case 'id': return isFn(e.name) ? (callText(e.name, []) ?? `the result of ${e.name}`) : `a copy of ${e.name}`;
    case 'range': return e.step ? `the numbers from ${exprText(e.from)} to ${exprText(e.to)} in steps of ${exprText(e.step)}` : `the whole numbers from ${exprText(e.from)} to ${exprText(e.to)}`;
    case 'matrix': {
      if (!e.rows.length || e.rows.every((r) => !r.length)) return e.cell ? 'an empty cell array' : 'an empty matrix';
      const r = e.rows.length, c = e.rows[0].length, simple = e.rows.every((row) => row.length === c && row.every((x) => x.k === 'num' || x.k === 'un' || x.k === 'str'));
      if (e.cell) return `a cell array of ${e.rows.flat().length} item${e.rows.flat().length === 1 ? '' : 's'}`;
      if (!simple) return `the values ${exprText(e)} put together`;
      return r === 1 ? `a row of ${c} number${c === 1 ? '' : 's'}` : c === 1 ? `a column of ${r} numbers` : `a ${r}×${c} matrix written out`;
    }
    case 'lambda': return `a function of ${e.params.join(', ') || 'nothing'} that works out ${exprText(e.body)}`;
    case 'handle': return `a handle to the function ${e.name}`;
    case 'index': {
      if (e.of.k === 'id' && isFn(e.of.name) && !e.brace) return callText(e.of.name, e.args) ?? `the result of ${exprText(e)}`;
      return e.brace ? `what is inside ${exprText(e)}` : `part of ${exprText(e.of)}: ${exprText(e)}`;
    }
    case 'post': return e.op === "'" || e.op === ".'" ? `${exprText(e.a)} turned on its side (rows become columns)` : exprText(e);
    case 'bin':
      if (e.op === '\\') return `the solution x of ${exprText(e.a)}·x = ${exprText(e.b)}`;
      if (['==', '~=', '<', '<=', '>', '>=', '&&', '||', '&', '|'].includes(e.op)) return `true or false: ${exprText(e)}`;
      return `${exprText(e)} worked out`;
    case 'un': return e.op === '~' || e.op === '!' ? `the opposite of ${exprText(e.a)}` : `${exprText(e)} worked out`;
    default: return exprText(e);
  }
}
const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

function stmtText(st: Stmt, isFn: (n: string) => boolean): string | null {
  switch (st.s) {
    case 'assign': {
      if (st.op !== '=') return `Changes ${exprText(st.to[0])} (${st.op}).`;
      if (st.to.length > 1) {
        const names = st.to.map(exprText).join(', ');
        const e = st.e, fn = e.k === 'index' && e.of.k === 'id' ? e.of.name : null;
        const call = fn && e.k === 'index' ? callText(fn, e.args) : null;
        return `${names}: the results of ${call ? `${fn}: ${lower(call)}` : exprText(e)}.`;
      }
      const t = st.to[0];
      if (t.k === 'id') return `${t.name}: ${lower(what(st.e, isFn))}.`;
      if (t.k === 'field') return `Sets the field ${typeof t.name === 'string' ? t.name : exprText(t.name)} of ${exprText(t.of)} to ${exprText(st.e)}.`;
      if (t.k === 'index' && st.e.k === 'matrix' && !st.e.rows.flat().length) return `Removes ${exprText(t)}.`;
      return `Changes ${exprText(t)} to ${exprText(st.e)}.`;
    }
    case 'expr': {
      const e = st.e;
      if (e.k === 'id' && !isFn(e.name)) return `Shows ${e.name}.`;
      if (e.k === 'index' && e.of.k === 'id' && isFn(e.of.name)) { const c = callText(e.of.name, e.args); return c ? `${c}.` : null; }
      if (e.k === 'id' && isFn(e.name)) { const c = callText(e.name, []); return c ? `${c}.` : null; }
      return `Works out and shows ${exprText(e)}.`;
    }
    case 'command': {
      if (st.name === 'syms') return `Makes ${st.args.filter((a) => !/^(real|positive|integer|rational|clear|complex)$/.test(a)).join(', ')} symbols, for exact maths.`;
      const e = HELP.get(st.name);
      return e ? `${sentence(e.text)}${st.args.length ? ` (${st.args.join(' ')})` : ''}.` : null;
    }
    case 'for': {
      const v = exprText(st.v);
      if (st.e.k === 'range') return st.e.step ? `Repeats the lines up to its end for each ${v} from ${exprText(st.e.from)} to ${exprText(st.e.to)} in steps of ${exprText(st.e.step)}.` : `Repeats the lines up to its end for each ${v} from ${exprText(st.e.from)} to ${exprText(st.e.to)}.`;
      return `Repeats the lines up to its end once for each column of ${exprText(st.e)}, as ${v}.`;
    }
    case 'while': return `Repeats the lines up to its end while ${exprText(st.cond)} is true.`;
    case 'do': return 'Runs the lines below, then again until its condition is true.';
    case 'if': return `Runs the lines below only when ${exprText(st.arms[0].cond)} is true${st.arms.length > 1 || st.other ? ' (otherwise the elseif / else part)' : ''}.`;
    case 'switch': return `Picks the case that matches ${exprText(st.e)}.`;
    case 'try': return 'Runs the lines below; if one fails, the catch part runs instead of stopping.';
    case 'break': return 'Leaves the loop now.';
    case 'continue': return 'Skips to the next pass of the loop.';
    case 'return': return 'Leaves the function (or the script) now.';
    case 'global': return `Shares ${st.names.join(', ')} with every function that also says global ${st.names.join(' ')}.`;
  }
}
const children = (st: Stmt): Stmt[] => (st.s === 'if' ? [...st.arms.flatMap((a) => a.body), ...(st.other ?? [])] : st.s === 'for' || st.s === 'while' || st.s === 'do' ? st.body : st.s === 'switch' ? [...st.cases.flatMap((c) => c.body), ...(st.other ?? [])] : st.s === 'try' ? [...st.body, ...st.handler] : []);

/** Line number (from 1) → what that line does, for every line with code. */
export function explainScript(src: string, prog: Program, isFn: (name: string) => boolean): Map<number, string> {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  const lineOf = (at: number) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= at) lo = m; else hi = m - 1; } return lo + 1; };
  const out = new Map<number, string>();
  const known = (n: string) => isFn(n) || prog.fns.has(n);
  const walk = (list: Stmt[]) => {
    for (const st of list) {
      const t = stmtText(st, known);
      if (t) { const l = lineOf(st.at); out.set(l, out.has(l) ? `${out.get(l)} ${t}` : t); }
      walk(children(st));
    }
  };
  walk(prog.body);
  for (const f of prog.fns.values()) walk(f.body);
  // Function headers (the parse keeps no position for them).
  src.split('\n').forEach((line, i) => {
    const m = /^\s*function\s+(?:(\[[^\]]*\]|\w+)\s*=\s*)?(\w+)\s*(?:\(([^)]*)\))?/.exec(line);
    if (m) out.set(i + 1, `Defines the function ${m[2]}(${(m[3] ?? '').trim()})${m[1] ? `, giving back ${m[1].replace(/[[\]]/g, '').trim()}` : ''}.`);
  });
  return out;
}
