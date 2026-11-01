import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { cleanSave, MAX_SAVES } from '@/lib/tool-saves';

// Collaborate → Create, saved work (M75). GET: my saves (newest first, no data). POST { tool, title,
// data }: save a tool's work to my account (at most 300 saves, 200 KB each).

const noStore = { 'Cache-Control': 'no-store' };

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const saves = await prisma.toolSave.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' }, take: MAX_SAVES, select: { id: true, tool: true, title: true, shareToken: true, updatedAt: true } });
  return NextResponse.json({ saves: saves.map(({ shareToken, ...s }) => ({ ...s, shared: !!shareToken })) }, { headers: noStore });
}

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const s = cleanSave(await req.json().catch(() => null));
  if (typeof s === 'string') return NextResponse.json({ error: s }, { status: 400 });
  if ((await prisma.toolSave.count({ where: { userId: user.id } })) >= MAX_SAVES) return NextResponse.json({ error: `You have ${MAX_SAVES} saves: delete some first.` }, { status: 409 });
  const row = await prisma.toolSave.create({ data: { userId: user.id, tool: s.tool!, title: s.title!, data: JSON.stringify(s.data) }, select: { id: true, tool: true, title: true, updatedAt: true } });
  return NextResponse.json({ save: { ...row, shared: false } }, { status: 201 });
}
