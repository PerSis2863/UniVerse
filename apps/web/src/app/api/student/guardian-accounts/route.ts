import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { oneOf, text, type Body } from '@/server/body';
import { GuardianAccountError, cancelCode, makeCode, studentGuardians, studentUnlink } from '@/server/guardian-accounts';

// Student Settings → Parent or guardian → parent accounts (Stage 5 · B16.1).
// GET: linked parent accounts and the current code. POST { action }: code (make a new one),
// cancel-code, remove { linkId }.

const ACTIONS = ['code', 'cancel-code', 'remove'] as const;

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'STUDENT') return NextResponse.json({ links: [], code: null });
  return NextResponse.json(await studentGuardians(user.id), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'STUDENT') return NextResponse.json({ error: 'Only student accounts can link a parent.' }, { status: 403 });
  const b = ((await req.json().catch(() => null)) ?? {}) as Body;
  if (!oneOf(ACTIONS, b.action)) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  try {
    if (b.action === 'code') await makeCode(user.id);
    else if (b.action === 'cancel-code') await cancelCode(user.id);
    else await studentUnlink(user, text(b.linkId));
    return NextResponse.json(await studentGuardians(user.id));
  } catch (e) {
    if (e instanceof GuardianAccountError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
