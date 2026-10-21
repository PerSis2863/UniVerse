import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/billing';
import { audit } from '@/server/audit';
import { HttpException } from '@/server/http';
import { deleteSchedule } from '@/server/report-schedules';

type Ctx = { params: Promise<{ id: string }> };
const fail = (e: unknown) => NextResponse.json({ error: (e as Error).message }, { status: e instanceof HttpException ? e.status : 500 });

// DELETE: stops a scheduled export (the files it saved stay in My files).
export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const res = await deleteSchedule(auth.user, id);
    audit(auth.user, { action: 'report_schedule.removed', summary: `Stopped the scheduled export “${res.label}”`, targetType: 'report_schedule', targetId: id }, req);
    return NextResponse.json(res);
  } catch (e) {
    return fail(e);
  }
}
