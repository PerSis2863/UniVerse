import prisma from '@/lib/db';
import { aiUsageToday } from './ai-budget';
import { REAL_ERRORS } from './errors';

// The owner console's live board (the owner's "Instrumental" reference, 24 Oct 2026): requests,
// response times, errors, people online, activity, what waits, AI and the plan, for the last hour,
// day or week in 40 slices. Everything is added up in SQL from what the app records anyway
// (api_timings is the Worker's 1-in-20 sample plus every server error, cloudflare/worker.ts), so no
// rows are carried into the Worker.

export type PulseRange = '1h' | '24h' | '7d';
export const PULSE_RANGES: Record<PulseRange, number> = { '1h': 3600, '24h': 86_400, '7d': 7 * 86_400 };
export const SLICES = 40;
const LATENCY_BIN_MS = 25;
const LATENCY_BINS = 40; // 0–1 s; the last bin holds everything slower

const n = (v: unknown) => Number(v ?? 0) || 0;
// Dates as Prisma stores them in D1 ("…T21:42:19.500+00:00"), so text comparisons line up.
const asText = (sec: number) => new Date(sec * 1000).toISOString().replace('Z', '+00:00');

/** Fills `SLICES` slots from rows of { b: slice, ...counts }. */
function slots<K extends string>(rows: Record<string, unknown>[], keys: K[]): Record<K, number[]> {
  const out = Object.fromEntries(keys.map((k) => [k, Array<number>(SLICES).fill(0)])) as Record<K, number[]>;
  for (const r of rows) {
    const b = n(r.b);
    if (b < 0 || b >= SLICES) continue;
    for (const k of keys) out[k][b] += n(r[k]);
  }
  return out;
}

export async function pulse(range: PulseRange, now = Date.now()) {
  const span = PULSE_RANGES[range];
  const step = span / SLICES;
  const sec = Math.floor(now / 1000);
  const start = sec - span;
  const startText = asText(start);
  const day = new Date(now - 86_400_000);
  // A text date's slice: seconds since `start`, divided by the slice length.
  const slice = (col: string) => `CAST((CAST(strftime('%s', "${col}") AS INTEGER) - ${start}) / ${step} AS INTEGER)`;
  const [api, before, latency, msgs, views, logins, errors, online, activeToday, people, waiting, resolvedToday, ai, guard] = await Promise.all([
    prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT CAST(("at" - ?) / ? AS INTEGER) AS "b", SUM("weight") AS "req",
         SUM(CASE WHEN "status" >= 500 THEN 1 ELSE 0 END) AS "s5",
         SUM(CASE WHEN "status" >= 400 AND "status" < 500 THEN "weight" ELSE 0 END) AS "s4",
         AVG(CASE WHEN "weight" > 1 THEN "ms" END) AS "ms"
       FROM "api_timings" WHERE "at" >= ? GROUP BY "b"`, start, step, start,
    ).catch(() => []),
    prisma.$queryRawUnsafe<{ req: unknown }[]>(`SELECT SUM("weight") AS "req" FROM "api_timings" WHERE "at" >= ? AND "at" < ?`, start - span, start).catch(() => []),
    prisma.$queryRawUnsafe<{ k: unknown; c: unknown }[]>(
      `SELECT MIN(CAST("ms" / ${LATENCY_BIN_MS} AS INTEGER), ${LATENCY_BINS - 1}) AS "k", COUNT(*) AS "c" FROM "api_timings" WHERE "at" >= ? AND "weight" > 1 GROUP BY "k"`, start,
    ).catch(() => []),
    prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT ${slice('createdAt')} AS "b", COUNT(*) AS "messages" FROM "messages" WHERE "createdAt" >= ? GROUP BY "b"`, startText).catch(() => []),
    prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT ${slice('createdAt')} AS "b", COUNT(*) AS "views" FROM "ui_events" WHERE "kind" = 'VIEW' AND "createdAt" >= ? GROUP BY "b"`, startText).catch(() => []),
    prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT ${slice('createdAt')} AS "b", SUM(CASE WHEN "kind" = 'SESSION' THEN 0 ELSE 1 END) AS "signIns", SUM(CASE WHEN "kind" = 'SESSION' THEN 1 ELSE 0 END) AS "opens"
       FROM "login_events" WHERE "createdAt" >= ? GROUP BY "b"`, startText,
    ).catch(() => []),
    prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT ${slice('lastSeen')} AS "b", SUM(CASE WHEN "source" = 'CLIENT' THEN 1 ELSE 0 END) AS "app", SUM(CASE WHEN "source" = 'CLIENT' THEN 0 ELSE 1 END) AS "server"
       FROM "error_reports" WHERE "lastSeen" >= ? GROUP BY "b"`, startText,
    ).catch(() => []),
    prisma.user.count({ where: { lastSeenAt: { gt: new Date(now - 5 * 60_000) } } }),
    prisma.user.count({ where: { lastSeenAt: { gt: day } } }),
    prisma.user.count(),
    Promise.all([
      prisma.roleApplication.count({ where: { status: 'PENDING' } }),
      prisma.accountDeletionRequest.count({ where: { status: 'PENDING' } }),
      prisma.errorReport.count({ where: { status: { in: ['NEW', 'DIAGNOSED'] }, ...REAL_ERRORS } }),
    ]).catch(() => [0, 0, 0]),
    prisma.errorReport.count({ where: { resolvedAt: { gt: day } } }).catch(() => 0),
    aiUsageToday().catch(() => null),
    prisma.usageGuard.findUnique({ where: { id: 'main' } }).catch(() => null),
  ]);

  const a = slots(api, ['req', 's5', 's4']);
  const msBySlice = Array<number | null>(SLICES).fill(null);
  for (const r of api) { const b = n(r.b); if (b >= 0 && b < SLICES && r.ms !== null && r.ms !== undefined) msBySlice[b] = Math.round(n(r.ms)); }
  const bins = Array<number>(LATENCY_BINS).fill(0);
  for (const r of latency) { const k = n(r.k); if (k >= 0 && k < LATENCY_BINS) bins[k] += n(r.c); }
  const meters = (guard?.meters ? JSON.parse(guard.meters) : []) as { key: string; label: string; used: number | null; limit: number; bytes?: boolean }[];
  const plan = meters.filter((m) => m.used !== null && m.limit > 0).sort((x, y) => y.used! / y.limit - x.used! / x.limit)[0] ?? null;
  const [apps, deletions, openErrors] = waiting as number[];
  return {
    range, step, at: new Date(now).toISOString(),
    // Requests per second in each slice (the sample is weighted back up to all requests).
    requests: a.req.map((r) => Math.round((r / step) * 100) / 100),
    requestsBefore: n(before[0]?.req),
    requestsTotal: a.req.reduce((s, x) => s + x, 0),
    errors: { server: a.s5, client: a.s4, app: slots(errors, ['app', 'server']).app },
    latency: { binMs: LATENCY_BIN_MS, bins, perSlice: msBySlice },
    activity: { ...slots(msgs, ['messages']), ...slots(views, ['views']) },
    signIns: slots(logins, ['signIns', 'opens']),
    online: { now: online, today: activeToday, people },
    waiting: { apps, deletions, errors: openErrors, resolvedToday },
    ai: ai ? { used: ai.used, limit: ai.limits.site } : null,
    plan: plan && { label: plan.label, used: plan.used!, limit: plan.limit, bytes: !!plan.bytes },
  };
}

export type Pulse = Awaited<ReturnType<typeof pulse>>;
