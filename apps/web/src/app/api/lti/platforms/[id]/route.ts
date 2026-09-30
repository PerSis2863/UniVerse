import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { audit } from '@/server/audit';

// PATCH { isActive?, trustEmails?, deploymentIds? } · DELETE — admins.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user || user.role !== 'ADMIN') return NextResponse.json({ error: 'Not allowed.' }, { status: user ? 403 : 401 });
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const data: { isActive?: boolean; trustEmails?: boolean; deploymentIds?: string[] } = {};
  if (typeof b.isActive === 'boolean') data.isActive = b.isActive;
  if (typeof b.trustEmails === 'boolean') data.trustEmails = b.trustEmails;
  if (typeof b.deploymentIds === 'string') data.deploymentIds = b.deploymentIds.split(/[\s,]+/).map((d: string) => d.trim()).filter(Boolean).slice(0, 20);
  const p = await prisma.ltiPlatform.update({ where: { id }, data }).catch(() => null);
  if (!p) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  audit(user, { action: 'lti.platform_updated', summary: `Updated LMS “${p.name}”`, targetType: 'lti_platform', targetId: id, metadata: data }, req);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user || user.role !== 'ADMIN') return NextResponse.json({ error: 'Not allowed.' }, { status: user ? 403 : 401 });
  const { id } = await params;
  const p = await prisma.ltiPlatform.findUnique({ where: { id } });
  if (!p) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  await prisma.$transaction([prisma.ltiNonce.deleteMany({ where: { platformId: id } }), prisma.ltiUser.deleteMany({ where: { platformId: id } }), prisma.ltiContext.deleteMany({ where: { platformId: id } }), prisma.ltiPlatform.delete({ where: { id } })]);
  audit(user, { action: 'lti.platform_removed', summary: `Disconnected LMS “${p.name}”`, targetType: 'lti_platform', targetId: id }, req);
  return NextResponse.json({ ok: true });
}
