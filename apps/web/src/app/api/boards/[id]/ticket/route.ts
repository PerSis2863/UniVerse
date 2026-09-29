import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { boardAccess, canEdit, roomFetch } from '@/server/boards';

type Ctx = { params: Promise<{ id: string }> };

// POST: the WebSocket address for drawing on this board together: /board-live?board=…&ticket=…
// (valid for one connection within 60 seconds). 503 when live boards aren't available.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const access = await boardAccess(id, user.id);
  if (!access) return NextResponse.json({ error: 'This board doesn’t exist or hasn’t been shared with you.' }, { status: 404 });
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { avatar: true } });
  const res = await roomFetch(id, '/ticket', {
    method: 'POST',
    body: JSON.stringify({ userId: user.id, name: user.name, avatar: me?.avatar ?? null, canEdit: canEdit(access.role) }),
  });
  if (!res?.ok) return NextResponse.json({ error: 'Live whiteboards are unavailable right now.' }, { status: 503 });
  const { ticket } = (await res.json()) as { ticket: string };
  // Opening a board counts as activity, so recently used boards sort first.
  if (canEdit(access.role)) await prisma.board.update({ where: { id }, data: { updatedAt: new Date() } }).catch(() => {});
  return NextResponse.json(
    { path: `/board-live?board=${encodeURIComponent(id)}&ticket=${encodeURIComponent(ticket)}`, role: access.role },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
