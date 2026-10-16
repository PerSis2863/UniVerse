import { find, kid, kids, parseXml, textOf, type XmlNode } from './xml-lite';
import { htmlText } from './cc-import';
import type { ImportedQuestion, ImportResult } from './qti-items';

// Moodle XML import into the question bank (Stage 5 · B4.6): the format Moodle's question bank
// exports besides GIFT. Reads multiple choice (one or several right), true / false, short answer,
// numbers (with a tolerance) and matching, with the general feedback kept as the explanation.
// Essays, descriptions, cloze and drag-and-drop are listed as skipped. Tested in moodle-xml.test.ts.

const MAX = 200;
const clean = (s: string) => htmlText(s).replace(/\s+/g, ' ').trim();
/** A <text> child's content (HTML in CDATA, or plain). */
const textIn = (n: XmlNode | undefined) => { const t = kid(n, 'text'); return t ? clean(t.text || textOf(t)) : ''; };
const num = (s: string) => { const n = Number(s.trim()); return Number.isFinite(n) ? n : null; };

const SKIP: Record<string, string> = {
  essay: 'An essay: there’s no answer to mark.',
  description: 'A description with no question.',
  multianswer: 'A cloze question: make it again as fill in the blanks.',
  calculated: 'A formula question: make it again as a number that changes.',
  calculatedsimple: 'A formula question: make it again as a number that changes.',
  calculatedmulti: 'A formula question: make it again as a number that changes.',
  ddwtos: 'Drag and drop: make it again as fill in the blanks.',
  gapselect: 'Drop-down blanks: make it again as fill in the blanks.',
  ddimageortext: 'Drag and drop onto a picture: make it again as tap on a picture.',
  ddmarker: 'Drag and drop onto a picture: make it again as tap on a picture.',
  randomsamatch: 'A random matching question.',
};

function question(q: XmlNode, type: string): ImportedQuestion | string {
  if (SKIP[type]) return SKIP[type];
  const text = textIn(kid(q, 'questiontext'));
  if (!text) return 'There’s no question text.';
  const explain = textIn(kid(q, 'generalfeedback'));
  const grade = num(textOf(kid(q, 'defaultgrade')));
  const base = { question: text, points: grade != null && grade > 0 && grade <= 100 ? grade : 1, ...(explain ? { explain: explain.slice(0, 1000) } : {}) };
  const answers = kids(q, 'answer').map((a) => ({ text: textIn(a) || clean(a.text), fraction: num(a.attrs.fraction ?? '0') ?? 0, tolerance: num(textOf(kid(a, 'tolerance'))) }));
  switch (type) {
    case 'truefalse': {
      const right = answers.find((a) => a.fraction > 0);
      if (!right) return 'No answer is marked right.';
      return { ...base, type: 'TRUE_FALSE', correctAnswer: /^true$/i.test(right.text) ? 'True' : 'False' };
    }
    case 'multichoice': {
      const options = answers.map((a) => a.text);
      if (options.length < 2 || options.some((o) => !o)) return 'The answer options couldn’t be read.';
      const correct = answers.filter((a) => a.fraction > 0).map((a) => a.text);
      if (!correct.length) return 'No answer is marked right.';
      if (textOf(kid(q, 'single')) === 'false' || correct.length > 1) return { ...base, type: 'MULTI', options, correct, partial: answers.some((a) => a.fraction > 0 && a.fraction < 100) };
      return { ...base, type: 'CHOICE', options, correctAnswer: correct[0] };
    }
    case 'shortanswer': {
      const accepted = [...new Set(answers.filter((a) => a.fraction >= 100).map((a) => a.text).filter((a) => a && a !== '*'))];
      if (!accepted.length) return 'There are no fully right answers.';
      return { ...base, type: 'SHORT', accepted: accepted.slice(0, 10) };
    }
    case 'numerical': {
      const right = answers.find((a) => a.fraction >= 100 && num(a.text) != null);
      if (!right) return 'The right number couldn’t be read.';
      const unit = textOf(find(find(kid(q, 'units'), 'unit'), 'unit_name'));
      return { ...base, type: 'NUMBER', value: num(right.text)!, tolerance: Math.abs(right.tolerance ?? 0), ...(unit ? { unit: unit.slice(0, 20) } : {}) };
    }
    case 'matching': {
      const subs = kids(q, 'subquestion').map((s) => ({ left: textIn(s), right: textIn(kid(s, 'answer')) }));
      const pairs = subs.filter((p) => p.left && p.right);
      return { ...base, type: 'MATCH', pairs, extra: subs.filter((p) => !p.left && p.right).map((p) => p.right) };
    }
  }
  return `A kind this app doesn’t take (${type || 'unknown'}).`;
}

/** Questions from a Moodle XML file; what couldn't be read, by question number, and why. */
export function parseMoodleXml(xml: string): ImportResult {
  const root = parseXml(xml);
  if (root.name !== 'quiz') throw new Error('This isn’t a Moodle XML question file.');
  const questions: ImportedQuestion[] = [];
  const errors: ImportResult['errors'] = [];
  kids(root, 'question').filter((q) => q.attrs.type !== 'category').slice(0, MAX * 2).forEach((q, k) => {
    const r = question(q, (q.attrs.type ?? '').toLowerCase());
    if (typeof r === 'string') errors.push({ n: k + 1, title: textIn(kid(q, 'name')) || textIn(kid(q, 'questiontext')).slice(0, 60) || `Question ${k + 1}`, error: r });
    else questions.push(r);
  });
  return { questions: questions.slice(0, MAX), errors };
}

/** True when the XML is a Moodle question file. */
export const isMoodleXml = (xml: string) => /^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<quiz\b/.test(xml.slice(0, 2000));
