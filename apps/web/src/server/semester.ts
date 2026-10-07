import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { spendAi } from './ai-budget';
import { geminiJson } from './gemini';
import { HttpException } from './http';
import { featureOff } from './moderation';
import { words } from '@/lib/text-search';
import { later } from './email';

// "Ask your semester" (Stage 4 · 4.5): one search and AI answer box over a student's semester: what
// the teacher said in class (transcripts) and the study packs, course materials, their documents,
// their graded work with its feedback, and the notes of calls they were in. Every source is cut into
// passages once, when it's made or changed (and older ones a few at a time as people use this), and
// kept in a full-text index in D1 (memory_fts, FTS5: the database ranks, so a search costs the Worker
// almost nothing). Each passage has a scope (course:<id>, doc:<id>, user:<id>); a search only looks at
// the scopes the asker may see. Answers cite the passages, linking to the class moment or document.

export type MemoryKind = 'transcript' | 'pack' | 'material' | 'doc' | 'work' | 'meeting';
export const MEMORY_KINDS: MemoryKind[] = ['transcript', 'pack', 'material', 'doc', 'work', 'meeting'];
interface Piece { title: string; body: string; link: string; at?: number | null; day?: string | null }

const PIECE = 900; // characters per passage, about a paragraph
const CATCH_UP = 6; // older sources indexed per search, so the first searches stay quick
const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const day = (d: Date) => d.toISOString().slice(0, 10);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const parse = <T,>(v: string | null | undefined): T[] => { try { const x = JSON.parse(v ?? '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };

/** Text cut into passages of about PIECE characters, on sentence ends where it can. */
function cut(text: string): string[] {
  const out: string[] = [];
  let buf = '';
  for (const part of text.replace(/\s+\n/g, '\n').split(/(?<=[.!?])\s+|\n{2,}/)) {
    if (buf && (buf + ' ' + part).length > PIECE) { out.push(buf.trim()); buf = ''; }
    buf += (buf ? ' ' : '') + part;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter((p) => p.length > 20).slice(0, 200);
}

/** A document's saved HTML as plain text. */
const htmlText = (html: string) => html
  .replace(/<\/(p|h[1-6]|li|blockquote|pre|tr)>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+/g, ' ').trim();

/** Replaces a source's passages (in every scope) if it changed since it was last indexed. */
async function indexSource(kind: MemoryKind, ref: string, stamp: string, scopes: string[], pieces: Piece[]) {
  const had = await prisma.memorySource.findUnique({ where: { kind_ref: { kind, ref } }, select: { stamp: true } });
  if (had?.stamp === stamp) return false;
  await prisma.memoryPassage.deleteMany({ where: { kind, ref } });
  const rows = scopes.flatMap((scope) => pieces.map((p) => ({ kind, ref, scope, title: p.title.slice(0, 200), body: p.body.slice(0, 2400), link: p.link.slice(0, 300), at: p.at ?? null, day: p.day ?? null })));
  // D1 takes up to 100 values a query: 10 passages (9 values each) at a time.
  for (const part of chunks(rows, 10)) await prisma.memoryPassage.createMany({ data: part });
  await prisma.memorySource.upsert({ where: { kind_ref: { kind, ref } }, update: { stamp, indexedAt: new Date() }, create: { kind, ref, stamp } });
  return true;
}

// ── Sources ──────────────────────────────────────────────────────────────────────────────────────

/** A class: its study pack (summary, notes, key moments, recap, flashcards) and what the teacher said. */
export async function indexClassSession(sessionId: string) {
  const s = await prisma.classSession.findUnique({
    where: { id: sessionId },
    select: { id: true, courseId: true, status: true, startedAt: true, summary: true, notes: true, keyMoments: true, flashcards: true, recap: true, transcript: true, createdById: true, course: { select: { code: true } } },
  });
  if (!s || s.status !== 'READY') return;
  const scope = [`course:${s.courseId}`];
  const when = day(s.startedAt);
  const title = `${s.course.code} class · ${s.startedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  const link = `{portal}/blackboard?course=${s.courseId}&tab=sessions&session=${s.id}`;
  const pack = [s.summary ?? '', s.recap ?? '', parse<string>(s.notes).join('\n'), parse<{ t: number; text: string }>(s.keyMoments).map((k) => `${clock(k.t)} ${k.text}`).join('\n'), parse<{ front: string; back: string }>(s.flashcards).map((c) => `${c.front} ${c.back}`).join('\n')].filter(Boolean).join('\n\n');
  await indexSource('pack', s.id, `${pack.length}`, scope, cut(pack).map((body) => ({ title: `${title} · study pack`, body, link, day: when })));
  // What the teacher said, in pieces of about a minute and a half (students' own words aren't kept here).
  const teacher = (await prisma.user.findUnique({ where: { id: s.createdById }, select: { name: true } }))?.name;
  const lines = parse<{ t: number; who: string; text: string }>(s.transcript).filter((l) => l.who === teacher);
  const pieces: Piece[] = [];
  for (let i = 0; i < lines.length;) {
    const start = lines[i].t;
    let body = '';
    while (i < lines.length && (lines[i].t - start < 90 || !body) && body.length < PIECE) body += (body ? ' ' : '') + lines[i++].text;
    pieces.push({ title: `${title} · ${clock(start)}`, body, link: `${link}&t=${start}`, at: start, day: when });
  }
  await indexSource('transcript', s.id, `${lines.length}:${s.transcript?.length ?? 0}`, scope, pieces.slice(0, 300));
}

/** A course material the tutor has read. */
export async function indexCourseSource(sourceId: string) {
  const src = await prisma.courseSource.findUnique({ where: { id: sourceId }, select: { id: true, courseId: true, title: true, text: true, status: true, updatedAt: true } });
  if (!src || src.status !== 'READY' || !src.text) return;
  const link = `{portal}/blackboard?course=${src.courseId}&tab=materials`;
  await indexSource('material', src.id, `${src.text.length}:${src.updatedAt.getTime()}`, [`course:${src.courseId}`], cut(src.text).map((body) => ({ title: src.title, body, link, day: day(src.updatedAt) })));
}

/** A document, from its latest saved version (the editor saves one every couple of minutes). */
export async function indexDoc(docId: string) {
  const [doc, v] = await Promise.all([
    prisma.doc.findUnique({ where: { id: docId }, select: { id: true, title: true } }),
    prisma.docVersion.findFirst({ where: { docId }, orderBy: { createdAt: 'desc' }, select: { id: true, html: true, createdAt: true } }),
  ]);
  if (!doc || !v) return;
  await indexSource('doc', doc.id, v.id, [`doc:${doc.id}`], cut(htmlText(v.html)).map((body) => ({ title: doc.title, body, link: `/docs/${doc.id}`, day: day(v.createdAt) })));
}

/** A student's graded assignment: the task, their answer, the grade and the teacher's feedback (theirs only). */
export async function indexWork(submissionId: string) {
  const w = await prisma.assignmentSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, studentId: true, status: true, text: true, score: true, feedback: true, feedbackTranscript: true, returnedAt: true, assignment: { select: { title: true, instructions: true, maxScore: true, course: { select: { code: true } } } } },
  });
  if (!w || w.status !== 'RETURNED') return;
  const title = `${w.assignment.course.code} · ${w.assignment.title}`;
  const feedback = [w.score !== null ? `Grade: ${w.score} / ${w.assignment.maxScore}.` : '', w.feedback ?? '', w.feedbackTranscript ?? ''].filter(Boolean).join(' ');
  const pieces: Piece[] = [
    ...cut(w.assignment.instructions).slice(0, 4).map((body) => ({ title: `${title} · the task`, body })),
    ...cut(w.text).slice(0, 20).map((body) => ({ title: `${title} · your answer`, body })),
    ...cut(feedback).map((body) => ({ title: `${title} · feedback`, body })),
  ].map((p) => ({ ...p, link: '{portal}/assignments', day: w.returnedAt ? day(w.returnedAt) : null }));
  await indexSource('work', w.id, `${w.returnedAt?.getTime() ?? 0}:${feedback.length}`, [`user:${w.studentId}`], pieces);
}

/** A call's meeting notes, for each person who was in the call. */
export async function indexMeeting(noteId: string) {
  const n = await prisma.callNote.findUnique({ where: { id: noteId }, select: { id: true, status: true, title: true, summary: true, decisions: true, actions: true, people: true, createdById: true, startedAt: true } });
  if (!n || n.status !== 'READY') return;
  const people = [...new Set([n.createdById, ...parse<string>(n.people)])].filter((id) => !id.startsWith('guest:')).slice(0, 50);
  const body = [n.summary ?? '', parse<string>(n.decisions).map((d) => `Decided: ${d}`).join('\n'), parse<{ text: string; who: string; due: string }>(n.actions).map((a) => `To do: ${a.who ? `${a.who}: ` : ''}${a.text}${a.due ? ` (by ${a.due})` : ''}`).join('\n')].filter(Boolean).join('\n\n');
  await indexSource('meeting', n.id, `${body.length}`, people.map((id) => `user:${id}`), cut(body).map((b) => ({ title: `Meeting notes · ${n.title}`, body: b, link: `/calls?note=${n.id}`, day: day(n.startedAt) })));
}

/** Indexes in the background; a failure only means that source waits for the next catch-up. */
export const indexLater = (work: () => Promise<unknown>) => later(() => work().catch((e) => console.error('semester index:', e)));

// ── Searching ────────────────────────────────────────────────────────────────────────────────────

/** Who I am in the index: my courses, my documents and my own things. */
async function scopesOf(user: SessionUser) {
  const [courses, groups] = await Promise.all([
    user.role === 'STUDENT'
      ? prisma.enrollment.findMany({ where: { studentId: user.id }, select: { courseId: true }, take: 60 }).then((r) => r.map((e) => e.courseId))
      : prisma.course.findMany({ where: { teacherId: user.id }, select: { id: true }, take: 60 }).then((r) => r.map((c) => c.id)),
    prisma.groupMembership.findMany({ where: { userId: user.id }, select: { groupId: true }, take: 60 }).then((r) => r.map((m) => m.groupId)),
  ]);
  const docs = await prisma.doc.findMany({
    where: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }, ...(courses.length ? [{ courseId: { in: courses } }] : []), ...(groups.length ? [{ groupId: { in: groups } }] : [])] },
    orderBy: { updatedAt: 'desc' }, take: 80, select: { id: true },
  });
  return { courses, docs: docs.map((d) => d.id), scopes: [`user:${user.id}`, ...courses.map((c) => `course:${c}`), ...docs.map((d) => `doc:${d.id}`)] };
}

/** Older sources this person can see that aren't in the index yet (or changed): a few at a time. */
async function catchUp(user: SessionUser, me: { courses: string[]; docs: string[] }) {
  const since = new Date(Date.now() - 150 * 86_400_000);
  const [sessions, sources, docs, work, notes] = await Promise.all([
    me.courses.length ? prisma.classSession.findMany({ where: { courseId: { in: me.courses }, status: 'READY', startedAt: { gte: since } }, orderBy: { startedAt: 'desc' }, take: 40, select: { id: true, summary: true, recap: true, notes: true, keyMoments: true, flashcards: true } }) : Promise.resolve([]),
    me.courses.length ? prisma.courseSource.findMany({ where: { courseId: { in: me.courses }, status: 'READY' }, take: 60, select: { id: true, text: true, updatedAt: true } }) : Promise.resolve([]),
    me.docs.length ? prisma.docVersion.findMany({ where: { docId: { in: me.docs } }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, docId: true } }) : Promise.resolve([]),
    prisma.assignmentSubmission.findMany({ where: { studentId: user.id, status: 'RETURNED' }, take: 60, select: { id: true } }),
    prisma.callNote.findMany({ where: { status: 'READY', createdAt: { gte: since }, OR: [{ createdById: user.id }, { people: { contains: user.id } }] }, take: 40, select: { id: true } }),
  ]);
  // What's indexed already, for just these sources.
  const refs = [...sessions.map((x) => x.id), ...sources.map((x) => x.id), ...new Set(docs.map((v) => v.docId)), ...work.map((x) => x.id), ...notes.map((x) => x.id)];
  const known = (await Promise.all(chunks(refs, 90).map((c) => prisma.memorySource.findMany({ where: { ref: { in: c } }, select: { kind: true, ref: true, stamp: true } })))).flat();
  const stampOf = new Map(known.map((k) => [`${k.kind}:${k.ref}`, k.stamp]));
  const latestVersion = new Map<string, string>();
  for (const v of docs) if (!latestVersion.has(v.docId)) latestVersion.set(v.docId, v.id);
  const packLen = (s: (typeof sessions)[number]) => [s.summary ?? '', s.recap ?? '', parse<string>(s.notes).join('\n'), parse<{ t: number; text: string }>(s.keyMoments).map((k) => `${clock(k.t)} ${k.text}`).join('\n'), parse<{ front: string; back: string }>(s.flashcards).map((c) => `${c.front} ${c.back}`).join('\n')].filter(Boolean).join('\n\n').length;
  const todo: (() => Promise<unknown>)[] = [
    ...sessions.filter((s) => stampOf.get(`pack:${s.id}`) !== `${packLen(s)}`).map((s) => () => indexClassSession(s.id)),
    ...work.filter((w) => !stampOf.has(`work:${w.id}`)).map((w) => () => indexWork(w.id)),
    ...[...latestVersion].filter(([docId, vid]) => stampOf.get(`doc:${docId}`) !== vid).map(([docId]) => () => indexDoc(docId)),
    ...notes.filter((n) => !stampOf.has(`meeting:${n.id}`)).map((n) => () => indexMeeting(n.id)),
    ...sources.filter((s) => stampOf.get(`material:${s.id}`) !== `${s.text?.length ?? 0}:${s.updatedAt.getTime()}`).map((s) => () => indexCourseSource(s.id)),
  ];
  for (const job of todo.slice(0, CATCH_UP)) await job().catch((e) => console.error('semester catch-up:', e));
  return Math.max(0, todo.length - CATCH_UP);
}

export interface Found { id: number; kind: MemoryKind; ref: string; title: string; snippet: string; body: string; link: string; at: number | null; day: string | null }

/** The best passages for a question, from what this person may see (and has chosen to include). */
async function find(user: SessionUser, q: string, kinds: MemoryKind[], limit: number) {
  const me = await scopesOf(user);
  const pending = await catchUp(user, me);
  const terms = [...new Set(words(q))].slice(0, 12);
  if (!terms.length || !kinds.length) return { found: [] as Found[], pending };
  const match = terms.map((t) => `"${t}"`).join(' OR ');
  const rows: (Found & { rank: number })[] = [];
  // D1 takes up to 100 values a query: the scopes 80 at a time; the database ranks the passages.
  for (const part of chunks(me.scopes, 80)) {
    rows.push(...(await prisma.$queryRawUnsafe<(Found & { rank: number })[]>(
      `SELECT p."id", p."kind", p."ref", p."title", snippet("memory_fts", 1, '«', '»', '…', 24) AS "snippet", p."body", p."link", p."at", p."day", bm25("memory_fts", 2.0, 1.0) AS "rank"
       FROM "memory_fts" JOIN "memory_passages" p ON p."id" = "memory_fts".rowid
       WHERE "memory_fts" MATCH ? AND p."scope" IN (${part.map(() => '?').join(', ')}) AND p."kind" IN (${kinds.map(() => '?').join(', ')})
       ORDER BY "rank" LIMIT ?`,
      match, ...part, ...kinds, limit * 2,
    )));
  }
  // Best first, the same passage once, and at most three from one source.
  const seen = new Set<number>(), per = new Map<string, number>();
  const found = rows.sort((a, b) => a.rank - b.rank).filter((r) => {
    const key = `${r.kind}:${r.ref}`;
    if (seen.has(r.id) || (per.get(key) ?? 0) >= 3) return false;
    seen.add(r.id); per.set(key, (per.get(key) ?? 0) + 1);
    return true;
  }).slice(0, limit).map(({ rank: _rank, ...r }) => { void _rank; return { ...r, at: r.at === null ? null : Number(r.at) }; });
  return { found, pending };
}

const portalOf = (role: string) => (role === 'ADMIN' ? '/admin' : role === 'TEACHER' ? '/teacher' : '/student');
const kindsFrom = (raw: unknown): MemoryKind[] => {
  const want = typeof raw === 'string' ? raw.split(',') : [];
  const ok = MEMORY_KINDS.filter((k) => want.includes(k));
  return ok.length ? ok : MEMORY_KINDS;
};

/** GET /api/semester?q=&kinds=: search only (no AI). */
export async function searchSemester(user: SessionUser, q: string, kindsRaw: unknown) {
  const { found, pending } = await find(user, q.slice(0, 300), kindsFrom(kindsRaw), 12);
  const portal = portalOf(user.role);
  return { results: found.map(({ body: _b, ...r }) => { void _b; return { ...r, link: r.link.replace('{portal}', portal) }; }), pending };
}

const ASK_SYSTEM = `You help a student find things in their own semester on UniVerse: what was said in their classes, study packs, course materials, their documents, their graded work and feedback, and notes of calls they were in.
Answer using ONLY the numbered passages. Cite them inline with their numbers in square brackets, like [1] or [2][3], right after the sentence they support.
If the passages don't answer the question, say so plainly (grounded: false) and suggest where to look. Never make things up.
Answer in the language of the question, in under 200 words, in short paragraphs or bullet points, plain text.`;

/** POST /api/semester { q, kinds }: an AI answer from the best passages, with citations (one AI request). */
export async function askSemester(user: SessionUser, q: string, kindsRaw: unknown) {
  const question = q.trim().slice(0, 500);
  if (!question) throw new HttpException('Type a question.', 400);
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) throw new HttpException('AI answers aren’t available right now. The search results below still work.', 503);
  const { found, pending } = await find(user, question, kindsFrom(kindsRaw), 8);
  if (!found.length) return { answer: null, grounded: false, citations: [], pending };
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  const passages = found.map((f, i) => `[${i + 1}] (${f.title}${f.day ? `, ${f.day}` : ''})\n${f.body}`).join('\n\n');
  const out = await geminiJson<{ answer: string; grounded: boolean; used: number[] }>(ASK_SYSTEM, `Passages:\n${passages}\n\nQuestion: ${question}`, {
    type: 'OBJECT', properties: { answer: { type: 'STRING' }, grounded: { type: 'BOOLEAN' }, used: { type: 'ARRAY', items: { type: 'INTEGER' } } }, required: ['answer', 'grounded', 'used'],
  }, 1200);
  if (!out) throw new HttpException('Couldn’t get an answer right now. Please try again.', 502);
  const used = new Set([...(out.used ?? []), ...[...out.answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]))]);
  const portal = portalOf(user.role);
  const citations = found.map((f, i) => ({ n: i + 1, kind: f.kind, title: f.title, link: f.link.replace('{portal}', portal), at: f.at, excerpt: f.body.slice(0, 280) })).filter((c) => used.has(c.n));
  return { answer: out.answer, grounded: out.grounded && citations.length > 0, citations, pending };
}
