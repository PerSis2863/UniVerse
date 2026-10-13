import { NextResponse } from 'next/server';
import { publicShowcase } from '@/server/impact-league';

// An Impact League challenge's public showcase (Stage 5 · D14), no sign-in: the challenge, prizes and
// the teams that chose to appear (team names, universities, projects), never people's names.
const HEADERS = { 'Cache-Control': 'public, max-age=300' };

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const page = /^[a-z0-9-]{1,60}$/.test(slug) ? await publicShowcase(slug) : null;
  if (!page) return NextResponse.json({ error: 'This page isn’t public.' }, { status: 404, headers: HEADERS });
  return NextResponse.json(page, { headers: HEADERS });
}
