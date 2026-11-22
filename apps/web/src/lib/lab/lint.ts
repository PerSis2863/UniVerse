import { LabError, parse, type Expr, type Program, type Stmt } from './parse';

// Hyperion's code checker (M399): as you type, the problems a careful reader would point out, in plain words, each
// with a one-click fix where there is a safe one. It reads the code without running it: a name used before it has a
// value (probably a typo), a variable that hides a function, a loop that prints on every pass, an array that grows in
// a loop, text compared with ==, decimals compared exactly, code after return, unused results inside a function.

export interface Problem {
  from: number; to: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  fix?: { label: string; from: number; to: number; insert: string };
}

const CONSTANTS = new Set(['pi', 'Inf', 'inf', 'NaN', 'nan', 'eps', 'i', 'j', 'true', 'false', 'end', 'ans', 'nargin', 'nargout', 'varargin', 'varargout', 'e', 'NA', 'realmax', 'realmin', 'intmax', 'intmin']);
/** Commands after which any name may exist (they make variables we can't see). */
const MAKERS = new Set(['load', 'eval', 'evalin', 'assignin', 'evalc', 'run', 'syms']);

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Where a line's code ends (before a comment and trailing spaces). */
function codeEnd(src: string, at: number): { lineEnd: number; codeTo: number } {
  let lineEnd = src.indexOf('\n', at);
  if (lineEnd < 0) lineEnd = src.length;
  let inStr: string | null = null, codeTo = lineEnd;
  for (let i = at; i < lineEnd; i++) {
    const c = src[i];
    if (inStr) { if (c === inStr) inStr = null; continue; }
    if (c === '"' || (c === "'" && !/[\w)\]}'.]/.test(src[i - 1] ?? ''))) { inStr = c; continue; }
    if (c === '%' || c === '#') { codeTo = i; break; }
  }
  while (codeTo > at && /\s/.test(src[codeTo - 1])) codeTo--;
  return { lineEnd, codeTo };
}


const rootName = (e: Expr): string | null => (e.k === 'id' ? e.name : e.k === 'index' || e.k === 'field' ? rootName(e.of) : null);

