import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { oneOf, str } from '@/server/body';
import { HttpException } from '@/server/http';
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
  const grievanceId = str(body.grievanceId) ?? '';
  const status = oneOf(['RESOLVED', 'REJECTED', 'IN_REVIEW'] as const, body.status) ? body.status : null;
  const resolutionNote = str(body.resolutionNote) ?? null;

  if (!grievanceId || !status) {
    return NextResponse.json({ error: 'grievanceId and valid status required' }, { status: 400 });
  }

  try {
    // Only a request from someone in the admin's own school (another school's looks not found).
    const updated = await resolvePrivacyGrievance({
      actor: user,
      grievanceId,
      status,
      resolutionNote,
    });
    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err instanceof HttpException) return NextResponse.json({ error: err.message }, { status: err.getStatus() });
    throw err;
  }
}
