import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { membership } from '@/lib/chat';
import { listScheduled, scheduleMessage } from '@/server/scheduled-messages';

type Ctx = { params: Promise<{ id: string }> };

// My messages scheduled to send later in this chat (Stage 4 · 1.4; src/server/scheduled-messages.ts).
// GET: the list, soonest first. POST { body, sendAt (a quarter hour, ISO), replyToId? }: schedule one.
export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  if (!(await membership(id, user.id))) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  return NextResponse.json({ scheduled: await listScheduled(id, user.id) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  if (!(await membership(id, user.id))) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  const r = await scheduleMessage(id, user.id, await req.json().catch(() => ({})));
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r, { status: 201 });
}
