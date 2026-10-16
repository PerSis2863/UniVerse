import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { NotFoundException } from './http';

// Grade history (Stage 5 · B3.4): every grade written, changed or deleted, with who did it and the
// score before and after. Written in a few statements (D1 takes 100 values a query: 10 columns, 9
// rows at a time); kept when the grade itself is deleted. The teaching team reads it.

export interface GradeChangeRow { courseId: string; studentId: string; gradeId: string | null; assessment: string; oldScore: number | null; newScore: number | null; maxScore: number }

export async function logGradeChanges(rows: GradeChangeRow[], by: { id: string; name: string }) {
  const changed = rows.filter((r) => r.oldScore !== r.newScore);
  for (let i = 0; i < changed.length; i += 9) {
    await prisma.gradeChange.createMany({ data: changed.slice(i, i + 9).map((r) => ({ ...r, assessment: r.assessment.slice(0, 200), changedById: by.id, changedByName: by.name.slice(0, 120) })) });
  }
}

/** GET /api/courses/:id/grade-history?studentId= — the latest 300 changes (the teaching team). */
export async function gradeHistory(courseId: string, user: SessionUser, studentId: string | null) {
  const a = await courseAccess(courseId, user);
  if (!a || !a.canGrade) throw new NotFoundException('Course not found.');
  const rows = await prisma.gradeChange.findMany({
    where: { courseId, ...(studentId ? { studentId } : {}) }, orderBy: { createdAt: 'desc' }, take: 300,
    select: { id: true, studentId: true, assessment: true, oldScore: true, newScore: true, maxScore: true, changedByName: true, createdAt: true },
  });
  const ids = [...new Set(rows.map((r) => r.studentId))].slice(0, 90);
  const names = new Map((ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  return rows.map((r) => ({ ...r, student: names.get(r.studentId) ?? 'A former student' }));
}
