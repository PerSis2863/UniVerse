import prisma from '@/lib/db';
import type { ReportCardData } from '@/lib/report-card';
import { studentProgress } from './student-progress';
import { weekActivity } from './safety';
import { myCards } from './report-cards';

// What a parent or guardian sees about one student: the guardian link page (/guardian/<token>) and
// the parent app (Stage 5 · B16.1). Schoolwork only: first name, courses with grade and attendance,
// what's due, recent achievements, the week in numbers and published report cards. Never contact
// details, messages or anything personal.

export async function guardianView(studentId: string) {
  const [user, progress, certificates, points, activity, cards] = await Promise.all([
    prisma.user.findUnique({ where: { id: studentId }, select: { name: true, role: true, status: true } }),
    studentProgress(studentId, 21),
    prisma.impactCertificate.findMany({
      where: { userId: studentId, status: 'ISSUED' },
      orderBy: { issuedAt: 'desc' },
      take: 5,
      select: { id: true, title: true, organization: true, issuedAt: true },
    }),
    prisma.impactPoint.findMany({
      where: { userId: studentId },
      orderBy: { awardedAt: 'desc' },
      take: 5,
      select: { id: true, reason: true, points: true, awardedAt: true },
    }),
    // This week in numbers (Stage 4 · 4.10): never what they wrote or who to.
    weekActivity(studentId),
    // Published report cards (Stage 5 · B15.3), without the student's email.
    myCards(studentId),
  ]);
  // A deleted or suspended account, or one that's no longer a student, shows nothing.
  if (!user || user.role !== 'STUDENT' || user.status === 'SUSPENDED') return null;

  const achievements = [
    ...certificates.map((c) => ({ id: `c-${c.id}`, kind: 'certificate' as const, title: c.title, detail: c.organization, at: c.issuedAt.toISOString() })),
    ...points.map((p) => ({ id: `p-${p.id}`, kind: 'points' as const, title: p.reason, detail: `${p.points} impact points`, at: p.awardedAt.toISOString() })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);

  return {
    firstName: user.name.trim().split(/\s+/)[0] || 'Your student',
    average: progress.average,
    attendance: progress.attendance,
    courses: progress.courses.map(({ id, code, name, color, emoji, grade, attendance }) => ({ id, code, name, color, emoji, grade, attendance })),
    deadlines: progress.deadlines,
    achievements,
    activity,
    reportCards: cards.map(({ id, data, comment, run }) => {
      const d = data as unknown as ReportCardData;
      return { id, comment, run: { title: run.title, fromDate: run.fromDate, toDate: run.toDate }, data: { ...d, student: { name: d.student.name, email: '' } } };
    }),
  };
}
