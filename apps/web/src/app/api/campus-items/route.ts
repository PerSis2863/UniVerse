import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { CAMPUS_KINDS, cleanCampusItem } from '@/lib/campus';

// GET ?kind=SERVICE|LINK|EVENT — campus info for any signed-in user (events: upcoming first).
// Admins also get `createdBy` (name, email, role) and can pass ?past=1 to include past events.
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const kind = new URL(req.url).searchParams.get('kind')?.toUpperCase();
  if (!kind || !(CAMPUS_KINDS as readonly string[]).includes(kind)) return NextResponse.json({ error: 'Unknown kind.' }, { status: 400 });

  // Admins can ask for past events too (?past=1); everyone else only sees upcoming ones.
  const isAdmin = user.role === 'ADMIN';
  const withPast = isAdmin && new URL(req.url).searchParams.get('past') === '1';
  const items = await prisma.campusItem.findMany({
    where: { kind, ...(kind === 'EVENT' && !withPast ? { startAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } : {}) },
    orderBy: kind === 'EVENT' ? [{ startAt: withPast ? 'desc' : 'asc' }] : [{ category: 'asc' }, { title: 'asc' }],
    take: 200,
  });
  if (!isAdmin) return NextResponse.json(items, { headers: { 'Cache-Control': 'no-store' } });

  // Admins also see who added each item (one extra query for all creators).
  const creatorIds = [...new Set(items.map((i) => i.createdById).filter((id): id is string => !!id))];
  // (D1 allows ~100 bound values per query, so ids go in chunks of 90.)
  const chunks: string[][] = [];
  for (let i = 0; i < creatorIds.length; i += 90) chunks.push(creatorIds.slice(i, i + 90));
  const creators = (await Promise.all(chunks.map((ids) => prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true, role: true, status: true },
  })))).flat();
  const byId = new Map(creators.map((c) => [c.id, c]));
  return NextResponse.json(
    items.map((i) => ({ ...i, createdBy: i.createdById ? byId.get(i.createdById) ?? null : null })),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

// POST — admins add campus info.
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Only admins can add campus info.' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const kind = String(b.kind ?? '').toUpperCase();
  if (!(CAMPUS_KINDS as readonly string[]).includes(kind)) return NextResponse.json({ error: 'Unknown kind.' }, { status: 400 });
  const data = cleanCampusItem(b);
  if (!data.title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
  if (kind === 'LINK' && !data.url) return NextResponse.json({ error: 'Enter a valid link (https://…).' }, { status: 400 });
  if (kind === 'EVENT' && !data.startAt) return NextResponse.json({ error: 'Pick a date and time for the event.' }, { status: 400 });
  const item = await prisma.campusItem.create({ data: { ...data, title: data.title, kind, createdById: user.id } });
  return NextResponse.json(item, { status: 201 });
}
