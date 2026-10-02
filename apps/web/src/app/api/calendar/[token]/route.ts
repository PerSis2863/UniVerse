import { calendarFeed } from '@/server/ical';
import { verifyCalendarToken } from '@/server/share-tokens';

// GET /api/calendar/<token>.ics: the calendar feed that Google / Apple / Outlook Calendar subscribe
// to (no sign-in: the signed token is the key). Calendar apps re-read it on their own schedule; the
// 15-minute cache keeps repeated reads from hitting the database.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/i, '');
  const userId = verifyCalendarToken(token);
  if (!userId) {
    return new Response('This calendar link doesn’t work. Copy a new one from the calendar page in UniVerse.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' },
    });
  }
  const body = await calendarFeed(userId);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="universe.ics"',
      'Cache-Control': 'private, max-age=900',
      'X-Robots-Tag': 'noindex',
    },
  });
}
