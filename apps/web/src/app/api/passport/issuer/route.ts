import { NextResponse } from 'next/server';
import { issuerProfile } from '@/server/passport';

// The Open Badges issuer profile (referenced by every badge UniVerse issues).
export function GET() {
  return NextResponse.json(issuerProfile(), { headers: { 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' } });
}
