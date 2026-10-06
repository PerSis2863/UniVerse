import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { MAX_BODY, membership } from '@/lib/chat';
import { isLanguage } from '@/server/translate';

type Ctx = { params: Promise<{ id: string }> };
const MUTE_FOR: Record<string, number | null> = { '8h': 8 * 3600_000, '1w': 7 * 86_400_000, always: null };

// PATCH { pinned?, muted?: '8h' | '1w' | 'always' | false, archived?, unread?, translateTo?: lang | null,
// draft?: text | null } — the caller's own settings for this chat. The draft is what they were
// writing here, so it follows them to their other devices (Stage 4 · 1.4).
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const me = await membership(id, user.id);
  if (!me) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const data: { pinnedAt?: Date | null; mutedUntil?: Date | null; archivedAt?: Date | null; markedUnread?: boolean; translateTo?: string | null; draft?: string | null; draftAt?: Date } = {};
  if (typeof b.pinned === 'boolean') {
    if (b.pinned) {
      const pinnedCount = await prisma.conversationParticipant.count({ where: { userId: user.id, pinnedAt: { not: null }, NOT: { id: me.id } } });
      if (pinnedCount >= 3) return NextResponse.json({ error: 'You can pin up to 3 chats.' }, { status: 400 });
    }
    data.pinnedAt = b.pinned ? new Date() : null;
  }
  if (b.muted === false) data.mutedUntil = null;
  else if (typeof b.muted === 'string' && b.muted in MUTE_FOR) {
    const ms = MUTE_FOR[b.muted];
    data.mutedUntil = ms === null ? new Date('9999-12-31T00:00:00Z') : new Date(Date.now() + ms);
  }
  if (typeof b.archived === 'boolean') { data.archivedAt = b.archived ? new Date() : null; if (b.archived) data.pinnedAt = null; }
  if (typeof b.unread === 'boolean') data.markedUnread = b.unread;
  if (b.translateTo === null || isLanguage(b.translateTo)) data.translateTo = b.translateTo;
  else if (b.translateTo !== undefined) return NextResponse.json({ error: 'Unknown language.' }, { status: 400 });
  if (b.draft === null || typeof b.draft === 'string') {
    const text = String(b.draft ?? '').slice(0, MAX_BODY);
    data.draft = text.trim() ? text : null;
    data.draftAt = new Date();
  }

  await prisma.conversationParticipant.update({ where: { id: me.id }, data });
  return NextResponse.json({ ok: true });
}
