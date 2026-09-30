import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { audit } from '@/server/audit';

// PATCH { isPublic } — withdraw a report (its link stops working) or publish it again. Admins.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  if (typeof b.isPublic !== 'boolean') return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  const r = await prisma.impactReport.update({ where: { id }, data: { isPublic: b.isPublic } }).catch(() => null);
  if (!r) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  audit(user, { action: b.isPublic ? 'impact_report.published' : 'impact_report.withdrawn', summary: `${b.isPublic ? 'Published' : 'Withdrew'} impact report “${r.title}”`, targetType: 'impact_report', targetId: id }, req);
  return NextResponse.json({ ok: true });
}
