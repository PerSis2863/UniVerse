import { NextResponse } from 'next/server';
import { verifyGuardianToken } from '@/server/share-tokens';
import { guardianView } from '@/server/guardian-view';

// The parent / guardian view behind a student's shared link (no sign-in). Read-only and kept to
// schoolwork (src/server/guardian-view.ts).

const HEADERS = { 'Cache-Control': 'private, max-age=300', 'X-Robots-Tag': 'noindex, nofollow' };

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const v = verifyGuardianToken((await params).token);
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: v.error === 'expired' ? 410 : 404, headers: HEADERS });
  const view = await guardianView(v.userId);
  // A deleted or suspended account, or one that's no longer a student, reads as a broken link.
  if (!view) return NextResponse.json({ error: 'invalid' }, { status: 404, headers: HEADERS });
  return NextResponse.json({ ...view, expiresAt: v.expiresAt.toISOString() }, { headers: HEADERS });
}
