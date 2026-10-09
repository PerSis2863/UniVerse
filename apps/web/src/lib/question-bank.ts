// Question bank (Stage 5 · B4.1): rules shared by the server, the bank page and CSV import.
// Import-free.

export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface BankQuestionIn { question: string; options: string[]; correctAnswer: string; points: number; tags: string[]; difficulty: Difficulty | null }

/** A question made safe to store, or the reason it can't be. */
export function cleanQuestion(raw: { question?: unknown; options?: unknown; correctAnswer?: unknown; points?: unknown; tags?: unknown; difficulty?: unknown }): BankQuestionIn | string {
  const question = typeof raw.question === 'string' ? raw.question.trim().slice(0, 1000) : '';
  if (!question) return 'A question needs its text.';
  const options = (Array.isArray(raw.options) ? raw.options : []).map((o) => (typeof o === 'string' ? o.trim().slice(0, 300) : '')).filter(Boolean);
  if (options.length < 2 || options.length > 6) return 'Give 2 to 6 answer options.';
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return 'Answer options must be different.';
  const correct = typeof raw.correctAnswer === 'string' ? raw.correctAnswer.trim() : '';
  const correctAnswer = options.find((o) => o === correct) ?? options.find((o) => o.toLowerCase() === correct.toLowerCase());
  if (!correctAnswer) return 'The right answer must be one of the options.';
  const p = raw.points == null || raw.points === '' ? 1 : Number(raw.points);
  if (!Number.isFinite(p) || p < 0.5 || p > 100) return 'Points must be between 0.5 and 100.';
  const tagList = Array.isArray(raw.tags) ? raw.tags : typeof raw.tags === 'string' ? raw.tags.split(/[,;|]/) : [];
  const tags = [...new Set(tagList.map((t) => (typeof t === 'string' ? t.trim().toLowerCase().slice(0, 40) : '')).filter(Boolean))].slice(0, 8);
  const d = typeof raw.difficulty === 'string' ? raw.difficulty.trim().toUpperCase() : '';
  const difficulty = (DIFFICULTIES as readonly string[]).includes(d) ? (d as Difficulty) : null;
  return { question, options, correctAnswer, points: Math.round(p * 2) / 2, tags, difficulty };
}

/** Splits CSV text into rows of cells (quotes, commas or semicolons, CRLF). */
export function csvRows(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

/**
 * Questions from a CSV: question, option A…F, correct (a letter A–F or the answer's text), points,
 * tags (comma-separated inside quotes), difficulty (easy/medium/hard). A header row is skipped.
 * Columns are found by header names when there is a header; otherwise in that order with 4 options.
 */
export function parseQuestionCsv(text: string): { questions: BankQuestionIn[]; errors: { line: number; error: string }[] } {
  const rows = csvRows(text.replace(/^﻿/, ''));
  if (!rows.length) return { questions: [], errors: [] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = head.includes('question') || head.some((h) => /^(correct|answer)/.test(h));
  const col = (names: RegExp) => head.findIndex((h) => names.test(h));
  const idx = hasHeader
    ? { q: col(/^question/), opts: head.map((h, i) => (/^(option|choice|answer)\s*[a-f1-6]$|^[a-f]$/.test(h) ? i : -1)).filter((i) => i >= 0), correct: col(/^(correct|right|key)/), points: col(/^(points|marks|score)/), tags: col(/^tags?/), difficulty: col(/^(difficulty|level)/) }
    : { q: 0, opts: [1, 2, 3, 4], correct: 5, points: 6, tags: 7, difficulty: 8 };
  const questions: BankQuestionIn[] = [];
  const errors: { line: number; error: string }[] = [];
  rows.slice(hasHeader ? 1 : 0).forEach((r, i) => {
    const line = i + (hasHeader ? 2 : 1);
    const cell = (k: number) => (k >= 0 ? (r[k] ?? '').trim() : '');
    const options = idx.opts.map(cell).filter(Boolean);
    let correct = cell(idx.correct);
    const letter = /^[a-f]$/i.test(correct) ? correct.toUpperCase().charCodeAt(0) - 65 : -1;
    if (letter >= 0 && idx.opts[letter] != null) correct = cell(idx.opts[letter]);
    const q = cleanQuestion({ question: cell(idx.q), options, correctAnswer: correct, points: cell(idx.points), tags: cell(idx.tags), difficulty: cell(idx.difficulty) });
    if (typeof q === 'string') errors.push({ line, error: q });
    else questions.push(q);
  });
  return { questions, errors };
}
