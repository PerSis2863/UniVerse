import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { isToken } from '@/lib/tool-saves';
import { noteOpen } from '@/server/tool-save-opens';

// A shared piece of work (M75; M76: it opens without signing in, at /s/<token>): anyone with the view
// link can see it, read-only, while it's shared. Only the work, its version and the sharer's first
// name: never an email or anything else about them.

type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { token } = await params;
  const row = isToken(token) ? await prisma.toolSave.findUnique({ where: { shareToken: token }, select: { id: true, tool: true, title: true, data: true, updatedAt: true, userId: true, version: true } }) : null;
  if (!row) return NextResponse.json({ error: 'This link was stopped or never existed. Ask whoever shared it for a new one.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  // Someone signed in who opens it gets it on their Collaborate home (M194); nobody else is recorded.
  const viewer = req.headers.get('authorization') ? await getSessionUser(req).catch(() => null) : null;
  if (viewer) await noteOpen(row.id, row.userId, viewer.id, token, 'view');
  const by = await prisma.user.findUnique({ where: { id: row.userId }, select: { name: true } });
  return NextResponse.json({ shared: { tool: row.tool, title: row.title, data: JSON.parse(row.data) as Record<string, string>, updatedAt: row.updatedAt, version: row.version, by: by?.name?.split(' ')[0] ?? 'Someone' } }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
