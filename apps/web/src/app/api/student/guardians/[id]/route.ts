import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { HttpException } from '@/server/http';
import { removeContact, updateContact } from '@/server/guardians';

type Ctx = { params: Promise<{ id: string }> };

// PATCH { weeklyDigest?, absenceAlerts?, name? } / DELETE: the student changes or removes a guardian.
async function run(req: Request, work: (studentId: string) => Promise<unknown>) {
  const user = await getSessionUser(req);
  if (!user || user.role !== 'STUDENT') return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  try {
    return NextResponse.json(await work(user.id));
  } catch (e) {
    if (e instanceof HttpException) return NextResponse.json({ error: e.message }, { status: e.getStatus() });
    throw e;
  }
}

export const PATCH = async (req: Request, { params }: Ctx) => run(req, async (sid) => updateContact(sid, (await params).id, await req.json().catch(() => ({}))));
export const DELETE = async (req: Request, { params }: Ctx) => run(req, async (sid) => removeContact(sid, (await params).id));
