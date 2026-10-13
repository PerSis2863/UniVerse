import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { HttpException } from '@/server/http';
import { planView } from '@/server/group-autopilot';

// GET: the best weekly meeting times for the group, from members' class timetables (Stage 5 · D6).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  try {
    const { candidateMeetingSlots } = await planView((await params).id, user);
    return NextResponse.json({ slots: candidateMeetingSlots }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof HttpException) return NextResponse.json({ error: e.message }, { status: e.getStatus() });
    throw e;
  }
}
