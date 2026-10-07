import { NextResponse } from 'next/server';
import { publicRoom } from '@/server/impact-rooms';

// The public page of an impact room (no sign-in): figures, staff posts and reports, never students.
const HEADERS = { 'Cache-Control': 'public, max-age=300' };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const room = await publicRoom((await params).id);
  if (!room) return NextResponse.json({ error: 'This page isn’t public.' }, { status: 404, headers: HEADERS });
  return NextResponse.json(room, { headers: HEADERS });
}
