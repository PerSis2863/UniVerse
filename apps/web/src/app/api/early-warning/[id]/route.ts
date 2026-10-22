import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { audit } from '@/server/audit';
import { teaches } from '@/lib/course-access';
import { inSchools, schoolsOf } from '@/server/school-scope';

const STATUSES = ['OPEN', 'CONTACTED', 'RESOLVED', 'DISMISSED'];

// PATCH { status?, note? } — the teacher (or an admin of the school: the student's and the course
// teacher's) records what they did. Another school's flag looks like one that doesn't exist.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const flag = await prisma.studentRiskFlag.findUnique({ where: { id }, include: { course: { select: { teacherId: true, code: true, teacher: { select: { organizationId: true } } } }, student: { select: { name: true, organizationId: true } } } });
  const schools = flag && user.role === 'ADMIN' ? await schoolsOf(user) : null;
  const admin = !!flag && !!schools && inSchools(schools, flag.student.organizationId) && inSchools(schools, flag.course.teacher?.organizationId);
  if (!flag || (!admin && !(user.role === 'TEACHER' && (flag.course.teacherId === user.id || (await teaches(flag.courseId, user.id, ['CO_TEACHER'])))))) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  const b = await req.json().catch(() => ({}));
  const data: { status?: string; note?: string | null; handledById?: string; handledByName?: string; handledAt?: Date; handledScore?: number } = {};
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });
    Object.assign(data, { status: b.status, handledById: user.id, handledByName: user.name, handledAt: new Date(), handledScore: flag.score });
  }
  if (b.note === null || typeof b.note === 'string') data.note = typeof b.note === 'string' ? b.note.trim().slice(0, 1000) || null : null;
  const updated = await prisma.studentRiskFlag.update({ where: { id }, data });
  if (data.status) {
    audit(user, { action: 'early_warning.updated', summary: `Marked early warning for ${flag.student.name} (${flag.course.code}) as ${data.status.toLowerCase()}`, targetType: 'risk_flag', targetId: id }, req);
  }
  return NextResponse.json(updated);
}
