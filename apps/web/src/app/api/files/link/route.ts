import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { HttpException } from '@/server/http';
import { str, type Body } from '@/server/body';
import { privateLink } from '@/server/private-files';

// A 10-minute link to a private file (a call recording, a student's document) for the signed-in
// person, after checking they may see it (src/server/private-files.ts). Other files come back as they are.
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Body;
  const url = str(body.url);
  if (!url || url.length > 2000) return NextResponse.json({ error: 'Which file?' }, { status: 400 });
  try {
    return NextResponse.json(await privateLink(url, user), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof HttpException) return NextResponse.json({ error: e.message }, { status: e.getStatus() });
    throw e;
  }
}
