// Stage 5 · Q21: collects the English text people see (screen text, button and field labels,
// toasts, dialogs, tab and menu names) from src/app and src/components into
// public/i18n/catalog.json. The owner console translates this catalog once per language with the
// AI translator (Owner console → Languages); the app then shows the translation in place of the
// English text (src/components/i18n/UiTranslator.tsx). Text with values in it ("{0} open reports")
// is kept as a pattern with numbered places. Run from apps/web after changing screens:
//   node scripts/gen-ui-strings.mjs
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const ROOTS = ['src/app', 'src/components'];
// Plain .ts files: only what reaches the screen (error messages, notification titles, labels).
const TS_ROOTS = ['src/app', 'src/components', 'src/server', 'src/lib'];
const TS_SKIP = /\/(sample|i18n)\b|\.test\.ts$|\.gen\.ts$/;
const PROPS_TS = new Set(['label', 'title', 'hint', 'description', 'subtitle', 'message', 'error', 'placeholder', 'confirmLabel']);
let props = null; // the property names that count in the file being read
const PROPS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label', 'hint', 'description', 'subtitle', 'message', 'confirmLabel', 'cancelLabel', 'emptyText', 'text', 'heading', 'caption', 'tooltip', 'name']);
const SKIP_CALLS = new Set(['cn', 'clsx', 'format', 'formatDistanceToNow', 'fetch', 'authedJson', 'authedFetch', 'chatJson', 'call', 'api', 'useSWR', 'require', 'import', 'push', 'replace', 'get', 'set', 'setItem', 'getItem', 'removeItem', 'querySelector', 'startsWith', 'endsWith', 'includes', 'split', 'join', 'test', 'match', 'encodeURIComponent', 'URL', 'URLSearchParams', 'addEventListener', 'dispatchEvent', 'Error', 'console']);
const out = new Set();

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const looksLikeText = (s) => /[A-Za-z]{2,}/.test(s) && !/^[a-z0-9]+([-_/.][a-z0-9]+)+$/i.test(s) && !/^(https?:|\/|#|@|\.|\{(?!\d\}))/.test(s) && !/^[a-z][a-zA-Z0-9]*$/.test(s) && s.length <= 300 && !/\b(px|rem|rgba?|var)\(|^[\w-]+:[\w-]+/.test(s) && !/^([a-z]+:)*-?[a-z]+(-[a-z0-9/.[\]]+)+(\s+([a-z]+:)*-?[a-z]+(-[a-z0-9/.[\]]+)+)*$/.test(s);
const add = (s) => { const t = norm(s); if (looksLikeText(t) && (!addNatural || natural(t))) out.add(t); };
/** Reads like a sentence or a label ("This term", "Not enrolled yet"), not a key or a code. */
const natural = (s) => /^[A-Z][a-z’']*([ ,.!?:;–—&/()-]+[\w’'-]+)+[.!?…)]?$|^[A-Z][a-z]+$/.test(norm(s));
const DENY = new Set(['className', 'class', 'href', 'src', 'id', 'key', 'type', 'name', 'role', 'style', 'd', 'viewBox', 'fill', 'stroke', 'rel', 'target', 'method', 'action', 'inputMode', 'autoComplete', 'pattern', 'accept', 'dir', 'lang', 'htmlFor', 'layoutId', 'value', 'defaultValue', 'icon', 'variant', 'size', 'color', 'gradient', 'tone', 'mode', 'kind', 'as', 'data-setting', 'form', 'list', 'enterKeyHint']);
let addNatural = false; // in a JSX prop or table that isn't a known label: only sentence-like text
const calleeName = (n) => (ts.isIdentifier(n.expression) ? n.expression.text : ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : '');
const isToast = (n) => (ts.isIdentifier(n.expression) && n.expression.text === 'toast') || (ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === 'toast');
/** "${n} open reports" → "{0} open reports" (null when nothing but values). */
function pattern(t) {
  let s = t.head.text;
  t.templateSpans.forEach((span, i) => { s += `{${i}}${span.literal.text}`; });
  const fixed = s.replace(/\{\d+\}/g, '');
  return /[A-Za-z]{2,}/.test(fixed) && t.templateSpans.length <= 4 ? s : null;
}
function strings(node, inUi) {
  // String literals that end up as visible text: JSX children, toast/dialog arguments, UI props.
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) { if (inUi) add(node.text); return; }
  if (ts.isTemplateExpression(node)) { if (inUi) { const p = pattern(node); if (p) add(p); } return; }
  // Errors people see: new BadRequestException('…'), new Error('…') in screens, NextResponse.json({ error: '…' }).
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && /(Exception|^Error)$/.test(node.expression.text)) { node.arguments?.forEach((a) => strings(a, true)); return; }
  // A helper that returns text for the screen ("Good morning").
  if (!props && ts.isReturnStatement(node) && node.expression) { strings(node.expression, true); return; }
  if (ts.isCallExpression(node)) {
    if (isToast(node)) { node.arguments.forEach((a) => strings(a, true)); return; }
    if (SKIP_CALLS.has(calleeName(node))) return;
    if (calleeName(node) === 'confirmDialog' || calleeName(node) === 'promptDialog') { node.arguments.forEach((a) => strings(a, true)); return; }
  }
  if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
    const key = node.name.text;
    if ((props ?? PROPS).has(key)) { strings(node.initializer, true); return; }
    if (key === 'className' || key === 'href' || key === 'id' || key === 'key' || key === 'type') return;
    // A table of texts in a screen ({ student: 'Your classes…' }): sentence-like values only.
    if (!props && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))) {
      addNatural = true; add(node.initializer.text); addNatural = false; return;
    }
  }
  if (ts.isJsxAttribute(node)) {
    const key = node.name.getText();
    if (PROPS.has(key) && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) add(node.initializer.text);
      else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) strings(node.initializer.expression, true);
    } else if (node.initializer && !DENY.has(key) && !key.startsWith('on') && !key.startsWith('aria-')) {
      // Any other prop (sub=, emptyLabel=…): its text counts when it reads like a sentence or a label.
      addNatural = true;
      if (ts.isStringLiteral(node.initializer)) add(node.initializer.text);
      else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) strings(node.initializer.expression, true);
      addNatural = false;
    } else if (node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) strings(node.initializer.expression, false);
    return;
  }
  if (ts.isJsxText(node)) { add(node.text); return; }
  if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) { strings(node.expression, true); return; }
  // Inside a conditional or && in visible text, the branches are visible text too.
  const passUi = inUi && (ts.isConditionalExpression(node) || ts.isBinaryExpression(node) || ts.isParenthesizedExpression(node) || ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node));
  ts.forEachChild(node, (c) => strings(c, passUi && !(ts.isConditionalExpression(node) && c === node.condition)));
}

