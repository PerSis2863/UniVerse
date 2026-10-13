import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { applyPlanToWorkspace } from '@/server/group-autopilot';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  await params;

  try {
    const body = await req.json().catch(() => ({}));
    if (!body.planId) return NextResponse.json({ error: 'Plan ID required.' }, { status: 400 });

    const result = await applyPlanToWorkspace(body.planId, user, body.autoScheduleCall !== false);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to apply autopilot plan';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
