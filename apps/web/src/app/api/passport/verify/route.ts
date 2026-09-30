import { NextResponse } from 'next/server';
import { verifyOpenBadge } from '@/server/passport';

// POST { badge: "<VC-JWT>" } — checks an Open Badge issued by UniVerse (signature, issuer, not revoked).
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const jwt = typeof b.badge === 'string' ? b.badge.trim() : '';
  if (!jwt || jwt.length > 20_000) return NextResponse.json({ error: 'Paste the badge (the text of the .jwt file).' }, { status: 400 });
  return NextResponse.json(await verifyOpenBadge(jwt), { headers: { 'Access-Control-Allow-Origin': '*' } });
}
