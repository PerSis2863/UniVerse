import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { generateWeeklyProgressReport } from '@/server/group-autopilot';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;

  const reports = await prisma.groupAutopilotReport.findMany({
    where: { groupId: id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return NextResponse.json({
    reports: reports.map((r) => ({
      ...r,
      metrics: JSON.parse(r.metricsJson || '{}'),
      nudges: JSON.parse(r.nudgesJson || '[]'),
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    let planId = body.planId;
    if (!planId) {
      const active = await prisma.groupAutopilotPlan.findFirst({
        where: { groupId: id, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!active) return NextResponse.json({ error: 'No active autopilot plan found for group.' }, { status: 404 });
      planId = active.id;
    }

    const report = await generateWeeklyProgressReport(planId, user);
    return NextResponse.json({ report });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate progress report';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
