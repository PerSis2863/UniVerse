import { find, findAll, kid, parseXml, textOf, type XmlNode } from './xml-lite';
import { htmlText } from './cc-import';
import type { QuestionInput, QuestionType } from './question-types';

// QTI import into the question bank (Stage 5 · B4.6). Reads the question files Canvas, Blackboard,
// Brightspace, Moodle and most other systems export:
//  • QTI 1.2 (questestinterop): multiple choice, true / false, multiple answers, short answer, fill in
//    several blanks, matching and numbers (exact with a margin, or a range). Canvas names each kind in
//    its metadata; without that, the kind is worked out from the answer boxes.
//  • QTI 2.1 / 3 (assessmentItem): choice (one or several), text entry (short answer, a number, or
//    blanks in a sentence), ordering and matching.
// Essays, file uploads, formulas and other kinds are listed as skipped, with the reason.
// Pure; the browser unzips a QTI package (fflate) and passes each XML file. Tested in qti-items.test.ts.

export type ImportedQuestion = QuestionInput & { type: QuestionType; question: string; points: number };
export interface ImportResult { questions: ImportedQuestion[]; errors: { n: number; title: string; error: string }[] }

const MAX = 200;
const clean = (s: string) => htmlText(s).replace(/\s+/g, ' ').trim();
const num = (s: string) => { const n = Number(s.trim()); return Number.isFinite(n) ? n : null; };
/** Without floating-point dust (3.15 − 3.13 is 0.0100000000000002). */
const tidy = (n: number) => Number(n.toPrecision(12));
const points = (v: number | null) => (v != null && v > 0 && v <= 100 ? v : 1);

const SKIP: Record<string, string> = {
  essay_question: 'an essay: there’s no answer to mark',
  file_upload_question: 'a file upload: there’s no answer to mark',
  text_only_question: 'text with no question',
  calculated_question: 'a formula question: make it again as a number that changes',
  multiple_dropdowns_question: 'drop-down blanks: make it again as fill in the blanks',
};

/** A QTI 1.2 material's text (HTML or plain). */
function mat(n: XmlNode | undefined) {
  const m = find(n, 'mattext') ?? find(n, 'mat_formattedtext');
  return m ? clean(m.text || textOf(m)) : '';
}
const field = (item: XmlNode, label: string) => {
  const f = findAll(item, 'qtimetadatafield').find((x) => textOf(kid(x, 'fieldlabel')) === label);
  return f ? textOf(kid(f, 'fieldentry')) : '';
};
/** The score a response condition gives (Set or Add; Subtract counts as nothing). */
const scoreOf = (c: XmlNode) => { const v = findAll(c, 'setvar').find((s) => (s.attrs.action ?? 'Set') !== 'Subtract'); return v ? num(textOf(v)) ?? 0 : 0; };
/** Values a condition names as right: inside <and>/<or>, not inside <not>. */
function rightValues(n: XmlNode, out: { respident: string; value: string }[] = []) {
  for (const c of n.children) {
    if (c.name === 'not') continue;
    if (c.name === 'varequal') out.push({ respident: c.attrs.respident ?? '', value: textOf(c) });
    else rightValues(c, out);
  }
  return out;
}

