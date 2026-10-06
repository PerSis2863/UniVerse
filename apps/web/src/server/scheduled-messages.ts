import prisma from '@/lib/db';
import { decorate, getSystemUser, MAX_BODY, membership, messageSelect, serializeMessage } from '@/lib/chat';
import { afterSend } from './chat-notify';
import { channelSendCheck } from './communities';
import { notify } from './email';
import { chatMuted } from './moderation';

// Messages set to send later (Stage 4 · 1.4). The 15-minute cron (cloudflare/worker.ts →
// /api/cron/reminders) sends the ones that are due, so times are quarter hours. A scheduled
// message is deleted once it's sent, and is sent at most once: its message carries the clientId
// "sched-<id>", which the database keeps unique per sender, so the cron and "Send now" can't both
// send it.

export const QUARTER_MS = 15 * 60_000;
const MAX_AHEAD_MS = 30 * 86_400_000;
const MAX_PER_CHAT = 20;
const MAX_PER_PERSON = 100;
const sender = { select: { id: true, name: true, avatar: true } } as const;
export const scheduledSelect = { id: true, body: true, sendAt: true, replyToId: true } as const;

type Row = { id: string; conversationId: string; senderId: string; body: string; replyToId: string | null };

/** The time to send at, or why it can't be used: a quarter hour, up to 30 days ahead. */
function sendTime(v: unknown, now = Date.now()): Date | string {
  const t = typeof v === 'string' || typeof v === 'number' ? new Date(v).getTime() : NaN;
  if (!Number.isFinite(t)) return 'Pick a time to send it.';
  if (t % QUARTER_MS !== 0) return 'Scheduled messages go out on the quarter hour (:00, :15, :30 or :45).';
  if (t <= now) return 'That time has passed. Pick a later one.';
  if (t > now + MAX_AHEAD_MS) return 'You can schedule up to 30 days ahead.';
  return new Date(t);
}

/** Why this person can't post in this chat, or null. Slow mode is left out: see `slowModeClash`. */
async function cantPost(conversationId: string, userId: string): Promise<string | null> {
  const system = await getSystemUser();
  const [official, muted, why] = await Promise.all([
    prisma.conversationParticipant.findFirst({ where: { conversationId, userId: system.id }, select: { id: true } }),
    chatMuted(userId),
    channelSendCheck(conversationId, userId, { slowMode: false }),
  ]);
  if (official) return 'This is an announcements-only channel.';
  return muted ?? why;
}

/** A channel in slow mode (at most 15 minutes): members get one scheduled message per quarter hour. */
async function slowModeClash(conversationId: string, userId: string, at: Date, except?: string): Promise<string | null> {
  const ch = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { communityId: true, slowModeSec: true } });
  if (!ch?.communityId || !ch.slowModeSec) return null;
  const member = await prisma.communityMember.findUnique({ where: { communityId_userId: { communityId: ch.communityId, userId } }, select: { role: true } });
  if (member?.role !== 'MEMBER') return null;
  const taken = await prisma.scheduledMessage.findFirst({ where: { conversationId, senderId: userId, sendAt: at, ...(except ? { id: { not: except } } : {}) }, select: { id: true } });
  return taken ? 'Slow mode is on here: one scheduled message per time. Pick another time.' : null;
}

/** My scheduled messages in a chat, soonest first. */
export function listScheduled(conversationId: string, userId: string) {
  return prisma.scheduledMessage.findMany({ where: { conversationId, senderId: userId }, orderBy: { sendAt: 'asc' }, take: MAX_PER_CHAT, select: scheduledSelect });
}

export async function scheduleMessage(conversationId: string, userId: string, b: { body?: unknown; sendAt?: unknown; replyToId?: unknown }) {
  const body = String(b.body ?? '').trim().slice(0, MAX_BODY);
  if (!body) return { error: 'Write a message to schedule.', status: 400 };
  const at = sendTime(b.sendAt);
  if (typeof at === 'string') return { error: at, status: 400 };
  const why = await cantPost(conversationId, userId);
  if (why) return { error: why, status: 403 };
  const [here, all] = await Promise.all([
    prisma.scheduledMessage.count({ where: { conversationId, senderId: userId } }),
    prisma.scheduledMessage.count({ where: { senderId: userId } }),
  ]);
  if (here >= MAX_PER_CHAT) return { error: `You can have up to ${MAX_PER_CHAT} scheduled messages in a chat.`, status: 400 };
  if (all >= MAX_PER_PERSON) return { error: `You can have up to ${MAX_PER_PERSON} scheduled messages in all.`, status: 400 };
  const clash = await slowModeClash(conversationId, userId, at);
  if (clash) return { error: clash, status: 400 };
  const parent = typeof b.replyToId === 'string' ? await prisma.message.findFirst({ where: { id: b.replyToId, conversationId }, select: { id: true } }) : null;
  const scheduled = await prisma.scheduledMessage.create({ data: { conversationId, senderId: userId, body, sendAt: at, replyToId: parent?.id ?? null }, select: scheduledSelect });
  return { scheduled };
}

