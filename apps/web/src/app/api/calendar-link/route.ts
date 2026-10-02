import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { issueCalendarToken, shareLinksEnabled } from '@/server/share-tokens';

// GET → the signed-in person's calendar feed address (path only; the page adds its own origin).
// The same person always gets the same link, so it can be copied again at any time.
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!shareLinksEnabled()) return NextResponse.json({ error: 'Calendar links aren’t available yet. Please try again later.', code: 'not-set-up' }, { status: 503 });
  return NextResponse.json({ path: `/api/calendar/${issueCalendarToken(user.id)}.ics` }, { headers: { 'Cache-Control': 'no-store' } });
}
