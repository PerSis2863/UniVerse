import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { GUARDIAN_DAYS, issueGuardianToken, shareLinksEnabled } from '@/server/share-tokens';

// POST { days: 7 | 30 | 90 } → a link a student gives a parent or guardian: a read-only view of
// their grades, attendance and deadlines (/guardian/<token>). Nothing is stored; the link carries
// its own expiry.
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'STUDENT') return NextResponse.json({ error: 'Only student accounts can share progress.' }, { status: 403 });
  if (!shareLinksEnabled()) return NextResponse.json({ error: 'Sharing links aren’t available yet. Please try again later.', code: 'not-set-up' }, { status: 503 });

  const b = await req.json().catch(() => ({}));
  const days = (GUARDIAN_DAYS as readonly number[]).includes(Number(b.days)) ? Number(b.days) : 30;
  const { token, expiresAt } = issueGuardianToken(user.id, days);
  return NextResponse.json({ path: `/guardian/${token}`, expiresAt: expiresAt.toISOString(), days }, { headers: { 'Cache-Control': 'no-store' } });
}
