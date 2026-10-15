import prisma from '@/lib/db';

// Small daily counters for the owner console's Health numbers (table health_counts, 60 days):
// one statement per call, whatever the number of keys. Never fails the caller.

const today = () => new Date().toISOString().slice(0, 10);

/** Adds to today's counters: count({ 'push.ok': 3, 'push.failed': 1 }). Zero counts are skipped. */
export async function count(add: Record<string, number>): Promise<void> {
  const rows = Object.entries(add).filter(([, n]) => Number.isFinite(n) && n > 0);
  if (!rows.length) return;
  const day = today();
  await prisma
    .$executeRawUnsafe(
      `INSERT INTO "health_counts" ("day", "key", "n") VALUES ${rows.map(() => '(?, ?, ?)').join(', ')} ON CONFLICT ("day", "key") DO UPDATE SET "n" = "n" + excluded."n"`,
      ...rows.flatMap(([key, n]) => [day, key, Math.round(n)]),
    )
    .catch(() => {});
}
