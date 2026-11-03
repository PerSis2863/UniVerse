import { describe, expect, it } from 'vitest';
import { countValues, mergeParts, partArgs, planPages, planSplit, readInPages, readsOrderedRelation, sortRows } from './d1-split';

const ids = (n: number, p = 'u') => Array.from({ length: n }, (_, i) => `${p}${String(i).padStart(3, '0')}`);

describe('splitting queries with long lists for D1 (100 values a query)', () => {
  it('counts the values a filter binds', () => {
    expect(countValues({ userId: { in: ['a', 'b'] }, type: 'chat', read: false, at: { gt: new Date() }, x: null, name: { contains: 'a', mode: 'insensitive' } })).toBe(6);
  });

  it('leaves short queries, and the ones Prisma splits itself, alone', () => {
    expect(planSplit('findMany', { where: { userId: { in: ids(80) }, type: 'chat' } })).toBeNull();
    expect(planSplit('findMany', { where: { id: { in: ids(300) } }, select: { id: true } })).toBeNull();
    expect(planSplit('create', { data: { x: 1 } })).toBeNull();
  });

  it('splits a list with other conditions into parts that fit', () => {
    const plan = planSplit('findMany', { where: { userId: { in: ids(200) }, type: 'chat', createdAt: { gt: new Date() } } });
    expect(plan).toMatchObject({ key: 'userId', size: 93 });
    expect(plan!.list).toHaveLength(200);
    const { parts } = partArgs('findMany', { where: { userId: { in: ids(200) }, type: 'chat' } }, plan!);
    expect(parts.map((p) => ((p.where as { userId: { in: string[] } }).userId.in).length)).toEqual([93, 93, 14]);
    expect((parts[0].where as { type: string }).type).toBe('chat');
  });

  it('counts updateMany data and take as values too, and refuses what it can’t put back together', () => {
    expect(planSplit('updateMany', { where: { id: { in: ids(100) } }, data: { a: 1, b: 2, c: 3 } })!.size).toBe(92);
    expect(planSplit('findMany', { where: { id: { in: ids(200) }, x: 1 }, skip: 10 })).toBeNull();
    expect(planSplit('findMany', { where: { id: { in: ids(200) }, x: 1 }, distinct: ['x'] })).toBeNull();
    expect(planSplit('findMany', { where: { id: { in: ids(200) }, x: 1 }, orderBy: { user: { name: 'asc' } } })).toBeNull();
    expect(planSplit('groupBy', { by: ['type'], where: { userId: { in: ids(200) } } })).toBeNull();
    expect(planSplit('groupBy', { by: ['userId'], where: { userId: { in: ids(200) } } })).not.toBeNull();
    expect(planSplit('findMany', { where: { a: { in: ids(60) }, b: { in: ids(60) } } })!.size).toBe(35); // the other list stays whole
    expect(planSplit('findMany', { where: { a: { in: ids(90) }, b: { in: ids(90) } } })).toBeNull(); // no room left for parts
  });

  it('adds orderBy fields to select for sorting, then takes them away', () => {
    const args = { where: { userId: { in: ids(150) }, type: 'chat' }, select: { id: true }, orderBy: { createdAt: 'desc' }, take: 3 };
    const plan = planSplit('findMany', args)!;
    const { parts, added } = partArgs('findMany', args, plan);
    expect(added).toEqual(['createdAt']);
    expect(parts[0].select).toEqual({ id: true, createdAt: true });
    const day = (d: number) => new Date(Date.UTC(2026, 9, d));
    const merged = mergeParts('findMany', args, [[{ id: 'a', createdAt: day(5) }, { id: 'b', createdAt: day(2) }], [{ id: 'c', createdAt: day(9) }, { id: 'd', createdAt: day(3) }]], added);
    expect(merged).toEqual([{ id: 'c' }, { id: 'a' }, { id: 'd' }]);
  });

  it('sorts like SQLite: nulls first when ascending, then by the next field', () => {
    const rows = [{ n: 2, s: 'b' }, { n: null, s: 'z' }, { n: 1, s: 'c' }, { n: 2, s: 'a' }];
    expect(sortRows(rows, [{ n: 'asc' }, { s: 'asc' }]).map((r) => r.s)).toEqual(['z', 'c', 'a', 'b']);
    expect(sortRows(rows, { n: { sort: 'desc', nulls: 'first' } }).map((r) => r.n)).toEqual([null, 2, 2, 1]);
    expect(sortRows([{ s: 'b' }, { s: 'B' }, { s: 'a' }], { s: 'asc' }).map((r) => r.s)).toEqual(['B', 'a', 'b']);
  });

  it('puts counts, updates and firsts back together', () => {
    expect(mergeParts('count', {}, [3, 4, 0])).toBe(7);
    expect(mergeParts('count', {}, [{ _all: 2, id: 1 }, { _all: 5, id: 4 }])).toEqual({ _all: 7, id: 5 });
    expect(mergeParts('updateMany', {}, [{ count: 2 }, { count: 9 }])).toEqual({ count: 11 });
    expect(mergeParts('findFirst', { orderBy: { at: 'asc' } }, [{ id: 'x', at: 5 }, null, { id: 'y', at: 2 }])).toEqual({ id: 'y', at: 2 });
    expect(mergeParts('findFirst', {}, [null, null])).toBeNull();
    expect(mergeParts('groupBy', {}, [[{ userId: 'a', _count: 1 }], [{ userId: 'b', _count: 2 }]])).toHaveLength(2);
  });
});

describe('lists that read an ordered related list (read in pages)', () => {
  const lastSignIn = { id: true, loginEvents: { orderBy: { createdAt: 'desc' }, take: 1 } };
  it('spots a related list with its own orderBy or take, at any depth, but not counts or plain lists', () => {
    expect(readsOrderedRelation(lastSignIn)).toBe(true);
    expect(readsOrderedRelation({ conversation: { select: { participants: { take: 25 } } } })).toBe(true);
    expect(readsOrderedRelation({ loginEvents: { where: { country: 'IN' } }, _count: { select: { loginEvents: true } } })).toBe(false);
    expect(readsOrderedRelation({ name: true, user: { select: { id: true } } })).toBe(false);
  });
  it('pages a long or unlimited findMany only', () => {
    expect(planPages('findMany', { take: 200, select: lastSignIn })).toBe(90);
    expect(planPages('findMany', { include: { members: { take: 3 } } })).toBe(90);
    expect(planPages('findMany', { take: 50, select: lastSignIn })).toBeNull();
    expect(planPages('findMany', { take: 200, select: { id: true } })).toBeNull();
    expect(planPages('findMany', { take: 200, distinct: ['role'], select: lastSignIn })).toBeNull();
    expect(planPages('findFirst', { select: lastSignIn })).toBeNull();
  });
  it('reads page by page from the skip, up to take, stopping at a short page', async () => {
    const all = ids(230);
    const calls: { skip: number; take: number }[] = [];
    const run = async (a: Record<string, unknown>) => { const s = a.skip as number, t = a.take as number; calls.push({ skip: s, take: t }); return all.slice(s, s + t); };
    expect(await readInPages({ skip: 10, take: 200 }, 90, run)).toEqual(all.slice(10, 210));
    expect(calls).toEqual([{ skip: 10, take: 90 }, { skip: 100, take: 90 }, { skip: 190, take: 20 }]);
    calls.length = 0;
    expect(await readInPages({}, 90, run)).toHaveLength(230);
    expect(calls).toHaveLength(3);
  });
});
