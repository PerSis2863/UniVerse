import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { logAiUse } from './ai-receipts';
import { spendAi } from './ai-budget';
import { later, notify, notifyMany } from './email';
import { geminiJson } from './gemini';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from './http';

// The student side of assignments (Stage 5 · B3.5): a signed receipt for each hand-in, the rubric in
// plain words (made once by AI for the whole class), and asking for a regrade.

// ── Receipts ─────────────────────────────────────────────────────────────────────────────────
// "r1.<submission>.<handed in, ms base 36>.<content fingerprint>.<HMAC>", signed with SESSION_SECRET
// like the other links (its own label, so it can't be used as one). Nothing is stored: a receipt
// proves that this content was handed in at that time, even after a later version replaces it.

const secret = () => { const s = process.env.SESSION_SECRET; return s && s.length >= 32 ? s : null; };
const mac = (key: string, body: string) => createHmac('sha256', key).update(`receipt:${body}`).digest('base64url').slice(0, 22);

export const fingerprint = (h: { text: string; fileUrl?: string | null; linkUrl?: string | null }) =>
  createHash('sha256').update(`${h.text}\n${h.fileUrl ?? ''}\n${h.linkUrl ?? ''}`).digest('base64url').slice(0, 16);

/** A hand-in's receipt (null when receipts aren't set up: no SESSION_SECRET). */
export function receiptFor(sub: { id: string; submittedAt: Date; text: string; fileUrl?: string | null; linkUrl?: string | null }): string | null {
  const key = secret();
  if (!key) return null;
  const body = `r1.${sub.id}.${sub.submittedAt.getTime().toString(36)}.${fingerprint(sub)}`;
  return `${body}.${mac(key, body)}`;
}

/** What a receipt says, if its signature is right. */
export function readReceipt(code: string): { submissionId: string; submittedAt: Date; fingerprint: string } | null {
  const key = secret();
  const m = /^r1\.([A-Za-z0-9_-]{1,64})\.([0-9a-z]{1,12})\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{22})$/.exec(code.trim());
  if (!key || !m) return null;
  const body = `r1.${m[1]}.${m[2]}.${m[3]}`;
  const a = Buffer.from(mac(key, body)), b = Buffer.from(m[4]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { submissionId: m[1], submittedAt: new Date(parseInt(m[2], 36)), fingerprint: m[3] };
}

/** GET /api/assignments/receipts?code= — checks a receipt (the teaching team, or whose hand-in it is). */
export async function verifyReceipt(code: string, user: SessionUser) {
  const r = readReceipt(code);
  if (!r) return { valid: false as const };
  const sub = await prisma.assignmentSubmission.findUnique({ where: { id: r.submissionId }, select: { studentId: true, groupId: true, text: true, fileUrl: true, linkUrl: true, student: { select: { name: true } }, assignment: { select: { title: true, courseId: true } } } });
  if (!sub) return { valid: true as const, gone: true, submittedAt: r.submittedAt };
  const a = await courseAccess(sub.assignment.courseId, user);
  const theirs = sub.studentId === user.id || (!!sub.groupId && !!(await prisma.assignmentGroupMember.findFirst({ where: { groupId: sub.groupId, studentId: user.id }, select: { id: true } })));
  if (!a || (!a.canGrade && !theirs)) throw new NotFoundException('Receipt not found.');
  return { valid: true as const, gone: false, submittedAt: r.submittedAt, assignment: sub.assignment.title, student: sub.student.name, current: fingerprint(sub) === r.fingerprint };
}

// ── The rubric in plain words ────────────────────────────────────────────────────────────────

interface Help { key: string; criteria: { id: string; plain: string; great: string; weak: string }[] }
const cut = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

const SYSTEM = `You explain a teacher's grading rubric to students in plain, friendly words, so they know what to aim for.
For each criterion (use its id): "plain": what it means in one or two short sentences a 14-year-old understands; "great": what a top answer does for it; "weak": the most common way answers lose marks on it.
Don't change or add criteria, don't give the answer to the assignment, and don't promise grades. Use the language of the rubric.`;

/** POST /api/assignments/:id/rubric-help — the explanation, made once (one AI request) and kept for everyone. */
export async function rubricHelp(assignmentId: string, user: SessionUser) {
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: { id: true, title: true, instructions: true, rubric: true, rubricHelp: true, courseId: true } });
  const a = assignment ? await courseAccess(assignment.courseId, user) : null;
  if (!assignment || !a) throw new NotFoundException('Assignment not found.');
  const rubric = (Array.isArray(assignment.rubric) ? assignment.rubric : []) as { id: string; criterion: string; description?: string | null; points: number }[];
  const key = createHash('sha256').update(JSON.stringify(rubric) + assignment.instructions).digest('hex').slice(0, 16);
  try {
    const kept = assignment.rubricHelp ? (JSON.parse(assignment.rubricHelp) as Help) : null;
    if (kept?.key === key) return { criteria: kept.criteria };
  } catch { /* made again below */ }
  if (!process.env.GEMINI_API_KEY) throw new HttpException('The AI isn’t set up yet, so the rubric can’t be explained.', 503);
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  await logAiUse(user.id, { kind: 'rubric', detail: assignment.title, courseId: assignment.courseId });
  const out = await geminiJson<{ criteria: { id: string; plain: string; great: string; weak: string }[] }>(
    SYSTEM,
    `Assignment: ${assignment.title}\nInstructions: ${assignment.instructions.slice(0, 3000)}\nRubric:\n${rubric.map((r) => `- id ${r.id}: ${r.criterion} (${r.points} points)${r.description ? `: ${r.description}` : ''}`).join('\n')}`,
    { type: 'OBJECT', properties: { criteria: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, plain: { type: 'STRING' }, great: { type: 'STRING' }, weak: { type: 'STRING' } }, required: ['id', 'plain', 'great', 'weak'] } } }, required: ['criteria'] },
    1500,
  );
  const byId = new Map((out?.criteria ?? []).map((c) => [c.id, c]));
  const criteria = rubric.map((r) => { const c = byId.get(r.id); return { id: r.id, plain: cut(c?.plain, 400), great: cut(c?.great, 400), weak: cut(c?.weak, 400) }; }).filter((c) => c.plain);
  if (!criteria.length) throw new HttpException('The AI couldn’t explain the rubric this time. Try again later.', 503);
  await prisma.assignment.update({ where: { id: assignmentId }, data: { rubricHelp: JSON.stringify({ key, criteria } satisfies Help) } });
  return { criteria };
}

