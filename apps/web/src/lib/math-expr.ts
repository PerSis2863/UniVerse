// Maths answers (Stage 5 · B4.1): reads an expression as students type it ("2x^2 + 3x", "1/2 x",
// "sqrt(x)", or LaTeX like "\frac{1}{2}x^{2}"), and checks whether two expressions are the same by
// working both out at a few sample values of their letters. Import-free; tested in math-expr.test.ts.

export type Node =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'neg'; a: Node }
  | { k: 'op'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { k: 'fn'; name: Fn; a: Node };

const FNS = ['sqrt', 'sin', 'cos', 'tan', 'ln', 'log', 'exp', 'abs'] as const;
type Fn = (typeof FNS)[number];
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };
const MAX_INPUT = 200;
const MAX_DEPTH = 40;

/** Reads one brace group "{...}" starting at s[i] === '{'; returns its inside and the index after it. */
function group(s: string, i: number): [string, number] | null {
  if (s[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}' && --depth === 0) return [s.slice(i + 1, j), j + 1];
  }
  return null;
}

/** LaTeX and maths symbols turned into plain notation: \frac{a}{b} → ((a)/(b)), \sqrt{x} → sqrt(x)… */
export function plain(raw: string): string {
  let s = raw.slice(0, MAX_INPUT * 2)
    .replace(/\$/g, '').replace(/\\left|\\right|\\[,;:! ]|\\displaystyle/g, '')
    .replace(/\\cdot|\\times|[×·∙⋅]/g, '*').replace(/\\div|÷/g, '/').replace(/[−–]/g, '-')
    .replace(/\\pi|π/g, 'pi').replace(/²/g, '^2').replace(/³/g, '^3').replace(/√/g, 'sqrt')
    .replace(/\\(sin|cos|tan|ln|log|exp)\b/g, '$1');
  let out = '';
  for (let i = 0; i < s.length;) {
    if (s.startsWith('\\frac', i) || s.startsWith('\\dfrac', i) || s.startsWith('\\tfrac', i)) {
      const at = s.indexOf('{', i);
      const a = at >= 0 ? group(s, at) : null;
      const b = a ? group(s, a[1]) : null;
      if (!a || !b) return '';
      out += `((${plain(a[0])})/(${plain(b[0])}))`;
      i = b[1];
    } else if (s.startsWith('\\sqrt', i)) {
      let j = i + 5, n: string | null = null;
      if (s[j] === '[') { const end = s.indexOf(']', j); if (end < 0) return ''; n = s.slice(j + 1, end); j = end + 1; }
      const a = group(s, j);
      if (!a) return '';
      out += n ? `((${plain(a[0])})^(1/(${plain(n)})))` : `sqrt(${plain(a[0])})`;
      i = a[1];
    } else if (s[i] === '_') {
      // A subscript is part of the letter's name: x_1 → x1.
      const a = group(s, i + 1);
      if (a) { out += a[0].replace(/\W/g, ''); i = a[1]; } else { out += ''; i++; }
    } else if (s[i] === '\\') {
      return ''; // a command we don't know
    } else {
      out += s[i] === '{' ? '(' : s[i] === '}' ? ')' : s[i];
      i++;
    }
  }
  s = out;
  return s;
}

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'sym'; v: string };

