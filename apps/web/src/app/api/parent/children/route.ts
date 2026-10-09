import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import type { Body } from '@/server/body';
import { GuardianAccountError, linkByCode, myChildren } from '@/server/guardian-accounts';

// Parent app (Stage 5 · B16.1). GET: the guardian's linked children with their schoolwork.
// POST { code, relation? }: link a child with the code they made in their Settings.

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'GUARDIAN') return NextResponse.json({ error: 'This is for parent accounts.' }, { status: 403 });
  return NextResponse.json({ children: await myChildren(user.id) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'GUARDIAN') return NextResponse.json({ error: 'This is for parent accounts.' }, { status: 403 });
  const b = ((await req.json().catch(() => null)) ?? {}) as Body;
  try {
    return NextResponse.json(await linkByCode(user, b.code, b.relation));
  } catch (e) {
    if (e instanceof GuardianAccountError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
