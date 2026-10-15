import prisma from '@/lib/db';
import { readCspReports } from '@/lib/csp-report';

// What browsers blocked under the Content-Security-Policy (Stage 5 · A8), for the owner console's
// Errors tab. One row per kind (what was blocked, by which rule, on which page), counted, at most
// MAX rows: a flood of reports costs a handful of writes, not one per report.

const MAX = 200;
const SEEN_MS = 10 * 60_000;
const seen = new Map<string, number>(); // per Worker instance: the same report again within 10 min isn't written

export async function recordCspReports(contentType: string, text: string) {
  const now = Date.now();
  for (const r of readCspReports(contentType, text).slice(0, 5)) {
    if ((seen.get(r.key) ?? 0) > now - SEEN_MS) continue;
    if (seen.size > 500) seen.clear();
    seen.set(r.key, now);
    const at = new Date(now);
    const row = await prisma.cspReport.upsert({
      where: { key: r.key },
      create: { key: r.key, directive: r.directive, blocked: r.blocked, page: r.page, sample: r.sample, firstAt: at, lastAt: at },
      update: { count: { increment: 1 }, lastAt: at, ...(r.sample ? { sample: r.sample } : {}) },
      select: { count: true },
    });
    // A new kind: keep the newest MAX.
    if (row.count === 1) {
      const old = await prisma.cspReport.findMany({ orderBy: { lastAt: 'desc' }, skip: MAX, take: 50, select: { id: true } });
      if (old.length) await prisma.cspReport.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    }
  }
}

export const latestCspReports = () => prisma.cspReport.findMany({ orderBy: { lastAt: 'desc' }, take: 50 });
