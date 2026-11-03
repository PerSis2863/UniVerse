import { NextResponse } from 'next/server';
import { siteTotals } from '@/server/site-totals';

// The landing's live totals (M44), no sign-in: rounded-down counts for the whole site, nothing about
// anyone. They change once a day, so browsers and Cloudflare may keep them for an hour.
export async function GET() {
  return NextResponse.json({ totals: await siteTotals() }, { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' } });
}
