import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { isToken } from '@/lib/tool-saves';

// A shared piece of work (M75): anyone with the link can see it, read-only, while it's shared. Only
// the work and the sharer's first name: never an email or anything else about them.

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  const row = isToken(token) ? await prisma.toolSave.findUnique({ where: { shareToken: token }, select: { tool: true, title: true, data: true, updatedAt: true, userId: true } }) : null;
  if (!row) return NextResponse.json({ error: 'This link was stopped or never existed. Ask whoever shared it for a new one.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const by = await prisma.user.findUnique({ where: { id: row.userId }, select: { name: true } });
  return NextResponse.json({ shared: { tool: row.tool, title: row.title, data: JSON.parse(row.data) as Record<string, string>, updatedAt: row.updatedAt, by: by?.name?.split(' ')[0] ?? 'Someone' } }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
