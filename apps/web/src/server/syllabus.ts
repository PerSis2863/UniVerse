import { randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { logAiUse } from './ai-receipts';
import { spendAi } from './ai-budget';
import { geminiJson } from './gemini';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from './http';
import { parseSkills } from './skill-evidence';

// An AI first draft of a syllabus (Stage 5 · B2): the course, its level and number of weeks give
// weekly modules with their topics, learning outcomes and the skills the course builds (one AI
// request). The teacher edits the draft; nothing is saved until "Add to the course", and the new
// modules start hidden from students so the teacher can fill them in first.

export const LEVELS = ['school', 'first-year', 'intermediate', 'advanced', 'postgraduate'] as const;
export type Level = (typeof LEVELS)[number];
const LEVEL_TEXT: Record<Level, string> = {
  school: 'secondary school (ages 14–18)', 'first-year': 'first-year university, no background assumed', intermediate: 'second or third-year university',
  advanced: 'final-year university', postgraduate: 'postgraduate (master’s)',
};

export interface SyllabusDraft { outcomes: string[]; skills: string[]; modules: { title: string; summary: string; topics: string[] }[] }

const MAX_WEEKS = 20;
const cut = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const list = (v: unknown, max: number, len: number) => (Array.isArray(v) ? v.map((x) => cut(x, len)).filter(Boolean).slice(0, max) : []);

/** A draft as sent back by the teacher (or the AI): trimmed, capped, nothing empty. */
export function cleanDraft(raw: unknown): SyllabusDraft {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const modules = (Array.isArray(d.modules) ? d.modules.slice(0, 100) : []).flatMap((m) => {
    const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
    const title = cut(o.title, 120);
    return title ? [{ title, summary: cut(o.summary, 400), topics: list(o.topics, 6, 120) }] : [];
  }).slice(0, MAX_WEEKS);
  return { outcomes: list(d.outcomes, 6, 200), skills: parseSkills(JSON.stringify(list(d.skills, 6, 40))), modules };
}

async function teacherOf(courseId: string, user: SessionUser) {
  const a = await courseAccess(courseId, user);
  if (!a) throw new NotFoundException('Course not found.');
  if (!a.canManage) throw new ForbiddenException('Only the course’s teacher can plan its modules.');
  return a.course;
}

const SYSTEM = `You help a university teacher plan a course. Draft a syllabus the teacher will edit.
Give one module per week, in teaching order, each with a short title (no "Week n:" prefix), a one-sentence summary of what students learn, and 3–5 topics (short phrases).
Give 4–6 learning outcomes, each starting with a verb students can show ("Write…", "Explain…", "Compare…").
Give 4–6 skills the course builds, as an employer would list them: 1–4 words each.
Match the level asked for. Use the language of the course title. Plain text, no numbering.`;

/** POST /api/courses/:id/syllabus/draft { level, weeks, notes? } (one AI request). */
export async function draftSyllabus(courseId: string, user: SessionUser, b: Record<string, unknown>) {
  const course = await teacherOf(courseId, user);
  const level = (LEVELS as readonly unknown[]).includes(b.level) ? (b.level as Level) : 'first-year';
  const weeks = Math.floor(Number(b.weeks));
  if (!(weeks >= 1 && weeks <= MAX_WEEKS)) throw new BadRequestException(`Choose between 1 and ${MAX_WEEKS} weeks.`);
  const notes = cut(b.notes, 800);
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  await logAiUse(user.id, { kind: 'syllabus', detail: course.name, courseId });
  const full = await prisma.course.findUnique({ where: { id: courseId }, select: { description: true, department: true } });
  const out = await geminiJson<SyllabusDraft>(
    SYSTEM,
    `Course: ${course.code} — ${course.name}\nDepartment: ${full?.department ?? 'not given'}\nDescription: ${full?.description ?? 'not given'}\nLevel: ${LEVEL_TEXT[level]}\nWeeks: ${weeks}${notes ? `\nThe teacher adds: ${notes}` : ''}`,
    {
      type: 'OBJECT',
      properties: {
        outcomes: { type: 'ARRAY', items: { type: 'STRING' } },
        skills: { type: 'ARRAY', items: { type: 'STRING' } },
        modules: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, summary: { type: 'STRING' }, topics: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['title', 'summary', 'topics'] } },
      },
      required: ['outcomes', 'skills', 'modules'],
    },
    3000,
  );
  const draft = cleanDraft(out);
  if (!draft.modules.length) throw new HttpException('The AI couldn’t draft a syllabus this time. Try again, or add modules yourself.', 503);
  draft.modules = draft.modules.slice(0, weeks);
  return { draft, aiLeft: spend.left };
}

const newId = () => `c${[...randomBytes(18)].map((x) => (x % 36).toString(36)).join('').slice(0, 24)}`;

/**
 * POST /api/courses/:id/syllabus { draft, useSkills } — adds the (edited) draft as
 * modules after the existing ones, hidden from students, each topic a page to fill in; the outcomes
 * become a "Course outcomes" page in the first one. useSkills: the course's skills become the draft's.
 */
export async function applySyllabus(courseId: string, user: SessionUser, b: Record<string, unknown>) {
  await teacherOf(courseId, user);
  const draft = cleanDraft(b.draft);
  if (!draft.modules.length) throw new BadRequestException('Keep at least one module.');
  const last = await prisma.courseModule.findFirst({ where: { courseId }, orderBy: { position: 'desc' }, select: { position: true } });
  const start = (last?.position ?? -1) + 1;
  const modules = draft.modules.map((m, i) => ({ id: newId(), courseId, title: m.title, summary: m.summary || null, position: start + i, published: false }));
  const items = draft.modules.flatMap((m, i) => [
    ...(i === 0 && draft.outcomes.length ? [{ title: 'Course outcomes', body: `By the end of this course you will be able to:\n${draft.outcomes.map((o) => `• ${o}`).join('\n')}` }] : []),
    ...m.topics.map((t) => ({ title: t, body: null as string | null })),
  ].map((it, j) => ({ id: newId(), moduleId: modules[i].id, kind: 'PAGE', title: it.title, body: it.body, position: j })));
  // A few rows per statement: D1 allows 100 values per query (11 columns a module, 9 an item).
  for (let i = 0; i < modules.length; i += 9) await prisma.courseModule.createMany({ data: modules.slice(i, i + 9) });
  for (let i = 0; i < items.length; i += 11) await prisma.moduleItem.createMany({ data: items.slice(i, i + 11) });
  if (b.useSkills === true && draft.skills.length >= 3) await prisma.course.update({ where: { id: courseId }, data: { skills: JSON.stringify(draft.skills) } });
  return { modules: modules.length, items: items.length, skills: b.useSkills === true && draft.skills.length >= 3 };
}
