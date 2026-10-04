import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { HttpException } from '@/server/http';
import { addContact, guardianEmailsEnabled, listContacts } from '@/server/guardians';

// GET: the parents and guardians this student keeps informed. POST { email, name?, weeklyDigest?,
// absenceAlerts? }: add one (they get a confirmation email first). See src/server/guardians.ts.
async function student(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return { error: NextResponse.json({ error: 'Please sign in.' }, { status: 401 }) };
  if (user.role !== 'STUDENT') return { error: NextResponse.json({ error: 'Only student accounts can add parents or guardians.' }, { status: 403 }) };
  return { user };
}

export async function GET(req: Request) {
  const { user, error } = await student(req);
  if (error) return error;
  // enabled: whether the school switched guardian emails on (GUARDIAN_EMAILS); the card hides when off.
  return NextResponse.json({ enabled: guardianEmailsEnabled(), contacts: await listContacts(user.id) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const { user, error } = await student(req);
  if (error) return error;
  try {
    return NextResponse.json(await addContact(user, await req.json().catch(() => ({}))), { status: 201 });
  } catch (e) {
    if (e instanceof HttpException) return NextResponse.json({ error: e.message }, { status: e.getStatus() });
    throw e;
  }
}
