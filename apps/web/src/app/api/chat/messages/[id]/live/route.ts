import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { publishChat } from '@/server/realtime';

type Ctx = { params: Promise<{ id: string }> };
type Live = { lat: number; lng: number; label: string | null; live?: { until: string; updatedAt: string; stopped?: boolean } };

// M344: a live location's sender moves it ({ lat, lng }, while their app is open) or stops it ({ stop: true }). Only the
// sender, only until it ends.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const msg = await prisma.message.findUnique({ where: { id }, select: { conversationId: true, senderId: true, type: true, metadata: true, deletedAt: true } });
  const meta = msg?.metadata as Live | null;
  if (!msg || msg.deletedAt || msg.type !== 'LOCATION' || msg.senderId !== user.id || !meta?.live) return NextResponse.json({ error: 'Live location not found.' }, { status: 404 });
  if (meta.live.stopped || Date.parse(meta.live.until) < Date.now()) return NextResponse.json({ error: 'This live location has ended.' }, { status: 410 });
  const b = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  let next: Live;
  if (b?.stop === true) next = { ...meta, live: { ...meta.live, stopped: true, until: now, updatedAt: now } };
  else {
    const lat = Number(b?.lat), lng = Number(b?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return NextResponse.json({ error: 'Invalid location.' }, { status: 400 });
    // At most one move every 10 s.
    if (Date.now() - Date.parse(meta.live.updatedAt) < 10_000) return NextResponse.json(meta);
    next = { ...meta, lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, live: { ...meta.live, updatedAt: now } };
  }
  await prisma.message.update({ where: { id }, data: { metadata: next as object } });
  publishChat(msg.conversationId);
  return NextResponse.json(next);
}
