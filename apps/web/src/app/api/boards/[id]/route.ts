import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { boardAccess, canEdit, kick, LINK_ACCESS, type LinkAccess } from '@/server/boards';

type Ctx = { params: Promise<{ id: string }> };
const MAX_THUMBNAIL = 150_000; // characters of a data: URL (a small preview picture)

// GET: the board's details, my role and who it's shared with.
export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const access = await boardAccess(id, user.id);
  if (!access) return NextResponse.json({ error: 'This board doesn’t exist or hasn’t been shared with you.' }, { status: 404 });
  const board = await prisma.board.findUnique({
    where: { id },
    select: {
      id: true, title: true, linkAccess: true, updatedAt: true,
      owner: { select: { id: true, name: true, avatar: true, role: true } },
      members: { orderBy: { addedAt: 'asc' }, select: { role: true, user: { select: { id: true, name: true, avatar: true, role: true } } } },
    },
  });
  if (!board) return NextResponse.json({ error: 'Board not found.' }, { status: 404 });
  return NextResponse.json(
    { ...board, members: board.members.map((m) => ({ ...m.user, boardRole: m.role })), myRole: access.role, me: user.id },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

// PATCH { title?, linkAccess?, thumbnail? }: editors rename and refresh the preview; only the
// owner decides who can open the board with the link.
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const access = await boardAccess(id, user.id);
  if (!access) return NextResponse.json({ error: 'Board not found.' }, { status: 404 });
  if (!canEdit(access.role)) return NextResponse.json({ error: 'You can only view this board.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const data: { title?: string; linkAccess?: LinkAccess; thumbnail?: string | null } = {};
  if (typeof body.title === 'string') data.title = body.title.trim().slice(0, 120) || 'Untitled board';
  if (body.thumbnail === null || typeof body.thumbnail === 'string') {
    if (body.thumbnail && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.thumbnail) || body.thumbnail.length > MAX_THUMBNAIL)) {
      return NextResponse.json({ error: 'Invalid preview image.' }, { status: 400 });
    }
    data.thumbnail = body.thumbnail;
  }
  if (body.linkAccess !== undefined) {
    if (access.role !== 'OWNER') return NextResponse.json({ error: 'Only the owner can change link sharing.' }, { status: 403 });
    if (!LINK_ACCESS.includes(body.linkAccess)) return NextResponse.json({ error: 'Invalid link setting.' }, { status: 400 });
    data.linkAccess = body.linkAccess;
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  const board = await prisma.board.update({ where: { id }, data, select: { id: true, title: true, linkAccess: true, updatedAt: true } });
  // Less access through the link: people who only had the link are reconnected (and turned away).
  if (data.linkAccess && data.linkAccess !== access.board.linkAccess) await kick(id, { all: true });
  return NextResponse.json(board);
}

// DELETE: the owner deletes the board for everyone.
export async function DELETE(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const board = await prisma.board.findUnique({ where: { id }, select: { ownerId: true } });
  if (!board) return NextResponse.json({ error: 'Board not found.' }, { status: 404 });
  if (board.ownerId !== user.id) return NextResponse.json({ error: 'Only the owner can delete this board.' }, { status: 403 });
  await prisma.board.delete({ where: { id } });
  await kick(id, { all: true, wipe: true });
  return NextResponse.json({ ok: true });
}
