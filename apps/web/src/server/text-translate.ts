import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { textHash } from '@/lib/text-hash';
import { courseAccess } from '@/lib/course-access';
import { materialSections } from '@/lib/material-sections';
import { AiLimitError, requireAi } from './ai-budget';
import { boardAccess } from './boards';
import { canReadDoc } from './docs';
import { BadRequestException, HttpException } from './http';
import { canReadTaskBoard } from './tasks';
import { isLanguage, translateTexts, type Translation } from './translate';

// "Translate" on texts that aren't chat messages (Stage 5 · B7.5): announcements, group posts, and
// comments on tasks, docs and whiteboards; and the classroom (Stage 5 · D8, language-free classroom):
// assignment instructions, students' answers, teachers' feedback and course materials, a section
// at a time ("material-part", id "<courseSourceId>.<n>"). Grading always uses the original. Only texts the reader may read are translated; each is
// translated once per language and shared by everyone (an edited text is translated again).

export const KINDS = ['announcement', 'group-post', 'task-comment', 'doc-comment', 'board-comment', 'assignment', 'submission', 'feedback', 'material-part'] as const;
export type TextKind = (typeof KINDS)[number];
const MAX_ITEMS = 30;
const MAX_CHARS = 2000;
/** Longer texts (answers, instructions) are translated in sections; at most this many, about 22,000 characters. */
const MAX_PARTS = 12;
/** Characters per AI call, so the translation fits in one answer. */
const PER_CALL = 5000;


/** The texts of these items that this person may read, by "kind:id" (also used by reading levels, D9). */
export async function readable(user: SessionUser, items: { kind: TextKind; id: string }[]) {
  const ids = (k: TextKind) => [...new Set(items.filter((i) => i.kind === k).map((i) => i.id))];
  const out = new Map<string, string>();
  const [ann, posts, tasks, docs, boards] = await Promise.all([
    // Every signed-in person can read announcements (src/server/services/announcements.service.ts).
    ids('announcement').length ? prisma.announcement.findMany({ where: { id: { in: ids('announcement') } }, select: { id: true, title: true, body: true } }) : Promise.resolve([]),
    ids('group-post').length ? prisma.groupPost.findMany({ where: { id: { in: ids('group-post') } }, select: { id: true, body: true, group: { select: { isPublic: true, members: { where: { userId: user.id }, select: { id: true } } } } } }) : Promise.resolve([]),
    ids('task-comment').length ? prisma.taskComment.findMany({ where: { id: { in: ids('task-comment') } }, select: { id: true, body: true, task: { select: { boardId: true } } } }) : Promise.resolve([]),
    ids('doc-comment').length ? prisma.docComment.findMany({ where: { id: { in: ids('doc-comment') } }, select: { id: true, body: true, docId: true } }) : Promise.resolve([]),
    ids('board-comment').length ? prisma.boardComment.findMany({ where: { id: { in: ids('board-comment') } }, select: { id: true, body: true, boardId: true } }) : Promise.resolve([]),
  ]);
  for (const a of ann) out.set(`announcement:${a.id}`, `${a.title}\n\n${a.body}`);
  for (const p of posts) if (p.group.isPublic || p.group.members.length || user.role === 'ADMIN') out.set(`group-post:${p.id}`, p.body);
  // Where a comment lives decides who reads it; each place is checked once (a few at most per request).
  const allowed = async <T,>(list: T[], place: (x: T) => string, check: (id: string) => Promise<boolean>) => {
    const places = [...new Set(list.map(place))].slice(0, 5);
    const ok = new Set((await Promise.all(places.map(async (p) => ((await check(p)) ? p : null)))).filter((p): p is string => !!p));
    return list.filter((x) => ok.has(place(x)));
  };
  for (const c of await allowed(tasks, (x) => x.task.boardId, (id) => canReadTaskBoard(id, user))) out.set(`task-comment:${c.id}`, c.body);
  for (const c of await allowed(docs, (x) => x.docId, (id) => canReadDoc(id, user))) out.set(`doc-comment:${c.id}`, c.body);
  for (const c of await allowed(boards, (x) => x.boardId, async (id) => !!(await boardAccess(id, user.id)))) out.set(`board-comment:${c.id}`, c.body);

  // The classroom (D8). Instructions and materials: anyone in the course. An answer or its feedback:
  // the student who wrote it, or the course's teacher.
  const subIds = [...new Set([...ids('submission'), ...ids('feedback')])];
  const sourceIds = [...new Set(ids('material-part').map((r) => r.slice(0, r.lastIndexOf('.'))))];
  const [assignments, subs, sources] = await Promise.all([
    ids('assignment').length ? prisma.assignment.findMany({ where: { id: { in: ids('assignment') } }, select: { id: true, instructions: true, courseId: true } }) : Promise.resolve([]),
    subIds.length ? prisma.assignmentSubmission.findMany({ where: { id: { in: subIds } }, select: { id: true, text: true, feedback: true, studentId: true, assignment: { select: { courseId: true } } } }) : Promise.resolve([]),
    sourceIds.length ? prisma.courseSource.findMany({ where: { id: { in: sourceIds.slice(0, 5) }, status: 'READY' }, select: { id: true, courseId: true, text: true } }) : Promise.resolve([]),
  ]);
  const courses = new Map<string, Awaited<ReturnType<typeof courseAccess>>>();
  for (const id of [...new Set([...assignments.map((a) => a.courseId), ...subs.map((x) => x.assignment.courseId), ...sources.map((x) => x.courseId)])].slice(0, 5)) courses.set(id, await courseAccess(id, user));
  for (const a of assignments) if (courses.get(a.courseId)) out.set(`assignment:${a.id}`, a.instructions);
  for (const x of subs) {
    if (x.studentId !== user.id && !courses.get(x.assignment.courseId)?.canManage) continue;
    if (ids('submission').includes(x.id)) out.set(`submission:${x.id}`, x.text);
    if (ids('feedback').includes(x.id) && x.feedback) out.set(`feedback:${x.id}`, x.feedback);
  }
  for (const src of sources) {
    if (!courses.get(src.courseId)) continue;
    const parts = materialSections(src.text);
    for (const r of ids('material-part')) {
      const at = r.lastIndexOf('.');
      const n = Number(r.slice(at + 1));
      if (r.slice(0, at) === src.id && Number.isInteger(n) && parts[n]) out.set(`material-part:${r}`, parts[n]);
    }
  }
  return out;
}

