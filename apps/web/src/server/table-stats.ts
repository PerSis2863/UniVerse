import prisma from '@/lib/db';

// Numbers about many tables at once, for the owner console. D1 on Workers Free allows 50 queries per
// request (and 5 parts per UNION), so a query per table fails on the live site. Instead each table's
// number is one column (a subquery) of a single SELECT, 30 tables per statement: about 4 queries for
// the whole database.

/** Runs `SELECT <sql> AS "<key>", …` for every [key, sql] pair and returns { key: value }. */
export async function selectColumns(columns: [key: string, sql: string][], perStatement = 30): Promise<Record<string, unknown>> {
  const parts = Array.from({ length: Math.ceil(columns.length / perStatement) }, (_, i) => columns.slice(i * perStatement, (i + 1) * perStatement));
  const rows = await Promise.all(parts.map((p) => prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT ${p.map(([k, sql]) => `${sql} AS "${k}"`).join(', ')}`)));
  return Object.assign({}, ...rows.map((r) => r[0] ?? {}));
}

/** Number of records in each table, in one or a few queries. */
export async function countTables(tables: { name: string; table: string }[]): Promise<Record<string, number>> {
  const got = await selectColumns(tables.map((t) => [t.name, `(SELECT COUNT(*) FROM "${t.table}")`]));
  return Object.fromEntries(tables.map((t) => [t.name, Number(got[t.name] ?? 0)]));
}
