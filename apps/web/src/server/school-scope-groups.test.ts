import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { groupAccess } from './spaces';

// Study groups across schools (security fix): an admin runs only groups made by their own school's
// people; members keep their access whatever their school.

vi.mock('@/lib/db', () => ({ default: { group: { findUnique: vi.fn() }, organization: { findUnique: vi.fn(async () => null) } } }));
vi.mock('./auth', () => ({ isOwner: () => false }));

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as { group: { findUnique: Fn } };
const group = (org: string | null, members: { role: string }[] = []) => ({ id: 'g1', name: 'G', description: null, createdById: 'c1', createdBy: { organizationId: org }, members });
const admin = (org: string | null) => ({ id: 'a1', name: 'A', email: 'a@x', role: 'ADMIN', organizationId: org }) as never;

describe('study groups and school admins', () => {
  beforeEach(() => vi.clearAllMocks());

  it('an admin runs their own school’s groups, not another school’s', async () => {
    db.group.findUnique.mockResolvedValue(group('orgA'));
    expect(await groupAccess('g1', admin('orgA'))).toMatchObject({ canManage: true });
    expect(await groupAccess('g1', admin('orgB'))).toBeNull();
    // The school field isn't passed on.
    expect((await groupAccess('g1', admin('orgA')))!.group).not.toHaveProperty('createdBy');
  });

  it('a member keeps access in any school; an admin member of another school’s group isn’t its manager', async () => {
    db.group.findUnique.mockResolvedValue(group('orgA', [{ role: 'MEMBER' }]));
    expect(await groupAccess('g1', { id: 's1', name: 'S', email: 's@x', role: 'STUDENT', organizationId: 'orgB' } as never)).toMatchObject({ canManage: false });
    expect(await groupAccess('g1', admin('orgB'))).toMatchObject({ canManage: false });
  });
});
