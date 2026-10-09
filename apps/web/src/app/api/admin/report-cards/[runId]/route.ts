import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/billing';
import { ReportCardError, runDetail } from '@/server/report-cards';

// GET: one round's cards (Admin → Reports → Report cards).
export async function GET(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json(await runDetail((await params).runId), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof ReportCardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
