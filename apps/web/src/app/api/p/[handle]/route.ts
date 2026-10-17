import { NextResponse } from 'next/server';
import { publicPassportByHandle } from '@/server/passport';

/** Public portfolio by vanity handle. */
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const p = await publicPassportByHandle(handle);
  if (!p) return NextResponse.json({ error: 'This portfolio doesn’t exist or isn’t public.' }, { status: 404 });
  return NextResponse.json(p, { headers: { 'Cache-Control': 'public, max-age=30', 'X-Robots-Tag': 'noindex' } });
}
