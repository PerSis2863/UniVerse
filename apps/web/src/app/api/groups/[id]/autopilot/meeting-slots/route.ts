import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { findCommonMeetingSlots } from '@/server/group-autopilot';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;

  const members = await prisma.groupMembership.findMany({
    where: { groupId: id },
    select: { userId: true },
    take: 50,
  });

  const slots = await findCommonMeetingSlots(members.map((m) => m.userId));
  return NextResponse.json({ slots }, { headers: { 'Cache-Control': 'no-store' } });
}
