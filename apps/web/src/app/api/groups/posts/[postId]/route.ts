import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { groupRole, postSelect, MAX_POST_LENGTH } from '@/lib/groups';

type Ctx = { params: Promise<{ postId: string }> };

async function loadOwnPost(req: Request, postId: string) {
  const user = await getSessionUser(req);
  if (!user) return { error: NextResponse.json({ error: 'Please sign in.' }, { status: 401 }) };
  const post = await prisma.groupPost.findUnique({ where: { id: postId }, select: { id: true, authorId: true, groupId: true } });
  if (!post) return { error: NextResponse.json({ error: 'Message not found.' }, { status: 404 }) };
  return { user, post };
}

// Edit your own message.
export async function PATCH(req: Request, { params }: Ctx) {
  const { postId } = await params;
  const r = await loadOwnPost(req, postId);
  if ('error' in r) return r.error;
  if (r.post.authorId !== r.user.id) return NextResponse.json({ error: 'You can only edit your own messages.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? '').trim().slice(0, MAX_POST_LENGTH);
  if (!text) return NextResponse.json({ error: 'Message is empty.' }, { status: 400 });

  const post = await prisma.groupPost.update({ where: { id: postId }, data: { body: text }, select: postSelect });
  return NextResponse.json(post);
}

// Delete your own message (group admins/moderators and platform admins can remove any).
export async function DELETE(req: Request, { params }: Ctx) {
  const { postId } = await params;
  const r = await loadOwnPost(req, postId);
  if ('error' in r) return r.error;
  const role = await groupRole(r.post.groupId, r.user.id);
  const canModerate = r.user.role === 'ADMIN' || role === 'ADMIN' || role === 'MODERATOR';
  if (r.post.authorId !== r.user.id && !canModerate) {
    return NextResponse.json({ error: 'You can only delete your own messages.' }, { status: 403 });
  }
  await prisma.groupPost.delete({ where: { id: postId } });
  return NextResponse.json({ ok: true });
}