/** Changes a scheduled message's text or time (its sender only). */
export async function editScheduled(id: string, userId: string, b: { body?: unknown; sendAt?: unknown }) {
  const row = await prisma.scheduledMessage.findFirst({ where: { id, senderId: userId }, select: { conversationId: true } });
  if (!row) return { error: 'This message was sent or deleted.', status: 404 };
  const data: { body?: string; sendAt?: Date } = {};
  if (b.body !== undefined) {
    const body = String(b.body ?? '').trim().slice(0, MAX_BODY);
    if (!body) return { error: 'The message can’t be empty.', status: 400 };
    data.body = body;
  }
  if (b.sendAt !== undefined) {
    const at = sendTime(b.sendAt);
    if (typeof at === 'string') return { error: at, status: 400 };
    const clash = await slowModeClash(row.conversationId, userId, at, id);
    if (clash) return { error: clash, status: 400 };
    data.sendAt = at;
  }
  const scheduled = await prisma.scheduledMessage.update({ where: { id }, data, select: scheduledSelect });
  return { scheduled };
}

export async function deleteScheduled(id: string, userId: string) {
  const { count } = await prisma.scheduledMessage.deleteMany({ where: { id, senderId: userId } });
  return count > 0;
}

/**
 * Sends a scheduled message now: as a normal message from its sender, if they can still post in
 * that chat. Either way it's no longer scheduled afterwards. Returns the message (decorated for
 * the sender), or why it wasn't sent.
 */
async function deliver(row: Row): Promise<{ message?: Awaited<ReturnType<typeof decorate>>[number]; error?: string; role?: string }> {
  const [member, from, convo] = await Promise.all([
    membership(row.conversationId, row.senderId),
    prisma.user.findUnique({ where: { id: row.senderId }, select: { id: true, name: true, role: true } }),
    prisma.conversation.findUnique({ where: { id: row.conversationId }, select: { disappearingSec: true, communityId: true } }),
  ]);
  const why = !member || !from || !convo ? 'You’re no longer in this chat.' : await cantPost(row.conversationId, row.senderId);
  if (why) {
    await prisma.scheduledMessage.deleteMany({ where: { id: row.id } });
    return { error: why, role: from?.role };
  }
  const clientId = `sched-${row.id}`;
  const parent = row.replyToId ? await prisma.message.findFirst({ where: { id: row.replyToId, conversationId: row.conversationId, deletedAt: null }, select: { id: true } }) : null;
  const now = new Date();
  let message;
  try {
    [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: row.conversationId, senderId: row.senderId, type: 'TEXT', body: row.body, clientId, replyToId: parent?.id ?? null,
          expiresAt: convo!.disappearingSec ? new Date(now.getTime() + convo!.disappearingSec * 1000) : null,
        },
        select: { ...messageSelect, sender },
      }),
      prisma.conversation.update({ where: { id: row.conversationId }, data: { updatedAt: now } }),
      prisma.scheduledMessage.deleteMany({ where: { id: row.id } }),
    ]);
  } catch (e) {
    // Sent a moment ago by the other path (the cron or "Send now"): nothing more to do.
    const sent = await prisma.message.findUnique({ where: { senderId_clientId: { senderId: row.senderId, clientId } }, select: { id: true } });
    if (!sent) throw e;
    await prisma.scheduledMessage.deleteMany({ where: { id: row.id } });
    return { error: 'It was already sent.' };
  }
  const system = await getSystemUser();
  afterSend({ id: message.id, conversationId: row.conversationId, type: 'TEXT', body: row.body, metadata: message.metadata }, from!, { communityId: convo!.communityId, systemUserId: system.id });
  const [out] = await decorate([serializeMessage(message)], row.senderId);
  return { message: out };
}

/** "Send now" from the list of scheduled messages (its sender only). */
export async function sendScheduledNow(id: string, userId: string) {
  const row = await prisma.scheduledMessage.findFirst({ where: { id, senderId: userId }, select: { id: true, conversationId: true, senderId: true, body: true, replyToId: true } });
  if (!row) return { error: 'This message was sent or deleted.', status: 404 };
  const r = await deliver(row);
  return r.message ? { message: r.message } : { error: r.error ?? 'Couldn’t send it.', status: 403 };
}

/**
 * The cron's part: sends the scheduled messages that are due (up to 50 a run). One that can't be
 * sent any more (its sender left the chat, or was paused) is dropped, and the sender is told in
 * the app (no email), with the text so nothing is lost.
 */
export async function sendDueScheduled() {
  const due = await prisma.scheduledMessage.findMany({
    where: { sendAt: { lte: new Date(Date.now() + 2 * 60_000) } },
    orderBy: { sendAt: 'asc' },
    take: 50,
    select: { id: true, conversationId: true, senderId: true, body: true, replyToId: true },
  });
  let sent = 0;
  for (const row of due) {
    const r = await deliver(row).catch((e) => (console.error('scheduled message failed:', e), null));
    if (r?.message) sent++;
    else if (r?.error && r.role) {
      const portal = r.role === 'ADMIN' ? 'admin' : r.role === 'TEACHER' ? 'teacher' : 'student';
      await notify(row.senderId, {
        type: 'chat',
        title: 'Scheduled message not sent',
        body: `${r.error} Your message: “${row.body.length > 160 ? `${row.body.slice(0, 160)}…` : row.body}”`,
        link: `/${portal}/inbox?c=${row.conversationId}`,
        email: false,
      });
    }
  }
  return { due: due.length, sent };
}
