import { NextResponse } from 'next/server';
import { getOneRosterOrgs } from '@/server/oneroster';

export async function GET() {
  const data = await getOneRosterOrgs(null);
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
  });
}
