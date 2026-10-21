// D1 takes at most 100 bound values in one query, and Prisma refuses a query with more (P2029
// "query parameter limit exceeded") rather than splitting it. For a list of ids that can be long (a
// big group, a whole school), run the query in parts of 90 and put the results together. Each part
// is one query, so keep an eye on D1's 50 queries a request: 1,000 ids are 12 queries.

export const D1_PART = 90;

/** The list cut into parts of `size`. */
export function partsOf<T>(list: readonly T[], size = D1_PART): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Runs `run` on each part of the list (at the same time) and joins the rows. */
export async function inParts<T, R>(list: readonly T[], run: (part: T[]) => Promise<R[]>, size = D1_PART): Promise<R[]> {
  if (!list.length) return [];
  return (await Promise.all(partsOf(list, size).map(run))).flat();
}
