import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { assertInSchool, inSchools, keepInSchool, orgIn, schoolSql, schoolsOf, usersIn } from './school-scope';

vi.mock('@/lib/db', () => ({ default: { organization: { findUnique: vi.fn() }, user: { findFirst: vi.fn(), findMany: vi.fn() } } }));
vi.mock('./auth', () => ({ isOwner: () => false }));

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as { organization: Record<string, Fn>; user: Record<string, Fn> };

describe('an admin sees only their own school (security fix)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('an admin in a school: that school (and one they own)', async () => {
    db.organization.findUnique.mockResolvedValue(null);
    expect(await schoolsOf({ id: 'a', organizationId: 'orgA' })).toEqual(['orgA']);
    db.organization.findUnique.mockResolvedValue({ id: 'orgOwned' });
    expect(await schoolsOf({ id: 'b', organizationId: 'orgA' })).toEqual(['orgA', 'orgOwned']);
  });

  it('an admin in no school: the main school and the school they own; the owner: everything', async () => {
    db.organization.findUnique.mockResolvedValue({ id: 'orgOwned' });
    expect(await schoolsOf({ id: 'c', organizationId: null })).toEqual([null, 'orgOwned']);
    expect(await schoolsOf({ id: 'd', owner: true })).toBe('all');
  });

  it('builds the filters', () => {
    expect(usersIn('all')).toEqual({});
    expect(usersIn([null])).toEqual({ organizationId: null });
    expect(usersIn(['x'])).toEqual({ organizationId: { in: ['x'] } });
    expect(orgIn([null, 'x'])).toEqual({ OR: [{ organizationId: null }, { organizationId: { in: ['x'] } }] });
    expect(schoolSql([null, 'x'], 'u')).toEqual({ sql: '(u.organizationId IS NULL OR u.organizationId IN (?))', args: ['x'] });
    expect(schoolSql('all')).toEqual({ sql: '1 = 1', args: [] });
    expect(inSchools([null], undefined)).toBe(true);
    expect(inSchools(['x'], null)).toBe(false);
  });

  it('another school’s person is "not found"; bulk actions skip them', async () => {
    db.organization.findUnique.mockResolvedValue(null);
    db.user.findFirst.mockResolvedValue(null);
    await expect(assertInSchool({ id: 'e', organizationId: 'orgA' }, 'someone-in-orgB')).rejects.toThrow('User not found');
    expect(db.user.findFirst.mock.calls[0][0].where).toEqual({ id: 'someone-in-orgB', organizationId: { in: ['orgA'] } });
    db.user.findMany.mockResolvedValue([{ id: 'p1' }]);
    expect(await keepInSchool({ id: 'f', organizationId: 'orgA' }, ['p1', 'p2'])).toEqual(['p1']);
  });
});
