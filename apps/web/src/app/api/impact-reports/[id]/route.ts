import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { audit } from '@/server/audit';
import { inSchools, schoolsOf } from '@/server/school-scope';

// PATCH { isPublic } — withdraw a report (its link stops working) or publish it again. Admins, for
// reports issued by someone in their school (one whose issuer is gone counts as the main school's);
// another school's look "not found".
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  if (typeof b.isPublic !== 'boolean') return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  const schools = await schoolsOf(user);
  if (schools !== 'all') {
    const found = await prisma.impactReport.findUnique({ where: { id }, select: { createdById: true } });
    const by = found ? await prisma.user.findUnique({ where: { id: found.createdById }, select: { organizationId: true } }) : null;
    if (!found || !inSchools(schools, by?.organizationId ?? null)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  const r = await prisma.impactReport.update({ where: { id }, data: { isPublic: b.isPublic } }).catch(() => null);
  if (!r) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  audit(user, { action: b.isPublic ? 'impact_report.published' : 'impact_report.withdrawn', summary: `${b.isPublic ? 'Published' : 'Withdrew'} impact report “${r.title}”`, targetType: 'impact_report', targetId: id }, req);
  return NextResponse.json({ ok: true });
}
