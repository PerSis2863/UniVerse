import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { publish } from '@/server/realtime';
import { activeEditors, isToken, mergePart, touchEditors, type Editor } from '@/lib/tool-saves';

// Live editing of a saved piece of work (M76), for signed-in people with its edit link.
// GET: the work, its version and who else has it open (this person is marked as here).
// PUT { key, value }: change one part. It is written only on top of the version just read (a
// conditional update, tried again if someone else wrote first), so two people editing different
// parts never wipe each other; the same part: the last change wins. Everyone with it open (and the
// owner) is told at once (realtime refresh of this address).

type Ctx = { params: Promise<{ token: string }> };
const noStore = { 'Cache-Control': 'no-store' };
const gone = () => NextResponse.json({ error: 'This edit link was stopped or never existed. Ask whoever shared it for a new one.' }, { status: 404, headers: noStore });
const editorsOf = (json: string | null) => { try { return (JSON.parse(json ?? '[]') as Editor[]) ?? []; } catch { return []; } };

export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in to edit together.' }, { status: 401 });
  const { token } = await params;
  if (!isToken(token)) return gone();
  const row = await prisma.toolSave.findUnique({ where: { editToken: token }, select: { id: true, tool: true, title: true, data: true, version: true, editors: true, userId: true } });
  if (!row) return gone();
  const now = Date.now(), t = touchEditors(row.editors, { id: user.id, name: user.name ?? 'Someone' }, now);
  if (t.changed) await prisma.toolSave.updateMany({ where: { id: row.id }, data: { editors: JSON.stringify(t.list) } });
  const owner = row.userId === user.id ? null : await prisma.user.findUnique({ where: { id: row.userId }, select: { name: true } });
  return NextResponse.json({
    live: { tool: row.tool, title: row.title, data: JSON.parse(row.data) as Record<string, string>, version: row.version, by: owner ? owner.name?.split(' ')[0] ?? 'Someone' : 'you', mine: row.userId === user.id, with: activeEditors(t.list, now, user.id) },
  }, { headers: noStore });
}

export async function PUT(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in to edit together.' }, { status: 401 });
  const { token } = await params;
  if (!isToken(token)) return gone();
  const body = (await req.json().catch(() => null)) as { key?: unknown; value?: unknown } | null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await prisma.toolSave.findUnique({ where: { editToken: token }, select: { id: true, data: true, version: true, editors: true, userId: true } });
    if (!row) return gone();
    const next = mergePart(row.data, body?.key, body?.value);
    if (typeof next !== 'string') return NextResponse.json({ error: next.error }, { status: 400 });
    if (next === row.data) return NextResponse.json({ version: row.version });
    const done = await prisma.toolSave.updateMany({ where: { id: row.id, version: row.version }, data: { data: next, version: row.version + 1 } });
    if (done.count === 1) {
      const people = [row.userId, ...editorsOf(row.editors).filter((e) => Date.now() - e.at < 10 * 60_000).map((e) => e.id)].filter((id) => id !== user.id);
      publish(people, { type: 'refresh', keys: [`/api/collab/live/${token}`] });
      return NextResponse.json({ version: row.version + 1 });
    }
  }
  return NextResponse.json({ error: 'Lots of changes at once: try again.' }, { status: 409 });
}
