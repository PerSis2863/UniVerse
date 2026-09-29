import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { MAX_BOARDS_PER_USER } from '@/server/boards';

const person = { select: { id: true, name: true, avatar: true } } as const;

// GET: my whiteboards and the ones shared with me. POST { title }: a new board.
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const boards = await prisma.board.findMany({
    where: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] },
    orderBy: { updatedAt: 'desc' },
    take: 300,
    select: {
      id: true, title: true, thumbnail: true, linkAccess: true, createdAt: true, updatedAt: true, ownerId: true,
      owner: person,
      members: { select: { userId: true, role: true, user: person }, take: 6 },
      _count: { select: { members: true } },
    },
  });
  return NextResponse.json(
    boards.map((b) => ({
      id: b.id,
      title: b.title,
      thumbnail: b.thumbnail,
      linkAccess: b.linkAccess,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      owner: b.owner,
      mine: b.ownerId === user.id,
      myRole: b.ownerId === user.id ? 'OWNER' : b.members.find((m) => m.userId === user.id)?.role ?? 'VIEWER',
      people: b.members.map((m) => m.user),
      memberCount: b._count.members,
    })),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? '').trim().slice(0, 120) || 'Untitled board';
  const count = await prisma.board.count({ where: { ownerId: user.id } });
  if (count >= MAX_BOARDS_PER_USER) return NextResponse.json({ error: `You can have up to ${MAX_BOARDS_PER_USER} boards. Delete some you no longer need.` }, { status: 400 });
  const board = await prisma.board.create({ data: { title, ownerId: user.id }, select: { id: true, title: true } });
  return NextResponse.json(board, { status: 201 });
}
