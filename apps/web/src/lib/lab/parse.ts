// UniVerse Lab (M374, the owner, 21 Nov 2026: "build your own matlab and octave together in one app which can be
// downloaded in the computer"): our own reader for the MATLAB / Octave language, written from scratch (no code from
// MATLAB or GNU Octave). Code → tokens → a tree of statements the interpreter (interp.ts) runs. Pure, no browser APIs,
// so the website's Lab and the computer app share it.

export type Tok =
  | { t: 'num'; v: string; n: number; at: number; imag?: boolean }
  | { t: 'str'; v: string; dq: boolean; at: number }
  | { t: 'id'; v: string; at: number }
  | { t: 'kw'; v: string; at: number }
  | { t: 'op'; v: string; at: number }
  | { t: 'nl'; v: string; at: number } // a newline, ';' or ',' between statements (v says which)
  | { t: 'eof'; v: ''; at: number };

const KEYWORDS = new Set(['if', 'elseif', 'else', 'end', 'endif', 'endfor', 'endwhile', 'endfunction', 'endswitch', 'end_try_catch', 'for', 'while', 'do', 'until', 'break', 'continue', 'return', 'function', 'switch', 'case', 'otherwise', 'try', 'catch', 'global', 'persistent']);
const OPS = ['...', '==', '~=', '!=', '<=', '>=', '&&', '||', '.*', './', '.\\', '.^', ".'", '++', '--', '+=', '-=', '*=', '/=',
  '+', '-', '*', '/', '\\', '^', "'", '<', '>', '&', '|', '~', '!', '=', ':', '(', ')', '[', ']', '{', '}', '@', '.', ',', ';'];

export class LabError extends Error {
  constructor(message: string, readonly at = -1) { super(message); }
}

/** Code → tokens. Brackets make whitespace meaningful ("[1 -2]" is two numbers, "[1 - 2]" one), and a quote is a
 *  transpose after a value but starts a string anywhere else, as in MATLAB. */
