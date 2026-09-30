import { NextResponse } from 'next/server';

// The tool's public keys for LMS registration forms that require a "public keyset URL". UniVerse
// only receives launches (it doesn't call LMS services yet), so there are no keys to publish.
export function GET() {
  return NextResponse.json({ keys: [] }, { headers: { 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' } });
}
