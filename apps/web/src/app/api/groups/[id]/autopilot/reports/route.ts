import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { HttpException } from '@/server/http';
import { listReports, progressReport } from '@/server/group-autopilot';

// GET: the group's weekly progress reports. POST: make (or refresh) this week's (Stage 5 · D6).

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  try {
    return NextResponse.json({ reports: await listReports((await params).id, user) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof HttpException) return NextResponse.json({ error: e.message }, { status: e.getStatus() });
    throw e;
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  try {
    return NextResponse.json({ report: await progressReport((await params).id, user) });
  } catch (e) {
    if (e instanceof HttpException) return NextResponse.json({ error: e.message }, { status: e.getStatus() });
    throw e;
  }
}