export function lex(src: string): Tok[] {
  const out: Tok[] = [];
  const depth: string[] = []; // the open brackets: [ { or (
  let i = 0;
  const inMatrix = () => depth.length > 0 && depth[depth.length - 1] !== '(';
  const prevIsValue = () => {
    const p = out[out.length - 1];
    if (!p) return false;
    if (p.t === 'num' || p.t === 'str' || p.t === 'id') return true;
    if (p.t === 'kw') return p.v === 'end';
    if (p.t === 'op') return p.v === ')' || p.v === ']' || p.v === '}' || p.v === "'" || p.v === ".'";
    return false;
  };
  while (i < src.length) {
    const c = src[i];
    // Continuation: "..." to the end of the line.
    if (src.startsWith('...', i)) { while (i < src.length && src[i] !== '\n') i++; i++; continue; }
    // Block comments %{ … %} on their own lines.
    if ((src.startsWith('%{', i) || src.startsWith('#{', i)) && /^\s*$/.test(src.slice(src.lastIndexOf('\n', i - 1) + 1, i)) && /^[%#]\{\s*(\n|$)/.test(src.slice(i))) {
      const end = src.slice(i).search(/\n\s*[%#]\}/);
      i = end < 0 ? src.length : i + end + src.slice(i + end).indexOf('}') + 1;
      continue;
    }
    if (c === '%' || c === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') {
      // In a matrix, a space between two values separates elements: "[a -b]" but not "[a - b]" or "[a -  b]".
      let j = i; while (src[j] === ' ' || src[j] === '\t' || src[j] === '\r') j++;
      if (inMatrix() && prevIsValue()) {
        const n = src[j], n2 = src[j + 1];
        const startsValue = n !== undefined && /[\w.'"(\[{@~!]/.test(n) && !(n === '.' && /[*/\\^']/.test(n2 ?? ''));
        const signed = (n === '+' || n === '-') && n2 !== ' ' && n2 !== '\t' && n2 !== '=';
        const binary = /^(==|~=|!=|<=|>=|&&|\|\||[*/\\^<>&|=:])/.test(src.slice(j)) || (n === '.' && /[*/\\^]/.test(n2 ?? ''));
        if ((startsValue && !binary) || signed) out.push({ t: 'op', v: ',', at: i });
      }
      i = j; continue;
    }
    if (c === '\n') {
      if (inMatrix()) out.push({ t: 'op', v: ';', at: i });
      else if (!depth.length) out.push({ t: 'nl', v: '\n', at: i });
      i++; continue;
    }
    // Numbers: 12, 1.5, .5, 1e-3, 0x1F.
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      // "1.*2" is 1 .* 2: a dot before an operator isn't the number's.
      const m = /^(0[xX][0-9a-fA-F]+|(\d+(\.(?![*/\\^'])\d*)?|\.\d+)([eEdD][+-]?\d+)?)/.exec(src.slice(i))!;
      i += m[0].length;
      // 3i / 2.5j: an imaginary number (M377).
      const imag = /[ij]/.test(src[i] ?? '') && !/\w/.test(src[i + 1] ?? '');
      out.push({ t: 'num', v: m[0], n: Number(m[0].replace(/[dD]/, 'e')), at: i - m[0].length, ...(imag ? { imag } : {}) });
      if (imag) i++;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_]\w*/.exec(src.slice(i))!;
      const w = m[0];
      // "end" inside an index means the last element (primary() reads it); elsewhere it closes a block.
      out.push(KEYWORDS.has(w) ? { t: 'kw', v: w, at: i } : { t: 'id', v: w, at: i });
      i += w.length; continue;
    }
    if (c === '"' || (c === "'" && !(prevIsValue() && !/[ \t]/.test(src[i - 1] ?? '')) && !(prevIsValue() && !inMatrix()))) {
      // A string: '…' ('' is a quote inside) or "…" (backslash escapes, Octave).
      const q = c; let j = i + 1, s = '';
      for (;;) {
        if (j >= src.length || src[j] === '\n') throw new LabError('A string isn’t closed: add the missing quote.', i);
        if (src[j] === q) { if (src[j + 1] === q) { s += q; j += 2; continue; } break; }
        if (q === '"' && src[j] === '\\') { const e = src[j + 1]; s += e === 'n' ? '\n' : e === 't' ? '\t' : e === '\\' ? '\\' : e === '"' ? '"' : `\\${e}`; j += 2; continue; }
        s += src[j++];
      }
      out.push({ t: 'str', v: s, dq: q === '"', at: i });
      i = j + 1; continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new LabError(`I don’t understand the character “${c}”.`, i);
    if (op === '(' || op === '[' || op === '{') depth.push(op);
    else if (op === ')' || op === ']' || op === '}') depth.pop();
    if ((op === ';' || op === ',') && !depth.length) out.push({ t: 'nl', v: op, at: i });
    else out.push({ t: 'op', v: op, at: i });
    i += op.length;
  }
  out.push({ t: 'eof', v: '', at: src.length });
  return out;
}

// ——— The tree ———

export type Expr =
  | { k: 'num'; v: number; imag?: boolean }
  | { k: 'str'; v: string; dq: boolean }
  | { k: 'id'; name: string; at: number }
  | { k: 'colon' } // a bare ":" inside an index
  | { k: 'end' } // "end" inside an index
  | { k: 'bin'; op: string; a: Expr; b: Expr }
  | { k: 'un'; op: string; a: Expr }
  | { k: 'post'; op: string; a: Expr }
  | { k: 'range'; from: Expr; step: Expr | null; to: Expr }
  | { k: 'index'; of: Expr; args: Expr[]; brace: boolean }
  | { k: 'field'; of: Expr; name: string | Expr }
  | { k: 'matrix'; rows: Expr[][]; cell: boolean }
  | { k: 'lambda'; params: string[]; body: Expr; src: string }
  | { k: 'handle'; name: string };

export type Stmt =
  | { s: 'expr'; e: Expr; show: boolean; at: number }
  | { s: 'assign'; to: Expr[]; e: Expr; show: boolean; op: string; at: number }
  | { s: 'if'; arms: { cond: Expr; body: Stmt[] }[]; other: Stmt[] | null; at: number }
  | { s: 'for'; v: Expr; e: Expr; body: Stmt[]; at: number }
  | { s: 'while'; cond: Expr; body: Stmt[]; at: number }
  | { s: 'do'; body: Stmt[]; cond: Expr; at: number }
  | { s: 'switch'; e: Expr; cases: { match: Expr; body: Stmt[] }[]; other: Stmt[] | null; at: number }
  | { s: 'try'; body: Stmt[]; id: string | null; handler: Stmt[]; at: number }
  | { s: 'break' | 'continue' | 'return'; at: number }
  | { s: 'global'; names: string[]; at: number }
  | { s: 'command'; name: string; args: string[]; show: boolean; at: number };

export interface FnDef { name: string; params: string[]; outs: string[]; body: Stmt[]; varargin: boolean; varargout: boolean }
export interface Program { body: Stmt[]; fns: Map<string, FnDef> }

/** Commands written without brackets ("hold on", "clc", "format long", "close all"). */
const COMMANDS = new Set(['legend', 'hold', 'clc', 'clear', 'close', 'format', 'grid', 'axis', 'figure', 'disp', 'who', 'whos', 'more', 'pkg', 'clf', 'help', 'doc', 'tic', 'toc', 'box', 'colormap', 'colorbar', 'shading', 'view', 'rotate3d', 'caxis', 'camlight', 'lighting', 'material', 'clabel', 'yyaxis', 'cla']);

export function parse(src: string): Program {
  const toks = lex(src);
  let p = 0;
  const fns = new Map<string, FnDef>();
  const peek = (o = 0) => toks[p + o];
  const is = (t: Tok['t'], v?: string) => peek().t === t && (v === undefined || peek().v === v);
  const take = () => toks[p++];
  const expect = (t: Tok['t'], v: string, what: string) => {
    if (!is(t, v)) throw new LabError(`Expected ${what} here.`, peek().at);
    return take();
  };
  const skipNl = () => { while (is('nl')) take(); };
  const ENDS = ['end', 'endif', 'endfor', 'endwhile', 'endfunction', 'endswitch', 'end_try_catch'];
  const closeBlock = (what: string) => {
    if (peek().t === 'kw' && ENDS.includes(peek().v)) { take(); return; }
    throw new LabError(`This ${what} needs an “end”.`, peek().at);
  };

  function block(stop: string[]): Stmt[] {
    const out: Stmt[] = [];
    for (;;) {
      skipNl();
      if (is('eof') || (peek().t === 'kw' && stop.includes(peek().v))) return out;
      const st = statement();
      if (st) out.push(st);
    }
  }

  /** Whether a statement is shown: not when it ends with ";". */
  const ending = () => {
    if (is('nl')) { const t = take(); return t.v !== ';'; }
    if (is('eof') || is('kw')) return true;
    throw new LabError('Something is missing between these parts (an operator or a new line?).', peek().at);
  };

  function statement(): Stmt | null {
    const t = peek();
    if (t.t === 'kw') {
      switch (t.v) {
        case 'if': {
          take();
          const arms = [{ cond: expr(), body: block(['elseif', 'else', ...ENDS]) }];
          let other: Stmt[] | null = null;
          for (;;) {
            if (is('kw', 'elseif')) { take(); arms.push({ cond: expr(), body: block(['elseif', 'else', ...ENDS]) }); continue; }
            if (is('kw', 'else')) { take(); other = block(ENDS); }
            break;
          }
          closeBlock('“if”');
          return { s: 'if', arms, other, at: t.at };
        }
        case 'for': {
          take();
          const paren = is('op', '(') && (() => { let d = 0, j = p; for (; j < toks.length; j++) { if (toks[j].v === '(') d++; else if (toks[j].v === ')' && --d === 0) break; } return toks[j + 1]?.t === 'nl'; })();
          if (paren) take();
          const v = postfix();
          expect('op', '=', '“=” after the loop variable');
          const e = expr();
          if (paren) expect('op', ')', '“)”');
          const body = block(ENDS);
          closeBlock('“for” loop');
          return { s: 'for', v, e, body, at: t.at };
        }
        case 'while': { take(); const cond = expr(); const body = block(ENDS); closeBlock('“while” loop'); return { s: 'while', cond, body, at: t.at }; }
        case 'do': { take(); const body = block(['until']); expect('kw', 'until', '“until”'); return { s: 'do', body, cond: expr(), at: t.at }; }
        case 'switch': {
          take();
          const e = expr();
          const cases: { match: Expr; body: Stmt[] }[] = [];
          let other: Stmt[] | null = null;
          skipNl();
          while (is('kw', 'case') || is('kw', 'otherwise')) {
            if (take().v === 'case') cases.push({ match: expr(), body: block(['case', 'otherwise', ...ENDS]) });
            else other = block(['case', 'otherwise', ...ENDS]);
          }
          closeBlock('“switch”');
          return { s: 'switch', e, cases, other, at: t.at };
        }
        case 'try': {
          take();
          const body = block(['catch', ...ENDS]);
          let id: string | null = null, handler: Stmt[] = [];
          if (is('kw', 'catch')) {
            take();
            if (is('id') && peek(1).t === 'nl' && peek(1).v !== ';') id = take().v;
            handler = block(ENDS);
          }
          closeBlock('“try”');
          return { s: 'try', body, id, handler, at: t.at };
        }
        case 'break': case 'continue': case 'return': take(); ending(); return { s: t.v, at: t.at };
        case 'global': case 'persistent': {
          take(); const names: string[] = [];
          while (is('id')) names.push(take().v);
          ending();
          return { s: 'global', names, at: t.at };
        }
        case 'function': { take(); fnDef(); return null; }
        default: throw new LabError(`“${t.v}” can’t start a line here.`, t.at);
      }
    }
    // A command without brackets: "hold on", "format long", "close all".
    if (t.t === 'id' && COMMANDS.has(t.v) && (peek(1).t === 'nl' || peek(1).t === 'eof' || (peek(1).t === 'id' && peek(2).t !== 'op') || (peek(1).t === 'id' && (peek(2).t === 'nl' || peek(2).t === 'eof')))) {
      take();
      const args: string[] = [];
      while (is('id') || is('num')) args.push(String(take().v));
      return { s: 'command', name: t.v, args, show: ending(), at: t.at };
    }
    // [a, b] = f(...)
    if (is('op', '[')) {
      const save = p;
      try {
        take();
        const to: Expr[] = [];
        while (!is('op', ']')) {
          if (is('op', '~')) { take(); to.push({ k: 'id', name: '~', at: peek().at }); } else to.push(postfix());
          if (is('op', ',')) take();
        }
        take();
        if (is('op', '=') && !is('op', '==')) { take(); const e = expr(); return { s: 'assign', to, e, show: ending(), op: '=', at: t.at }; }
      } catch { /* not a multiple assignment */ }
      p = save;
    }
    const e = expr();
    for (const op of ['=', '+=', '-=', '*=', '/=']) {
      if (is('op', op)) {
        if (!isTarget(e)) throw new LabError('The left side of “=” must be a variable name, like x or x(2).', t.at);
        take();
        const rhs = expr();
        return { s: 'assign', to: [e], e: rhs, show: ending(), op, at: t.at };
      }
    }
    if (is('op', '++') || is('op', '--')) { const op = take().v; return { s: 'assign', to: [e], e: { k: 'num', v: 1 }, show: ending(), op: op === '++' ? '+=' : '-=', at: t.at }; }
    return { s: 'expr', e, show: ending(), at: t.at };
  }

  const isTarget = (e: Expr): boolean => e.k === 'id' || ((e.k === 'index' || e.k === 'field') && isTarget(e.of));

  function fnDef() {
    // function [a, b] = name(x, y)   |   function a = name(x)   |   function name(x)
    let outs: string[] = [];
    if (is('op', '[')) {
      take();
      while (!is('op', ']')) { if (is('id')) outs.push(take().v); else take(); }
      take(); expect('op', '=', '“=”');
    } else if (is('id') && peek(1).t === 'op' && peek(1).v === '=') { outs = [take().v]; take(); }
    if (!is('id')) throw new LabError('A function needs a name.', peek().at);
    const name = take().v;
    const params: string[] = [];
    if (is('op', '(')) {
      take();
      while (!is('op', ')')) { if (is('id')) params.push(take().v); else if (is('op', '~')) { take(); params.push('~'); } else take(); }
      take();
    }
    const body = block(['function', ...ENDS]);
    if (peek().t === 'kw' && ENDS.includes(peek().v)) take();
    const varargin = params[params.length - 1] === 'varargin', varargout = outs[outs.length - 1] === 'varargout';
    fns.set(name, { name, params: varargin ? params.slice(0, -1) : params, outs: varargout ? outs.slice(0, -1) : outs, body, varargin, varargout });
  }

  // ——— Expressions, lowest precedence first ———
  const binary = (next: () => Expr, ops: string[]) => (): Expr => {
    let a = next();
    while (peek().t === 'op' && ops.includes(peek().v)) { const op = take().v; a = { k: 'bin', op: op === '!=' ? '~=' : op, a, b: next() }; }
    return a;
  };
  const expr = (): Expr => oror();
  const oror = binary(() => andand(), ['||']);
  const andand = binary(() => or(), ['&&']);
  const or = binary(() => and(), ['|']);
  const and = binary(() => cmp(), ['&']);
  const cmp = binary(() => range(), ['==', '~=', '!=', '<', '<=', '>', '>=']);
  function range(): Expr {
    // Inside an index, a lone ":" means "all of it".
    if (is('op', ':') && (peek(1).v === ')' || peek(1).v === ',' || peek(1).v === '}')) { take(); return { k: 'colon' }; }
    const a = add();
    if (!is('op', ':')) return a;
    take();
    const b = add();
    if (is('op', ':')) { take(); return { k: 'range', from: a, step: b, to: add() }; }
    return { k: 'range', from: a, step: null, to: b };
  }
  const add = binary(() => mul(), ['+', '-']);
  const mul = binary(() => unary(), ['*', '/', '\\', '.*', './', '.\\']);
  function unary(): Expr {
    if (peek().t === 'op' && ['-', '+', '~', '!'].includes(peek().v)) { const op = take().v; return { k: 'un', op: op === '!' ? '~' : op, a: unary() }; }
    return power();
  }
  function power(): Expr {
    let a = postfix();
    while (is('op', '^') || is('op', '.^')) {
      const op = take().v;
      // "2^-1": a sign straight after ^ belongs to the exponent.
      const b = peek().t === 'op' && ['-', '+', '~', '!'].includes(peek().v) ? (() => { const o = take().v; return { k: 'un' as const, op: o === '!' ? '~' : o, a: postfix() }; })() : postfix();
      a = { k: 'bin', op, a, b };
    }
    return a;
  }
  function postfix(): Expr {
    let a = primary();
    for (;;) {
      if (is('op', '(') ) { take(); a = { k: 'index', of: a, args: args(')'), brace: false }; continue; }
      if (is('op', '{')) { take(); a = { k: 'index', of: a, args: args('}'), brace: true }; continue; }
      if (is('op', '.') && (peek(1).t === 'id' || peek(1).t === 'kw')) { take(); a = { k: 'field', of: a, name: String(take().v) }; continue; }
      if (is('op', '.') && peek(1).v === '(') { take(); take(); const name = expr(); expect('op', ')', '“)”'); a = { k: 'field', of: a, name }; continue; }
      if (is('op', "'") || is('op', ".'")) { const op = take().v; a = { k: 'post', op, a }; continue; }
      return a;
    }
  }
  function args(close: string): Expr[] {
    const out: Expr[] = [];
    while (!is('op', close)) {
      if (is('eof')) throw new LabError(`A “${close === ')' ? '(' : '{'}” isn’t closed.`, peek().at);
      out.push(expr());
      if (is('op', ',')) take();
      else if (!is('op', close)) throw new LabError(`Expected “,” or “${close}” here.`, peek().at);
    }
    take();
    return out;
  }
  function primary(): Expr {
    const t = take();
    switch (t.t) {
      case 'num': return t.imag ? { k: 'num', v: t.n, imag: true } : { k: 'num', v: t.n };
      case 'str': return { k: 'str', v: t.v, dq: t.dq };
      case 'id': return { k: 'id', name: t.v, at: t.at };
      case 'kw': if (t.v === 'end') return { k: 'end' }; break;
      case 'op':
        if (t.v === '(') { const e = expr(); expect('op', ')', '“)”'); return e; }
        if (t.v === '[' || t.v === '{') return matrix(t.v === '{');
        if (t.v === '@') {
          if (is('op', '(')) {
            const start = peek().at;
            take();
            const params: string[] = [];
            while (!is('op', ')')) { if (is('id')) params.push(take().v); else take(); }
            take();
            const body = expr();
            return { k: 'lambda', params, body, src: src.slice(start, peek().at).trim() };
          }
          if (is('id')) return { k: 'handle', name: take().v };
        }
        if (t.v === ':') return { k: 'colon' };
    }
    throw new LabError(t.t === 'eof' ? 'The line ends too soon: something is missing.' : `I didn’t expect “${t.v}” here.`, t.at);
  }
  function matrix(cell: boolean): Expr {
    const close = cell ? '}' : ']';
    const rows: Expr[][] = [[]];
    while (!is('op', close)) {
      if (is('eof')) throw new LabError(`A “${cell ? '{' : '['}” isn’t closed.`, peek().at);
      if (is('op', ';')) { take(); rows.push([]); continue; }
      if (is('op', ',')) { take(); continue; }
      rows[rows.length - 1].push(expr());
    }
    take();
    return { k: 'matrix', rows: rows.filter((r, i) => r.length || i === 0), cell };
  }

  const body = block([]);
  if (!is('eof')) throw new LabError(`“${peek().v}” doesn’t close anything here.`, peek().at);
  return { body, fns };
}
