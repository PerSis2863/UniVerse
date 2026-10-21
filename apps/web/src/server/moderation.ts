import prisma from '@/lib/db';
import { findWatchWords, parseOrgSwitches, parseRollouts, parseSwitches, parseWatchWords, schoolOff } from '@/lib/feature-switches';
import { ownerEmails } from './auth';
import { notify } from './email';

// The owner's chat rules for the chat routes: features switched off (owner console → Server), a
// person muted in chat, and watch words that alert the owner (owner console → Live chats). The
// switches and words are read at most once a minute per instance.

let cached: { off: string[]; orgs: Record<string, string[]>; rollouts: Record<string, number>; words: string[]; at: number } = { off: [], orgs: {}, rollouts: {}, words: [], at: 0 };

async function rules() {
  if (Date.now() - cached.at < 60_000) return cached;
  const row = await prisma.serverControl.findUnique({ where: { id: 'main' }, select: { switches: true, watchWords: true } }).catch(() => null);
  cached = { off: parseSwitches(row?.switches), orgs: parseOrgSwitches(row?.switches), rollouts: parseRollouts(row?.switches), words: parseWatchWords(row?.watchWords), at: Date.now() };
  return cached;
}

/** Forget the cached rules (after the owner changes them on this instance). */
export function forgetRules() {
  cached = { ...cached, at: 0 };
}

/** Whether a feature is switched off for everyone, or (with `orgId`) for that person's school (its switches and rollouts). */
export async function featureOff(id: string, orgId?: string | null) {
  const r = await rules();
  return r.off.includes(id) || schoolOff(r.orgs, r.rollouts, orgId).includes(id);
}

/** Why this person can't send chat messages right now, or null if they can. */
export async function chatMuted(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { chatMutedUntil: true } });
  const until = u?.chatMutedUntil;
  if (!until || until.getTime() <= Date.now()) return null;
  const when = until.getTime() - Date.now() > 300 * 86_400_000 ? 'until UniVerse lifts it' : `until ${until.toUTCString().replace(/:\d\d GMT$/, ' UTC')}`;
  return `UniVerse has paused your messages ${when}. You can still read your chats.`;
}

/** The watch words in this text (whole words or phrases, any case). */
export async function watchWordsIn(text: string): Promise<string[]> {
  return findWatchWords((await rules()).words, text);
}

/** Tells the owner (bell, no email) that a watch word was written in a chat. */
export async function alertOwner(found: string[], from: { name: string }, conversationId: string, text: string) {
  const owners = await prisma.user.findMany({ where: { email: { in: ownerEmails() } }, select: { id: true } });
  const preview = text.length > 140 ? `${text.slice(0, 140)}…` : text;
  await Promise.all(owners.map((o) => notify(o.id, {
    title: `Watch word in a chat: ${found.slice(0, 3).join(', ')}`,
    body: `${from.name}: “${preview}”`,
    link: `/console?tab=chats&chat=${conversationId}`,
    type: 'warning',
    email: false,
  })));
}
