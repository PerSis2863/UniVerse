// D1 takes at most 100 values in one query, and Prisma splits a long `in` list itself only when that
// list is a findMany's whole filter: with anything else (another condition, orderBy and take, count,
// groupBy, updateMany, deleteMany) it refuses with P2029 "query parameter limit exceeded". A class,
// a group chat or a school can easily pass 90 people. This splits those queries: the longest `in`
// list at the top of `where` is cut into parts that fit, each part runs as its own query, and the
// results are put together as the one query would have given them (sorted again, limited again,
// counts added up). Pure and unit-tested (d1-split.test.ts); src/lib/db.ts runs it on every query.

/** D1's limit is 100; Prisma's D1 adapter stops at 98. Leave room for LIMIT, OFFSET and the like. */
export const MAX_VALUES = 95;
const MIN_PART = 10;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

/** How many values a filter or data object binds (overcounting is safe: the parts get smaller). */
export function countValues(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + countValues(x), 0);
  if (isObj(v)) return Object.entries(v).reduce((n, [k, x]) => n + (k === 'mode' ? 0 : countValues(x)), 0);
  return 1;
}

export interface SplitPlan { key: string; list: unknown[]; size: number }

const SPLITTABLE = new Set(['findMany', 'findFirst', 'count', 'updateMany', 'deleteMany', 'groupBy']);

/** Whether a scalar orderBy can be sorted again here: `{ field: 'asc' | 'desc' | { sort, nulls } }` items only. */
function orderList(orderBy: unknown): [string, 'asc' | 'desc', 'first' | 'last' | undefined][] | null {
  if (orderBy === undefined) return [];
  const items = Array.isArray(orderBy) ? orderBy : [orderBy];
  const out: [string, 'asc' | 'desc', 'first' | 'last' | undefined][] = [];
  for (const item of items) {
    if (!isObj(item)) return null;
    for (const [field, dir] of Object.entries(item)) {
      if (dir === 'asc' || dir === 'desc') out.push([field, dir, undefined]);
      else if (isObj(dir) && (dir.sort === 'asc' || dir.sort === 'desc') && Object.keys(dir).every((k) => k === 'sort' || k === 'nulls')) out.push([field, dir.sort, dir.nulls as 'first' | 'last' | undefined]);
      else return null; // a relation's field or _count: leave it to the database
    }
  }
  return out;
}

/**
 * The split for a query, or null to run it as it is: too few values, an operation or shape this
 * can't put back together (skip, cursor, distinct, a relation in orderBy, groupBy not by the list's
 * field), or Prisma splits it itself (findMany filtered by the list alone).
 */
export function planSplit(operation: string, args: unknown): SplitPlan | null {
  if (!SPLITTABLE.has(operation) || !isObj(args) || !isObj(args.where)) return null;
  const where = args.where;
  const extra = countValues((args as Obj).data) + (args.take !== undefined ? 1 : 0) + (args.skip !== undefined ? 1 : 0) + countValues((args as Obj).having);
  if (countValues(where) + extra <= MAX_VALUES) return null;
  if (args.skip !== undefined || args.cursor !== undefined || args.distinct !== undefined) return null;
  // The longest top-level `{ in: [...] }`.
  let key: string | null = null, list: unknown[] = [];
  for (const [k, v] of Object.entries(where)) if (isObj(v) && Array.isArray(v.in) && v.in.length > list.length) { key = k; list = v.in; }
  if (!key) return null;
  if ((operation === 'findMany' || operation === 'findFirst') && orderList(args.orderBy) === null) return null;
  if (operation === 'groupBy' && (!Array.isArray(args.by) || !args.by.includes(key) || args.orderBy !== undefined || args.take !== undefined || args.having !== undefined)) return null;
  // Prisma already splits a findMany whose filter is just this one list (and nothing else to bind).
  if (operation === 'findMany' && Object.keys(where).length === 1 && Object.keys(where[key] as Obj).length === 1 && args.take === undefined && args.orderBy === undefined) return null;
  const size = MAX_VALUES - (countValues(where) - countValues(list) + extra);
  if (size < MIN_PART) return null;
  return { key, list: [...new Set(list)], size };
}

/** The query's arguments for each part (orderBy fields added to `select` so the parts can be sorted). */
export function partArgs(operation: string, args: Obj, plan: SplitPlan): { parts: Obj[]; added: string[] } {
  const where = args.where as Obj;
  const added: string[] = [];
  let select = args.select;
  if ((operation === 'findMany' || operation === 'findFirst') && isObj(select)) {
    const sel = { ...select };
    for (const [field] of orderList(args.orderBy) ?? []) if (!sel[field]) { sel[field] = true; added.push(field); }
    select = sel;
  }
  const parts: Obj[] = [];
  for (let i = 0; i < plan.list.length; i += plan.size) {
    const part: Obj = { ...args, where: { ...where, [plan.key]: { ...(where[plan.key] as Obj), in: plan.list.slice(i, i + plan.size) } } };
    if (select !== undefined) part.select = select;
    if (operation === 'findFirst') part.take = 1;
    parts.push(part);
  }
  return { parts, added };
}

function compare(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'bigint' && typeof b === 'bigint') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  // SQLite compares text by bytes (BINARY): code points, not the reader's language.
  const x = String(a), y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Sorts rows like SQLite would for this orderBy (nulls first when ascending unless told otherwise). */
export function sortRows(rows: Obj[], orderBy: unknown): Obj[] {
  const order = orderList(orderBy) ?? [];
  if (!order.length) return rows;
  return [...rows].sort((r1, r2) => {
    for (const [field, dir, nulls] of order) {
      const a = r1[field], b = r2[field];
      const an = a === null || a === undefined, bn = b === null || b === undefined;
      if (an || bn) {
        if (an && bn) continue;
        const nullFirst = nulls ? nulls === 'first' : dir === 'asc';
        return (an ? -1 : 1) * (nullFirst ? 1 : -1);
      }
      const c = compare(a, b);
      if (c) return dir === 'asc' ? c : -c;
    }
    return 0;
  });
}

/** The parts' results as the one query would have returned them. */
export function mergeParts(operation: string, args: Obj, results: unknown[], added: string[] = []): unknown {
  if (operation === 'count') {
    if (results.every((r) => typeof r === 'number')) return (results as number[]).reduce((a, b) => a + b, 0);
    const out: Record<string, number> = {};
    for (const r of results as Record<string, number>[]) for (const [k, v] of Object.entries(r)) out[k] = (out[k] ?? 0) + v;
    return out;
  }
  if (operation === 'updateMany' || operation === 'deleteMany') return { count: (results as { count: number }[]).reduce((a, r) => a + r.count, 0) };
  if (operation === 'groupBy') return (results as unknown[][]).flat();
  let rows = sortRows((results as unknown[]).flatMap((r) => (r === null ? [] : Array.isArray(r) ? r : [r])) as Obj[], args.orderBy);
  if (operation === 'findFirst') rows = rows.slice(0, 1);
  else if (typeof args.take === 'number') rows = rows.slice(0, Math.max(0, args.take));
  if (added.length) rows = rows.map((r) => { const c = { ...r }; for (const f of added) delete c[f]; return c; });
  return operation === 'findFirst' ? rows[0] ?? null : rows;
}