/** POST /api/translate { items: [{ kind, id }], to }: translations by "kind:id" (missing ones couldn't be read or translated). */
export async function translateItems(user: SessionUser, b: Record<string, unknown>) {
  if (!isLanguage(b.to)) throw new BadRequestException('Choose a language to translate into.');
  const to = b.to;
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, MAX_ITEMS).map((x) => (x ?? {}) as Record<string, unknown>)
    .flatMap((x) => (KINDS.includes(x.kind as TextKind) && typeof x.id === 'string' && x.id.length <= 64 ? [{ kind: x.kind as TextKind, id: x.id }] : []));
  if (!items.length) return { translations: {} };
  const texts = await readable(user, items);
  const keys = [...texts.keys()];
  if (!keys.length) return { translations: {} };
  const stored = await prisma.textTranslation.findMany({ where: { lang: to, OR: KINDS.filter((k) => keys.some((key) => key.startsWith(`${k}:`))).map((k) => ({ kind: k, refId: { in: keys.filter((key) => key.startsWith(`${k}:`)).map((key) => key.slice(k.length + 1)) } })) }, select: { kind: true, refId: true, sourceLang: true, text: true, srcHash: true } });
  const result: Record<string, Translation> = {};
  for (const s of stored) {
    const key = `${s.kind}:${s.refId}`;
    // An edited text is translated again.
    if (texts.has(key) && s.srcHash === textHash(texts.get(key)!)) result[key] = { text: s.text, from: s.sourceLang, same: !s.text };
  }
  const todo = keys.filter((k) => !result[k]);
  if (todo.length) {
    try { await requireAi(user); } catch (e) {
      if (e instanceof AiLimitError) { if (Object.keys(result).length) return { translations: result }; throw new HttpException(e.message, 429); }
      throw e;
    }
    // Long texts go in sections ("key#n") and are joined again, so nothing is cut off.
    const parts = todo.flatMap((k) => {
      const t = texts.get(k)!;
      return t.length <= MAX_CHARS ? [{ id: k, text: t }] : materialSections(t).slice(0, MAX_PARTS).map((p, i) => ({ id: `${k}#${i}`, text: p }));
    });
    const calls: (typeof parts)[] = [];
    for (const p of parts) {
      const last = calls[calls.length - 1];
      if (last && last.length < 20 && last.reduce((n, x) => n + x.text.length, 0) + p.text.length <= PER_CALL) last.push(p);
      else calls.push([p]);
    }
    const got = new Map<string, { lang: string; text: string }>();
    let failed = false;
    for (const c of calls) {
      const r = await translateTexts(c, to);
      for (const [k, v] of r.out) got.set(k, v);
      if (r.failed) { failed = true; break; }
    }
    const out = new Map<string, { lang: string; text: string }>();
    for (const k of todo) {
      if (got.has(k)) { out.set(k, got.get(k)!); continue; }
      const mine = parts.filter((p) => p.id.startsWith(`${k}#`)).map((p) => got.get(p.id));
      if (!mine.length || mine.some((m) => !m)) continue; // a section failed: no translation rather than half of one
      const lang = mine.find((m) => m!.lang !== to)?.lang ?? to;
      // A section already in the target language comes back empty: keep its original.
      const text = mine.every((m) => !m!.text) ? '' : mine.map((m, i) => m!.text || parts.find((p) => p.id === `${k}#${i}`)!.text).join('\n\n');
      out.set(k, { lang: text ? lang : to, text });
    }
    const fresh: { kind: string; refId: string; lang: string; sourceLang: string; text: string; srcHash: string }[] = [];
    for (const k of todo) {
      const r = out.get(k);
      if (!r) continue;
      const text = r.lang === to ? '' : r.text;
      result[k] = { text, from: r.lang, same: !text };
      const at = k.indexOf(':');
      fresh.push({ kind: k.slice(0, at), refId: k.slice(at + 1), lang: to, sourceLang: r.lang, text, srcHash: textHash(texts.get(k)!) });
    }
    // Replaces any older (edited) translations, in two statements.
    if (fresh.length) {
      await prisma.textTranslation.deleteMany({ where: { lang: to, OR: KINDS.filter((k) => fresh.some((f) => f.kind === k)).map((k) => ({ kind: k, refId: { in: fresh.filter((f) => f.kind === k).map((f) => f.refId) } })) } });
      await prisma.textTranslation.createMany({ data: fresh }).catch(() => {});
    }
    if (failed && !Object.keys(result).length) throw new HttpException(process.env.GEMINI_API_KEY ? 'Translation is unavailable right now. Please try again.' : 'Translation isn’t set up yet.', 503);
  }
  return { translations: result };
}
