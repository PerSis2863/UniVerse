import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireFeature } from '@/lib/billing';
import { runSchedule } from '@/server/report-schedules';

type Ctx = { params: Promise<{ id: string }> };

// POST: makes the file now (and the next one a day, week or month from now).
export async function POST(req: Request, { params }: Ctx) {
  const auth = await requireFeature(req, 'data_exports');
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const s = await prisma.reportSchedule.findFirst({ where: { id, ownerId: auth.user.id }, select: { id: true, ownerId: true, type: true, filters: true, every: true } });
  if (!s) return NextResponse.json({ error: 'That scheduled export isn’t there any more.' }, { status: 404 });
  const res = await runSchedule(s);
  return res.ok ? NextResponse.json(res) : NextResponse.json({ error: res.error }, { status: 400 });
}
