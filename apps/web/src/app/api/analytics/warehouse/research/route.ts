import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { audit } from '@/server/audit';
import { listResearchDataRequests, submitResearchDataRequest } from '@/server/analytics-warehouse';

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'ADMIN' && user.role !== 'TEACHER') {
    return NextResponse.json({ error: 'Only faculty and administrators can view research data requests' }, { status: 403 });
  }

  const orgId = user.organizationId || 'default-org';
  const list = await listResearchDataRequests(orgId);
  return NextResponse.json(list, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = user.organizationId || 'default-org';

  try {
    const reqRecord = await submitResearchDataRequest({
      organizationId: orgId,
      requestedById: user.id,
      title: String(body.title || ''),
      institution: String(body.institution || ''),
      purpose: String(body.purpose || ''),
      datasetScope: typeof body.datasetScope === 'string' ? body.datasetScope : undefined,
      anonymized: body.anonymized !== false,
    });

    audit(
      user,
      {
        action: 'analytics.research_request_submitted',
        summary: `Submitted academic research data request "${reqRecord.title}" for ${reqRecord.institution}`,
        targetType: 'research_data_request',
        targetId: reqRecord.id,
      },
      req
    );

    return NextResponse.json(reqRecord, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to submit research request';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
