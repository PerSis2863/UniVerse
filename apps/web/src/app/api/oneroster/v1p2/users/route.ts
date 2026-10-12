import { NextResponse } from 'next/server';
import { getOneRosterUsers } from '@/server/oneroster';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const role = url.searchParams.get('role') || undefined;
  const limit = Number(url.searchParams.get('limit') || 100);
  const offset = Number(url.searchParams.get('offset') || 0);

  const data = await getOneRosterUsers(null, role, limit, offset);
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
  });
}
