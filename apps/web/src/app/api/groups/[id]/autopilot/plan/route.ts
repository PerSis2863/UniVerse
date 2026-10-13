import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { createOrUpdateAutopilotPlan, findCommonMeetingSlots } from '@/server/group-autopilot';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;

  const plan = await prisma.groupAutopilotPlan.findFirst({
    where: { groupId: id, status: { in: ['ACTIVE', 'DRAFT'] } },
    include: {
      board: { select: { id: true, title: true } },
      scheduledCall: { select: { id: true, title: true, startAt: true, durationMin: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!plan) return NextResponse.json({ plan: null });

  // Get member IDs to calculate latest slots
  const members = await prisma.groupMembership.findMany({
    where: { groupId: id },
    select: { userId: true },
    take: 50,
  });

  const slots = await findCommonMeetingSlots(members.map((m) => m.userId));

  return NextResponse.json({
    plan: {
      ...plan,
      breakdown: JSON.parse(plan.breakdownJson || '[]'),
      meetingSlot: plan.meetingSlot ? JSON.parse(plan.meetingSlot) : null,
    },
    candidateMeetingSlots: slots.slice(0, 5),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const result = await createOrUpdateAutopilotPlan(id, user, {
      title: body.title || 'Group Project',
      brief: body.brief || '',
      courseId: body.courseId,
      assignmentId: body.assignmentId,
      targetDueDate: body.targetDueDate,
      meetingCadence: body.meetingCadence,
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate autopilot plan';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
