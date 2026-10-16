// GIFT import (Stage 5 · B4.6): Moodle's plain-text question format, into the question bank. Reads
// one-answer and several-answer multiple choice, true / false, short answer, fill in the blank,
// matching and numbers (with a tolerance or a range); titles, comments and general feedback (kept as
// the explanation). Essays and descriptions are skipped. Import-free; tested in gift.test.ts.
// Each question comes out as QuestionInput (src/lib/question-types.ts), checked on the server.

export interface GiftQuestion {
  type: 'CHOICE' | 'TRUE_FALSE' | 'MULTI' | 'SHORT' | 'BLANKS' | 'MATCH' | 'NUMBER';
  question: string; points: number;
  options?: string[]; correctAnswer?: string; correct?: string[]; partial?: boolean; accepted?: string[];
  pairs?: { left: string; right: string }[]; extra?: string[]; value?: number; tolerance?: number; explain?: string;
}

const MAX = 200;

/** Where a special character isn't escaped with a backslash. */
function unescapedAt(s: string, i: number) { let n = 0; for (let j = i - 1; j >= 0 && s[j] === '\\'; j--) n++; return n % 2 === 0; }
function indexOfUnescaped(s: string, ch: string, from = 0) { for (let i = s.indexOf(ch, from); i >= 0; i = s.indexOf(ch, i + 1)) if (unescapedAt(s, i)) return i; return -1; }
const unescape = (s: string) => s.replace(/\\([~=#{}:\\n])/g, (_, c: string) => (c === 'n' ? '\n' : c)).replace(/\s+/g, ' ').trim();
const stripFormat = (s: string) => s.replace(/^\s*\[(html|moodle|plain|markdown)\]/i, '');
const plainHtml = (s: string) => s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** The answers inside { }, split at unescaped = and ~ (and their feedback after # dropped). */
function answers(inner: string) {
  const out: { mark: '=' | '~'; text: string; weight: number | null }[] = [];
  let i = 0;
  while (i < inner.length) {
    const c = inner[i];
    if ((c === '=' || c === '~') && unescapedAt(inner, i)) {
      let j = i + 1;
      while (j < inner.length && !((inner[j] === '=' || inner[j] === '~') && unescapedAt(inner, j) && !(inner[j] === '=' && inner[j - 1] === '-'))) j++;
      // "->" in matching isn't a new answer; neither is "=" right after "-".
      let body = inner.slice(i + 1, j);
      const hash = indexOfUnescaped(body, '#');
      if (hash >= 0) body = body.slice(0, hash);
      const w = /^\s*%(-?\d+(?:\.\d+)?)%/.exec(body);
      out.push({ mark: c, text: w ? body.slice(w[0].length) : body, weight: w ? Number(w[1]) : null });
      i = j;
    } else i++;
  }
  return out;
}

function numberOf(inner: string): { value: number; tolerance: number } | null {
  let s = inner.trim().replace(/^#/, '').trim();
  if (s.startsWith('=')) s = s.slice(1).split(/(?<!\\)=/)[0].replace(/^%\d+%/, '');
  s = s.split('#')[0].trim();
  const range = /^(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)$/.exec(s);
  if (range) { const a = Number(range[1]), b = Number(range[2]); return { value: Number(((a + b) / 2).toPrecision(12)), tolerance: Number((Math.abs(b - a) / 2).toPrecision(12)) }; }
  const m = /^(-?\d+(?:\.\d+)?)(?:\s*:\s*(\d+(?:\.\d+)?))?$/.exec(s);
  return m ? { value: Number(m[1]), tolerance: m[2] ? Number(m[2]) : 0 } : null;
}

/** Questions from GIFT text; what couldn't be read (by question number) and why. */
export function parseGift(text: string): { questions: GiftQuestion[]; errors: { n: number; title: string; error: string }[] } {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').filter((l) => !/^\s*\/\//.test(l) && !/^\s*\$CATEGORY:/i.test(l));
  const blocks = lines.join('\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const questions: GiftQuestion[] = [];
  const errors: { n: number; title: string; error: string }[] = [];
  blocks.slice(0, MAX * 2).forEach((block, k) => {
    let rest = block;
    let title = '';
    const t = /^::([\s\S]*?)::/.exec(rest);
    if (t) { title = unescape(t[1]); rest = rest.slice(t[0].length); }
    const open = indexOfUnescaped(rest, '{');
    const close = open >= 0 ? indexOfUnescaped(rest, '}', open) : -1;
    const fail = (error: string) => errors.push({ n: k + 1, title: title || unescape(plainHtml(stripFormat(open >= 0 ? rest.slice(0, open) : rest))).slice(0, 60), error });
    if (open < 0 || close < 0) return fail('No answers in { }.');
    const before = unescape(plainHtml(stripFormat(rest.slice(0, open))));
    const after = unescape(plainHtml(rest.slice(close + 1)));
    let inner = rest.slice(open + 1, close);
    let explain: string | undefined;
    const general = inner.indexOf('####');
    if (general >= 0) { explain = unescape(plainHtml(inner.slice(general + 4))) || undefined; inner = inner.slice(0, general); }
    const base = { points: 1, ...(explain ? { explain } : {}) };
    const q = (s: string) => (after ? `${before} _____ ${after}` : before).replace(/\s+/g, ' ').trim() || s;
    const trimmed = inner.trim();
    if (!trimmed) return fail('An essay question: there’s no answer to mark.');
    if (trimmed.startsWith('#')) {
      const n = numberOf(trimmed);
      if (!n) return fail('The number couldn’t be read.');
      return void questions.push({ ...base, type: 'NUMBER', question: q(title), value: n.value, tolerance: n.tolerance });
    }
    const tf = /^(T|TRUE|F|FALSE)\s*(#.*)?$/i.exec(trimmed);
    if (tf) return void questions.push({ ...base, type: 'TRUE_FALSE', question: q(title), correctAnswer: /^t/i.test(tf[1]) ? 'True' : 'False' });
    const list = answers(inner).map((a) => ({ ...a, text: unescape(plainHtml(a.text)) }));
    if (!list.length) return fail('The answers couldn’t be read.');
    if (list.every((a) => a.mark === '=' && a.text.includes('->'))) {
      const pairs = list.map((a) => { const [l, ...r] = a.text.split('->'); return { left: l.trim(), right: r.join('->').trim() }; });
      return void questions.push({ ...base, type: 'MATCH', question: q(title), pairs: pairs.filter((p) => p.left && p.right), extra: pairs.filter((p) => !p.left && p.right).map((p) => p.right) });
    }
    if (list.every((a) => a.mark === '=')) {
      const accepted = list.filter((a) => a.weight == null || a.weight > 0).map((a) => a.text).filter(Boolean);
      if (after) return void questions.push({ ...base, type: 'BLANKS', question: `${before} [[${accepted.map((a) => a.replace(/[[\]|]/g, '')).join('|')}]] ${after}`.trim() });
      return void questions.push({ ...base, type: 'SHORT', question: q(title), accepted });
    }
    const options = list.map((a) => a.text);
    const weighted = list.some((a) => a.weight != null);
    const rightOnes = list.filter((a) => (weighted ? (a.weight ?? 0) > 0 : a.mark === '='));
    if (weighted || rightOnes.length > 1) return void questions.push({ ...base, type: 'MULTI', question: q(title), options, correct: rightOnes.map((a) => a.text), partial: weighted });
    if (rightOnes.length !== 1) return fail('Mark the right answer with =.');
    questions.push({ ...base, type: 'CHOICE', question: q(title), options, correctAnswer: rightOnes[0].text });
  });
  return { questions: questions.slice(0, MAX), errors };
}
