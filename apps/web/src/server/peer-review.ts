import { randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { assignPeers } from '@/lib/peer-review';
import { audit } from './audit';
import { notifyMany } from './email';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';

// Anonymous peer review (Stage 5 · B3.2): the teacher hands out reviews (each student who handed in
// reviews k classmates' answers against the rubric: src/lib/peer-review.ts); reviewers never see whose
// answer it is, and authors never see who reviewed them. Students see the reviews of their own work
// after the review due date (or, without one, once their grade is back). The teacher sees everything,
// names included, as a second opinion beside their own grade. Not marked; no AI.

const half = (n: number) => Math.round(n * 2) / 2;
const newId = () => `c${[...randomBytes(18)].map((x) => (x % 36).toString(36)).join('').slice(0, 24)}`;
interface Rubric { id: string; criterion: string; points: number }
const rubricOf = (r: unknown): Rubric[] => (Array.isArray(r) ? (r as Rubric[]).filter((x) => x && typeof x.id === 'string') : []);

async function load(assignmentId: string, user: SessionUser) {
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: { id: true, title: true, courseId: true, rubric: true, maxScore: true, peerReviews: true, peerDueDate: true, groupMode: true } });
  const a = assignment ? await courseAccess(assignment.courseId, user) : null;
  if (!assignment || !a) throw new NotFoundException('Assignment not found.');
  return { assignment, access: a };
}

/** GET /api/assignments/:id/peer — a student's reviews to do (anonymous answers) and of their own work. */
export async function peerView(assignmentId: string, user: SessionUser) {
  const { assignment, access } = await load(assignmentId, user);
  if (access.canGrade) throw new ForbiddenException('Peer review is for students; the teaching team sees reviews in grading.');
  const [toDo, mine] = await Promise.all([
    prisma.peerReview.findMany({
      where: { assignmentId, reviewerId: user.id }, orderBy: { createdAt: 'asc' }, take: 10,
      select: { id: true, status: true, criteria: true, comment: true, submission: { select: { text: true, fileUrl: true, fileName: true, fileSize: true, linkUrl: true } } },
    }),
    prisma.assignmentSubmission.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId: user.id } }, select: { id: true, status: true, postedAt: true } }),
  ]);
  const graded = (mine?.status === 'RETURNED' || mine?.status === 'REOPENED') && !!mine?.postedAt;
  const open = !assignment.peerDueDate || assignment.peerDueDate > new Date();
  const visible = !!mine && (assignment.peerDueDate ? !open : graded);
  const received = visible
    ? await prisma.peerReview.findMany({ where: { submissionId: mine.id, status: 'DONE' }, orderBy: { submittedAt: 'asc' }, take: 10, select: { criteria: true, comment: true, submittedAt: true } })
    : [];
  return {
    rubric: rubricOf(assignment.rubric), maxScore: assignment.maxScore, peerDueDate: assignment.peerDueDate, open,
    toDo: toDo.map((r) => ({ id: r.id, status: r.status, criteria: r.criteria ? JSON.parse(r.criteria) : null, comment: r.comment, answer: r.submission })),
    received: received.map((r) => ({ criteria: r.criteria ? JSON.parse(r.criteria) : [], comment: r.comment, submittedAt: r.submittedAt })),
    receivedLater: !!mine && !visible,
  };
}

