import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { cleanPrefs, digestText, GROUP_OF_TYPE, nextDigestAt, NOTE_GROUPS, pushDecision, type NoteGroupId, type NotifyPrefs } from '@/lib/notify-prefs';
import { cleanTimeZone } from '@/lib/home-time';
import { planLimits } from '@/lib/plan-limits';
import { BadRequestException } from './http';

// Notification settings, the notification centre and the daily summary (Stage 5 · Q9).

const dbDate = (d: Date) => d.toISOString().replace('Z', '+00:00');
const PAGE = 30;

/** The settings saved with a time zone (for the summary's hour). */
export function readPrefs(raw: unknown): NotifyPrefs & { tz?: string } {
  const p = cleanPrefs(raw);
  let tz: string | undefined;
  try { tz = cleanTimeZone((typeof raw === 'string' ? JSON.parse(raw) : raw)?.tz); } catch { tz = undefined; }
  return { ...p, tz };
}

/** Whether anything waits for a summary (a kind set to "summary", or a muted course). */
const wantsDigest = (p: NotifyPrefs) => p.digest && (p.muted.length > 0 || Object.values(p.push).includes('digest'));


export async function getSettings(user: SessionUser) {
  const [me, courses, devices] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { notifyPrefs: true, digestAt: true } }),
    prisma.course.findMany({
      where: { OR: [{ enrollments: { some: { studentId: user.id } } }, { teacherId: user.id }, { staff: { some: { userId: user.id } } }] },
      select: { id: true, code: true, name: true }, orderBy: { code: 'asc' }, take: 60,
    }),
    prisma.pushSubscription.count({ where: { userId: user.id } }),
  ]);
  const prefs = readPrefs(me?.notifyPrefs);
  return { prefs, groups: NOTE_GROUPS.map(({ id, label, hint }) => ({ id, label, hint })), courses, devices, nextDigest: me?.digestAt ?? null };
}

export async function saveSettings(user: SessionUser, body: Record<string, unknown>) {
  const prefs = cleanPrefs(body.prefs);
  const tz = cleanTimeZone(body.tz);
  const digestAt = wantsDigest(prefs) ? nextDigestAt(tz, prefs.digestHour) : null;
  await prisma.user.update({ where: { id: user.id }, data: { notifyPrefs: JSON.stringify({ ...prefs, tz }), digestAt } });
  return { prefs, nextDigest: digestAt };
}

/** Of these people, the ones a push should reach now, given their settings. One query. */
export async function pushRecipients(userIds: string[], p: { kind?: string | null; tag?: string | null; courseId?: string | null; call?: boolean }) {
  if (!userIds.length) return userIds;
  const rows = await prisma.user.findMany({ where: { id: { in: userIds.slice(0, 90) }, notifyPrefs: { not: null } }, select: { id: true, notifyPrefs: true } });
  const held = new Set(rows.filter((r) => pushDecision(cleanPrefs(r.notifyPrefs), p) !== 'push').map((r) => r.id));
  return userIds.filter((id) => !held.has(id));
}

// ─── The notification centre ─────────────────────────────────────────────────

/** Notification types in a group ('other': every type not in a group). */
function typeFilter(group: NoteGroupId | null) {
  if (!group) return {};
  if (group === 'other') return { type: { notIn: NOTE_GROUPS.flatMap((g) => g.types) } };
  return { type: { in: NOTE_GROUPS.find((g) => g.id === group)!.types } };
}

export async function listNotifications(user: SessionUser, q: { group?: string | null; before?: string | null; unread?: boolean }) {
  const group = NOTE_GROUPS.some((g) => g.id === q.group) ? (q.group as NoteGroupId) : null;
  const before = q.before ? new Date(q.before) : null;
  const now = new Date();
  const visible = { userId: user.id, OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] };
  const [rows, unread, snoozed] = await Promise.all([
    prisma.notification.findMany({
      where: { ...visible, ...typeFilter(group), ...(q.unread ? { read: false } : {}), ...(before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: 'desc' }, take: PAGE + 1,
      select: { id: true, title: true, body: true, type: true, read: true, link: true, createdAt: true, courseId: true },
    }),
    prisma.notification.groupBy({ by: ['type'], where: { ...visible, read: false }, _count: { _all: true } }),
    prisma.notification.count({ where: { userId: user.id, snoozedUntil: { gt: now } } }),
  ]);
  const page = rows.slice(0, PAGE);
  const codes = [...new Set(page.map((n) => n.courseId).filter((c): c is string => !!c))];
  const courses = codes.length ? await prisma.course.findMany({ where: { id: { in: codes } }, select: { id: true, code: true } }) : [];
  const code = new Map(courses.map((c) => [c.id, c.code]));
  const counts: Partial<Record<NoteGroupId, number>> = {};
  for (const u of unread) { const g = GROUP_OF_TYPE(u.type); counts[g] = (counts[g] ?? 0) + u._count._all; }
  return {
    items: page.map((n) => ({ ...n, group: GROUP_OF_TYPE(n.type), course: n.courseId ? code.get(n.courseId) ?? null : null })),
    next: rows.length > PAGE ? page[page.length - 1].createdAt.toISOString() : null,
    unread: counts,
    snoozed,
  };
}

