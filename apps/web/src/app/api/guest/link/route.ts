import { NextResponse } from 'next/server';
import { guestLinkState } from '@/server/calls';

// GET ?call=&g=: whether a guest link still works (the join page, no account). Stage 4 · 2.11.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  return NextResponse.json(await guestLinkState(sp.get('call') ?? '', sp.get('g') ?? ''), { headers: { 'Cache-Control': 'no-store' } });
}
