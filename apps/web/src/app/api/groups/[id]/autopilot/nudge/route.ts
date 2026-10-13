import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import type { Body } from '@/server/body';
import { HttpException } from '@/server/http';
import { nudge } from '@/server/group-autopilot';

// POST { taskId }: remind a teammate about their late task on the plan's board (in-app, once a day).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const b = ((await req.json().catch(() => null)) ?? {}) as Body;
  try {
    return NextResponse.json(await nudge((await params).id, user, b.taskId));
  } catch (e) {
    if (e instanceof HttpException) return NextResponse.json({ error: e.message }, { status: e.getStatus() });
    throw e;
  }
}
