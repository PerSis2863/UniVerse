import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { openSkillsBadgeFor } from '@/server/passport';

// Downloads my skills with evidence as one signed Open Badges 3.0 credential.
//   ?format=jwt (default) the signed VC-JWT · ?format=json the readable credential
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  let badge: Awaited<ReturnType<typeof openSkillsBadgeFor>>;
  try { badge = await openSkillsBadgeFor(user.id); }
  catch { return NextResponse.json({ error: 'Badge downloads aren’t set up yet (the credential signing key is missing). Please contact support.' }, { status: 503 }); }
  if (!badge) return NextResponse.json({ error: 'You have no evidence to export yet.' }, { status: 404 });
  const json = new URL(req.url).searchParams.get('format') === 'json';
  return new NextResponse(json ? JSON.stringify(badge.credential, null, 2) : badge.jwt, {
    headers: {
      'Content-Type': json ? 'application/json; charset=utf-8' : 'application/jwt; charset=utf-8',
      'Content-Disposition': `attachment; filename="${badge.fileName}.${json ? 'json' : 'jwt'}"`,
      'Cache-Control': 'no-store',
    },
  });
}
