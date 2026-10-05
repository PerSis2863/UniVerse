import prisma from '@/lib/db';
import { publish } from './realtime';
import { pushService } from './services/push.service';

// Offline-first classroom (upgrade 4): work done with no connection reaches the server later from
// the device's outbox (src/lib/outbox.ts). These read what the device says about it. A device's
// clock can't be trusted far, so times are only accepted within the last two weeks.

const MAX_AGE = 14 * 86_400_000;

/** The outbox's id for one queued action (a retried send carries the same one). */
export function clientIdOf(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

/** A time the device reported (when work was finished offline), or null if missing or implausible. */
export function offlineTime(v: unknown, now = Date.now()): Date | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const t = new Date(v).getTime();
  if (!Number.isFinite(t) || t > now + 2 * 60_000 || t < now - MAX_AGE) return null;
  return new Date(Math.min(t, now));
}

/** Tell a teacher in the app (no email) that offline work needs their decision. */
export async function tellTeacher(teacherId: string, title: string, body: string, link: string) {
  await prisma.notification.create({ data: { userId: teacherId, title, body, type: 'info', link } });
  publish([teacherId], { type: 'notification' });
  await pushService.sendToMany([teacherId], { title, body, url: link, tag: 'offline-work' }).catch(() => 0);
}
