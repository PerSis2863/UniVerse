import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { Router, type Ctx } from './router';
import applications, { approveInvited } from './modules/applications';
import auditModule from './modules/audit';
import { SafetyService } from './services/safety.service';
import { ScholarshipsService } from './services/scholarships.service';

// An admin of school A sees and changes only school A's people and their records; school B's look
// "not found" (security fix, school-scope.ts).

vi.mock('@/lib/db', () => ({
  default: {
    organization: { findUnique: vi.fn() },
    user: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    roleApplication: { findFirst: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), update: vi.fn(), create: vi.fn() },
    invitation: { update: vi.fn() },
    studentProfile: { upsert: vi.fn() },
    teacherProfile: { upsert: vi.fn() },
    auditLog: { findMany: vi.fn(), groupBy: vi.fn() },
    safetyAlert: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    scholarshipApplication: { findFirst: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('./auth', () => ({ isOwner: () => false, forgetUser: vi.fn() }));
vi.mock('./audit', () => ({ audit: vi.fn() }));
vi.mock('./email', () => ({ later: vi.fn(), notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock('./bulk-import', () => ({ applyPendingEnrolments: vi.fn() }));

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as Record<string, Record<string, Fn>>;
// A fresh object each time: schoolsOf remembers its answer per user object.
const adminA = () => ({ id: 'a1', name: 'Admin A', role: 'ADMIN', organizationId: 'orgA', email: 'a@a.test' });
const owner = () => ({ id: 'o1', name: 'Owner', role: 'ADMIN', organizationId: null, owner: true, email: 'o@o.test' });

/** Whether a person of this school passes a usersIn() filter (the shapes it builds). */
function passes(filter: Record<string, unknown> | undefined, organizationId: string | null): boolean {
  if (!filter || !Object.keys(filter).length) return true;
  if (Array.isArray(filter.OR)) return filter.OR.some((f) => passes(f as Record<string, unknown>, organizationId));
  const want = filter.organizationId as string | null | { in: string[] };
  return want && typeof want === 'object' ? want.in.includes(organizationId as string) : want === organizationId;
}

function route(mount: (r: Router) => void, method: string, path: string) {
  const router = new Router();
  mount(router);
  const { route: found, params } = router.match(method, path);
  if (!found) throw new Error(`no route ${method} ${path}`);
  return (ctx: Partial<Ctx>) => found.handler({ params, query: {}, body: {}, req: new Request('http://x.test'), ...ctx } as Ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
  db.organization.findUnique.mockResolvedValue(null);
});

describe('applications', () => {
  // School B's applicant asking to become an organization representative (ADMIN).
  const appOfB = { id: 'app1', userId: 'u2', status: 'PENDING', requestedRole: 'ADMIN', history: [], department: null, user: { name: 'Bea', email: 'b@b.test', role: 'STUDENT', status: 'ACTIVE', organizationId: 'orgB' } };
  beforeEach(() => {
    db.roleApplication.findFirst.mockImplementation(async ({ where }: { where: { id: string; user?: Record<string, unknown> } }) =>
      where.id === appOfB.id && passes(where.user, appOfB.user.organizationId) ? appOfB : null);
    db.roleApplication.update.mockResolvedValue({ ...appOfB, status: 'APPROVED' });
  });

  it("another school's admin can't approve (or even see) the application: no role is granted", async () => {
    const approve = route(applications, 'POST', 'applications/app1/approve');
    await expect(approve({ user: adminA() as never })).rejects.toThrow('Application not found');
    expect(db.roleApplication.findFirst.mock.calls[0][0].where.user).toEqual({ organizationId: { in: ['orgA'] } });
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.roleApplication.update).not.toHaveBeenCalled();

    const many = route(applications, 'POST', 'applications/approve-many');
    expect(await many({ user: adminA() as never, body: { ids: ['app1'] } })).toEqual({ approved: 0, failed: [{ id: 'app1', reason: 'Application not found' }] });
    expect(db.user.update).not.toHaveBeenCalled();

    await expect(route(applications, 'POST', 'applications/app1/reject')({ user: adminA() as never, body: { reason: 'no' } })).rejects.toThrow('Application not found');
    await expect(route(applications, 'GET', 'applications/app1')({ user: adminA() as never })).rejects.toThrow('Application not found');
  });

  it('the platform owner still can', async () => {
    await route(applications, 'POST', 'applications/app1/approve')({ user: owner() as never });
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u2' }, data: expect.objectContaining({ role: 'ADMIN' }) }));
  });

  it('the list and its counts leave out other schools', async () => {
    db.roleApplication.findMany.mockResolvedValue([]);
    db.roleApplication.groupBy.mockResolvedValue([]);
    await route(applications, 'GET', 'applications')({ user: adminA() as never });
    expect(db.roleApplication.findMany.mock.calls[0][0].where.user).toEqual({ organizationId: { in: ['orgA'] } });
    expect(db.roleApplication.groupBy.mock.calls[0][0].where).toEqual({ user: { organizationId: { in: ['orgA'] } } });
  });

  it('an invited person joins the school that invited them (unless already in one)', async () => {
    db.invitation.update.mockResolvedValue({ organizationId: 'orgA' });
    await approveInvited({ id: 'u3', name: 'New', role: 'STUDENT', email: 'n@a.test' }, 'TEACHER', 'inv1');
    expect(db.user.updateMany).toHaveBeenCalledWith({ where: { id: 'u3', organizationId: null }, data: { organizationId: 'orgA' } });

    vi.clearAllMocks();
    db.invitation.update.mockResolvedValue({ organizationId: null });
    await approveInvited({ id: 'u4', name: 'Main', role: 'STUDENT', email: 'm@a.test' }, 'TEACHER', 'inv2');
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
});

describe('activity log', () => {
  beforeEach(() => {
    db.auditLog.findMany.mockResolvedValue([]);
    db.auditLog.groupBy.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([]);
  });

  it("shows a school's admin only entries by their school's people", async () => {
    await route(auditModule, 'GET', 'audit')({ user: adminA() as never, query: { action: 'user' } });
    expect(db.auditLog.findMany.mock.calls[0][0].where).toEqual({ AND: [{ actor: { organizationId: { in: ['orgA'] } } }, { action: { startsWith: 'user.' } }] });
    await route(auditModule, 'GET', 'audit/actions')({ user: adminA() as never });
    expect(db.auditLog.groupBy.mock.calls[0][0].where).toEqual({ actor: { organizationId: { in: ['orgA'] } } });
  });

  it('an email search only looks up their own school’s people', async () => {
    await route(auditModule, 'GET', 'audit/export')({ user: adminA() as never, query: { q: 'b@b.test' } });
    expect(db.user.findMany.mock.calls[0][0].where).toEqual({ AND: [{ organizationId: { in: ['orgA'] } }, { email: { contains: 'b@b.test' } }] });
  });

  it('the platform owner sees every entry', async () => {
    await route(auditModule, 'GET', 'audit')({ user: owner() as never });
    expect(db.auditLog.findMany.mock.calls[0][0].where).toEqual({ AND: [{}, {}] });
  });
});

describe('safety reports', () => {
  const safety = new SafetyService();

  it("lists only the admin's school's reports, anonymous ones by the school they came from", async () => {
    db.safetyAlert.findMany.mockResolvedValue([]);
    await safety.findAll(adminA() as never);
    expect(db.safetyAlert.findMany.mock.calls[0][0].where).toEqual({ OR: [{ reporter: { organizationId: { in: ['orgA'] } } }, { AND: [{ reporterId: null }, { organizationId: { in: ['orgA'] } }] }] });
    await safety.findAll(owner() as never);
    expect(db.safetyAlert.findMany.mock.calls[1][0].where).toEqual({});
  });

  it('an anonymous report keeps its school (not its reporter)', async () => {
    db.safetyAlert.create.mockResolvedValue({ id: 'r1', createdAt: new Date(), severity: 'MEDIUM', location: null });
    await safety.create({ id: 'u1', organizationId: 'orgA' }, { title: 'T', description: 'D', isAnonymous: true });
    expect(db.safetyAlert.create.mock.calls[0][0].data).toMatchObject({ reporterId: null, isAnonymous: true, organizationId: 'orgA' });
  });

  it("another school's report can't be resolved", async () => {
    db.safetyAlert.findFirst.mockResolvedValue(null);
    await expect(safety.resolve('s1', adminA() as never)).rejects.toThrow('Report not found');
    expect(db.safetyAlert.update).not.toHaveBeenCalled();
  });
});

describe('scholarships', () => {
  it("another school's application can't be decided", async () => {
    db.scholarshipApplication.findFirst.mockResolvedValue(null);
    await expect(new ScholarshipsService().updateApplication('sa1', { status: 'ACCEPTED' }, adminA() as never)).rejects.toThrow('Application not found');
    expect(db.scholarshipApplication.findFirst.mock.calls[0][0].where).toEqual({ id: 'sa1', student: { organizationId: { in: ['orgA'] } } });
    expect(db.scholarshipApplication.update).not.toHaveBeenCalled();
  });
});
