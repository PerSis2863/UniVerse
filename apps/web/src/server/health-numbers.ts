import prisma from '@/lib/db';

// The owner console's Health numbers (Stage 5 · A9): which API routes fail and which are slow (the
// Worker's sample, cloudflare/worker.ts sampleTiming), which pages people hit problems on (the
// errors table), AI use per feature, push notifications delivered, and call quality. Everything is
// added up in SQL (a handful of queries, no rows carried into the Worker: Workers Free has 10 ms of CPU).

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const DAY = 86_400;

interface RouteRow { route: string; method: string; requests: unknown; failed: unknown; failedYesterday: unknown; samples: unknown; avgMs: unknown; maxMs: unknown; slow: unknown }

export async function healthNumbers(now = Date.now()) {
  const sec = Math.floor(now / 1000);
  const todayStart = Math.floor(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate()) / 1000);
  const weekAgo = sec - 7 * DAY;
  // Dates as Prisma stores them in D1 ("…T21:42:19.500+00:00"), so text comparisons line up.
  const weekAgoText = new Date(weekAgo * 1000).toISOString().replace('Z', '+00:00');
  const days = Array.from({ length: 7 }, (_, i) => new Date((todayStart - (6 - i) * DAY) * 1000).toISOString().slice(0, 10));
  const [routes, pages, aiKinds, aiDays, push, calls, first] = await Promise.all([
    prisma.$queryRawUnsafe<RouteRow[]>(
      `SELECT "route", "method", SUM("weight") AS "requests",
         SUM(CASE WHEN "status" >= 500 THEN 1 ELSE 0 END) AS "failed",
         SUM(CASE WHEN "status" >= 500 AND "at" >= ? AND "at" < ? THEN 1 ELSE 0 END) AS "failedYesterday",
         SUM(CASE WHEN "weight" > 1 THEN 1 ELSE 0 END) AS "samples",
         AVG(CASE WHEN "weight" > 1 THEN "ms" END) AS "avgMs",
         MAX(CASE WHEN "weight" > 1 THEN "ms" END) AS "maxMs",
         SUM(CASE WHEN "weight" > 1 AND "ms" > 1000 THEN 1 ELSE 0 END) AS "slow"
       FROM "api_timings" WHERE "at" >= ? GROUP BY "route", "method"`,
      todayStart - DAY, todayStart, weekAgo,
    ).catch(() => [] as RouteRow[]),
    prisma.$queryRawUnsafe<{ path: string | null; source: string; problems: unknown; times: unknown }[]>(
      `SELECT "path", "source", COUNT(*) AS "problems", SUM("count") AS "times" FROM "error_reports" WHERE "lastSeen" >= ? GROUP BY "path", "source" ORDER BY "problems" DESC, "times" DESC LIMIT 10`,
      weekAgoText,
    ).catch(() => []),
    prisma.$queryRawUnsafe<{ kind: string; uses: unknown }[]>(`SELECT "kind", COUNT(*) AS "uses" FROM "ai_uses" WHERE "createdAt" >= ? GROUP BY "kind" ORDER BY "uses" DESC LIMIT 12`, weekAgoText).catch(() => []),
    prisma.$queryRawUnsafe<{ day: string; calls: unknown }[]>(`SELECT "day", "calls" FROM "ai_usage" WHERE "userId" = '*' AND "day" >= ?`, days[0]).catch(() => []),
    prisma.$queryRawUnsafe<{ key: string; n: unknown }[]>(`SELECT "key", SUM("n") AS "n" FROM "health_counts" WHERE "day" >= ? AND "key" LIKE 'push.%' GROUP BY "key"`, days[0]).catch(() => []),
    prisma.$queryRawUnsafe<{ calls: unknown; people: unknown; loss: unknown; worst: unknown; relay: unknown; failed: unknown; audioOnly: unknown; setupMs: unknown; rating: unknown }[]>(
      `SELECT COUNT(DISTINCT "callId") AS "calls", COUNT(*) AS "people", AVG("worstLoss") AS "loss", MAX("worstLoss") AS "worst",
         AVG(CASE WHEN "relay" THEN 1.0 ELSE 0 END) AS "relay", AVG(CASE WHEN "failure" IS NOT NULL THEN 1.0 ELSE 0 END) AS "failed",
         AVG(CASE WHEN "audioOnly" THEN 1.0 ELSE 0 END) AS "audioOnly", AVG("setupMs") AS "setupMs", AVG("rating") AS "rating"
       FROM "call_stats" WHERE "createdAt" >= ?`,
      weekAgoText,
    ).catch(() => []),
    prisma.$queryRawUnsafe<{ at: unknown }[]>(`SELECT MIN("at") AS "at" FROM "api_timings"`).catch(() => []),
  ]);

  const all = routes.map((r) => ({
    route: r.route,
    method: r.method,
    requests: Math.round(n(r.requests) ?? 0),
    failed: n(r.failed) ?? 0,
    failedYesterday: n(r.failedYesterday) ?? 0,
    samples: n(r.samples) ?? 0,
    avgMs: r.avgMs === null ? null : Math.round(n(r.avgMs)!),
    maxMs: n(r.maxMs),
    slowShare: n(r.samples) ? (n(r.slow) ?? 0) / n(r.samples)! : null,
  }));
  const pushBy = Object.fromEntries(push.map((p) => [p.key, n(p.n) ?? 0]));
  const c = calls[0];
  return {
    since: n(first[0]?.at) ? new Date(n(first[0].at)! * 1000).toISOString() : null,
    // Which route failed most yesterday (every server error is recorded, not sampled).
    failedYesterday: all.filter((r) => r.failedYesterday > 0).sort((a, b) => b.failedYesterday - a.failedYesterday).slice(0, 8),
    failing: all.filter((r) => r.failed > 0).sort((a, b) => b.failed - a.failed).slice(0, 8),
    // The slowest, among routes with enough samples to say.
    slowest: all.filter((r) => r.samples >= 3 && r.avgMs !== null).sort((a, b) => b.avgMs! - a.avgMs!).slice(0, 10),
    busiest: [...all].sort((a, b) => b.requests - a.requests).slice(0, 8),
    pages: pages.map((p) => ({ path: p.path ?? '(unknown)', source: p.source, problems: n(p.problems) ?? 0, times: n(p.times) ?? 0 })),
    ai: {
      perFeature: aiKinds.map((k) => ({ kind: k.kind, uses: n(k.uses) ?? 0 })),
      perDay: days.map((d) => ({ day: d, calls: n(aiDays.find((x) => x.day === d)?.calls) ?? 0 })),
    },
    push: { ok: pushBy['push.ok'] ?? 0, failed: pushBy['push.failed'] ?? 0, expired: pushBy['push.expired'] ?? 0 },
    calls: c && n(c.people)
      ? { calls: n(c.calls)!, people: n(c.people)!, avgLoss: n(c.loss), worstLoss: n(c.worst), relayShare: n(c.relay), failedShare: n(c.failed), audioOnlyShare: n(c.audioOnly), setupMs: c.setupMs === null ? null : Math.round(n(c.setupMs)!), rating: n(c.rating) }
      : null,
  };
}

export type HealthNumbers = Awaited<ReturnType<typeof healthNumbers>>;
