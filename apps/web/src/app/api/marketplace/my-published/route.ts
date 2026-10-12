import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const packs = await prisma.marketplacePack.findMany({
    where: { authorId: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { imports: true, reviews: true } },
    },
  });

  const totalEarningsMinor = packs.reduce((acc, p) => {
    const sales = p.downloadsCount;
    const authorCut = Math.round(p.priceMinor * (p.revenueSharePct / 100));
    return acc + sales * authorCut;
  }, 0);

  const totalDownloads = packs.reduce((acc, p) => acc + p.downloadsCount, 0);

  return NextResponse.json({
    packs,
    stats: {
      totalPacks: packs.length,
      totalDownloads,
      totalEarningsMinor,
      currency: 'INR',
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
