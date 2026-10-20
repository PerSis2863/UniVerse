import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { courseAccess } from '@/lib/course-access';
import { excerpt, isAiPolicy, receiptProblem, type AiReceipt, type AiUseItem, type AiUseKind } from '@/lib/ai-receipt';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';

// Honest AI receipts (Stage 5 · D12). Every time someone uses AI help in UniVerse (the assistant,
// the course tutor, the writing helper…) a line is kept for them: what kind, a short excerpt of what
// they asked, when, and the course. Only they see it (Settings → AI features), for 180 days. When
// handing in an assignment they can attach the lines since the assignment was set, as a receipt;
// the teacher's rule for the assignment says whether that's needed. The receipt is made here from
// the record, never from what the browser sends, so it can be trusted.

export const KEEP_DAYS = 180;
const MAX_ON_RECEIPT = 100;

/** Records one use of AI help (never throws). Calls for a whole class (ids like "cc:…") aren't anyone's. */
export async function logAiUse(userId: string | null | undefined, use: { kind: AiUseKind; detail?: string; courseId?: string | null }) {
  if (!userId || userId.includes(':')) return;
  try { await prisma.aiUse.create({ data: { userId, kind: use.kind, detail: excerpt(use.detail ?? ''), courseId: use.courseId ?? null } }); }
  catch { /* the help itself matters more than its record */ }
}

/** What a receipt covers: AI help in this course (or not tied to any course) from `since` until `until`. */
export interface ReceiptScope { courseId: string; since: Date; until?: Date; policy: string; during?: boolean }

export async function usesFor(userId: string, scope: { courseId: string; since: Date; until?: Date }): Promise<AiUseItem[]> {
  const rows = await prisma.aiUse.findMany({
    where: { userId, createdAt: { gte: scope.since, lte: scope.until ?? new Date() }, OR: [{ courseId: null }, { courseId: scope.courseId }] },
    orderBy: { createdAt: 'asc' }, take: MAX_ON_RECEIPT,
    select: { kind: true, detail: true, courseId: true, createdAt: true },
  });
  return rows.map((r) => ({ kind: r.kind, detail: r.detail, at: r.createdAt.toISOString(), courseId: r.courseId }));
}

/** The AI help on a receipt for this assignment: since it was set, in its course or not tied to any course. */
export const usesForAssignment = (userId: string, a: { courseId: string; createdAt: Date }, until = new Date()) => usesFor(userId, { courseId: a.courseId, since: a.createdAt, until });

/** GET /api/assignments/:id/ai-receipt: what the student would attach if they handed in now. */
export async function receiptPreview(user: SessionUser, assignmentId: string) {
  const a = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: { courseId: true, createdAt: true, aiPolicy: true } });
  const access = a && (await courseAccess(a.courseId, user));
  if (!a || !access) throw new NotFoundException('Assignment not found.');
  if (access.canManage) throw new ForbiddenException('Receipts are for students handing in.');
  return { policy: isAiPolicy(a.aiPolicy) ? a.aiPolicy : 'FREE', since: a.createdAt, uses: await usesForAssignment(user.id, a) };
}

/**
 * The receipt (JSON) to keep, from what the student chose: { attach, declaredNone, note }. Null when
 * there's nothing to keep. Throws when the choice doesn't fit the rule, except `how`: 'offline' (sent
 * later from a device with no connection and no choice: kept, marked offline) and 'auto' (a quiz
 * handed in by itself when the time ran out: kept as it was, marked so the teacher knows).
 */
export async function makeReceipt(userId: string, scope: ReceiptScope, input: unknown, how: 'given' | 'offline' | 'auto' = 'given'): Promise<string | null> {
  const policy = isAiPolicy(scope.policy) ? scope.policy : 'FREE';
  const since = scope.since.toISOString(), at = new Date().toISOString();
  const during = scope.during ? { during: true } : {};
  if (input == null || typeof input !== 'object') {
    if (policy === 'FREE') return null;
    if (how === 'offline') return JSON.stringify({ policy, attached: false, declaredNone: false, note: '', uses: [], since, at, offline: true, ...during } satisfies AiReceipt);
  }
  const b = (input ?? {}) as Record<string, unknown>;
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 1000) : '';
  const problem = receiptProblem(policy, b);
  if (problem) {
    if (how !== 'auto') throw new BadRequestException(problem);
    return JSON.stringify({ policy, attached: false, declaredNone: false, note, uses: [], since, at, auto: true, ...during } satisfies AiReceipt);
  }
  const attached = b.attach === true, declaredNone = b.declaredNone === true;
  if (policy === 'FREE' && !attached && !note) return null;
  const uses = attached ? await usesFor(userId, scope) : [];
  return JSON.stringify({ policy, attached, declaredNone, note, uses, since, at, ...during } satisfies AiReceipt);
}

/** An assignment's receipt (D12): the AI help since it was set. */
export const receiptForSubmission = (userId: string, a: { courseId: string; createdAt: Date; aiPolicy: string }, input: unknown, offline: boolean) =>
  makeReceipt(userId, { courseId: a.courseId, since: a.createdAt, policy: a.aiPolicy }, input, offline ? 'offline' : 'given');

/** GET /api/me/ai-uses: my record of AI help (the last 180 days), with course codes. */
export async function myAiUses(user: SessionUser) {
  const rows = await prisma.aiUse.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 300, select: { id: true, kind: true, detail: true, courseId: true, createdAt: true } });
  const ids = [...new Set(rows.map((r) => r.courseId).filter((x): x is string => !!x))].slice(0, 90);
  const courses = ids.length ? await prisma.course.findMany({ where: { id: { in: ids } }, select: { id: true, code: true } }) : [];
  const code = new Map(courses.map((c) => [c.id, c.code]));
  return { keepDays: KEEP_DAYS, uses: rows.map((r) => ({ ...r, course: r.courseId ? code.get(r.courseId) ?? null : null })) };
}
