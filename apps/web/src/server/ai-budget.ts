import prisma from '@/lib/db';

// Keeps Gemini use inside its free allowance: each person may make a set number of AI requests a
// day (students fewer than teachers and admins), the whole site has a daily ceiling, and answers
// that many people would ask for again (the same tutor question, a summary of the same file) are
// saved and handed out without asking AI. The owner sets the limits in owner console → Server and
// is never limited. Days are UTC days.

export interface AiLimits { student: number; staff: number; site: number }
export const DEFAULT_AI_LIMITS: AiLimits = { student: 20, staff: 50, site: 1000 };

const today = () => new Date().toISOString().slice(0, 10);

let limitsCache: { at: number; limits: AiLimits } | null = null;

/** Reads the owner's limits (server_control.aiLimits), at most once a minute. */
export async function aiLimits(): Promise<AiLimits> {
  if (limitsCache && Date.now() - limitsCache.at < 60_000) return limitsCache.limits;
  const row = await prisma.serverControl.findUnique({ where: { id: 'main' }, select: { aiLimits: true } }).catch(() => null);
  const limits = parseLimits(row?.aiLimits);
  limitsCache = { at: Date.now(), limits };
  return limits;
}

export function parseLimits(raw: string | null | undefined): AiLimits {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<AiLimits>) : {};
    const n = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : d);
    return { student: n(v.student, DEFAULT_AI_LIMITS.student), staff: n(v.staff, DEFAULT_AI_LIMITS.staff), site: n(v.site, DEFAULT_AI_LIMITS.site) };
  } catch {
    return { ...DEFAULT_AI_LIMITS };
  }
}

export const forgetAiLimits = () => { limitsCache = null; };

type Who = { id: string; role: string; owner?: boolean } | null;

/** ok: allowed (and counted); left: requests this person has left today (null: no limit); message: why not. */
export type AiSpend = { ok: boolean; left: number | null; message: string };

const BUSY = 'AI has reached its limit for today across UniVerse. It will be back tomorrow.';

/**
 * Counts one AI request for this person (and the site) if they have any left today. `who` null is
 * a request the app makes by itself (e.g. translating a new message): it only counts toward the
 * site. Call it right before asking AI, after checking for a saved answer.
 */
export async function spendAi(who: Who): Promise<AiSpend> {
  if (who?.owner) return { ok: true, left: null, message: '' };
  const day = today();
  const limits = await aiLimits();
  const perPerson = who ? (who.role === 'STUDENT' ? limits.student : limits.staff) : Infinity;
  const ids = who ? [who.id, '*'] : ['*'];
  const rows = await prisma.$queryRawUnsafe<{ userId: string; calls: number }[]>(
    `SELECT "userId", "calls" FROM "ai_usage" WHERE "day" = ? AND "userId" IN (${ids.map(() => '?').join(', ')})`, day, ...ids,
  );
  const used = (id: string) => Number(rows.find((r) => r.userId === id)?.calls ?? 0);
  if (used('*') >= limits.site) return { ok: false, left: 0, message: BUSY };
  if (who && used(who.id) >= perPerson) {
    return { ok: false, left: 0, message: `You've used your ${perPerson} AI requests for today. They reset at midnight (UTC), so you can ask again tomorrow.` };
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ai_usage" ("day", "userId", "calls") VALUES ${ids.map(() => '(?, ?, 1)').join(', ')} ON CONFLICT ("day", "userId") DO UPDATE SET "calls" = "calls" + 1`,
    ...ids.flatMap((id) => [day, id]),
  );
  return { ok: true, left: who ? Math.max(0, perPerson - used(who.id) - 1) : null, message: '' };
}

/** Whether the site still has AI left today, without counting a request. */
export async function siteHasAi(): Promise<boolean> {
  const limits = await aiLimits();
  const rows = await prisma.$queryRawUnsafe<{ calls: number }[]>(`SELECT "calls" FROM "ai_usage" WHERE "day" = ? AND "userId" = '*'`, today());
  return Number(rows[0]?.calls ?? 0) < limits.site;
}

/** Today's numbers for the owner console: site total, limits and the heaviest users. */
export async function aiUsageToday() {
  const day = today();
  const [limits, rows] = await Promise.all([
    aiLimits(),
    prisma.$queryRawUnsafe<{ userId: string; calls: number; name: string | null; role: string | null }[]>(
      `SELECT a."userId", a."calls", u."name", u."role" FROM "ai_usage" a LEFT JOIN "users" u ON u."id" = a."userId" WHERE a."day" = ? ORDER BY a."calls" DESC LIMIT 7`, day,
    ),
  ]);
  const site = rows.find((r) => r.userId === '*');
  return {
    limits,
    used: Number(site?.calls ?? 0),
    top: rows.filter((r) => r.userId !== '*').slice(0, 5).map((r) => ({ id: r.userId, name: r.name ?? (r.userId.startsWith('cc:') ? 'Live captions in a call' : 'Unknown'), role: r.role, calls: Number(r.calls) })),
  };
}

// ─── Saved answers ───────────────────────────────────────────────────────────────────────────

async function hash(parts: string[]) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('\u0000')));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The question as people type it, minus case, spacing and end punctuation. */
export const sameQuestion = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[?!.。？！\s]+$/u, '').trim();

/** A saved answer for these key parts, if one was saved within `maxAgeDays`. */
export async function cachedAi<T>(parts: string[], maxAgeDays = 7): Promise<T | null> {
  const key = await hash(parts);
  const row = await prisma.aiCache.findUnique({ where: { key } }).catch(() => null);
  if (!row || Date.now() - row.createdAt.getTime() > maxAgeDays * 86_400_000) return null;
  try { return JSON.parse(row.value) as T; } catch { return null; }
}

export async function saveAi(parts: string[], value: unknown): Promise<void> {
  const key = await hash(parts);
  const v = JSON.stringify(value);
  await prisma.aiCache.upsert({ where: { key }, update: { value: v, createdAt: new Date() }, create: { key, value: v } }).catch(() => {});
}

/** Drops saved answers and usage counts older than a month (daily cron). */
export async function pruneAi(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  await prisma.aiCache.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => {});
  await prisma.aiUsage.deleteMany({ where: { day: { lt: cutoff.toISOString().slice(0, 10) } } }).catch(() => {});
}

/** Thrown by `requireAi` when the person or the site has no AI left today; `message` is for people. */
export class AiLimitError extends Error {}

/** spendAi, throwing AiLimitError instead of answering not-ok. */
export async function requireAi(who: Who): Promise<void> {
  const s = await spendAi(who);
  if (!s.ok) throw new AiLimitError(s.message);
}
