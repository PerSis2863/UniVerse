import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';

type Ctx = { params: Promise<{ id: string }> };

// Group details with its real member list and recently shared files.
export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;

  const group = await prisma.group.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      isPublic: true,
      members: {
        orderBy: { joinedAt: 'asc' },
        take: 200,
        select: { role: true, joinedAt: true, user: { select: { id: true, name: true, avatar: true } } },
      },
    },
  });
  if (!group) return NextResponse.json({ error: 'Group not found.' }, { status: 404 });
  const isMember = group.members.some((m) => m.user.id === user.id);
  if (!group.isPublic && !isMember) return NextResponse.json({ error: 'This group is private.' }, { status: 403 });

  const files = await prisma.groupPost.findMany({
    where: { groupId: id, OR: [{ imageUrl: { not: null } }, { body: { startsWith: '📎 ' } }] },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, body: true, imageUrl: true, createdAt: true, author: { select: { name: true } } },
  });

  return NextResponse.json(
    { ...group, isMember, files },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
