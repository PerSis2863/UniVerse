import { NextResponse } from 'next/server';
import { publicPassport } from '@/server/passport';

// A student's public skills passport (only if they published it).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await publicPassport(slug);
  if (!p) return NextResponse.json({ error: 'This passport doesn’t exist or isn’t public.' }, { status: 404 });
  return NextResponse.json(p, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}
