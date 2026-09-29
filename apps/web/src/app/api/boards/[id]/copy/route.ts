import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { boardAccess, MAX_BOARDS_PER_USER, roomFetch } from '@/server/boards';

type Ctx = { params: Promise<{ id: string }> };

// POST: make my own copy of a board I can open (e.g. a teacher's template).
export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const access = await boardAccess(id, user.id);
  if (!access) return NextResponse.json({ error: 'Board not found.' }, { status: 404 });
  if ((await prisma.board.count({ where: { ownerId: user.id } })) >= MAX_BOARDS_PER_USER) {
    return NextResponse.json({ error: `You can have up to ${MAX_BOARDS_PER_USER} boards.` }, { status: 400 });
  }
  const snap = await roomFetch(id, '/snapshot');
  if (!snap?.ok) return NextResponse.json({ error: 'Live whiteboards are unavailable right now.' }, { status: 503 });
  const { elements, files } = (await snap.json()) as { elements: { isDeleted?: boolean }[]; files: unknown[] };
  const src = await prisma.board.findUnique({ where: { id }, select: { thumbnail: true } });
  const copy = await prisma.board.create({ data: { title: `${access.board.title} (copy)`.slice(0, 120), ownerId: user.id, thumbnail: src?.thumbnail ?? null }, select: { id: true, title: true } });
  const seeded = await roomFetch(copy.id, '/seed', { method: 'POST', body: JSON.stringify({ elements: elements.filter((e) => !e.isDeleted), files }) });
  if (!seeded?.ok) {
    await prisma.board.delete({ where: { id: copy.id } });
    return NextResponse.json({ error: 'Couldn’t copy the board. Please try again.' }, { status: 500 });
  }
  return NextResponse.json(copy, { status: 201 });
}
