import prisma from '@/lib/db';
import { geminiFileText, geminiJson } from './gemini';
import { readAppFile } from '@/lib/storage';

// Course AI tutor. Answers come only from the course's own sources — the teacher's materials
// (PDFs and text files, turned into text once and stored) and notes the teacher adds — and cite
// them, so students can check. Also makes practice questions and flashcards from the same sources.

const MAX_SOURCE_CHARS = 60_000; // per source
const CHUNK = 1_400;
const TOP_CHUNKS = 8;
const READABLE = /\.(pdf|txt|md|csv|html?)$/i;

export type Access = { courseId: string; courseName: string; courseCode: string; role: 'STUDENT' | 'TEACHER' | 'ADMIN' };

/** Who may use the tutor for a course: its students, its teacher, admins. */
export async function tutorAccess(user: { id: string; role: string }, courseId: string): Promise<Access | null> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, code: true, teacherId: true } });
  if (!course) return null;
  const base = { courseId: course.id, courseName: course.name, courseCode: course.code };
  if (user.role === 'ADMIN') return { ...base, role: 'ADMIN' };
  if (user.role === 'TEACHER' && course.teacherId === user.id) return { ...base, role: 'TEACHER' };
  if (user.role === 'STUDENT') {
    const enrolled = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId: user.id, courseId } }, select: { id: true } });
    if (enrolled) return { ...base, role: 'STUDENT' };
  }
  return null;
}

/** The course's sources, with materials that haven't been read yet listed as pending. */
export async function listSources(courseId: string) {
  const [sources, materials] = await Promise.all([
    prisma.courseSource.findMany({ where: { courseId }, orderBy: { createdAt: 'asc' }, select: { id: true, title: true, kind: true, status: true, error: true, chars: true, materialId: true, updatedAt: true } }),
    prisma.material.findMany({ where: { courseId }, select: { id: true, title: true, fileUrl: true, type: true } }),
  ]);
  const known = new Set(sources.map((s) => s.materialId).filter(Boolean));
  const pending = materials.filter((m) => !known.has(m.id)).map((m) => ({ id: `material:${m.id}`, title: m.title, kind: 'material', status: readableMaterial(m) ? 'PENDING' : 'UNSUPPORTED', error: null, chars: 0, materialId: m.id, updatedAt: null }));
  return [...sources, ...pending];
}

const readableMaterial = (m: { fileUrl: string; title: string }) => READABLE.test(m.fileUrl.split('?')[0]) || READABLE.test(m.title);

/**
 * Reads course materials that haven't been turned into text yet (up to `limit` per call, since
 * each one is an AI request). PDFs are read by Gemini; text files directly.
 */
export async function prepareSources(courseId: string, limit = 3) {
  const done = await prisma.courseSource.findMany({ where: { courseId, materialId: { not: null } }, select: { materialId: true } });
  const have = new Set(done.map((d) => d.materialId));
  const todo = (await prisma.material.findMany({ where: { courseId }, select: { id: true, title: true, fileUrl: true } }))
    .filter((m) => !have.has(m.id) && readableMaterial(m))
    .slice(0, limit);
  let ready = 0;
  for (const m of todo) {
    let text = '', error: string | null = null;
    try {
      const file = await readAppFile(m.fileUrl);
      if (!file) error = 'The file could not be opened (only files uploaded to UniVerse can be read).';
      else if (/pdf/.test(file.mime) || /\.pdf$/i.test(m.fileUrl)) {
        const t = await geminiFileText(file.bytes, 'application/pdf');
        if (t === null) error = 'The AI couldn’t read this PDF (it may be scanned images only, or too large).';
        else text = t;
      } else text = new TextDecoder().decode(file.bytes).replace(/<[^>]+>/g, ' ');
    } catch (e) {
      error = `Reading failed: ${(e as Error).message}`.slice(0, 200);
    }
    text = text.replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, MAX_SOURCE_CHARS);
    if (!error && text.length < 40) error = 'No readable text was found in this file.';
    await prisma.courseSource.upsert({
      where: { materialId: m.id },
      create: { courseId, materialId: m.id, title: m.title, kind: 'material', text: error ? '' : text, chars: error ? 0 : text.length, status: error ? 'FAILED' : 'READY', error },
      update: { title: m.title, text: error ? '' : text, chars: error ? 0 : text.length, status: error ? 'FAILED' : 'READY', error },
    });
    if (!error) ready++;
  }
  const remaining = (await prisma.material.findMany({ where: { courseId }, select: { id: true, title: true, fileUrl: true } })).filter((m) => !have.has(m.id) && readableMaterial(m)).length - todo.length;
  return { read: todo.length, ready, remaining: Math.max(0, remaining) };
}

