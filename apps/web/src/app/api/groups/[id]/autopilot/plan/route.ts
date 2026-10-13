import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import type { Body } from '@/server/body';
import { HttpException } from '@/server/http';
import { makePlan, planView } from '@/server/group-autopilot';

// Group project autopilot (Stage 5 · D6, src/server/group-autopilot.ts). Group members only.
// GET: the latest plan and the best meeting times. POST { title, brief, targetDueDate?, courseId? }: make the draft.

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  try {
    return NextResponse.json(await planView((await params).id, user), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof HttpException) return NextResponse.json({ error: e.message }, { status: e.getStatus() });
    throw e;
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const b = ((await req.json().catch(() => null)) ?? {}) as Body;
  try {
    return NextResponse.json(await makePlan((await params).id, user, { title: b.title, brief: b.brief, targetDueDate: b.targetDueDate, courseId: b.courseId }));
  } catch (e) {
    if (e instanceof HttpException) return NextResponse.json({ error: e.message }, { status: e.getStatus() });
    throw e;
  }
}
