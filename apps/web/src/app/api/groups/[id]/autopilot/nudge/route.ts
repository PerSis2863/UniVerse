import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { sendAutopilotNudge } from '@/server/group-autopilot';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    if (!body.taskId) return NextResponse.json({ error: 'Task ID is required.' }, { status: 400 });

    let planId = body.planId;
    if (!planId) {
      const active = await prisma.groupAutopilotPlan.findFirst({
        where: { groupId: id, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!active) return NextResponse.json({ error: 'Active autopilot plan not found.' }, { status: 404 });
      planId = active.id;
    }

    const result = await sendAutopilotNudge(planId, body.taskId, user);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send nudge';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
