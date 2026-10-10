import prisma from '@/lib/db';
import { membership } from '@/lib/chat';
import { MAX_AHEAD_MS } from '@/lib/reminder-times';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, NotFoundException } from './http';

// Reminders and the Later list (Stage 5 · B7.1). A reminder is either typed ("/remind") or about a
// message ("Remind me" in its menu). The 15-minute check sends it as a notification and a push
// (src/server/scheduled-calls.ts sendDueReminders), and it stays on the Later list, opening the
// message, until it's marked done or snoozed.

const MAX_PENDING = 50;
const DAY = 86_400_000;

const preview = (m: { type: string; body: string; attachmentName: string | null }) => {
  switch (m.type) {
    case 'IMAGE': return '📷 Photo';
    case 'VIDEO': return '🎬 Video';
    case 'AUDIO': return '🎤 Voice message';
    case 'FILE': return `📎 ${m.attachmentName || 'File'}`;
    case 'POLL': return `📊 ${m.body}`;
    case 'LOCATION': return '📍 Location';
    default: return m.body.replace(/[*_~`>#]/g, '').split('\n').find((l) => l.trim())?.trim() ?? '';
  }
};

/** When from { minutes } or { at } (an ISO time): from a minute to 60 days ahead. */
function whenFrom(b: Record<string, unknown>) {
  const now = Date.now();
  const due = typeof b.at === 'string' ? new Date(b.at).getTime() : now + Math.round(Number(b.minutes) || 0) * 60_000;
  if (!Number.isFinite(due) || due - now < 60_000 - 5_000 || due - now > MAX_AHEAD_MS) throw new BadRequestException('Pick a time from 1 minute to 60 days ahead.');
  return new Date(due);
}

/** POST /api/chat/reminders { text, minutes | at, conversationId? } or { messageId, minutes | at }. */
export async function createReminder(user: SessionUser, b: Record<string, unknown>) {
  const dueAt = whenFrom(b);
  let text = typeof b.text === 'string' ? b.text.trim().slice(0, 300) : '';
  let conversationId = typeof b.conversationId === 'string' && (await membership(b.conversationId, user.id)) ? b.conversationId : null;
  let messageId: string | null = null;
  if (typeof b.messageId === 'string') {
    const m = await prisma.message.findUnique({ where: { id: b.messageId }, select: { id: true, conversationId: true, type: true, body: true, attachmentName: true, deletedAt: true, sender: { select: { name: true } } } });
    if (!m || m.deletedAt || m.type === 'SYSTEM' || !(await membership(m.conversationId, user.id))) throw new NotFoundException('That message isn’t in one of your chats.');
    messageId = m.id;
    conversationId = m.conversationId;
    text ||= `${m.sender.name}: ${preview(m)}`.slice(0, 300);
  }
  if (!text) throw new BadRequestException('What should I remind you about?');
  const pending = await prisma.chatReminder.count({ where: { userId: user.id, sentAt: null } });
  if (pending >= MAX_PENDING) throw new BadRequestException(`You have ${MAX_PENDING} reminders waiting already.`);
  return prisma.chatReminder.create({ data: { userId: user.id, conversationId, messageId, text, dueAt }, select: { id: true, dueAt: true } });
}

/** GET /api/chat/reminders: the Later list: due (came up, not done), upcoming, and done this week. */
export async function laterList(user: SessionUser) {
  const now = Date.now();
  const rows = await prisma.chatReminder.findMany({
    where: { userId: user.id, OR: [{ doneAt: null, OR: [{ sentAt: null }, { sentAt: { gte: new Date(now - 30 * DAY) } }] }, { doneAt: { gte: new Date(now - 7 * DAY) } }] },
    orderBy: { dueAt: 'asc' }, take: 120,
    select: { id: true, text: true, dueAt: true, sentAt: true, doneAt: true, conversationId: true, messageId: true },
  });
  // The chats' names, and whether each message is still there for me.
  const chatIds = [...new Set(rows.map((r) => r.conversationId).filter((x): x is string => !!x))].slice(0, 90);
  const msgIds = [...new Set(rows.map((r) => r.messageId).filter((x): x is string => !!x))].slice(0, 90);
  const [chats, msgs] = await Promise.all([
    chatIds.length ? prisma.conversation.findMany({ where: { id: { in: chatIds }, participants: { some: { userId: user.id } } }, select: { id: true, isGroup: true, name: true, participants: { where: { userId: { not: user.id } }, take: 1, select: { user: { select: { name: true } } } } } }) : Promise.resolve([]),
    msgIds.length ? prisma.message.findMany({ where: { id: { in: msgIds }, deletedAt: null }, select: { id: true } }) : Promise.resolve([]),
  ]);
  const title = new Map(chats.map((c) => [c.id, c.isGroup ? c.name || 'Group chat' : c.participants[0]?.user.name ?? 'Chat']));
  const alive = new Set(msgs.map((m) => m.id));
  const item = (r: (typeof rows)[number]) => ({
    id: r.id, text: r.text, dueAt: r.dueAt.toISOString(), doneAt: r.doneAt?.toISOString() ?? null,
    chat: r.conversationId && title.has(r.conversationId) ? { id: r.conversationId, title: title.get(r.conversationId)! } : null,
    messageId: r.messageId && alive.has(r.messageId) ? r.messageId : null,
  });
  // Due: its time has come (sent, or within the 15-minute check's reach) and it isn't done.
  const isDue = (r: (typeof rows)[number]) => !r.doneAt && (!!r.sentAt || r.dueAt.getTime() <= now);
  const due = rows.filter(isDue).sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime()).map(item);
  return {
    due,
    upcoming: rows.filter((r) => !r.doneAt && !isDue(r)).map(item),
    done: rows.filter((r) => r.doneAt).sort((a, b) => b.doneAt!.getTime() - a.doneAt!.getTime()).slice(0, 20).map(item),
  };
}

/** PATCH /api/chat/reminders/:id { action: 'done' | 'undo' | 'snooze', minutes | at }; DELETE removes it. */
export async function reminderAction(user: SessionUser, id: string, b: Record<string, unknown> | null) {
  const r = await prisma.chatReminder.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!r) throw new NotFoundException('That reminder isn’t yours.');
  if (b === null) {
    await prisma.chatReminder.delete({ where: { id } });
    return { removed: true };
  }
  switch (b.action) {
    case 'done': await prisma.chatReminder.update({ where: { id }, data: { doneAt: new Date() } }); return { done: true };
    case 'undo': await prisma.chatReminder.update({ where: { id }, data: { doneAt: null } }); return { done: false };
    case 'snooze': {
      const dueAt = whenFrom(b);
      await prisma.chatReminder.update({ where: { id }, data: { dueAt, sentAt: null, doneAt: null } });
      return { dueAt: dueAt.toISOString() };
    }
    default: throw new BadRequestException('Unknown action.');
  }
}
