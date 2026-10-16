import { cleanQuestion, parseQuestionCsv, type BankQuestionIn } from './question-bank';
import type { QuestionInput } from './question-types';
import { parseGift } from './gift';
import { isQti, parseQti, type ImportResult } from './qti-items';
import { isMoodleXml, parseMoodleXml } from './moodle-xml';

// One step for the question bank's Import (Stage 5 · B4.6): any question file a teacher brings.
//  • .csv: the bank's own columns (src/lib/question-bank.ts)
//  • .txt / .gift: GIFT (Moodle's plain text, src/lib/gift.ts)
//  • .xml: Moodle XML (src/lib/moodle-xml.ts) or QTI 1.2 / 2.x (src/lib/qti-items.ts)
//  • .zip / .imscc: a QTI package (Canvas, Blackboard, Brightspace…): every QTI file inside
// Each question is checked with the same rules the server uses (cleanQuestion), so the preview says
// exactly what will be added and why anything won't; `send` holds the same questions as the reader
// gave them, for the server to check again (it never trusts the browser's checking). The caller
// unzips (fflate, loaded on demand).

export type QuestionFileFormat = 'CSV' | 'GIFT' | 'Moodle XML' | 'QTI';
export interface QuestionFile { format: QuestionFileFormat; questions: BankQuestionIn[]; send: (QuestionInput & { points?: number })[]; errors: { where: string; error: string }[] }

const MAX_QUESTIONS = 1000;
const MAX_FILES = 200;
const dec = new TextDecoder();

/** Turns a reader's questions into ones the bank can store, keeping each one's reason for not. */
function checked(format: QuestionFileFormat, r: ImportResult, prefix = ''): QuestionFile {
  const out: QuestionFile = { format, questions: [], send: [], errors: r.errors.map((e) => ({ where: `${prefix}Question ${e.n}${e.title ? ` (${e.title.slice(0, 50)})` : ''}`, error: e.error })) };
  r.questions.forEach((q) => {
    const c = cleanQuestion(q);
    if (typeof c === 'string') out.errors.push({ where: `${prefix}“${q.question.slice(0, 50)}”`, error: c });
    else { out.questions.push(c); out.send.push(q); }
  });
  return out;
}

function fromXml(text: string, prefix = ''): QuestionFile {
  if (isMoodleXml(text)) return checked('Moodle XML', parseMoodleXml(text), prefix);
  if (isQti(text)) return checked('QTI', parseQti(text), prefix);
  throw new Error('This XML file isn’t Moodle XML or QTI questions.');
}

/** Reads a question file, by its name and bytes. Throws with a plain message when it can't. */
export function readQuestionFile(name: string, bytes: Uint8Array, unzip?: (b: Uint8Array) => Record<string, Uint8Array>): QuestionFile {
  const ext = (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '');
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip || ext === 'zip' || ext === 'imscc') {
    if (!unzip) throw new Error('That zip file couldn’t be opened.');
    let files: Record<string, Uint8Array>;
    try { files = unzip(bytes); } catch { throw new Error('That zip file couldn’t be opened.'); }
    const out: QuestionFile = { format: 'QTI', questions: [], send: [], errors: [] };
    const xmls = Object.keys(files).filter((p) => /\.xml$/i.test(p) && !/(^|\/)(imsmanifest|assessment_meta)\.xml$/i.test(p)).sort().slice(0, MAX_FILES);
    let read = 0;
    for (const path of xmls) {
      const text = dec.decode(files[path]);
      if (!isQti(text) && !isMoodleXml(text)) continue;
      try {
        const r = fromXml(text, xmls.length > 1 ? `${path.split('/').pop()}: ` : '');
        read++;
        out.questions.push(...r.questions);
        out.send.push(...r.send);
        out.errors.push(...r.errors);
      } catch (e) { out.errors.push({ where: path.split('/').pop() ?? path, error: e instanceof Error ? e.message : 'Couldn’t be read.' }); }
      if (out.questions.length >= MAX_QUESTIONS) break;
    }
    if (!read) throw new Error('There are no QTI question files in that zip.');
    out.questions = out.questions.slice(0, MAX_QUESTIONS);
    out.send = out.send.slice(0, MAX_QUESTIONS);
    return out;
  }
  const text = dec.decode(bytes).replace(/^﻿/, '');
  if (ext === 'csv') {
    const r = parseQuestionCsv(text);
    const questions = r.questions.slice(0, MAX_QUESTIONS);
    return { format: 'CSV', questions, send: questions, errors: r.errors.map((e) => ({ where: `Line ${e.line}`, error: e.error })) };
  }
  if (ext === 'xml' || /^\s*<(\?xml|quiz|questestinterop|assessmentItem)\b/.test(text)) return fromXml(text);
  if (ext === 'txt' || ext === 'gift' || /\{[\s\S]*\}/.test(text)) return checked('GIFT', parseGift(text));
  throw new Error('Choose a CSV, GIFT (.txt), Moodle XML, QTI (.xml) or QTI package (.zip) file.');
}
