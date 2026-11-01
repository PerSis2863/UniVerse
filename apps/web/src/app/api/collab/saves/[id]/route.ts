import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { cleanSave } from '@/lib/tool-saves';

// One saved piece of work (M75), only its owner's. GET: with its data. PUT { title?, data? }: rename
// or save over it. DELETE: remove it (and its share link).

type Ctx = { params: Promise<{ id: string }> };
const noStore = { 'Cache-Control': 'no-store' };
const notFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

async function mine(req: Request, params: Ctx['params']) {
  const user = await getSessionUser(req);
  if (!user) return { error: NextResponse.json({ error: 'Please sign in.' }, { status: 401 }) };
  const { id } = await params;
  if (!/^[\w-]{1,40}$/.test(id)) return { error: notFound() };
  const row = await prisma.toolSave.findFirst({ where: { id, userId: user.id } });
  return row ? { row } : { error: notFound() };
}

export async function GET(req: Request, { params }: Ctx) {
  const r = await mine(req, params);
  if (r.error) return r.error;
  const { id, tool, title, data, shareToken, updatedAt } = r.row;
  return NextResponse.json({ save: { id, tool, title, data: JSON.parse(data) as Record<string, string>, shareToken, updatedAt } }, { headers: noStore });
}

export async function PUT(req: Request, { params }: Ctx) {
  const r = await mine(req, params);
  if (r.error) return r.error;
  const s = cleanSave(await req.json().catch(() => null), true);
  if (typeof s === 'string') return NextResponse.json({ error: s }, { status: 400 });
  const row = await prisma.toolSave.update({ where: { id: r.row.id }, data: { ...(s.title ? { title: s.title } : {}), ...(s.data ? { data: JSON.stringify(s.data) } : {}) }, select: { id: true, tool: true, title: true, shareToken: true, updatedAt: true } });
  return NextResponse.json({ save: { id: row.id, tool: row.tool, title: row.title, updatedAt: row.updatedAt, shared: !!row.shareToken } });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const r = await mine(req, params);
  if (r.error) return r.error;
  await prisma.toolSave.delete({ where: { id: r.row.id } });
  return NextResponse.json({ ok: true });
}
