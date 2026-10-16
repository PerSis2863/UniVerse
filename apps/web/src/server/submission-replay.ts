import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import type { Replay } from '@/lib/writing-replay';
import { ForbiddenException, NotFoundException } from './http';

// The writing replay of a typed answer (Stage 5 · B3.6, src/lib/writing-replay.ts): kept with the
// hand-in, read only by the course's teaching team.

/** GET /api/assignments/submissions/:sid/replay — how the answer grew, and whether it ends at it. */
export async function replayOf(submissionId: string, user: SessionUser) {
  const sub = await prisma.assignmentSubmission.findUnique({ where: { id: submissionId }, select: { writingReplay: true, replayMatches: true, assignment: { select: { courseId: true } } } });
  const a = sub ? await courseAccess(sub.assignment.courseId, user) : null;
  if (!sub || !a) throw new NotFoundException('Submission not found.');
  if (!a.canGrade) throw new ForbiddenException('Only the course’s teaching team can see this.');
  let replay: Replay | null = null;
  try { replay = sub.writingReplay ? (JSON.parse(sub.writingReplay) as Replay) : null; } catch { /* none kept */ }
  if (!replay) throw new NotFoundException('No writing replay was kept for this answer.');
  return { replay, matches: !!sub.replayMatches };
}