export function lintScript(src: string, isFn: (name: string) => boolean): { problems: Problem[]; prog: Program | null } {
  let prog: Program;
  try { prog = parse(src); } catch (e) {
    if (e instanceof LabError) {
      const at = Math.max(0, Math.min(src.length, e.at >= 0 ? e.at : 0));
      return { problems: [{ from: at, to: Math.min(src.length, Math.max(at + 1, codeEnd(src, at).codeTo)), severity: 'error', message: e.message }], prog: null };
    }
    return { problems: [], prog: null };
  }
  const problems: Problem[] = [];
  const fnNames = new Set(prog.fns.keys());
  const callable = (n: string) => isFn(n) || fnNames.has(n);
  const stmtRange = (st: Stmt) => ({ from: st.at, to: Math.max(st.at + 1, codeEnd(src, st.at).codeTo) });

  const checkScope = (body: Stmt[], params: string[], inFunction: boolean, outs: string[]) => {
    const defined = new Set<string>(params);
    const firstSet = new Map<string, { at: number; shown: boolean }>();
    const used = new Set<string>();
    let open = false; // after load / eval: any name may exist
    // Inside a loop, a name read under an if before it is set may hold last pass's value: not reported.
    let loops = 0, soft = 0;
    const note = (name: string, at: number) => {
      used.add(name);
      if (open || defined.has(name) || callable(name) || CONSTANTS.has(name)) return;
      if (loops > 0 && soft > 0) { defined.add(name); return; }
      const near = [...defined, ...fnNames].map((d) => ({ d, k: lev(d, name) })).filter((x) => x.k <= 2 && x.k < name.length).sort((a, b) => a.k - b.k)[0];
      problems.push({ from: at, to: at + name.length, severity: 'error', message: `“${name}” has no value here: nothing has been put in it yet, and it isn’t a function I know.${near ? ` Did you mean ${near.d}?` : ''}`,
        ...(near ? { fix: { label: `Change to ${near.d}`, from: at, to: at + name.length, insert: near.d } } : {}) });
      defined.add(name); // one report per name
    };
    const reads = (e: Expr, local: Set<string> = new Set()) => {
      switch (e.k) {
        case 'id': if (!local.has(e.name)) note(e.name, e.at); break;
        case 'bin': reads(e.a, local); reads(e.b, local); break;
        case 'un': case 'post': reads(e.a, local); break;
        case 'range': reads(e.from, local); if (e.step) reads(e.step, local); reads(e.to, local); break;
        case 'index': reads(e.of, local); e.args.forEach((a) => reads(a, local)); break;
        case 'field': reads(e.of, local); if (typeof e.name !== 'string') reads(e.name, local); break;
        case 'matrix': e.rows.flat().forEach((x) => reads(x, local)); break;
        case 'lambda': reads(e.body, new Set([...local, ...e.params])); break;
      }
    };
    const compare = (e: Expr, st: Stmt) => {
      const visit = (x: Expr) => {
        if (x.k === 'bin') {
          if ((x.op === '==' || x.op === '~=') && [x.a, x.b].some((s) => s.k === 'str' && s.v.length !== 1)) {
            problems.push({ ...stmtRange(st), severity: 'warning', message: `${x.op} on text compares it letter by letter and fails when the lengths differ: use strcmp(a, b)${x.op === '~=' ? ' with ~' : ''} instead.` });
          } else if ((x.op === '==' || x.op === '~=') && [x.a, x.b].some((s) => s.k === 'num' && !Number.isInteger(s.v))) {
            problems.push({ ...stmtRange(st), severity: 'info', message: 'Decimals are rarely exactly equal after arithmetic (0.1 + 0.2 isn’t 0.3): compare with abs(a - b) < 1e-9.' });
          }
          visit(x.a); visit(x.b);
        } else if (x.k === 'un' || x.k === 'post') visit(x.a);
        else if (x.k === 'index') x.args.forEach(visit);
      };
      visit(e);
    };
    const branch = (body: Stmt[]) => { if (loops) soft++; walk(body); if (loops) soft--; };
    const walk = (list: Stmt[]) => {
      let stopped: string | null = null;
      for (const st of list) {
        if (stopped) {
          problems.push({ ...stmtRange(st), severity: 'warning', message: `This line never runs: it comes after ${stopped}.` });
          stopped = null; // once per block
        }
        switch (st.s) {
          case 'assign': {
            reads(st.e);
            compare(st.e, st);
            for (const t of st.to) {
              if (t.k === 'index') t.args.forEach((a) => reads(a));
              if (t.k === 'field' && typeof t.name !== 'string') reads(t.name);
              const name = rootName(t);
              if (!name || name === '~') continue;
              if (t.k === 'id' && callable(name) && !defined.has(name) && !CONSTANTS.has(name)) {
                problems.push({ from: t.at, to: t.at + name.length, severity: 'info', message: `${name} is also a function: while this variable exists, ${name}(…) reads from it instead of calling the function. A different name avoids surprises.` });
              }
              if (t.k === 'index' && loops > 0 && !defined.has(name) && t.of.k === 'id') {
                problems.push({ from: t.of.at, to: t.of.at + name.length, severity: 'info', message: `${name} grows on every pass of the loop, which gets slow for long loops: make it first, before the loop (for example ${name} = zeros(1, n)).` });
              }
              if (t.k !== 'id' && defined.has(name)) used.add(name); // changing part of it counts as using it
              if (!firstSet.has(name)) firstSet.set(name, { at: t.k === 'id' ? t.at : st.at, shown: st.show });
              if (st.show) used.add(name);
              defined.add(name);
            }
            if (st.show && loops > 0) {
              const { codeTo } = codeEnd(src, st.at);
              problems.push({ ...stmtRange(st), severity: 'warning', message: 'This prints its result on every pass of the loop: add ; at the end to keep the command window quiet.', fix: { label: 'Add ;', from: codeTo, to: codeTo, insert: ';' } });
            }
            break;
          }
          case 'expr':
            reads(st.e);
            compare(st.e, st);
            if (st.e.k === 'index' && st.e.of.k === 'id' && MAKERS.has(st.e.of.name)) open = true;
            break;
          case 'command':
            if (MAKERS.has(st.name)) { if (st.name === 'syms') st.args.forEach((a) => { if (/^[A-Za-z]\w*$/.test(a)) defined.add(a); }); else open = true; }
            break;
          case 'global': st.names.forEach((n) => defined.add(n)); break;
          case 'if': for (const a of st.arms) { reads(a.cond); compare(a.cond, st); branch(a.body); } if (st.other) branch(st.other); break;
          case 'switch': reads(st.e); for (const c of st.cases) { reads(c.match); branch(c.body); } if (st.other) branch(st.other); break;
          case 'try': branch(st.body); if (st.id) defined.add(st.id); branch(st.handler); break;
          case 'for': case 'while': case 'do': {
            if (st.s === 'for') {
              reads(st.e);
              if (st.v.k === 'id') {
                if (st.v.name === 'i' || st.v.name === 'j') problems.push({ from: st.v.at, to: st.v.at + 1, severity: 'info', message: `${st.v.name} is also the imaginary unit √−1: as a loop counter it hides it (1i still works). k or ii avoids the mix-up.` });
                defined.add(st.v.name);
                used.add(st.v.name);
              }
            } else if (st.s === 'while') { reads(st.cond); compare(st.cond, st); }
            loops++;
            const outer = soft;
            soft = 0;
            walk(st.body);
            soft = outer;
            loops--;
            if (st.s === 'do') { reads(st.cond); compare(st.cond, st); }
            break;
          }
          case 'break': case 'continue': case 'return': stopped = st.s; break;
        }
      }
    };
    walk(body);
    if (inFunction) for (const [name, { at, shown }] of firstSet) {
      if (!used.has(name) && !shown && !outs.includes(name) && name !== 'ans') problems.push({ from: at, to: at + name.length, severity: 'warning', message: `${name} gets a value here but is never used afterwards.` });
    }
  };
  checkScope(prog.body, [], false, []);
  for (const f of prog.fns.values()) checkScope(f.body, [...f.params, ...(f.varargin ? ['varargin'] : [])], true, [...f.outs, ...(f.varargout ? ['varargout'] : [])]);
  return { problems: problems.sort((a, b) => a.from - b.from), prog };
}
