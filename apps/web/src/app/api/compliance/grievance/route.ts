import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { cleanGrievanceType, listPrivacyGrievances, resolvePrivacyGrievance, submitPrivacyGrievance } from '@/server/compliance';

// India DPDP Act 2023 (Sections 11-14): Data Principal Rights (Correction, Erasure, Nomination, Grievance).
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const grievances = await listPrivacyGrievances(user);
  return NextResponse.json(grievances, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const requestType = cleanGrievanceType(body.requestType);
    const details = typeof body.details === 'string' ? body.details : '';
    const nomineeName = typeof body.nomineeName === 'string' ? body.nomineeName : null;
    const nomineeEmail = typeof body.nomineeEmail === 'string' ? body.nomineeEmail : null;

    const item = await submitPrivacyGrievance({
      userId: user.id,
      requestType,
      details,
      nomineeName,
      nomineeEmail,
    });

    return NextResponse.json(item);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const user = await getSessionUser(req);
  if (!user || (user.role !== 'ADMIN' && !user.owner)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const grievanceId = typeof body.grievanceId === 'string' ? body.grievanceId : '';
  const status = body.status === 'RESOLVED' || body.status === 'REJECTED' || body.status === 'IN_REVIEW' ? body.status : null;
  const resolutionNote = typeof body.resolutionNote === 'string' ? body.resolutionNote : null;

  if (!grievanceId || !status) {
    return NextResponse.json({ error: 'grievanceId and valid status required' }, { status: 400 });
  }

  const updated = await resolvePrivacyGrievance({
    grievanceId,
    status,
    resolutionNote,
  });

  return NextResponse.json(updated);
}
