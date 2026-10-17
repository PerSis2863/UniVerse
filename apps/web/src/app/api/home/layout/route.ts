import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { cleanLayout } from '@/lib/home-layout';

/** Saves my home page's cards: their order, the hidden ones and my daily study goal (Stage 5 · Q8). */
export async function PUT(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const layout = cleanLayout(await req.json().catch(() => null));
  await prisma.user.update({ where: { id: user.id }, data: { homeLayout: JSON.stringify(layout) } });
  return NextResponse.json({ layout });
}