// ─── Retrieval: split sources into passages and pick the ones that best match the question ────

type Passage = { n: number; sourceId: string; title: string; text: string };

const STOP = new Set('the a an and or of to in on for is are was were be by with as at from that this it its what which who how why when where do does did can could should would will i you we they he she me my your our their about into than then there these those not no yes le la les un une des et ou de du en est sont pour par avec que qui quoi comment pourquoi dans sur ce cette'.split(' '));
const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{2,}/g)?.filter((w) => !STOP.has(w)) ?? [];

function passages(sources: { id: string; title: string; text: string }[]) {
  const out: Omit<Passage, 'n'>[] = [];
  for (const s of sources) {
    const paras = s.text.split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z])/);
    let buf = '';
    for (const p of paras) {
      if ((buf + ' ' + p).length > CHUNK && buf) { out.push({ sourceId: s.id, title: s.title, text: buf.trim() }); buf = ''; }
      buf += (buf ? ' ' : '') + p;
    }
    if (buf.trim()) out.push({ sourceId: s.id, title: s.title, text: buf.trim() });
  }
  return out;
}

/** BM25-style ranking of passages for a query. */
function rank(all: Omit<Passage, 'n'>[], query: string, k = TOP_CHUNKS): Passage[] {
  const q = [...new Set(words(query))];
  if (!q.length) return all.slice(0, k).map((p, i) => ({ ...p, n: i + 1 }));
  const docs = all.map((p) => words(p.title + ' ' + p.text));
  const avg = docs.reduce((n, d) => n + d.length, 0) / Math.max(1, docs.length);
  const df = new Map(q.map((w) => [w, docs.filter((d) => d.includes(w)).length]));
  const scored = docs.map((d, i) => {
    let score = 0;
    for (const w of q) {
      const tf = d.filter((x) => x === w).length;
      if (!tf) continue;
      const idf = Math.log(1 + (docs.length - df.get(w)! + 0.5) / (df.get(w)! + 0.5));
      score += idf * ((tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (d.length / avg))));
    }
    return { i, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
  return scored.map((x, j) => ({ ...all[x.i], n: j + 1 }));
}

async function readySources(courseId: string) {
  return prisma.courseSource.findMany({ where: { courseId, status: 'READY' }, select: { id: true, title: true, text: true } });
}

const cite = (ps: Passage[]) => ps.map((p) => `[${p.n}] (${p.title})\n${p.text}`).join('\n\n');

// ─── Ask ─────────────────────────────────────────────────────────────────────────────────────

const ASK_SYSTEM = `You are the AI tutor for a university course on UniVerse. Answer the student's question using ONLY the numbered course passages provided.
Rules:
- Cite the passages you used inline with their numbers in square brackets, like [1] or [2][3], right after the sentence they support.
- If the passages don't contain the answer, say so plainly (set "grounded" to false) and suggest what to ask the teacher or where to look; don't make things up. You may add one short general hint, clearly marked as not from the course.
- Explain step by step and simply, like a patient tutor. Encourage thinking: for homework-style questions, guide rather than just giving the final answer.
- Answer in the same language as the question. Keep it under 250 words. Use short paragraphs or bullet points; plain text, no markdown headings.`;

export async function askTutor(a: Access, question: string, history: { role: 'user' | 'tutor'; text: string }[]) {
  const sources = await readySources(a.courseId);
  if (!sources.length) return { answer: null, reason: 'no-sources' as const, citations: [] };
  const context = history.slice(-4).map((h) => `${h.role === 'user' ? 'Student' : 'Tutor'}: ${h.text.slice(0, 600)}`).join('\n');
  const found = rank(passages(sources), `${history.filter((h) => h.role === 'user').slice(-1)[0]?.text ?? ''} ${question}`);
  const out = await geminiJson<{ answer: string; grounded: boolean; used: number[] }>(
    ASK_SYSTEM,
    `Course: ${a.courseCode} — ${a.courseName}\n\nCourse passages:\n${cite(found) || '(none matched)'}\n\n${context ? `Conversation so far:\n${context}\n\n` : ''}Student's question: ${question.slice(0, 1500)}`,
    {
      type: 'OBJECT',
      properties: { answer: { type: 'STRING' }, grounded: { type: 'BOOLEAN' }, used: { type: 'ARRAY', items: { type: 'INTEGER' } } },
      required: ['answer', 'grounded', 'used'],
    },
    1500,
  );
  if (!out) return { answer: null, reason: 'unavailable' as const, citations: [] };
  const usedNums = new Set([...(out.used ?? []), ...[...out.answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]))]);
  const citations = found.filter((p) => usedNums.has(p.n)).map((p) => ({ n: p.n, title: p.title, sourceId: p.sourceId, excerpt: p.text.slice(0, 400) }));
  return { answer: out.answer, grounded: out.grounded && citations.length > 0, citations, reason: null };
}

