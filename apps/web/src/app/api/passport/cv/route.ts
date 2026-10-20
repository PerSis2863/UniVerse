import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { passportCvData } from '@/server/passport';

/** CV data from the passport for the in-browser PDF builder (Workers Free: no server PDF). */
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'STUDENT') return NextResponse.json({ error: 'The CV builder is for students.' }, { status: 403 });
  const data = await passportCvData(user.id);
  if (!data) return NextResponse.json({ error: 'Passport not found.' }, { status: 404 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
