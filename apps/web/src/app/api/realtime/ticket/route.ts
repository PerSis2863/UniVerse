import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { createTicket } from '@/server/realtime';
import { touchPresence } from '@/lib/chat';

// Returns the WebSocket address for live updates: /realtime?user=…&ticket=… (valid for one
// connection within 60 seconds). 503 when live updates aren't available; the app keeps polling.
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const [ticket] = await Promise.all([createTicket(user.id).catch(() => null), touchPresence(user.id).catch(() => {})]);
  if (!ticket) return NextResponse.json({ error: 'Live updates are unavailable.' }, { status: 503 });
  return NextResponse.json(
    { path: `/realtime?user=${encodeURIComponent(user.id)}&ticket=${encodeURIComponent(ticket)}` },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
