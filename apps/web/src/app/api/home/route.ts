import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getSessionUser } from '@/lib/server-auth';
import { cleanTimeZone } from '@/lib/home-time';
import { requestCf } from '@/server/request-cf';
import { homeData } from '@/server/home-data';

/** The home page's layout, Up next and its role's extras (src/server/home-data.ts). Usually the
 *  light API path answers this (cloudflare/fast-api.ts) with the same code. */
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const tz = cleanTimeZone(new URL(req.url).searchParams.get('tz')) ?? requestCf(req)?.timezone;
  const data = await homeData({ id: user.id, role: user.role, org: user.organizationId ?? null }, getCloudflareContext().env.DB, { tz });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
