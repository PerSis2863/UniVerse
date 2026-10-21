import { NextResponse } from 'next/server';
import { requireAdmin, requireFeature } from '@/lib/billing';
import { audit } from '@/server/audit';
import { HttpException } from '@/server/http';
import { createSchedule, listSchedules } from '@/server/report-schedules';

// Admin → Reports → Scheduled exports (src/server/report-schedules.ts).
const fail = (e: unknown) => NextResponse.json({ error: (e as Error).message }, { status: e instanceof HttpException ? e.status : 500 });

// GET: this admin's scheduled exports.
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await listSchedules(auth.user), { headers: { 'Cache-Control': 'no-store' } });
}

// POST { type, every, role?, status? }: a new scheduled export (Pro, like the exports themselves).
export async function POST(req: Request) {
  const auth = await requireFeature(req, 'data_exports');
  if (auth instanceof NextResponse) return auth;
  try {
    const s = await createSchedule(auth.user, await req.json().catch(() => ({})));
    audit(auth.user, { action: 'report_schedule.created', summary: `Scheduled “${s.label}” every ${s.every.toLowerCase()}`, targetType: 'report_schedule', targetId: s.id }, req);
    return NextResponse.json(s, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
