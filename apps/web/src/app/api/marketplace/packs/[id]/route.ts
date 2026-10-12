import { NextResponse } from 'next/server';
import { getMarketplacePack } from '@/server/marketplace';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const pack = await getMarketplacePack(id);
    return NextResponse.json(pack, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Pack not found';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
