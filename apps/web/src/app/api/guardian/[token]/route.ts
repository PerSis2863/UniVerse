import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { verifyGuardianToken } from '@/server/share-tokens';
import { studentProgress } from '@/server/student-progress';

// The parent / guardian view behind a student's shared link (no sign-in). Read-only and kept to
// schoolwork: first name, courses with grade and attendance, what's due, recent achievements.
// Never contact details, messages or anything personal.

const HEADERS = { 'Cache-Control': 'private, max-age=300', 'X-Robots-Tag': 'noindex, nofollow' };

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const v = verifyGuardianToken((await params).token);
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: v.error === 'expired' ? 410 : 404, headers: HEADERS });

  const [user, progress, certificates, points] = await Promise.all([
    prisma.user.findUnique({ where: { id: v.userId }, select: { name: true, role: true, status: true } }),
    studentProgress(v.userId, 21),
    prisma.impactCertificate.findMany({
      where: { userId: v.userId, status: 'ISSUED' },
      orderBy: { issuedAt: 'desc' },
      take: 5,
      select: { id: true, title: true, organization: true, issuedAt: true },
    }),
    prisma.impactPoint.findMany({
      where: { userId: v.userId },
      orderBy: { awardedAt: 'desc' },
      take: 5,
      select: { id: true, reason: true, points: true, awardedAt: true },
    }),
  ]);
  // A deleted or suspended account, or one that's no longer a student, reads as a broken link.
  if (!user || user.role !== 'STUDENT' || user.status === 'SUSPENDED') return NextResponse.json({ error: 'invalid' }, { status: 404, headers: HEADERS });

  const achievements = [
    ...certificates.map((c) => ({ id: `c-${c.id}`, kind: 'certificate' as const, title: c.title, detail: c.organization, at: c.issuedAt.toISOString() })),
    ...points.map((p) => ({ id: `p-${p.id}`, kind: 'points' as const, title: p.reason, detail: `${p.points} impact points`, at: p.awardedAt.toISOString() })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);

  return NextResponse.json(
    {
      firstName: user.name.trim().split(/\s+/)[0] || 'Your student',
      expiresAt: v.expiresAt.toISOString(),
      average: progress.average,
      attendance: progress.attendance,
      courses: progress.courses.map(({ id, code, name, color, emoji, grade, attendance }) => ({ id, code, name, color, emoji, grade, attendance })),
      deadlines: progress.deadlines,
      achievements,
    },
    { headers: HEADERS },
  );
}
