import { NextResponse } from 'next/server';
import { getOneRosterClasses } from '@/server/oneroster';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') || 100);
  const offset = Number(url.searchParams.get('offset') || 0);

  const data = await getOneRosterClasses(null, limit, offset);
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
  });
}
