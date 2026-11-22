import { StreamLanguage, HighlightStyle, syntaxHighlighting, indentService } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';

// M389: Hyperion's code colouring and suggestions for MATLAB / Octave, our own tokenizer (the same rules as
// src/lib/lab/parse.ts: a quote after a value is a transpose, anywhere else it starts text).

const KEYWORDS = new Set(['if', 'elseif', 'else', 'end', 'endif', 'endfor', 'endwhile', 'endfunction', 'endswitch', 'end_try_catch', 'for', 'parfor', 'while', 'do', 'until', 'break', 'continue', 'return', 'function', 'switch', 'case', 'otherwise', 'try', 'catch', 'global', 'persistent']);
const OPENERS = /^\s*(if|for|parfor|while|switch|try|function|do)\b/;
const CLOSERS = /^\s*(end\w*|else|elseif|case|otherwise|catch|until)\b/;
/** The engine's function names (sent by the worker); filled in when it starts. */
export const builtinNames = new Set<string>();

interface St { block: boolean; afterValue: boolean }
export const matlab = StreamLanguage.define<St>({
  name: 'matlab',
  startState: () => ({ block: false, afterValue: false }),
  token(stream, st) {
    if (st.block) {
      if (stream.sol() && stream.match(/^\s*[%#]\}\s*$/)) { st.block = false; return 'comment'; }
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.sol() && stream.match(/^\s*[%#]\{\s*$/)) { st.block = true; return 'comment'; }
    if (stream.eatSpace()) return null;
    const ch = stream.peek();
    if (ch === '%' || ch === '#') { stream.skipToEnd(); st.afterValue = false; return 'comment'; }
    if (stream.match('...')) { stream.skipToEnd(); return 'comment'; }
    if (ch === '"' || (ch === "'" && !st.afterValue)) {
      stream.next();
      while (!stream.eol()) {
        const c = stream.next();
        if (c === ch) { if (stream.peek() === ch) { stream.next(); continue; } break; }
        if (ch === '"' && c === '\\') stream.next();
      }
      st.afterValue = true;
      return 'string';
    }
    if (stream.match(/^(0[xX][0-9a-fA-F]+|(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?)[ij]?/)) { st.afterValue = true; return 'number'; }
    const word = stream.match(/^[A-Za-z_]\w*/) as RegExpMatchArray | null;
    if (word) {
      const w = word[0];
      st.afterValue = !KEYWORDS.has(w) || w === 'end';
      if (KEYWORDS.has(w)) return 'keyword';
      if (w === 'true' || w === 'false' || w === 'pi' || w === 'Inf' || w === 'NaN' || w === 'eps') return 'atom';
      return builtinNames.has(w) ? 'builtin' : 'variableName';
    }
    if (stream.match(/^[)\]}]/)) { st.afterValue = true; return 'bracket'; }
    if (stream.match(/^[([{]/)) { st.afterValue = false; return 'bracket'; }
    if (ch === "'" && st.afterValue) { stream.next(); return 'operator'; }
    if (stream.match(/^(==|~=|!=|<=|>=|&&|\|\||\.\*|\.\/|\.\\|\.\^|\.'|[-+*/\\^<>&|~!=:@,;])/)) { st.afterValue = false; return 'operator'; }
    stream.next();
    st.afterValue = false;
    return null;
  },
  languageData: { commentTokens: { line: '%' }, closeBrackets: { brackets: ['(', '[', '{', '"'] }, indentOnInput: /^\s*(end|else|elseif|case|otherwise|catch)$/ },
});

/** Indentation: one step inside if / for / while / function…, back out for end, else, case. */
export const matlabIndent = indentService.of((cx, pos) => {
  const unit = cx.unit;
  let prev = cx.state.doc.lineAt(pos).number - 1, base = 0, opens = 0;
  while (prev >= 1) { const text = cx.lineAt(cx.state.doc.line(prev).from).text; if (text.trim()) { base = /^\s*/.exec(text)![0].length; opens = OPENERS.test(text) && !/\bend\s*;?\s*$/.test(text) ? 1 : /^\s*(else|elseif|case|otherwise|catch)\b/.test(text) ? 1 : 0; break; } prev--; }
  const here = cx.lineAt(pos).text.slice(0);
  return Math.max(0, base + opens * unit - (CLOSERS.test(here) ? unit : 0));
});

export const highlight = (dark: boolean) => syntaxHighlighting(HighlightStyle.define([
  { tag: t.keyword, color: dark ? '#c4b5fd' : '#6d28d9', fontWeight: '600' },
  { tag: t.standard(t.variableName), color: dark ? '#93c5fd' : '#1d4ed8' },
  { tag: t.string, color: dark ? '#6ee7b7' : '#047857' },
  { tag: t.comment, color: dark ? '#a1a1aa' : '#71717a', fontStyle: 'italic' },
  { tag: t.number, color: dark ? '#fcd34d' : '#b45309' },
  { tag: t.atom, color: dark ? '#fcd34d' : '#b45309' },
  { tag: t.operator, color: dark ? '#d4d4d8' : '#52525b' },
]));

/** Suggestions: the script's own words and variables, the engine's functions, the language's keywords. */
export function completions(vars: () => string[], describe: (name: string) => string | undefined) {
  return (cx: CompletionContext): CompletionResult | null => {
    const word = cx.matchBefore(/[A-Za-z_]\w*/);
    if (!word || (word.from === word.to && !cx.explicit)) return null;
    const own = new Set<string>();
    for (const m of cx.state.doc.toString().matchAll(/\b([A-Za-z_]\w*)\s*=/g)) own.add(m[1]);
    const options = [
      ...[...new Set([...vars(), ...own])].map((label) => ({ label, type: 'variable', boost: 2 })),
      ...[...KEYWORDS].map((label) => ({ label, type: 'keyword', boost: 1 })),
      ...[...builtinNames].map((label) => ({ label, type: 'function', info: describe(label) })),
    ];
    return { from: word.from, options, validFor: /^\w*$/ };
  };
}
