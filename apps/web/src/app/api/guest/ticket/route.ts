import { NextResponse } from 'next/server';
import { guestTicket } from '@/server/calls';
import { HttpException } from '@/server/http';

// POST { callId, token, name }: a guest's ticket for a call link (Stage 4 · 2.11). No account:
// the call room checks the link, limits tickets per network address and per link, and puts the
// guest in the waiting room until a host lets them in.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await guestTicket(String(b.callId ?? ''), b.token, b.name, req.headers.get('cf-connecting-ip')), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof HttpException) return NextResponse.json({ error: e.message }, { status: e.getStatus() });
    throw e;
  }
}