function qti12(item: XmlNode): ImportedQuestion | string {
  const kind = field(item, 'question_type') || field(item, 'cc_profile').replace(/^cc\.|\.v0p1$/g, '');
  if (SKIP[kind]) return SKIP[kind];
  const presentation = kid(item, 'presentation') ?? item;
  // The question's own text: the presentation's first material (not the answers').
  const question = mat(kid(presentation, 'material') ?? kid(find(presentation, 'flow'), 'material') ?? presentation);
  if (!question) return 'there’s no question text';
  const general = findAll(item, 'itemfeedback').find((f) => /general_fb|^general$/i.test(f.attrs.ident ?? ''));
  const base = { question, points: points(num(field(item, 'points_possible') || field(item, 'cc_weighting'))), ...(general && mat(general) ? { explain: mat(general).slice(0, 1000) } : {}) };
  const conds = findAll(item, 'respcondition').filter((c) => scoreOf(c) > 0);
  const lids = findAll(presentation, 'response_lid');
  const strs = findAll(presentation, 'response_str').concat(findAll(presentation, 'response_num'));

  if (/matching/.test(kind) || (!kind && lids.length > 1 && !/\[[^\]]+\]/.test(question))) {
    const labelText = new Map<string, string>();
    for (const l of lids.flatMap((x) => findAll(x, 'response_label'))) labelText.set(l.attrs.ident ?? '', mat(l));
    const pairs = lids.map((l) => {
      const v = conds.flatMap((c) => rightValues(c)).find((x) => x.respident === l.attrs.ident);
      return { left: mat(kid(l, 'material') ?? l), right: v ? labelText.get(v.value) ?? '' : '' };
    }).filter((p) => p.left && p.right);
    const used = new Set(pairs.map((p) => p.right));
    return { ...base, type: 'MATCH', pairs, extra: [...new Set(labelText.values())].filter((t) => t && !used.has(t)) };
  }
  if (/fill_in_multiple_blanks/.test(kind) || (!kind && lids.length > 1)) {
    // Each [name] in the text is a blank; its box lists the accepted answers.
    let text = question;
    for (const l of lids) {
      const name = mat(kid(l, 'material') ?? l) || (l.attrs.ident ?? '').replace(/^response_/, '');
      const labels = findAll(l, 'response_label');
      const marked = new Set(conds.flatMap((c) => rightValues(c)).filter((x) => x.respident === l.attrs.ident).map((x) => x.value));
      const accepted = labels.filter((x) => !marked.size || marked.has(x.attrs.ident ?? '')).map(mat).filter(Boolean).map((a) => a.replace(/[[\]|]/g, ''));
      if (!accepted.length) return `the blank “${name}” has no answer`;
      if (!text.includes(`[${name}]`)) return `the blank “${name}” isn’t in the question`;
      text = text.replace(`[${name}]`, `[[${accepted.slice(0, 6).join('|')}]]`);
    }
    return { ...base, type: 'BLANKS', question: text };
  }
  if (lids.length === 1) {
    const lid = lids[0];
    const labels = findAll(lid, 'response_label').map((l) => ({ id: l.attrs.ident ?? '', text: mat(l) }));
    const right = new Set(conds.flatMap((c) => rightValues(c)).filter((x) => !x.respident || x.respident === lid.attrs.ident).map((x) => x.value));
    const options = labels.map((l) => l.text);
    const correct = labels.filter((l) => right.has(l.id)).map((l) => l.text);
    if (labels.length < 2 || options.some((o) => !o)) return 'the answer options couldn’t be read';
    if (!correct.length) return 'no answer is marked right';
    const several = /multiple_answers/.test(kind) || (lid.attrs.rcardinality ?? 'Single') !== 'Single';
    if (several) return { ...base, type: 'MULTI', options, correct };
    if (/true_false/.test(kind) || (options.length === 2 && options.every((o) => /^(true|false)$/i.test(o)))) {
      if (options.every((o) => /^(true|false)$/i.test(o))) return { ...base, type: 'TRUE_FALSE', correctAnswer: /^true$/i.test(correct[0]) ? 'True' : 'False' };
    }
    return { ...base, type: 'CHOICE', options, correctAnswer: correct[0] };
  }
  if (strs.length) {
    const fib = find(strs[0], 'render_fib');
    const numeric = /numerical/.test(kind) || /^(decimal|integer)$/i.test(fib?.attrs.fibtype ?? '') || strs[0].name === 'response_num';
    if (numeric) {
      // Exact (with a margin as a range) or a range: the first right condition.
      for (const c of conds) {
        const eq = find(c, 'varequal'), lo = find(c, 'vargte') ?? find(c, 'vargt'), hi = find(c, 'varlte') ?? find(c, 'varlt');
        const v = eq ? num(textOf(eq)) : null, a = lo ? num(textOf(lo)) : null, b = hi ? num(textOf(hi)) : null;
        if (v != null) return { ...base, type: 'NUMBER', value: v, tolerance: a != null && b != null ? tidy(Math.max(v - a, b - v, 0)) : 0 };
        if (a != null && b != null && b >= a) return { ...base, type: 'NUMBER', value: tidy((a + b) / 2), tolerance: tidy((b - a) / 2) };
      }
      return 'the right number couldn’t be read';
    }
    const accepted = [...new Set(conds.flatMap((c) => rightValues(c)).map((x) => x.value.trim()).filter(Boolean))].slice(0, 10);
    if (!accepted.length) return 'there are no accepted answers';
    return { ...base, type: 'SHORT', accepted };
  }
  return kind ? `a kind this app doesn’t take (${kind.replace(/_question$/, '').replace(/_/g, ' ')})` : 'there are no answers to mark';
}