const SNOOZE_MAX = 7 * 86_400_000;

/** Mark read / unread, snooze until a time (back as unread then), or remove: my own only. */
export async function actOnNotifications(user: SessionUser, body: Record<string, unknown>) {
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string' && x.length <= 40).slice(0, 90) : [];
  const all = body.all === true;
  if (!ids.length && !all) throw new BadRequestException('Pick some notifications.');
  const where = { userId: user.id, ...(all ? {} : { id: { in: ids } }) };
  switch (body.action) {
    case 'read': return { changed: (await prisma.notification.updateMany({ where: { ...where, read: false }, data: { read: true } })).count };
    case 'unread': return { changed: (await prisma.notification.updateMany({ where, data: { read: false } })).count };
    case 'delete': return { changed: (await prisma.notification.deleteMany({ where })).count };
    case 'snooze': {
      const until = new Date(String(body.until ?? ''));
      if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now() || until.getTime() > Date.now() + SNOOZE_MAX) throw new BadRequestException('Pick a time within the next week.');
      if (all) throw new BadRequestException('Pick the notifications to snooze.');
      return { changed: (await prisma.notification.updateMany({ where, data: { snoozedUntil: until, read: false } })).count };
    }
    default: throw new BadRequestException('Unknown action.');
  }
}

// ─── The daily summary ───────────────────────────────────────────────────────

/** The 15-minute cron: people whose summary is due get one push and one bell notification counting
 *  what came in since the last one (what their settings kept back is in there). */
export async function sendDigests(now = new Date()) {
  const budget = planLimits().pushes;
  const due = await prisma.user.findMany({
    where: { digestAt: { lte: now }, status: { not: 'SUSPENDED' } }, orderBy: { digestAt: 'asc' }, take: Math.min(25, budget),
    select: { id: true, notifyPrefs: true, digestAt: true, role: true },
  });
  if (!due.length) return { due: 0, sent: 0 };
  const ids = due.map((u) => u.id);
  const since = new Date(now.getTime() - 86_400_000);
  const unread = await prisma.notification.groupBy({ by: ['userId', 'type'], where: { userId: { in: ids }, read: false, createdAt: { gt: since }, type: { not: 'digest' } }, _count: { _all: true } });
  const counts = new Map<string, Partial<Record<NoteGroupId, number>>>();
  for (const r of unread) { const c = counts.get(r.userId) ?? {}; const g = GROUP_OF_TYPE(r.type); c[g] = (c[g] ?? 0) + r._count._all; counts.set(r.userId, c); }
  const tell = due.map((u) => ({ u, text: digestText(counts.get(u.id) ?? {}) })).filter((x): x is { u: (typeof due)[number]; text: { title: string; body: string } } => !!x.text);
  let sent = 0;
  if (tell.length) {
    await prisma.notification.createMany({ data: tell.map(({ u, text }) => ({ userId: u.id, title: text.title, body: text.body, type: 'digest', link: '/notifications' })) });
    const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: tell.map((t) => t.u.id) } }, orderBy: { createdAt: 'desc' }, select: { userId: true, endpoint: true, p256dh: true, auth: true } });
    const items = tell.flatMap(({ u, text }) => subs.filter((s) => s.userId === u.id).slice(0, 2).map((subscription) => ({ subscription, payload: { title: text.title, body: text.body, url: '/notifications', tag: 'notify-digest' } })));
    const { pushService } = await import('./services/push.service');
    sent = await pushService.sendEach(items.slice(0, budget));
  }
  // Everyone done gets tomorrow's, in one statement (3 values a person: at most 75).
  const next = due.map((u) => { const p = readPrefs(u.notifyPrefs); return [u.id, wantsDigest(p) ? dbDate(nextDigestAt(p.tz, p.digestHour, now.getTime() + 3_600_000)) : null] as const; });
  await prisma.$executeRawUnsafe(
    `UPDATE users SET "digestAt" = CASE "id" ${next.map(() => 'WHEN ? THEN ?').join(' ')} END WHERE "id" IN (${next.map(() => '?').join(',')})`,
    ...next.flatMap(([id, at]) => [id, at]), ...next.map(([id]) => id),
  );
  return { due: due.length, told: tell.length, sent, at: dbDate(now) };
}
