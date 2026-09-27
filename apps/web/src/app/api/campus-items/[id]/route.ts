import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { cleanCampusItem } from '@/lib/campus';

type Ctx = { params: Promise<{ id: string }> };

async function requireAdmin(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Only admins can change campus info.' }, { status: 403 });
  return null;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const data = cleanCampusItem(await req.json().catch(() => ({})));
  if (!data.title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
  const item = await prisma.campusItem.update({ where: { id }, data: { ...data, title: data.title } }).catch(() => null);
  if (!item) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json(item);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  await prisma.campusItem.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