const walk = (dir, files = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) files.push(p);
  }
  return files;
};
for (const f of ROOTS.flatMap((r) => walk(r))) {
  props = null;
  strings(ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), false);
}
const walkTs = (dir, files = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkTs(p, files);
    else if (/\.ts$/.test(name) && !TS_SKIP.test(p)) files.push(p);
  }
  return files;
};
for (const f of TS_ROOTS.flatMap((r) => walkTs(r))) {
  props = PROPS_TS;
  strings(ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS), false);
}
// The older t() keys' English text (src/lib/i18n.ts) shows on screen too.
const i18n = readFileSync('src/lib/i18n.ts', 'utf8');
const en = i18n.slice(i18n.indexOf('en: {'), i18n.indexOf('\n  },', i18n.indexOf('en: {')));
for (const m of en.matchAll(/'[\w.]+':\s*'((?:[^'\\]|\\.)*)'/g)) add(m[1].replace(/\\'/g, "'"));

// Patterns need their own words (same rule as src/lib/ui-dictionary.ts strongPattern).
const strong = (s) => { const f = s.replace(/\{\d+\}/g, ' '); return (f.match(/[A-Za-z]/g) ?? []).length >= 5 && (!/^\{\d+\}.*\{\d+\}$/.test(s) || (f.match(/[A-Za-z]{2,}/g) ?? []).length >= 2); };
const list = [...out].filter((s) => !/\{\d+\}/.test(s) || strong(s)).sort();
mkdirSync('public/i18n', { recursive: true });
writeFileSync('public/i18n/catalog.json', JSON.stringify({ v: list.length, strings: list }));
console.log(`${list.length} strings (${list.filter((s) => /\{\d+\}/.test(s)).length} with values) → public/i18n/catalog.json`);