/** POST /api/assignments/:id/peer { reviewId, criteria: [{ id, score, comment }], comment } — a student's review. */
export async function submitPeerReview(assignmentId: string, user: SessionUser, b: Record<string, unknown>) {
  const { assignment } = await load(assignmentId, user);
  const review = typeof b.reviewId === 'string' ? await prisma.peerReview.findFirst({ where: { id: b.reviewId, assignmentId, reviewerId: user.id }, select: { id: true } }) : null;
  if (!review) throw new NotFoundException('That review isn’t yours to do.');
  if (assignment.peerDueDate && assignment.peerDueDate < new Date()) throw new BadRequestException('Peer review has closed.');
  const given = new Map((Array.isArray(b.criteria) ? b.criteria : []).map((c: Record<string, unknown>) => [c?.id, c]));
  const criteria = rubricOf(assignment.rubric).map((r) => {
    const c = given.get(r.id) as Record<string, unknown> | undefined;
    const score = half(Number(c?.score));
    if (!c || !Number.isFinite(score) || score < 0 || score > r.points) throw new BadRequestException(`Give “${r.criterion}” a score between 0 and ${r.points}.`);
    return { id: r.id, score, comment: typeof c.comment === 'string' ? c.comment.trim().slice(0, 600) : '' };
  });
  const comment = typeof b.comment === 'string' ? b.comment.trim().slice(0, 2000) : '';
  if (comment.length < 10) throw new BadRequestException('Write a short comment: what works, and one thing to improve.');
  await prisma.peerReview.update({ where: { id: review.id }, data: { criteria: JSON.stringify(criteria), comment, status: 'DONE', submittedAt: new Date() } });
  return { ok: true };
}

/**
 * POST /api/assignments/:id/peer/assign — hands out reviews (teacher and co-teachers): reviews done stay,
 * the rest are handed out again around them, so answers handed in late join in.
 */
export async function handOutReviews(assignmentId: string, user: SessionUser, req: Request) {
  const { assignment, access } = await load(assignmentId, user);
  if (!access.canManage) throw new ForbiddenException('Only the course’s teacher can hand out peer reviews.');
  if (assignment.groupMode) throw new BadRequestException('Peer review is for work students hand in on their own.');
  if (!assignment.peerReviews) throw new BadRequestException('Set how many answers each student reviews first.');
  const [subs, done] = await Promise.all([
    prisma.assignmentSubmission.findMany({ where: { assignmentId }, take: 1000, select: { id: true, studentId: true } }),
    prisma.peerReview.findMany({ where: { assignmentId, status: 'DONE' }, take: 5000, select: { submissionId: true, reviewerId: true } }),
  ]);
  if (subs.length < 2) throw new BadRequestException('Peer review needs at least two answers handed in.');
  const pairs = assignPeers(subs.map((s) => ({ submissionId: s.id, authorId: s.studentId })), assignment.peerReviews, done);
  await prisma.peerReview.deleteMany({ where: { assignmentId, status: 'ASSIGNED' } });
  if (pairs.length) {
    // All in one statement however big the class (one bound value).
    await prisma.$executeRawUnsafe(
      `INSERT INTO peer_reviews (id, assignmentId, submissionId, reviewerId) SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.s'), json_extract(value, '$.r') FROM json_each(?)`,
      assignmentId, JSON.stringify(pairs.map((p) => ({ id: newId(), s: p.submissionId, r: p.reviewerId }))),
    );
    const reviewers = [...new Set(pairs.map((p) => p.reviewerId))];
    await notifyMany(reviewers, { type: 'info', title: `Peer review: ${assignment.title}`, body: `Classmates’ answers to review${assignment.peerDueDate ? ` by ${assignment.peerDueDate.toUTCString().slice(0, 16)}` : ''}. You won’t see whose they are, and they won’t see who you are.`, link: `/student/assignments/${assignmentId}`, email: false });
  }
  audit(user, { action: 'assignment.peer-review', summary: `Handed out ${pairs.length} peer reviews for “${assignment.title}” (${access.course.code})`, targetType: 'assignment', targetId: assignmentId }, req);
  return { handedOut: pairs.length, done: done.length };
}

/** For the teaching team: every review with the reviewer's name, by answer. */
export async function reviewsForTeacher(assignmentId: string) {
  const rows = await prisma.peerReview.findMany({
    where: { assignmentId }, take: 5000,
    select: { submissionId: true, status: true, criteria: true, comment: true, submittedAt: true, reviewer: { select: { id: true, name: true } } },
  });
  return rows.map((r) => ({ ...r, criteria: r.criteria ? (JSON.parse(r.criteria) as { id: string; score: number; comment: string }[]) : null }));
}