// ── Regrades ─────────────────────────────────────────────────────────────────────────────────

const MAX_REQUESTS = 3;

/** POST /api/assignments/submissions/:sid/regrade { reason } — a student asks for a second look. */
export async function requestRegrade(submissionId: string, user: SessionUser, b: Record<string, unknown>) {
  const sub = await prisma.assignmentSubmission.findUnique({ where: { id: submissionId }, select: { id: true, studentId: true, groupId: true, status: true, postedAt: true, assignment: { select: { id: true, title: true, courseId: true, course: { select: { code: true, teacherId: true } } } } } });
  if (!sub) throw new NotFoundException('Submission not found.');
  const theirs = sub.studentId === user.id || (!!sub.groupId && !!(await prisma.assignmentGroupMember.findFirst({ where: { groupId: sub.groupId, studentId: user.id }, select: { id: true } })));
  if (!theirs) throw new NotFoundException('Submission not found.');
  if (sub.status !== 'RETURNED' || !sub.postedAt) throw new BadRequestException('You can ask for a regrade once your grade is back.');
  const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, 1500) : '';
  if (reason.length < 20) throw new BadRequestException('Say which part you’d like looked at again, and why (a sentence or two).');
  const mine = await prisma.regradeRequest.findMany({ where: { submissionId, studentId: user.id }, select: { status: true } });
  if (mine.some((r) => r.status === 'OPEN')) throw new BadRequestException('You’ve already asked; your teacher will answer.');
  if (mine.length >= MAX_REQUESTS) throw new BadRequestException(`You can ask up to ${MAX_REQUESTS} times for one assignment.`);
  const req = await prisma.regradeRequest.create({ data: { submissionId, studentId: user.id, reason }, select: { id: true } });
  const staff = await prisma.courseStaff.findMany({ where: { courseId: sub.assignment.courseId, role: { in: ['CO_TEACHER', 'TA'] } }, select: { userId: true }, take: 20 });
  later(() => notifyMany([sub.assignment.course.teacherId, ...staff.map((s) => s.userId)], { type: 'info', title: `Regrade request: ${sub.assignment.title}`, body: `${sub.assignment.course.code} · ${user.name} asked for a second look`, link: `/teacher/assignments/${sub.assignment.id}`, email: false }));
  return { id: req.id };
}

/** POST /api/assignments/regrades/:rid { outcome: CHANGED | SAME, reply } — the teaching team answers. */
export async function answerRegrade(requestId: string, user: SessionUser, b: Record<string, unknown>) {
  const req = await prisma.regradeRequest.findUnique({ where: { id: requestId }, select: { id: true, status: true, studentId: true, submission: { select: { assignment: { select: { id: true, title: true, courseId: true } } } } } });
  const a = req ? await courseAccess(req.submission.assignment.courseId, user) : null;
  if (!req || !a) throw new NotFoundException('That request isn’t there any more.');
  if (!a.canGrade) throw new ForbiddenException('Only the course’s teaching team can answer.');
  if (req.status !== 'OPEN') throw new BadRequestException('This request has been answered.');
  const outcome = b.outcome === 'CHANGED' || b.outcome === 'SAME' ? b.outcome : null;
  if (!outcome) throw new BadRequestException('Say whether the grade changed.');
  const reply = typeof b.reply === 'string' ? b.reply.trim().slice(0, 1500) : '';
  if (reply.length < 5) throw new BadRequestException('Write a short answer for the student.');
  await prisma.regradeRequest.update({ where: { id: req.id }, data: { status: 'ANSWERED', outcome, reply, repliedById: user.id, repliedByName: user.name.slice(0, 120), repliedAt: new Date() } });
  const t = req.submission.assignment;
  later(() => notify(req.studentId, { type: 'grade', title: `Regrade answered: ${t.title}`, body: outcome === 'CHANGED' ? 'Your grade was changed. See the answer on the assignment.' : 'Your grade stays. See why on the assignment.', link: `/student/assignments/${t.id}`, email: false }));
  return { ok: true };
}

/** The requests for an assignment's hand-ins (the teaching team), or one hand-in's (its student). */
export function regradesOf(where: { assignmentId?: string; submissionId?: string }) {
  return prisma.regradeRequest.findMany({
    where: where.submissionId ? { submissionId: where.submissionId } : { submission: { assignmentId: where.assignmentId } },
    orderBy: { createdAt: 'asc' }, take: 300,
    select: { id: true, submissionId: true, reason: true, status: true, outcome: true, reply: true, repliedByName: true, createdAt: true, repliedAt: true, student: { select: { id: true, name: true } } },
  });
}
