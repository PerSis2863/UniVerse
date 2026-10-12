import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { getComparativeTermAnalytics } from '@/server/analytics-warehouse';

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = user.organizationId || 'default-org';
  const data = await getComparativeTermAnalytics(orgId);
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
