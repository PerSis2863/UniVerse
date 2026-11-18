import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { GuardianAccountError, guardianUnlink, setAbsenceAlerts } from '@/server/guardian-accounts';

// Parent app: DELETE unlinks this child (Stage 5 · B16.1).
export async function DELETE(req: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'GUARDIAN') return NextResponse.json({ error: 'This is for parent accounts.' }, { status: 403 });
  try {
    return NextResponse.json(await guardianUnlink(user, (await params).linkId));
  } catch (e) {
    if (e instanceof GuardianAccountError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

// M297: PATCH { alerts }: what this parent hears about the child's absences in the app.
export async function PATCH(req: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'GUARDIAN') return NextResponse.json({ error: 'This is for parent accounts.' }, { status: 403 });
  const b = ((await req.json().catch(() => null)) ?? {}) as { alerts?: unknown };
  try {
    return NextResponse.json(await setAbsenceAlerts(user.id, (await params).linkId, b.alerts));
  } catch (e) {
    if (e instanceof GuardianAccountError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
