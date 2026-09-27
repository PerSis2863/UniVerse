import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { CAMPUS_KINDS, cleanCampusItem } from '@/lib/campus';

// GET ?kind=SERVICE|LINK|EVENT — campus info for any signed-in user (events: upcoming first).
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const kind = new URL(req.url).searchParams.get('kind')?.toUpperCase();
  if (!kind || !(CAMPUS_KINDS as readonly string[]).includes(kind)) return NextResponse.json({ error: 'Unknown kind.' }, { status: 400 });

  const items = await prisma.campusItem.findMany({
    where: { kind, ...(kind === 'EVENT' ? { startAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } : {}) },
    orderBy: kind === 'EVENT' ? [{ startAt: 'asc' }] : [{ category: 'asc' }, { title: 'asc' }],
    take: 200,
  });
  return NextResponse.json(items, { headers: { 'Cache-Control': 'no-store' } });
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
