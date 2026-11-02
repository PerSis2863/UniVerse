import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { shareToken } from '@/lib/tool-saves';

// Share a saved piece of work by link (M75, M76). POST { mode: 'view' | 'edit' }: make (or keep) a
// link. A view link opens for anyone, no sign-in, read-only; an edit link lets signed-in people edit
// it together, live. DELETE ?mode=view|edit (both when left out): that link stops working at once.

type Ctx = { params: Promise<{ id: string }> };

async function own(req: Request, params: Ctx['params']) {
  const user = await getSessionUser(req);
  if (!user) return null;
  const { id } = await params;
  if (!/^[\w-]{1,40}$/.test(id)) return null;
  return prisma.toolSave.findFirst({ where: { id, userId: user.id }, select: { id: true, shareToken: true, editToken: true } });
}

export async function POST(req: Request, { params }: Ctx) {
  const row = await own(req, params);
  if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const mode = ((await req.json().catch(() => ({}))) as { mode?: unknown }).mode === 'edit' ? 'edit' : 'view';
  const have = mode === 'edit' ? row.editToken : row.shareToken;
  const token = have ?? shareToken();
  if (!have) await prisma.toolSave.update({ where: { id: row.id }, data: mode === 'edit' ? { editToken: token } : { shareToken: token } });
  return NextResponse.json({ token, mode });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const row = await own(req, params);
  if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const mode = new URL(req.url).searchParams.get('mode');
  await prisma.toolSave.update({ where: { id: row.id }, data: mode === 'view' ? { shareToken: null } : mode === 'edit' ? { editToken: null, editors: null } : { shareToken: null, editToken: null, editors: null } });
  return NextResponse.json({ ok: true });
}
