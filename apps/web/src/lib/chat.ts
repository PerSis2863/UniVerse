import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';

// ─── Messaging hub helpers (used by /api/chat/*) ────────────────────────────

export const SYSTEM_EMAIL = 'hello@universeimpact.system';
const SYSTEM_FIREBASE_UID = 'system:universe-impact'; // never a real Firebase uid, so nobody can sign in as it
export const ONLINE_WINDOW_MS = 60_000;
export const MAX_BODY = 4000;
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export const userCard = { select: { id: true, name: true, avatar: true, role: true, lastSeenAt: true, email: true } } as const;

export function isOnline(lastSeenAt: Date | null | undefined) {
  return !!lastSeenAt && Date.now() - lastSeenAt.getTime() < ONLINE_WINDOW_MS;
}

/** Record that the user is active (at most one write every 30s). */
export async function touchPresence(userId: string) {
  const cutoff = new Date(Date.now() - 30_000);
  await prisma.user.updateMany({
    where: { id: userId, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }] },
    data: { lastSeenAt: new Date() },
  });
}

/** The official "UniVerse Impact" account that sends welcome messages. */
export async function getSystemUser() {
  return prisma.user.upsert({
    where: { email: SYSTEM_EMAIL },
    update: {},
    create: { email: SYSTEM_EMAIL, firebaseUid: SYSTEM_FIREBASE_UID, name: 'UniVerse Impact', role: 'ADMIN', status: 'ACTIVE' },
    select: { id: true },
  });
}

function welcomeText(user: SessionUser) {
  const first = user.name?.split(' ')[0] || 'there';
  const steps =
    user.role === 'TEACHER'
      ? ['Set up your courses and timetable', 'Share materials and quizzes with your students', 'Propose collaboration projects with NGOs', 'Message students and colleagues right here']
      : user.role === 'ADMIN'
        ? ['Invite your students and teachers', 'Add your partner NGOs and organizations', 'Explore analytics and reporting under Premium', 'Reach anyone on your campus right here']
        : ['Complete your profile so NGOs and classmates can find you', 'Browse NGO projects and apply to one that fits your skills', 'Join a study or project group', 'Earn verified credentials as you make an impact'];
  return [
    `Welcome to UniVerse Impact, ${first}! 👋`,
    '',
    "We're really glad you're here. UniVerse brings your studies, campus life and real-world social impact together in one place.",
    '',
    'Here’s how to get started:',
    ...steps.map((s) => `• ${s}`),
    '',
    'This is your messaging hub: chat one-to-one or in groups, share photos, files and voice notes, and start voice or video calls.',
    '',
    'Need help? Visit Support any time or email myuniverseimpact@gmail.com.',
    '',
    '— The UniVerse Impact team',
  ].join('\n');
}

/** Creates the one-time welcome conversation for a user if they don't have it yet. */
export async function ensureWelcome(user: SessionUser) {
  const system = await getSystemUser();
  if (system.id === user.id) return;
  const existing = await prisma.conversation.findFirst({
    where: { isGroup: false, AND: [{ participants: { some: { userId: user.id } } }, { participants: { some: { userId: system.id } } }] },
    select: { id: true },
  });
  if (existing) return;
  await prisma.conversation.create({
    data: {
      participants: { create: [{ userId: user.id }, { userId: system.id, lastReadAt: new Date() }] },
      messages: { create: { senderId: system.id, body: welcomeText(user), type: 'TEXT' } },
    },
  });
}

/** The caller's membership in a conversation, or null. */
export function membership(conversationId: string, userId: string) {
  return prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true, role: true, lastReadAt: true, joinedAt: true },
  });
}

/** Attachments must be files uploaded through this app (R2 or database storage). */
export { isAppFileUrl as isOwnBlobUrl } from '@/lib/storage';

export const messageSelect = {
  id: true,
  conversationId: true,
  senderId: true,
  body: true,
  type: true,
  attachmentUrl: true,
  attachmentName: true,
  attachmentSize: true,
  attachmentMime: true,
  metadata: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  expiresAt: true,
  forwarded: true,
  replyTo: { select: { id: true, body: true, type: true, deletedAt: true, sender: { select: { id: true, name: true } } } },
  reactions: { select: { emoji: true, userId: true } },
} as const;

type RawMessage = {
  body: string;
  type: string;
  deletedAt: Date | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentSize: number | null;
  attachmentMime: string | null;
  metadata: unknown;
  replyTo: { id: string; body: string; type: string; deletedAt: Date | null; sender: { id: string; name: string } } | null;
  reactions: { emoji: string; userId: string }[];
  [k: string]: unknown;
};

/** Hides the content of deleted messages and groups reactions by emoji. */
export function serializeMessage<T extends RawMessage>(m: T) {
  const reactions: Record<string, string[]> = {};
  for (const r of m.reactions) (reactions[r.emoji] ??= []).push(r.userId);
  if (m.deletedAt) {
    return { ...m, type: 'DELETED', body: '', attachmentUrl: null, attachmentName: null, attachmentSize: null, attachmentMime: null, metadata: null, replyTo: null, reactions: {} };
  }
  return {
    ...m,
    reactions,
    replyTo: m.replyTo ? { ...m.replyTo, body: m.replyTo.deletedAt ? '' : m.replyTo.body.slice(0, 200) } : null,
  };
}

/** Messages a user should see: not expired (disappearing) and not deleted "for me". */
export function visibleTo(userId: string) {
  return {
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    NOT: { userStates: { some: { userId, hidden: true } } },
  };
}

/** Adds the viewer's star and live poll tallies to serialized messages. */
export async function decorate<T extends { id: string; type: string; metadata: unknown }>(messages: T[], userId: string) {
  if (!messages.length) return messages.map((m) => ({ ...m, starred: false, poll: null }));
  const ids = messages.map((m) => m.id);
  const pollIds = messages.filter((m) => m.type === 'POLL').map((m) => m.id);
  const [stars, votes] = await Promise.all([
    prisma.messageUserState.findMany({ where: { userId, starred: true, messageId: { in: ids } }, select: { messageId: true } }),
    pollIds.length ? prisma.pollVote.findMany({ where: { messageId: { in: pollIds } }, select: { messageId: true, userId: true, option: true } }) : [],
  ]);
  const starred = new Set(stars.map((s) => s.messageId));
  return messages.map((m) => {
    let poll = null;
    if (m.type === 'POLL') {
      const options = ((m.metadata as { options?: string[] } | null)?.options ?? []);
      const mine = votes.filter((v) => v.messageId === m.id && v.userId === userId).map((v) => v.option);
      const counts = options.map((_, i) => votes.filter((v) => v.messageId === m.id && v.option === i).length);
      const voters = new Set(votes.filter((v) => v.messageId === m.id).map((v) => v.userId)).size;
      poll = { counts, mine, voters };
    }
    return { ...m, starred: starred.has(m.id), poll };
  });
}
