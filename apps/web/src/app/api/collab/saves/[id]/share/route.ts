import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { shareToken } from '@/lib/tool-saves';

// Share a saved piece of work by link (M75), read-only. POST: make (or keep) its link. DELETE: stop
// sharing: the old link stops working at once.

type Ctx = { params: Promise<{ id: string }> };

async function own(req: Request, params: Ctx['params']) {
  const user = await getSessionUser(req);
  if (!user) return null;
  const { id } = await params;
  if (!/^[\w-]{1,40}$/.test(id)) return null;
  return prisma.toolSave.findFirst({ where: { id, userId: user.id }, select: { id: true, shareToken: true } });
}

export async function POST(req: Request, { params }: Ctx) {
  const row = await own(req, params);
  if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const token = row.shareToken ?? shareToken();
  if (!row.shareToken) await prisma.toolSave.update({ where: { id: row.id }, data: { shareToken: token } });
  return NextResponse.json({ token });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const row = await own(req, params);
  if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  await prisma.toolSave.update({ where: { id: row.id }, data: { shareToken: null } });
  return NextResponse.json({ ok: true });
}