function tokens(s: string): Tok[] | null {
  const out: Tok[] = [];
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
    if (num) { out.push({ t: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[a-zA-Z]+\d*/.exec(s.slice(i));
    if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    if ('+-*/^()|,'.includes(c)) { out.push({ t: 'sym', v: c }); i++; continue; }
    return null;
  }
  return out;
}

/** The expression as a tree, or null when it can't be read. */
export function parseExpr(raw: string): Node | null {
  if (!raw.trim() || raw.length > MAX_INPUT) return null;
  const s = plain(raw);
  const toks = s ? tokens(s) : null;
  if (!toks || !toks.length) return null;
  let i = 0;
  const peek = () => toks[i];
  const isSym = (v: string) => peek()?.t === 'sym' && peek()!.v === v;
  const fail = () => { throw new Error('parse'); };

  // Letters that aren't a function or a constant are separate letters multiplied: "xy" → x·y.
  const ident = (name: string): Node => {
    if (name in CONSTS) return { k: 'num', v: CONSTS[name] };
    const m = /^([a-zA-Z]+)(\d*)$/.exec(name)!;
    const letters = m[1].split('');
    const parts: Node[] = letters.map((l, j) => ({ k: 'var', name: j === letters.length - 1 ? l + m[2] : l }));
    return parts.reduce((a, b) => ({ k: 'op', op: '*', a, b }));
  };
  // What can follow without a sign and mean "times" (not "|": it may close an |absolute value|).
  const startsPrimary = () => { const p = peek(); return !!p && (p.t === 'num' || p.t === 'id' || (p.t === 'sym' && p.v === '(')); };

  function expr(d: number): Node {
    if (d > MAX_DEPTH) fail();
    let a = term(d + 1);
    while (isSym('+') || isSym('-')) { const op = peek()!.v as '+' | '-'; i++; a = { k: 'op', op, a, b: term(d + 1) }; }
    return a;
  }
  function term(d: number): Node {
    let a = unary(d + 1);
    for (;;) {
      if (isSym('*') || isSym('/')) { const op = peek()!.v as '*' | '/'; i++; a = { k: 'op', op, a, b: unary(d + 1) }; }
      else if (startsPrimary()) a = { k: 'op', op: '*', a, b: power(d + 1) }; // 2x, x(x+1), (a)(b)
      else return a;
    }
  }
  function unary(d: number): Node {
    if (d > MAX_DEPTH) fail();
    if (isSym('-')) { i++; return { k: 'neg', a: unary(d + 1) }; }
    if (isSym('+')) { i++; return unary(d + 1); }
    return power(d + 1);
  }
  function power(d: number): Node {
    const base = primary(d + 1);
    if (isSym('^')) { i++; return { k: 'op', op: '^', a: base, b: unary(d + 1) }; }
    return base;
  }
  function primary(d: number): Node {
    if (d > MAX_DEPTH) fail();
    const p = peek();
    if (!p) return fail();
    if (p.t === 'num') { i++; return { k: 'num', v: p.v }; }
    if (p.t === 'sym' && p.v === '(') { i++; const a = expr(d + 1); if (!isSym(')')) fail(); i++; return a; }
    if (p.t === 'sym' && p.v === '|') { i++; const a = expr(d + 1); if (!isSym('|')) fail(); i++; return { k: 'fn', name: 'abs', a }; }
    if (p.t === 'id') {
      i++;
      const name = p.v.toLowerCase();
      if ((FNS as readonly string[]).includes(name)) {
        // sin(x), or sin x (the next power: sin x^2 is sin(x^2)).
        const a = isSym('(') ? (i++, (() => { const e = expr(d + 1); if (!isSym(')')) fail(); i++; return e; })()) : power(d + 1);
        return { k: 'fn', name: name as Fn, a };
      }
      return ident(p.v);
    }
    return fail();
  }
  try {
    const tree = expr(0);
    return i === toks.length ? tree : null;
  } catch {
    return null;
  }
}

/** The letters an expression uses. */
export function letters(n: Node, out = new Set<string>()): Set<string> {
  if (n.k === 'var') out.add(n.name);
  else if (n.k === 'neg' || n.k === 'fn') letters(n.a, out);
  else if (n.k === 'op') { letters(n.a, out); letters(n.b, out); }
  return out;
}

export function evaluate(n: Node, at: Record<string, number>): number {
  switch (n.k) {
    case 'num': return n.v;
    case 'var': return at[n.name] ?? NaN;
    case 'neg': return -evaluate(n.a, at);
    case 'fn': {
      const x = evaluate(n.a, at);
      switch (n.name) {
        case 'sqrt': return Math.sqrt(x);
        case 'sin': return Math.sin(x);
        case 'cos': return Math.cos(x);
        case 'tan': return Math.tan(x);
        case 'ln': return Math.log(x);
        case 'log': return Math.log10(x);
        case 'exp': return Math.exp(x);
        case 'abs': return Math.abs(x);
      }
    }
    case 'op': {
      const a = evaluate(n.a, at), b = evaluate(n.b, at);
      return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : n.op === '/' ? a / b : Math.pow(a, b);
    }
  }
}

const SAMPLES = [0.7, 1.3, 2.9, -1.7, 3.6, 0.45, -0.35, 5.2];
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

/** Whether two expressions are the same: equal wherever both can be worked out (at least 3 points). */
export function sameExpr(a: Node, b: Node): boolean {
  const vars = [...new Set([...letters(a), ...letters(b)])].sort();
  if (!vars.length) { const x = evaluate(a, {}), y = evaluate(b, {}); return Number.isFinite(x) && Number.isFinite(y) && close(x, y); }
  let checked = 0;
  for (let k = 0; k < SAMPLES.length; k++) {
    // Each letter its own value at each point, so x·y and x² don't look alike.
    const at = Object.fromEntries(vars.map((v, j) => [v, SAMPLES[(k + j * 3) % SAMPLES.length] + j * 0.11]));
    const x = evaluate(a, at), y = evaluate(b, at);
    if (Number.isFinite(x) !== Number.isFinite(y)) return false;
    if (!Number.isFinite(x)) continue;
    if (!close(x, y)) return false;
    checked++;
  }
  return checked >= 3;
}

/** The expression in LaTeX, to show students how their answer was read. */
export function toLatex(n: Node): string {
  const wrap = (m: Node, s: string) => (m.k === 'op' && (m.op === '+' || m.op === '-') ? `\\left(${s}\\right)` : s);
  switch (n.k) {
    case 'num': return Math.abs(n.v - Math.PI) < 1e-12 ? '\\pi' : Math.abs(n.v - Math.E) < 1e-12 ? 'e' : String(n.v);
    case 'var': return n.name.replace(/^([a-zA-Z])(\d+)$/, '$1_{$2}');
    case 'neg': return `-${wrap(n.a, toLatex(n.a))}`;
    case 'fn': return n.name === 'sqrt' ? `\\sqrt{${toLatex(n.a)}}` : n.name === 'abs' ? `\\left|${toLatex(n.a)}\\right|` : `\\${n.name}\\left(${toLatex(n.a)}\\right)`;
    case 'op': {
      const a = toLatex(n.a), b = toLatex(n.b);
      if (n.op === '/') return `\\frac{${a}}{${b}}`;
      if (n.op === '^') return `${n.a.k === 'num' || n.a.k === 'var' || n.a.k === 'fn' ? a : `\\left(${a}\\right)`}^{${b}}`;
      if (n.op === '*') return `${wrap(n.a, a)}${n.b.k === 'num' || n.a.k === 'num' && n.b.k === 'neg' ? ' \\cdot ' : ' '}${wrap(n.b, b)}`;
      return `${a} ${n.op} ${n.b.k === 'neg' ? `\\left(${b}\\right)` : b}`;
    }
  }
}
