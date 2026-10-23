import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { cleanPins, parsePins } from '@/lib/collab-pins';

// GET: my pinned items on Collaborate → Home (M17). PUT { pins }: replace them (cleaned, at most 24).

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { collabPins: true } });
  return NextResponse.json({ pins: parsePins(me?.collabPins) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const pins = cleanPins(await req.json().catch(() => null));
  await prisma.user.update({ where: { id: user.id }, data: { collabPins: JSON.stringify(pins) } });
  return NextResponse.json({ pins });
}
