// A tiny syntax highlighter for code blocks in chat (```lang … ```): keywords, strings, comments,
// numbers, function calls and types, for the languages students and teachers paste most. Loaded
// only when a message has a code block (import('@/lib/highlight')), so chats don't carry it.
// Not a parser: a few regular expressions, good enough to make code readable.

export type TokenKind = 'kw' | 'str' | 'com' | 'num' | 'fn' | 'type' | 'tag' | 'attr' | 'lit';
export interface Token { text: string; kind?: TokenKind }

const words = (s: string) => new Set(s.split(/\s+/).filter(Boolean));
const C_LIKE = words('if else for while do switch case break continue return function var let const new delete typeof instanceof in of class extends super this import export from default try catch finally throw async await yield static public private protected void interface enum type implements package namespace using struct union goto sizeof auto register volatile extern inline virtual override final abstract synchronized throws native transient strictfp boolean byte char short int long float double unsigned signed func go defer chan select range map fallthrough fn mut impl trait pub crate mod use match loop where dyn ref move unsafe as is var val when object fun companion internal lateinit open sealed data suspend guard let protocol extension operator template typename constexpr nullptr friend explicit mutable');
const PY = words('def class return if elif else for while break continue pass import from as with try except finally raise yield lambda global nonlocal in is not and or del assert async await match case print');
const RUBY = words('def end class module if elsif else unless while until for in do return yield begin rescue ensure raise require include extend attr_accessor puts self nil');
const SH = words('if then else elif fi for while do done case esac in function return local export echo cd ls cat grep sed awk sudo exit set unset source alias');
const SQL = words('select from where and or not insert into values update set delete create table drop alter add primary key foreign references join left right inner outer full on group by order having limit offset as distinct union all exists in is null like between case when then else end index view count sum avg min max default unique check');
const LITERALS = words('true false null undefined None True False nil NaN Infinity');

interface Lang { kw: Set<string>; line?: string; block?: [string, string]; caseless?: boolean; markup?: boolean }
const LANGS: Record<string, Lang> = {
  c: { kw: C_LIKE, line: '//', block: ['/*', '*/'] },
  py: { kw: PY, line: '#' },
  rb: { kw: RUBY, line: '#' },
  sh: { kw: SH, line: '#' },
  sql: { kw: SQL, line: '--', block: ['/*', '*/'], caseless: true },
  json: { kw: new Set() },
  html: { kw: new Set(), markup: true },
  css: { kw: new Set(), block: ['/*', '*/'] },
};
const ALIAS: Record<string, string> = {
  js: 'c', jsx: 'c', ts: 'c', tsx: 'c', javascript: 'c', typescript: 'c', java: 'c', kotlin: 'c', kt: 'c', swift: 'c', go: 'c', golang: 'c',
  rust: 'c', rs: 'c', cpp: 'c', 'c++': 'c', cs: 'c', csharp: 'c', php: 'c', dart: 'c', scala: 'c', c: 'c', h: 'c',
  py: 'py', python: 'py', rb: 'rb', ruby: 'rb', sh: 'sh', bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', yaml: 'sh', yml: 'sh', toml: 'sh',
  sql: 'sql', postgres: 'sql', mysql: 'sql', sqlite: 'sql', json: 'json', html: 'html', xml: 'html', svg: 'html', vue: 'html', css: 'css', scss: 'css',
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** The code, line by line, as coloured pieces. Unknown languages get the C-like rules. */
export function highlight(code: string, lang: string): Token[][] {
  const l = LANGS[ALIAS[lang.toLowerCase()] ?? 'c'];
  if (l.markup) return code.split('\n').map(markupLine);
  const parts = [
    l.block ? `${esc(l.block[0])}[\\s\\S]*?(?:${esc(l.block[1])}|$)` : null,
    l.line ? `${esc(l.line)}[^\\n]*` : null,
    '"(?:\\\\.|[^"\\\\\\n])*"?', "'(?:\\\\.|[^'\\\\\\n])*'?", '`(?:\\\\.|[^`\\\\])*`?',
    '\\b0x[\\da-fA-F]+\\b|\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b',
    '[A-Za-z_$][\\w$]*',
  ].filter(Boolean);
  const re = new RegExp(parts.join('|'), 'g');
  const out: Token[] = [];
  let last = 0;
  for (const m of code.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: code.slice(last, i) });
    const t = m[0];
    const c = t[0];
    let kind: TokenKind | undefined;
    if ((l.line && t.startsWith(l.line)) || (l.block && t.startsWith(l.block[0]))) kind = 'com';
    else if (c === '"' || c === "'" || c === '`') kind = 'str';
    else if (/\d/.test(c)) kind = 'num';
    else if (LITERALS.has(t)) kind = 'lit';
    else if (l.kw.has(l.caseless ? t.toLowerCase() : t)) kind = 'kw';
    else if (code[i + t.length] === '(') kind = 'fn';
    else if (/^[A-Z][a-z]/.test(t) && !l.caseless) kind = 'type';
    out.push({ text: t, kind });
    last = i + t.length;
  }
  if (last < code.length) out.push({ text: code.slice(last) });
  // Split into lines (a comment or string may span several).
  const lines: Token[][] = [[]];
  for (const tok of out) {
    const pieces = tok.text.split('\n');
    pieces.forEach((p, k) => {
      if (k > 0) lines.push([]);
      if (p) lines[lines.length - 1].push({ text: p, kind: tok.kind });
    });
  }
  return lines;
}

/** HTML and XML: tags, attribute names and their values. */
function markupLine(line: string): Token[] {
  const out: Token[] = [];
  const re = /(<!--.*?(?:-->|$))|(<\/?[\w:-]+)|([\w:-]+)(?==)|("[^"]*"|'[^']*')|(\/?>)/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: line.slice(last, i) });
    out.push({ text: m[0], kind: m[1] ? 'com' : m[2] || m[5] ? 'tag' : m[3] ? 'attr' : 'str' });
    last = i + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

/** Colours for each kind of piece, on the code block's dark background. */
export const TOKEN_COLOR: Record<TokenKind, string> = {
  kw: '#c792ea', str: '#c3e88d', com: '#7a83a8', num: '#f78c6c', fn: '#82aaff', type: '#ffcb6b', tag: '#f07178', attr: '#ffcb6b', lit: '#ff9cac',
};
