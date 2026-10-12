import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { addMarketplaceReview } from '@/server/marketplace';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const reviews = await prisma.marketplaceReview.findMany({
    where: { packId: id },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { id: true, name: true } } },
    take: 50,
  });

  return NextResponse.json(reviews, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const rating = typeof body.rating === 'number' ? body.rating : 5;
  const comment = typeof body.comment === 'string' ? body.comment : undefined;

  try {
    const updated = await addMarketplaceReview({
      packId: id,
      userId: user.id,
      rating,
      comment,
    });
    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to submit review';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
