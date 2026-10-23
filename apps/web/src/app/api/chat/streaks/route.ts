import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { streaksFrom } from '@/lib/chat-streaks';

// GET: my chat streaks (M17, after Snapchat): one-to-one chats where we've both written every day
// lately, as { [conversationId]: days }. One query over the last 60 days, my chats only.
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const rows = await prisma.$queryRawUnsafe<{ c: string; d: string; n: number | bigint }[]>(
    `SELECT m.conversationId AS c, substr(m.createdAt, 1, 10) AS d, COUNT(DISTINCT m.senderId) AS n
       FROM messages m
       JOIN conversation_participants p ON p.conversationId = m.conversationId AND p.userId = ?
       JOIN conversations cv ON cv.id = m.conversationId AND cv.isGroup = 0 AND cv.communityId IS NULL
      WHERE m.createdAt > ? AND m.deletedAt IS NULL AND m.type != 'SYSTEM'
      GROUP BY c, d`,
    user.id, since,
  );
  const streaks = streaksFrom(rows.map((r) => ({ c: r.c, d: r.d, n: Number(r.n) })), new Date().toISOString().slice(0, 10));
  return NextResponse.json({ streaks }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
