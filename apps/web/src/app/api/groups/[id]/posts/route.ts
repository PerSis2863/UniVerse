import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { groupRole, postSelect, MAX_POST_LENGTH } from '@/lib/groups';
import { isAppFileUrl } from '@/lib/storage';

type Ctx = { params: Promise<{ id: string }> };

// Group chat: list messages (members, or anyone for public groups) and post a message (members only).

export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;

  const group = await prisma.group.findUnique({ where: { id }, select: { isPublic: true } });
  if (!group) return NextResponse.json({ error: 'Group not found.' }, { status: 404 });
  const role = await groupRole(id, user.id);
  if (!group.isPublic && !role) return NextResponse.json({ error: 'Join this group to see its messages.' }, { status: 403 });

  const posts = await prisma.groupPost.findMany({
    where: { groupId: id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: postSelect,
  });
  return NextResponse.json(
    { posts: posts.reverse(), isMember: !!role, myId: user.id },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  if (!(await groupRole(id, user.id))) return NextResponse.json({ error: 'Join this group to send messages.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? '').trim().slice(0, MAX_POST_LENGTH);
  const imageUrl = isAppFileUrl(body.imageUrl) ? body.imageUrl.slice(0, 1000) : null;
  if (!text && !imageUrl) return NextResponse.json({ error: 'Message is empty.' }, { status: 400 });

  const post = await prisma.groupPost.create({
    data: { groupId: id, authorId: user.id, body: text, imageUrl },
    select: postSelect,
  });
  return NextResponse.json(post, { status: 201 });
}