/** Elements by local name in raw XML, with their attributes and inner XML (not nested in themselves). */
function rawAll(xml: string, name: string) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}\\s*>)`, 'g');
  return [...xml.matchAll(re)].map((m) => ({ attrs: Object.fromEntries([...m[1].matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((a) => [a[1].replace(/^.*:/, ''), a[2] ?? a[3] ?? ''])), inner: m[2] ?? '', whole: m[0] }));
}
const INTERACTIONS = ['choiceInteraction', 'orderInteraction', 'matchInteraction', 'associateInteraction', 'extendedTextInteraction', 'hotspotInteraction', 'inlineChoiceInteraction', 'gapMatchInteraction', 'uploadInteraction', 'sliderInteraction'];

function qti21(xml: string, root: XmlNode): ImportedQuestion | string {
  const decls = new Map(findAll(root, 'responseDeclaration').map((d) => [d.attrs.identifier ?? '', d]));
  const correctOf = (id: string) => {
    const d = decls.get(id);
    const values = findAll(kid(d, 'correctResponse'), 'value').map(textOf);
    const mapped = findAll(kid(d, 'mapping'), 'mapEntry').filter((e) => (num(e.attrs.mappedValue ?? '') ?? 0) > 0).map((e) => e.attrs.mapKey ?? '');
    return { values: [...new Set([...values, ...mapped].map((v) => v.trim()).filter(Boolean))], d };
  };
  const body = rawAll(xml, 'itemBody')[0]?.inner ?? '';
  let text = body;
  for (const name of INTERACTIONS) text = text.replace(new RegExp(`<(?:[\\w.-]+:)?${name}\\b[\\s\\S]*?(?:/>|</(?:[\\w.-]+:)?${name}\\s*>)`, 'g'), ' ');
  const prompt = clean(rawAll(body, 'prompt')[0]?.inner ?? '');
  const general = findAll(root, 'modalFeedback').find((f) => (f.attrs.showHide ?? 'show') === 'show');
  const base = { points: points(num(findAll(root, 'outcomeDeclaration').find((o) => /MAXSCORE/i.test(o.attrs.identifier ?? ''))?.children.map(textOf).join(' ') ?? '')), ...(general && textOf(general) ? { explain: textOf(general).slice(0, 1000) } : {}) };
  const entries = rawAll(body, 'textEntryInteraction');
  const only = (s: string) => s.replace(/<(?:[\w.-]+:)?textEntryInteraction\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:[\w.-]+:)?textEntryInteraction\s*>)/g, ' ');
  const question = [clean(only(text)), prompt].filter(Boolean).join(' ').trim() || clean(root.attrs.title ?? '');
  if (!question) return 'there’s no question text';
  const kinds = INTERACTIONS.filter((n) => rawAll(body, n).length);
  const skipFor: Record<string, string> = { extendedTextInteraction: 'an essay: there’s no answer to mark', uploadInteraction: 'a file upload: there’s no answer to mark' };
  if (kinds.length + (entries.length ? 1 : 0) > 1) return 'a question with several kinds of answer in it';

  if (kinds[0] === 'choiceInteraction') {
    const ci = rawAll(body, 'choiceInteraction')[0];
    const choices = rawAll(ci.inner, 'simpleChoice').map((c) => ({ id: c.attrs.identifier ?? '', text: clean(c.inner) }));
    const { values, d } = correctOf(ci.attrs.responseIdentifier ?? '');
    const options = choices.map((c) => c.text);
    const correct = choices.filter((c) => values.includes(c.id)).map((c) => c.text);
    if (choices.length < 2 || options.some((o) => !o)) return 'the answer options couldn’t be read';
    if (!correct.length) return 'no answer is marked right';
    if ((d?.attrs.cardinality ?? 'single') !== 'single' || Number(ci.attrs.maxChoices ?? 1) !== 1) return { ...base, question, type: 'MULTI', options, correct };
    if (options.length === 2 && options.every((o) => /^(true|false)$/i.test(o))) return { ...base, question, type: 'TRUE_FALSE', correctAnswer: /^true$/i.test(correct[0]) ? 'True' : 'False' };
    return { ...base, question, type: 'CHOICE', options, correctAnswer: correct[0] };
  }
  if (kinds[0] === 'orderInteraction') {
    const oi = rawAll(body, 'orderInteraction')[0];
    const choices = new Map(rawAll(oi.inner, 'simpleChoice').map((c) => [c.attrs.identifier ?? '', clean(c.inner)]));
    const items = correctOf(oi.attrs.responseIdentifier ?? '').values.map((v) => choices.get(v) ?? '').filter(Boolean);
    if (items.length < 2) return 'the right order couldn’t be read';
    return { ...base, question, type: 'ORDER', items };
  }
  if (kinds[0] === 'matchInteraction') {
    const mi = rawAll(body, 'matchInteraction')[0];
    const sets = rawAll(mi.inner, 'simpleMatchSet').map((s) => new Map(rawAll(s.inner, 'simpleAssociableChoice').map((c) => [c.attrs.identifier ?? '', clean(c.inner)])));
    const [left = new Map<string, string>(), right = new Map<string, string>()] = sets;
    const pairs = correctOf(mi.attrs.responseIdentifier ?? '').values.map((v) => { const [a, b] = v.split(/\s+/); return { left: left.get(a) ?? '', right: right.get(b) ?? '' }; }).filter((p) => p.left && p.right);
    if (pairs.length < 2) return 'the right pairs couldn’t be read';
    const used = new Set(pairs.map((p) => p.right));
    return { ...base, question, type: 'MATCH', pairs, extra: [...right.values()].filter((t) => t && !used.has(t)) };
  }
  if (kinds.length) return skipFor[kinds[0]] ?? `a kind this app doesn’t take (${kinds[0].replace(/Interaction$/, '')})`;
  if (entries.length) {
    const answersOf = (e: (typeof entries)[number]) => correctOf(e.attrs.responseIdentifier ?? '');
    const first = answersOf(entries[0]);
    if (entries.length === 1 && /^(float|integer)$/.test(first.d?.attrs.baseType ?? '')) {
      const v = num(first.values[0] ?? '');
      if (v == null) return 'the right number couldn’t be read';
      // A margin from the marking rule (<equal tolerance="0.1 0.1">), if it has one.
      const tol = num((find(root, 'equal')?.attrs.tolerance ?? '').split(/\s+/)[0]) ?? 0;
      return { ...base, question, type: 'NUMBER', value: v, tolerance: Math.abs(tol) };
    }
    // Blanks in a sentence when there's text after a box (or several boxes); otherwise a short answer.
    const textAfter = clean(only(text.slice(text.indexOf(entries[entries.length - 1].whole) + entries[entries.length - 1].whole.length)));
    if (entries.length === 1 && !textAfter) {
      if (!first.values.length) return 'there are no accepted answers';
      return { ...base, question, type: 'SHORT', accepted: first.values.slice(0, 10) };
    }
    let marked = text;
    for (const e of entries) {
      const a = answersOf(e).values.map((x) => x.replace(/[[\]|]/g, '')).filter(Boolean);
      if (!a.length) return 'a blank has no answer';
      marked = marked.replace(e.whole, ` [[${a.slice(0, 6).join('|')}]] `);
    }
    return { ...base, type: 'BLANKS', question: [clean(marked), prompt].filter(Boolean).join(' ') };
  }
  return 'there are no answers to mark';
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1) + '.';

/** Questions from one QTI XML file (1.2 or 2.x); what couldn't be read, by question number, and why. */
export function parseQti(xml: string): ImportResult {
  const root = parseXml(xml);
  const questions: ImportedQuestion[] = [];
  const errors: ImportResult['errors'] = [];
  if (root.name === 'assessmentItem') {
    const q = qti21(xml, root);
    if (typeof q === 'string') errors.push({ n: 1, title: clean(root.attrs.title ?? '') || 'Question 1', error: sentence(q) });
    else questions.push(q);
    return { questions, errors };
  }
  if (root.name !== 'questestinterop' && !find(root, 'item')) throw new Error('This isn’t a QTI question file.');
  findAll(root, 'item').slice(0, MAX * 2).forEach((item, k) => {
    const q = qti12(item);
    if (typeof q === 'string') errors.push({ n: k + 1, title: (item.attrs.title ?? '').trim() || mat(kid(item, 'presentation')).slice(0, 60) || `Question ${k + 1}`, error: sentence(q) });
    else questions.push(q);
  });
  return { questions: questions.slice(0, MAX), errors };
}

/** True when the XML looks like QTI (1.2 or 2.x) rather than a manifest or something else. */
export const isQti = (xml: string) => /<(?:[\w.-]+:)?(questestinterop|assessmentItem)\b/.test(xml.slice(0, 5000)) || /<(?:[\w.-]+:)?item\b[^>]*ident=/.test(xml.slice(0, 20000));
