import prisma from '@/lib/db';
import { wallClock, within } from '@/lib/local-time';

// When teachers answer parents (Stage 5 · B16.2; src/server/parent-messages.ts). Kept apart so the
// chat notifications (src/server/chat-notify.ts) can hold a teacher's push outside these hours.

export interface ContactHours { open: boolean; days: number[]; start: string; end: string; timeZone: string }
export const DEFAULT_HOURS: ContactHours = { open: true, days: [1, 2, 3, 4, 5], start: '08:00', end: '16:00', timeZone: 'UTC' };
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const parseDays = (s: string) => [...new Set(s.split(',').filter((x) => x.trim() !== '').map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();

/** Whether it's within the teacher's hours for parents now. */
export function inHours(h: ContactHours, now = new Date()) {
  if (!h.open) return false;
  const w = wallClock(now, h.timeZone);
  const day = new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay();
  return h.days.includes(day) && within(h.start, h.end, w.hour * 60 + w.min);
}

/** "Mon–Fri, 08:00–16:00" (a run of days is shortened). */
export function hoursText(h: ContactHours) {
  if (!h.open) return 'Not taking parent messages right now';
  const d = [...h.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // Monday first
  const run = d.length > 2 && d.every((x, i) => i === 0 || (x - d[i - 1] + 7) % 7 === 1);
  const days = d.length === 7 ? 'Every day' : run ? `${DAY[d[0]]}–${DAY[d[d.length - 1]]}` : d.map((x) => DAY[x]).join(', ');
  return `${days}, ${h.start}–${h.end}`;
}

/** Contact hours for these teachers (the defaults for anyone who hasn't set them). */
export async function hoursOf(teacherIds: string[]) {
  const rows = teacherIds.length ? await prisma.parentContactHours.findMany({ where: { teacherId: { in: teacherIds.slice(0, 90) } } }) : [];
  const map = new Map(rows.map((r) => [r.teacherId, { open: r.open, days: parseDays(r.days), start: r.start, end: r.end, timeZone: r.timeZone } as ContactHours]));
  return (id: string) => map.get(id) ?? DEFAULT_HOURS;
}
