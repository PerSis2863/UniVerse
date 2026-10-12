import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/billing';
import { listOneRosterSyncHistory } from '@/server/oneroster';

// Admin → Integrations: OneRoster SIS sync history.
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const history = await listOneRosterSyncHistory(auth.org.id);
  return NextResponse.json(history, { headers: { 'Cache-Control': 'no-store' } });
}
