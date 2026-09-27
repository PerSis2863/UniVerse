import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';

// Latest messages across the groups the signed-in user belongs to.
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const limit = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || 10));
  const posts = await prisma.groupPost.findMany({
    where: { group: { members: { some: { userId: user.id } } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      body: true,
      imageUrl: true,
      createdAt: true,
      author: { select: { id: true, name: true } },
      group: { select: { id: true, name: true, category: true } },
    },
  });
  return NextResponse.json(posts, { headers: { 'Cache-Control': 'no-store' } });
}
