import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { visibleTo } from '@/lib/chat';
import { route } from '@/server/assignments';
import { parseQuery } from '@/lib/chat-search';

// GET ?q=: messages in any of my chats (newest first, 30 at most), for the search box in Messages.
// Each result opens its chat at that message. Search 2.0 (Stage 4 · 1.14): filters in the query,
//   from:name (or from:me)   in:chat-name   has:file | has:link | has:photo | has:voice
//   before:YYYY-MM-DD   after:YYYY-MM-DD
// and the words, all of which must appear: in the text, a file's name, or a voice message's
// transcript. Filters alone (e.g. "has:file from:me") list the matching messages.
// The words are looked up in the full-text index (message_fts, migration 0074: any word that starts
// with what was typed, accents ignored); if the index isn't there yet, a plain LIKE search runs.

const LIMIT = 30;
/** The FTS5 query: every word must match the start of a word (quotes escaped). */
const ftsQuery = (words: string[], column: string) => `${column}(${words.map((w) => `"${w.replace(/"/g, '""')}"*`).join(' ')})`;
const dbDate = (d: Date) => d.toISOString().replace('Z', '+00:00');
export const GET = (req: Request) =>
  route(req, async (user) => {
    const q = parseQuery((new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 200));
    const hasFilter = !!(q.from || q.in || q.has || q.before || q.after);
    if (!hasFilter && q.words.join(' ').length < 2) return [];

    // Which of my chats (in:name narrows them).
    const chats = await prisma.conversationParticipant.findMany({
      where: { userId: user.id },
      select: { conversationId: true, conversation: { select: { isGroup: true, name: true, community: { select: { name: true } }, participants: { where: { userId: { not: user.id } }, take: 1, select: { user: { select: { name: true } } } } } } },
      take: 2000,
    });
    const chatName = (c: (typeof chats)[number]) => (c.conversation.isGroup ? c.conversation.name ?? 'Group chat' : c.conversation.participants[0]?.user.name ?? 'Chat');
    // in: matches a chat's name, or a channel's community.
    const inChats = q.in ? chats.filter((c) => `${chatName(c)} ${c.conversation.community?.name ?? ''}`.toLowerCase().includes(q.in!)).map((c) => c.conversationId) : null;
    if (inChats && !inChats.length) return [];

    const when: Prisma.DateTimeFilter | undefined = q.before || q.after ? { ...(q.before ? { lt: q.before } : {}), ...(q.after ? { gte: q.after } : {}) } : undefined;
    const sender: Prisma.MessageWhereInput = q.from === 'me' || q.from === 'you' ? { senderId: user.id } : q.from ? { sender: { name: { contains: q.from } } } : {};
    const base: Prisma.MessageWhereInput = {
      deletedAt: null,
      ...(inChats ? { conversationId: { in: inChats } } : { conversation: { participants: { some: { userId: user.id } } } }),
      ...(when ? { createdAt: when } : {}),
      ...sender,
      ...visibleTo(user.id),
    };
    // Words through the index: the newest matching messages in my chats (dates, in: and from:me
    // narrowed there too, so the cap keeps the right ones).
    const words = q.words.filter((w) => /[\p{L}\p{N}]/u.test(w));
    let matched: string[] | null = null;
    if (words.length) {
      const column = q.has === 'file' || q.has === 'photo' ? '{file} : ' : q.has === 'voice' ? '{voice} : ' : q.has === 'link' ? '{body} : ' : '';
      const extra: string[] = [], args: unknown[] = [user.id, ftsQuery(words, column)];
      if (q.after) { extra.push('m."createdAt" >= ?'); args.push(dbDate(q.after)); }
      if (q.before) { extra.push('m."createdAt" < ?'); args.push(dbDate(q.before)); }
      if (q.from === 'me' || q.from === 'you') { extra.push('m."senderId" = ?'); args.push(user.id); }
      if (inChats && inChats.length <= 60) { extra.push(`m."conversationId" IN (${inChats.map(() => '?').join(',')})`); args.push(...inChats); }
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT m."id" AS id FROM "message_fts" f
         JOIN "messages" m ON m.rowid = f.rowid
         JOIN "conversation_participants" p ON p."conversationId" = m."conversationId" AND p."userId" = ?
         WHERE "message_fts" MATCH ? AND m."deletedAt" IS NULL${extra.map((e) => ` AND ${e}`).join('')}
         ORDER BY m."createdAt" DESC LIMIT 90`,
        ...args,
      ).catch((e) => { console.error('message search index:', (e as Error).message); return null; });
      if (rows) {
        if (!rows.length) return [];
        matched = rows.map((r) => r.id);
      }
    }
    const textWords = q.words.map((w) => ({ body: { contains: w } }));
    const fileWords = q.words.map((w) => ({ attachmentName: { contains: w } }));
    const kinds: Prisma.MessageWhereInput[] =
      q.has === 'file' ? [{ type: 'FILE', AND: fileWords }]
      : q.has === 'photo' ? [{ type: 'IMAGE', AND: fileWords }]
      : q.has === 'link' ? [{ type: 'TEXT', AND: [{ body: { contains: 'http' } }, ...textWords] }]
      : q.has === 'voice' ? (q.words.length ? [] : [{ type: 'AUDIO' }])
      : [{ type: 'TEXT', AND: textWords }, ...(q.words.length ? [{ type: 'FILE', AND: fileWords }] : [])];

    // Voice messages whose transcript has the words (the transcript is inside the message's JSON).
    let voiceIds: string[] = [];
    if (!matched && q.words.length && (!q.has || q.has === 'voice')) {
      const like = `%${q.words[0].replace(/[%_]/g, '')}%`;
      const rows = await prisma.$queryRawUnsafe<{ id: string; t: string | null }[]>(
        `SELECT m."id" AS id, json_extract(m."metadata", '$.transcript') AS t FROM "messages" m
         JOIN "conversation_participants" p ON p."conversationId" = m."conversationId" AND p."userId" = ?
         WHERE m."type" = 'AUDIO' AND m."deletedAt" IS NULL AND json_extract(m."metadata", '$.transcript') LIKE ?
         ORDER BY m."createdAt" DESC LIMIT 200`,
        user.id, like,
      ).catch(() => []);
      voiceIds = rows.filter((r) => q.words.every((w) => (r.t ?? '').toLowerCase().includes(w.toLowerCase()))).map((r) => r.id);
    }
    // With the index, the words already matched: only the kind of message still narrows.
    const byKind: Prisma.MessageWhereInput =
      q.has === 'file' ? { type: 'FILE' } : q.has === 'photo' ? { type: 'IMAGE' } : q.has === 'voice' ? { type: 'AUDIO' } : q.has === 'link' ? { type: 'TEXT', body: { contains: 'http' } } : {};
    const or = [...kinds, ...(voiceIds.length ? [{ id: { in: voiceIds } }] : [])];
    if (!matched && !or.length) return [];

    const rows = await prisma.message.findMany({
      where: matched ? { ...base, ...byKind, id: { in: matched } } : { ...base, OR: or },
      orderBy: { createdAt: 'desc' },
      take: LIMIT,
      select: {
        id: true, type: true, body: true, attachmentName: true, metadata: true, createdAt: true, conversationId: true,
        sender: { select: { id: true, name: true } },
        conversation: { select: { isGroup: true, name: true, participants: { where: { userId: { not: user.id } }, take: 1, select: { user: { select: { name: true, avatar: true } } } } } },
      },
    });
    const first = (q.words[0] ?? '').toLowerCase();
    const cut = (text: string) => {
      const i = first ? text.toLowerCase().indexOf(first) : -1;
      const start = Math.max(0, i - 40);
      return (start > 0 ? '…' : '') + text.slice(start, start + 140);
    };
    return rows.map((m) => {
      const transcript = (m.metadata as { transcript?: string } | null)?.transcript;
      const kind = m.type === 'AUDIO' ? 'voice' : m.type === 'FILE' ? 'file' : m.type === 'IMAGE' ? 'photo' : /https?:\/\//.test(m.body) ? 'link' : 'text';
      const text = m.type === 'AUDIO' ? (transcript ? `🎤 ${cut(transcript)}` : '🎤 Voice message') : m.type === 'FILE' || m.type === 'IMAGE' ? `${m.type === 'FILE' ? '📎' : '📷'} ${m.attachmentName ?? ''}${m.body ? ` · ${m.body.slice(0, 80)}` : ''}` : cut(m.body);
      return {
        id: m.id,
        conversationId: m.conversationId,
        title: m.conversation.isGroup ? m.conversation.name ?? 'Group chat' : m.conversation.participants[0]?.user.name ?? 'Chat',
        avatar: m.conversation.isGroup ? null : m.conversation.participants[0]?.user.avatar ?? null,
        sender: m.sender.id === user.id ? 'You' : m.sender.name.split(' ')[0],
        snippet: text,
        kind,
        createdAt: m.createdAt,
      };
    });
  });
