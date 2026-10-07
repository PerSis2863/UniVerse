import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { notifyMany } from './email';
import { pushService } from './services/push.service';

// @mentions across tools (Stage 4 · 3.9): "@Jane" or "@Jane Smith" in a document comment, a task
// comment or an impact room post notifies that person, if they can see where it was written.
// In-app and push (quiet hours respected), never email. Chat mentions are src/server/chat-notify.ts.

const MAX_PINGS = 20;
const TITLES = /^(dr|mr|mrs|ms|miss|prof|sir)\.?$/;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Who of these people the text mentions (by full name or first name, after an @). */
export function mentioned(text: string, people: { id: string; name: string }[]): string[] {
  if (!text.includes('@')) return [];
  const t = text.toLowerCase();
  return people.filter(({ name }) => {
    const full = name.toLowerCase().trim();
    // "Dr. Jane Smith" is @Jane, @Jane Smith or @Dr. Jane Smith.
    const parts = full.split(/\s+/).filter((w) => !TITLES.test(w));
    const first = parts[0] ?? '';
    return t.includes(`@${full}`) || (parts.length > 1 && t.includes(`@${parts.join(' ')}`)) || (first.length >= 2 && new RegExp(`(^|[^\\w@])@${esc(first)}(?![\\p{L}\\p{N}_])`, 'u').test(t));
  }).map((p) => p.id);
}

/** Notifies the people `text` mentions, among `audience` (ids of who can see it). Returns who. */
export async function notifyMentioned(text: string, audience: string[], from: SessionUser, where: { title: string; link: string }) {
  if (!text.includes('@') || !audience.length) return [];
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(audience)].filter((id) => id !== from.id).slice(0, 500) }, status: { not: 'SUSPENDED' } }, select: { id: true, name: true } });
  const ids = mentioned(text, people).slice(0, MAX_PINGS);
  if (!ids.length) return [];
  const title = `${from.name} mentioned you in ${where.title}`;
  await notifyMany(ids, { type: 'mention', title, body: text.slice(0, 200), link: where.link, email: false });
  await pushService.sendToMany(ids, { title, body: text.slice(0, 140), url: where.link, tag: `mention-${where.link}` }).catch(() => 0);
  return ids;
}
