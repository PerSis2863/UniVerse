import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { boardAccess, canEdit, kick, MAX_BOARD_MEMBERS } from '@/server/boards';
import { later, notify } from '@/server/email';

type Ctx = { params: Promise<{ id: string }> };

// POST { userIds, role }: share the board with people (teachers, classmates, anyone). Owners and
// editors can invite; only the owner can change someone's access or remove them.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const access = await boardAccess(id, user.id);
  if (!access) return NextResponse.json({ error: 'Board not found.' }, { status: 404 });
  if (!canEdit(access.role)) return NextResponse.json({ error: 'Viewers can’t share this board.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const role = body.role === 'VIEWER' ? 'VIEWER' : 'EDITOR';
  const given: unknown[] = Array.isArray(body.userIds) ? body.userIds : [body.userId];
  const ids = [...new Set(given.filter((x): x is string => typeof x === 'string'))]
    .filter((x) => x !== access.board.ownerId)
    .slice(0, 50);
  if (!ids.length) return NextResponse.json({ error: 'Choose who to share with.' }, { status: 400 });

  const [people, existing, count] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids }, status: { not: 'SUSPENDED' } }, select: { id: true } }),
    prisma.boardMember.findMany({ where: { boardId: id, userId: { in: ids } }, select: { userId: true, role: true } }),
    prisma.boardMember.count({ where: { boardId: id } }),
  ]);
  const had = new Map(existing.map((m) => [m.userId, m.role]));
  const added = people.filter((p) => !had.has(p.id));
  if (count + added.length > MAX_BOARD_MEMBERS) return NextResponse.json({ error: `A board can be shared with up to ${MAX_BOARD_MEMBERS} people. Use link sharing for a bigger group.` }, { status: 400 });
  // An editor can't lower another person's access; the owner can change anyone's.
  const changed = access.role === 'OWNER' ? people.filter((p) => had.has(p.id) && had.get(p.id) !== role) : [];

  await prisma.$transaction([
    ...added.map((p) => prisma.boardMember.create({ data: { boardId: id, userId: p.id, role } })),
    ...changed.map((p) => prisma.boardMember.update({ where: { boardId_userId: { boardId: id, userId: p.id } }, data: { role } })),
  ]);
  if (changed.length) await kick(id, { userIds: changed.map((p) => p.id) });

  const title = access.board.title;
  later(() => Promise.all(added.map((p) => notify(p.id, {
    type: 'board',
    title: `${user.name} shared a whiteboard with you`,
    body: `“${title}” — you can ${role === 'EDITOR' ? 'draw on it together live' : 'view it'}.`,
    link: `/boards/${id}`,
  }))));
  return NextResponse.json({ added: added.length, updated: changed.length });
}

// DELETE ?userId=: the owner removes someone; anyone can remove themselves (leave the board).
export async function DELETE(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const target = new URL(req.url).searchParams.get('userId') || user.id;
  const board = await prisma.board.findUnique({ where: { id }, select: { ownerId: true } });
  if (!board) return NextResponse.json({ error: 'Board not found.' }, { status: 404 });
  if (target !== user.id && board.ownerId !== user.id) return NextResponse.json({ error: 'Only the owner can remove people.' }, { status: 403 });
  await prisma.boardMember.deleteMany({ where: { boardId: id, userId: target } });
  await kick(id, { userIds: [target] });
  return NextResponse.json({ ok: true });
}
