import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { myRole, requireRole } from './communities';
import { later, notifyMany } from './email';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { publish, publishChat } from './realtime';

// Community moderation (Stage 4 · 1.13). Members report a message to the community's moderators;
// automod refuses (or reports) messages with the community's banned words; moderators remove
// messages and time people out (they can read but not post); everything moderators do is logged
// for the owner and moderators. All in-app, no email. Separate from UniVerse's own moderation
// (src/server/moderation.ts) and the school's chat safety check (src/server/safety.ts).

const MAX_WORDS = 100, MAX_TIMEOUT_MIN = 7 * 24 * 60;
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function logMod(communityId: string, actorId: string | null, action: string, targetId?: string | null, detail?: string | null) {
  await prisma.communityModLog.create({ data: { communityId, actorId, action, targetId: targetId ?? null, detail: detail?.slice(0, 300) ?? null } }).catch(() => null);
}

/** In-app notices that open the person's own inbox (/student, /teacher or /admin). */
async function tell(ids: string[], n: { type: string; title: string; body: string }, chatId?: string) {
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, role: true } });
  const byRole = new Map<string, string[]>();
  for (const u of users) byRole.set(u.role, [...(byRole.get(u.role) ?? []), u.id]);
  await Promise.all([...byRole].map(([role, group]) => notifyMany(group, { ...n, link: `/${role === 'ADMIN' ? 'admin' : role === 'TEACHER' ? 'teacher' : 'student'}/inbox${chatId ? `?c=${chatId}` : ''}`, email: false })));
}

async function moderators(communityId: string) {
  return (await prisma.communityMember.findMany({ where: { communityId, role: { in: ['OWNER', 'MOD'] } }, select: { userId: true }, take: 50 })).map((m) => m.userId);
}
const refresh = (ids: string[], communityId: string) => publish(ids, { type: 'refresh', keys: [`/api/chat/communities/${communityId}/moderation`] });

/** A message in a community channel, with its community. */
async function channelMessage(messageId: string) {
  const m = await prisma.message.findUnique({ where: { id: messageId }, select: { id: true, body: true, type: true, senderId: true, conversationId: true, deletedAt: true, metadata: true, conversation: { select: { communityId: true, name: true } } } });
  if (!m || !m.conversation.communityId) throw new NotFoundException('This message isn’t in a community channel.');
  return { ...m, communityId: m.conversation.communityId };
}

// ── Reports ───────────────────────────────────────────────────────────────────────────────────

/** POST /api/chat/messages/:id/report { reason? }: tell the community's moderators. */
export async function reportMessage(user: SessionUser, messageId: string, body: Record<string, unknown>) {
  const m = await channelMessage(messageId);
  if (!(await myRole(m.communityId, user.id))) throw new NotFoundException('This message isn’t in one of your communities.');
  if (m.deletedAt) throw new BadRequestException('This message was already removed.');
  if (m.senderId === user.id) throw new BadRequestException('You can’t report your own message.');
  const reason = clean(body.reason, 300) || null;
  const existing = await prisma.communityReport.findUnique({ where: { messageId_reporterId: { messageId, reporterId: user.id } }, select: { id: true } });
  if (existing) return { ok: true, already: true };
  await prisma.communityReport.create({ data: { communityId: m.communityId, conversationId: m.conversationId, messageId, reporterId: user.id, senderId: m.senderId, reason, excerpt: (m.body ?? `[${m.type.toLowerCase()}]`).slice(0, 500) } });
  const mods = (await moderators(m.communityId)).filter((id) => id !== user.id);
  refresh(mods, m.communityId);
  if (mods.length) later(() => tell(mods, { type: 'warning', title: 'A message was reported', body: `In #${m.conversation.name ?? 'channel'}${reason ? `: ${reason}` : ''}. Review it in the community's Moderation.` }, m.conversationId));
  return { ok: true };
}

