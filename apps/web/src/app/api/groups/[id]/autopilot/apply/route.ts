import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import type { Body } from '@/server/body';
import { HttpException } from '@/server/http';
import { applyPlan } from '@/server/group-autopilot';

// POST { planId, startAt?, slot? }: put the draft plan's tasks on the group's board and, with a
// start time, schedule the weekly call (Stage 5 · D6).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const b = ((await req.json().catch(() => null)) ?? {}) as Body;
  try {
    return NextResponse.json(await applyPlan((await params).id, user, { planId: b.planId, startAt: b.startAt, slot: b.slot }));
  } catch (e) {
    if (e instanceof HttpException) return NextResponse.json({ error: e.message }, { status: e.getStatus() });
    throw e;
  }
}
