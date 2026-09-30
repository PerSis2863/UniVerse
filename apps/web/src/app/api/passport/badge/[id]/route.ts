import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { openBadgeFor } from '@/server/passport';

// Downloads one of my verified credentials as an Open Badges 3.0 credential.
//   ?format=jwt  (default) the signed VC-JWT, for digital wallets and badge platforms
//   ?format=json the credential as readable JSON (unsigned view)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  let badge: Awaited<ReturnType<typeof openBadgeFor>>;
  try { badge = await openBadgeFor(user.id, id); }
  catch { return NextResponse.json({ error: 'Badge downloads aren’t set up yet (the credential signing key is missing). Please contact support.' }, { status: 503 }); }
  if (!badge) return NextResponse.json({ error: 'Only your verified, signed credentials can be exported.' }, { status: 404 });
  const json = new URL(req.url).searchParams.get('format') === 'json';
  return new NextResponse(json ? JSON.stringify(badge.credential, null, 2) : badge.jwt, {
    headers: {
      'Content-Type': json ? 'application/json; charset=utf-8' : 'application/jwt; charset=utf-8',
      'Content-Disposition': `attachment; filename="${badge.fileName}.${json ? 'json' : 'jwt'}"`,
      'Cache-Control': 'no-store',
    },
  });
}
