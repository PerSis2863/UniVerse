import prisma from '@/lib/db';
import { roundDown, TOTAL_KEYS, type Totals } from '@/lib/site-totals';

// The landing's live totals (M44): counted once a day by the daily jobs in one query, kept already
// rounded down (src/lib/site-totals.ts) and served to anyone. The owner's sample world
// (src/server/sample-world.ts: emails @sample.universe.test, ids and brands smp…) never counts.

const SAMPLE = '%@sample.universe.test';

export async function countSiteTotals(now = new Date()): Promise<Required<Totals>> {
  const [row] = await prisma.$queryRawUnsafe<Record<string, number | bigint | null>[]>(
    `SELECT
      (SELECT COUNT(*) FROM "users" WHERE "email" NOT LIKE ?) AS people,
      (SELECT COALESCE(SUM("co2Kg"), 0) FROM "green_actions" WHERE "id" NOT LIKE 'smp%') AS co2Kg,
      (SELECT COALESCE(SUM("people"), 0) FROM "relief_posts" WHERE "status" = 'DONE' AND "id" NOT LIKE 'smp%') AS helped,
      (SELECT COUNT(*) FROM "game_scores" g WHERE NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = g."userId" AND u."email" LIKE ?)) AS games,
      (SELECT COUNT(*) FROM "trace_scans" WHERE COALESCE("brandId", '') NOT LIKE 'smp%') AS scans`,
    SAMPLE, SAMPLE,
  );
  const totals = Object.fromEntries(TOTAL_KEYS.map((k) => [k, roundDown(Number(row?.[k] ?? 0))])) as Required<Totals>;
  const day = now.toISOString().slice(0, 10);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "site_totals" ("key", "value", "day") VALUES ${TOTAL_KEYS.map(() => '(?, ?, ?)').join(', ')}
     ON CONFLICT("key") DO UPDATE SET "value" = excluded."value", "day" = excluded."day"`,
    ...TOTAL_KEYS.flatMap((k) => [k, totals[k], day]),
  );
  return totals;
}

/** The totals for the landing, only those of 10 or more (counted now if the daily jobs haven't yet). */
export async function siteTotals(): Promise<Totals> {
  const rows = await prisma.siteTotal.findMany({ select: { key: true, value: true } });
  const all: Totals = rows.length ? Object.fromEntries(rows.map((r) => [r.key, r.value])) : await countSiteTotals();
  return Object.fromEntries(TOTAL_KEYS.flatMap((k) => ((all[k] ?? 0) >= 10 ? [[k, all[k]]] : [])));
}
