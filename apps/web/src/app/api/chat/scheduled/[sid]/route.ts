import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { deleteScheduled, editScheduled, sendScheduledNow } from '@/server/scheduled-messages';

type Ctx = { params: Promise<{ sid: string }> };

// One of my scheduled messages (Stage 4 · 1.4; src/server/scheduled-messages.ts).
// PATCH { body?, sendAt? }: change it. POST: send it now. DELETE: cancel it.
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { sid } = await params;
  const r = await editScheduled(sid, user.id, await req.json().catch(() => ({})));
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { sid } = await params;
  const r = await sendScheduledNow(sid, user.id);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.message, { status: 201 });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { sid } = await params;
  if (!(await deleteScheduled(sid, user.id))) return NextResponse.json({ error: 'This message was sent or deleted.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
