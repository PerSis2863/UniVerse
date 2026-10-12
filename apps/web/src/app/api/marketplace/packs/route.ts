import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { audit } from '@/server/audit';
import { listMarketplacePacks, publishMarketplacePack } from '@/server/marketplace';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || undefined;
  const category = searchParams.get('category') || undefined;
  const level = searchParams.get('level') || undefined;
  const priceFilter = searchParams.get('priceFilter') as 'all' | 'free' | 'paid' | null;
  const sort = searchParams.get('sort') as 'rating' | 'downloads' | 'recent' | null;
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined;
  const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : undefined;

  try {
    const data = await listMarketplacePacks({
      q,
      category,
      level,
      priceFilter: priceFilter || undefined,
      sort: sort || undefined,
      limit,
      offset,
    });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to query marketplace';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only instructors and administrators can publish course packs' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const pack = await publishMarketplacePack({
      authorId: user.id,
      sourceCourseId: typeof body.sourceCourseId === 'string' ? body.sourceCourseId : undefined,
      title: String(body.title || ''),
      summary: String(body.summary || ''),
      description: typeof body.description === 'string' ? body.description : undefined,
      category: String(body.category || 'Computer Science'),
      level: typeof body.level === 'string' ? body.level : 'ALL_LEVELS',
      priceMinor: typeof body.priceMinor === 'number' ? body.priceMinor : 0,
      currency: typeof body.currency === 'string' ? body.currency : 'INR',
      estimatedHours: typeof body.estimatedHours === 'number' ? body.estimatedHours : 5.0,
      thumbnailUrl: typeof body.thumbnailUrl === 'string' ? body.thumbnailUrl : undefined,
    });

    audit(
      user,
      {
        action: 'marketplace.pack_published',
        summary: `Published marketplace pack "${pack.title}" (${pack.category}, ${pack.priceMinor === 0 ? 'Free' : (pack.priceMinor / 100) + ' ' + pack.currency})`,
        targetType: 'marketplace_pack',
        targetId: pack.id,
      },
      req,
    );

    return NextResponse.json(pack, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to publish pack';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
