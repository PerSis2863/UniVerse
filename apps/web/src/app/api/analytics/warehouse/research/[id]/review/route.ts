import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { audit } from '@/server/audit';
import { reviewResearchDataRequest } from '@/server/analytics-warehouse';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only administrators can approve or reject research data requests' }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const status = body.status === 'APPROVED' ? 'APPROVED' : 'REJECTED';

  try {
    const updated = await reviewResearchDataRequest({
      requestId: id,
      reviewerId: user.id,
      status,
      rejectionReason: typeof body.rejectionReason === 'string' ? body.rejectionReason : undefined,
      validityDays: typeof body.validityDays === 'number' ? body.validityDays : undefined,
    });

    audit(
      user,
      {
        action: 'analytics.research_request_reviewed',
        summary: `${status} research data request ${id}`,
        targetType: 'research_data_request',
        targetId: id,
      },
      req
    );

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to review research request';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
