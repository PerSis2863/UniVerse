import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { membership, visibleTo } from '@/lib/chat';
import { isLanguage, translateMessages } from '@/server/translate';

type Ctx = { params: Promise<{ id: string }> };

// POST { ids, to }: translations of up to 40 messages of this chat into `to` (ISO 639-1), in one
// request. Stored translations are reused; the rest are translated once and stored for everyone.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const me = await membership(id, user.id);
  if (!me) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (!isLanguage(body.to)) return NextResponse.json({ error: 'Choose a language to translate into.' }, { status: 400 });
  const ids: string[] = Array.isArray(body.ids) ? [...new Set<string>(body.ids.filter((x: unknown): x is string => typeof x === 'string'))].slice(0, 40) : [];
  if (!ids.length) return NextResponse.json({ translations: {} });

  const messages = await prisma.message.findMany({
    where: { id: { in: ids }, conversationId: id, deletedAt: null, type: { in: ['TEXT', 'POLL'] }, AND: [visibleTo(user.id)] },
    select: { id: true, body: true },
  });
  const translations = await translateMessages(messages.filter((m) => m.body.trim()), body.to);
  const failed = messages.some((m) => m.body.trim() && !translations[m.id]);
  if (failed && !Object.keys(translations).length) {
    return NextResponse.json({ error: process.env.GEMINI_API_KEY ? 'Translation is unavailable right now. Please try again.' : 'Translation isn’t set up yet.' }, { status: 503 });
  }
  return NextResponse.json({ translations }, { headers: { 'Cache-Control': 'no-store' } });
}