// ─── Practice questions & flashcards ─────────────────────────────────────────────────────────

function pick(sources: { id: string; title: string; text: string }[], topic: string, k: number) {
  const all = passages(sources);
  if (topic.trim()) return rank(all, topic, k);
  // No topic: spread across the sources
  const step = Math.max(1, Math.floor(all.length / k));
  return all.filter((_, i) => i % step === 0).slice(0, k).map((p, i) => ({ ...p, n: i + 1 }));
}

export async function practiceQuestions(a: Access, topic: string, count = 5) {
  const sources = await readySources(a.courseId);
  if (!sources.length) return { questions: null, reason: 'no-sources' as const };
  const ps = pick(sources, topic, 8);
  const out = await geminiJson<{ questions: { question: string; options: string[]; answer: number; explanation: string; source: number }[] }>(
    `You write practice questions for university students from course passages. Make ${count} multiple-choice questions that test understanding (not trivia), each with 4 plausible options and exactly one correct answer. The explanation says why the answer is right, in one or two sentences. "source" is the number of the passage the question comes from. Use the language of the passages.`,
    `Course: ${a.courseCode} — ${a.courseName}${topic ? `\nTopic: ${topic.slice(0, 200)}` : ''}\n\nPassages:\n${cite(ps)}`,
    {
      type: 'OBJECT',
      properties: { questions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { question: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } }, answer: { type: 'INTEGER' }, explanation: { type: 'STRING' }, source: { type: 'INTEGER' } }, required: ['question', 'options', 'answer', 'explanation', 'source'] } } },
      required: ['questions'],
    },
    2500,
  );
  if (!out?.questions) return { questions: null, reason: 'unavailable' as const };
  const questions = out.questions
    .filter((q) => Array.isArray(q.options) && q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length)
    .slice(0, count)
    .map((q) => ({ ...q, options: q.options.slice(0, 5), sourceTitle: ps.find((p) => p.n === q.source)?.title ?? null }));
  return { questions, reason: null };
}

export async function makeFlashcards(a: Access, topic: string, count = 10) {
  const sources = await readySources(a.courseId);
  if (!sources.length) return { cards: null, reason: 'no-sources' as const };
  const ps = pick(sources, topic, 8);
  const out = await geminiJson<{ cards: { front: string; back: string; source: number }[] }>(
    `You make study flashcards from course passages. Make up to ${count} cards: the front is a short question or term, the back a short, precise answer (max 40 words). Cover the key ideas, one idea per card. "source" is the passage number. Use the language of the passages.`,
    `Course: ${a.courseCode} — ${a.courseName}${topic ? `\nTopic: ${topic.slice(0, 200)}` : ''}\n\nPassages:\n${cite(ps)}`,
    {
      type: 'OBJECT',
      properties: { cards: { type: 'ARRAY', items: { type: 'OBJECT', properties: { front: { type: 'STRING' }, back: { type: 'STRING' }, source: { type: 'INTEGER' } }, required: ['front', 'back', 'source'] } } },
      required: ['cards'],
    },
    2000,
  );
  if (!out?.cards) return { cards: null, reason: 'unavailable' as const };
  return { cards: out.cards.filter((c) => c.front?.trim() && c.back?.trim()).slice(0, count).map((c) => ({ front: c.front.slice(0, 300), back: c.back.slice(0, 600), sourceTitle: ps.find((p) => p.n === c.source)?.title ?? null })), reason: null };
}

// ─── Spaced repetition (SM-2) ────────────────────────────────────────────────────────────────

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

/** Next interval (days), ease and repetition count after a review, following SM-2. */
export function schedule(card: { interval: number; ease: number; reps: number; lapses: number }, grade: ReviewGrade) {
  const q = { again: 1, hard: 3, good: 4, easy: 5 }[grade];
  let { interval, ease, reps, lapses } = card;
  if (q < 3) { reps = 0; interval = 0; lapses += 1; }
  else {
    reps += 1;
    interval = reps === 1 ? 1 : reps === 2 ? (grade === 'easy' ? 4 : 3) : Math.round(interval * ease * (grade === 'hard' ? 0.8 : grade === 'easy' ? 1.3 : 1));
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  const due = new Date(Date.now() + (interval === 0 ? 10 * 60_000 : interval * 86_400_000)); // "again": in 10 minutes
  return { interval, ease: Math.round(ease * 100) / 100, reps, lapses, due };
}