/** Automod (from the message POST): null when fine; a reason when refused; or words to report. */
export async function automodCheck(conversationId: string, userId: string, body: string): Promise<{ block: string } | { flag: string[] } | null> {
  if (!body) return null;
  const ch = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { communityId: true, community: { select: { automodWords: true, automodAction: true } } } });
  if (!ch?.communityId || !ch.community?.automodWords) return null;
  const role = await myRole(ch.communityId, userId);
  if (role === 'OWNER' || role === 'MOD') return null;
  let words: string[] = [];
  try { words = JSON.parse(ch.community.automodWords); } catch { return null; }
  const text = body.toLowerCase();
  const hit = words.filter((w) => new RegExp(`(?<![\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu').test(text));
  if (!hit.length) return null;
  return ch.community.automodAction === 'FLAG' ? { flag: hit } : { block: 'This message has words this community doesn’t allow. Please reword it.' };
}

/** After a flagged message is sent: a report from automod. */
export async function automodReport(messageId: string, words: string[]) {
  const m = await channelMessage(messageId);
  await prisma.communityReport.create({ data: { communityId: m.communityId, conversationId: m.conversationId, messageId, reporterId: null, senderId: m.senderId, reason: `Automod: ${words.slice(0, 5).join(', ')}`, excerpt: (m.body ?? '').slice(0, 500) } }).catch(() => null);
  refresh(await moderators(m.communityId), m.communityId);
}

// ── Moderator actions ─────────────────────────────────────────────────────────────────────────

/** Removes a message for everyone ("Removed by a moderator"). */
async function removeMessage(user: SessionUser, m: Awaited<ReturnType<typeof channelMessage>>) {
  if (m.deletedAt) return;
  const meta = { ...((m.metadata ?? {}) as Record<string, unknown>), moderated: 'community' };
  await prisma.message.update({ where: { id: m.id }, data: { deletedAt: new Date(), metadata: meta as Prisma.InputJsonValue } });
  await prisma.communityReport.updateMany({ where: { messageId: m.id, status: 'OPEN' }, data: { status: 'RESOLVED', resolvedById: user.id, resolvedAt: new Date(), outcome: 'removed' } });
  await logMod(m.communityId, user.id, 'remove_message', m.senderId, (m.body ?? '').slice(0, 120));
  publishChat(m.conversationId);
}

/** POST /api/chat/messages/:id/moderate { action: 'remove' }: a moderator removes a message. */
export async function moderateMessage(user: SessionUser, messageId: string) {
  const m = await channelMessage(messageId);
  await requireRole(m.communityId, user, 'MOD');
  const theirs = await myRole(m.communityId, m.senderId);
  if (theirs === 'OWNER' && m.senderId !== user.id) throw new ForbiddenException('You can’t remove the owner’s messages.');
  await removeMessage(user, m);
  refresh(await moderators(m.communityId), m.communityId);
  return { ok: true };
}

/** Times someone out (minutes > 0) or lifts it (0). They can still read. */
async function timeout(user: SessionUser, communityId: string, userId: string, minutesRaw: unknown) {
  const mine = await requireRole(communityId, user, 'MOD');
  const theirs = await myRole(communityId, userId);
  if (!theirs) throw new NotFoundException('They aren’t in this community.');
  if (theirs === 'OWNER' || (theirs === 'MOD' && mine !== 'OWNER')) throw new ForbiddenException('You can’t time them out.');
  const minutes = Math.round(Number(minutesRaw));
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > MAX_TIMEOUT_MIN) throw new BadRequestException('A timeout is up to a week.');
  const until = minutes ? new Date(Date.now() + minutes * 60_000) : null;
  await prisma.communityMember.update({ where: { communityId_userId: { communityId, userId } }, data: { timeoutUntil: until } });
  await logMod(communityId, user.id, minutes ? 'timeout' : 'untimeout', userId, minutes ? `${minutes} min` : null);
  if (minutes) later(() => tell([userId], { type: 'warning', title: 'You’re timed out in a community', body: `A moderator paused your messages for ${minutes >= 1440 ? `${Math.round(minutes / 1440)} day(s)` : minutes >= 60 ? `${Math.round(minutes / 60)} hour(s)` : `${minutes} min`}. You can still read.` }));
  return until;
}

/** POST /api/chat/communities/:id/moderation { action, … }: moderators' actions. */
export async function moderate(user: SessionUser, communityId: string, b: Record<string, unknown>) {
  const action = String(b.action ?? '');
  if (action === 'timeout') {
    const until = await timeout(user, communityId, String(b.userId ?? ''), b.minutes);
    refresh(await moderators(communityId), communityId);
    return { ok: true, until };
  }
  if (action === 'automod') {
    await requireRole(communityId, user, 'MOD');
    const words = Array.isArray(b.words)
      ? [...new Set((b.words as unknown[]).map((w) => clean(w, 40).toLowerCase()).filter((w) => w.length >= 2))].slice(0, MAX_WORDS)
      : [];
    const mode = b.mode === 'FLAG' ? 'FLAG' : 'BLOCK';
    await prisma.community.update({ where: { id: communityId }, data: { automodWords: words.length ? JSON.stringify(words) : null, automodAction: mode } });
    await logMod(communityId, user.id, 'automod', null, `${words.length} words, ${mode === 'FLAG' ? 'report' : 'block'}`);
    refresh(await moderators(communityId), communityId);
    return { ok: true, words, mode };
  }
  if (action === 'resolve') {
    await requireRole(communityId, user, 'MOD');
    const r = await prisma.communityReport.findUnique({ where: { id: String(b.reportId ?? '') } });
    if (!r || r.communityId !== communityId) throw new NotFoundException('This report isn’t there any more.');
    const outcome = String(b.outcome ?? '');
    if (outcome === 'remove' || outcome === 'remove_timeout') {
      await removeMessage(user, await channelMessage(r.messageId));
      if (outcome === 'remove_timeout') await timeout(user, communityId, r.senderId, Number(b.minutes) || 60);
    } else {
      await prisma.communityReport.updateMany({ where: { messageId: r.messageId, status: 'OPEN' }, data: { status: 'DISMISSED', resolvedById: user.id, resolvedAt: new Date(), outcome: 'dismissed' } });
      await logMod(communityId, user.id, 'dismiss_report', r.senderId, r.excerpt.slice(0, 120));
    }
    refresh(await moderators(communityId), communityId);
    return { ok: true };
  }
  throw new BadRequestException('Unknown action.');
}

/** GET /api/chat/communities/:id/moderation: reports, timeouts, automod and the log (moderators). */
export async function moderationView(user: SessionUser, communityId: string) {
  await requireRole(communityId, user, 'MOD');
  const [community, open, done, timeouts, log] = await Promise.all([
    prisma.community.findUnique({ where: { id: communityId }, select: { automodWords: true, automodAction: true } }),
    prisma.communityReport.findMany({ where: { communityId, status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.communityReport.findMany({ where: { communityId, status: { not: 'OPEN' } }, orderBy: { resolvedAt: 'desc' }, take: 20 }),
    prisma.communityMember.findMany({ where: { communityId, timeoutUntil: { gt: new Date() } }, select: { userId: true, timeoutUntil: true }, take: 100 }),
    prisma.communityModLog.findMany({ where: { communityId }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  const ids = new Set<string>();
  for (const r of [...open, ...done]) { ids.add(r.senderId); if (r.reporterId) ids.add(r.reporterId); }
  for (const t of timeouts) ids.add(t.userId);
  for (const l of log) { if (l.actorId) ids.add(l.actorId); if (l.targetId) ids.add(l.targetId); }
  const people = new Map((await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const name = (id: string | null) => (id ? people.get(id) ?? 'Someone' : 'Automod');
  // Several reports of one message show as one, with how many people reported it.
  const grouped = new Map<string, (typeof open)[number] & { count: number; reasons: string[] }>();
  for (const r of open) {
    const g = grouped.get(r.messageId);
    if (g) { g.count += 1; if (r.reason) g.reasons.push(r.reason); } else grouped.set(r.messageId, { ...r, count: 1, reasons: r.reason ? [r.reason] : [] });
  }
  let words: string[] = [];
  try { words = JSON.parse(community?.automodWords ?? '[]'); } catch { /* none */ }
  return {
    reports: [...grouped.values()].map((r) => ({ id: r.id, messageId: r.messageId, conversationId: r.conversationId, excerpt: r.excerpt, reasons: r.reasons, count: r.count, sender: { id: r.senderId, name: name(r.senderId) }, reporter: name(r.reporterId), createdAt: r.createdAt })),
    resolved: done.map((r) => ({ id: r.id, excerpt: r.excerpt.slice(0, 120), outcome: r.outcome, sender: name(r.senderId), by: name(r.resolvedById), at: r.resolvedAt })),
    timeouts: timeouts.map((t) => ({ userId: t.userId, name: name(t.userId), until: t.timeoutUntil })),
    automod: { words, mode: community?.automodAction === 'FLAG' ? 'FLAG' : 'BLOCK' },
    log: log.map((l) => ({ id: l.id, action: l.action, actor: name(l.actorId), target: l.targetId ? name(l.targetId) : null, detail: l.detail, at: l.createdAt })),
  };
}
