import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { cleanCampusItem } from '@/lib/campus';
import { madeInSchool } from '@/server/school-scope';

type Ctx = { params: Promise<{ id: string }> };

// Campus info carries no school of its own: an admin changes what their own school's people added
// (M129; before, any school's admin could edit or delete every school's notices).
async function requireAdmin(req: Request, id: string) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Only admins can change campus info.' }, { status: 403 });
  const item = await prisma.campusItem.findUnique({ where: { id }, select: { createdById: true } });
  if (!item || !(await madeInSchool(user, item.createdById))) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return null;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const denied = await requireAdmin(req, id);
  if (denied) return denied;
  const data = cleanCampusItem(await req.json().catch(() => ({})));
  if (!data.title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
  const item = await prisma.campusItem.update({ where: { id }, data: { ...data, title: data.title } }).catch(() => null);
  if (!item) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json(item);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const denied = await requireAdmin(req, id);
  if (denied) return denied;
  await prisma.campusItem.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
