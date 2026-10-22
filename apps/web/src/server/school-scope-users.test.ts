import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { Router, type Ctx } from './router';
import users from './modules/users';

// Admin → Users across schools (security fix): another school's pending invitation can't be taken
// over (it decides which school the person joins), and bulk actions check the list size first.

vi.mock('@/lib/db', () => ({
  default: {
    organization: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    invitation: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));
vi.mock('./auth', () => ({ isOwner: () => false, forgetUser: vi.fn(), isDemoAccount: () => false, isOwnerEmail: () => false }));
vi.mock('./audit', () => ({ audit: vi.fn() }));

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as Record<string, Record<string, Fn>> & { $transaction: Fn };
const adminA = () => ({ id: 'a1', name: 'Admin A', role: 'ADMIN', organizationId: 'orgA', email: 'a@a.test' });

function route(method: string, path: string) {
  const router = new Router();
  users(router);
  const { route: found, params } = router.match(method, path);
  if (!found) throw new Error(`no route ${method} ${path}`);
  return (ctx: Partial<Ctx>) => found.handler({ params, query: {}, body: {}, req: new Request('http://x.test'), ...ctx } as Ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
  db.organization.findUnique.mockResolvedValue(null);
  db.user.findUnique.mockResolvedValue(null);
  db.user.findMany.mockResolvedValue([]);
  db.invitation.upsert.mockImplementation(({ create }) => ({ id: 'i1', ...create }));
});

describe('invitations from another school stay theirs', () => {
  it('one address: refused when school B already invited it', async () => {
    db.invitation.findUnique.mockResolvedValue({ organizationId: 'orgB' });
    await expect(route('POST', 'users/invitations')({ user: adminA() as never, body: { email: 'x@b.test', role: 'STUDENT' } })).rejects.toThrow('another school');
    expect(db.invitation.upsert).not.toHaveBeenCalled();
    // The admin's own school's invitation is renewed as before.
    db.invitation.findUnique.mockResolvedValue({ organizationId: 'orgA' });
    await route('POST', 'users/invitations')({ user: adminA() as never, body: { email: 'y@a.test', role: 'STUDENT' } });
    expect(db.invitation.upsert.mock.calls[0][0].create).toMatchObject({ email: 'y@a.test', organizationId: 'orgA' });
  });

  it('many addresses: school B’s pending ones are left out', async () => {
    db.invitation.findMany.mockResolvedValue([{ email: 'x@b.test', organizationId: 'orgB' }, { email: 'y@a.test', organizationId: 'orgA' }]);
    const out = await route('POST', 'users/invitations/bulk')({ user: adminA() as never, body: { emails: 'x@b.test, y@a.test, z@new.test', role: 'STUDENT' } });
    expect(out).toMatchObject({ invited: 2, alreadyMembers: ['x@b.test'] });
    const emails = db.invitation.upsert.mock.calls.map((c) => c[0].where.email);
    expect(emails).toEqual(['y@a.test', 'z@new.test']);
  });
});

describe('bulk actions check the list size before looking anyone up', () => {
  it('more than 200 people at once is refused without a database query', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `u${i}`);
    await expect(route('POST', 'users/bulk/status')({ user: adminA() as never, body: { status: 'SUSPENDED', ids } })).rejects.toThrow('up to 200');
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
});
