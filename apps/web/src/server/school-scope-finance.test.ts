import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/server-auth';

// Schools (school-scope.ts) in fees, refunds and chat safety: one school's admin can't bill, refund
// or moderate another school's people.

vi.mock('@/lib/db', () => ({
  default: {
    organization: { findUnique: vi.fn(async () => null), findFirst: vi.fn(async () => null) },
    user: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    feePlan: { findFirst: vi.fn() },
    paymentOrder: { findUnique: vi.fn() },
    safetyFlag: { findUnique: vi.fn(), update: vi.fn() },
    message: { findMany: vi.fn(async () => []) },
    $executeRawUnsafe: vi.fn(async () => 3),
  },
}));
vi.mock('./auth', () => ({ isOwner: () => false }));
vi.mock('./permissions', () => ({ need: vi.fn(async () => undefined), can: vi.fn(async () => true) }));
vi.mock('@/lib/billing', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/server/audit', () => ({ audit: vi.fn() }));
vi.mock('@/server/payments/provider', () => ({ processUnifiedRefund: vi.fn(async () => ({ amount: 500, refundId: 'r1' })) }));

import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/billing';
import { processUnifiedRefund } from '@/server/payments/provider';
import { POST as refund } from '@/app/api/admin/payments/refund/route';
import { feePlanAction } from './fees';
import { flagContext, reviewFlag } from './safety';

const db = vi.mocked(prisma, true);
const admin = (organizationId: string | null): SessionUser => ({ id: `admin-${organizationId}`, name: 'Admin', email: 'a@school.test', role: 'ADMIN', organizationId });

beforeEach(() => vi.clearAllMocks());

describe('issuing a fee plan', () => {
  it('bills only the issuer’s school’s students', async () => {
    db.feePlan.findFirst.mockResolvedValueOnce({ id: 'p1', name: 'Term 1', courseId: null, currency: 'INR', items: '[]', instalments: JSON.stringify([{ label: 'Full', dueAt: '2026-11-01T23:59:59.000Z', amount: 1000 }]), archivedAt: null, createdBy: { id: 'admin-org-a', organizationId: 'org-a' } } as never);
    const out = await feePlanAction(admin('org-a'), 'p1', { action: 'issue' });
    expect(out).toEqual({ issued: 3 });
    // The plan itself is looked up within the school (another school's looks not found).
    expect(db.feePlan.findFirst.mock.calls[0][0]).toMatchObject({ where: { id: 'p1', createdBy: { organizationId: { in: ['org-a'] } } } });
    const [sql, ...args] = db.$executeRawUnsafe.mock.calls[0] as unknown as [string, ...unknown[]];
    expect(sql).toContain(`u.role = 'STUDENT' AND u.status = 'ACTIVE' AND (u.organizationId IN (?))`);
    expect(args).toContain('org-a');
  });

  it('refuses another school’s plan', async () => {
    db.feePlan.findFirst.mockResolvedValueOnce(null);
    await expect(feePlanAction(admin('org-b'), 'p1', { action: 'issue' })).rejects.toThrow('That fee plan doesn’t exist.');
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});

describe('refunds', () => {
  const call = (orderId: string) => refund(new Request('https://x.test/api/admin/payments/refund', { method: 'POST', body: JSON.stringify({ orderId }) }));

  it('refuses another school’s order like one that doesn’t exist', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce({ user: admin('org-a'), org: { id: 'org-own' }, plan: 'PRO' } as never);
    db.paymentOrder.findUnique.mockResolvedValueOnce({ organizationId: 'org-b', userId: 'u9' } as never);
    const res = await call('ord-b');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Payment order not found.' });
    expect(processUnifiedRefund).not.toHaveBeenCalled();
  });

  it('refunds an order of the admin’s own school, or the one they own', async () => {
    for (const organizationId of ['org-a', 'org-own']) {
      vi.mocked(requireAdmin).mockResolvedValueOnce({ user: admin('org-a'), org: { id: 'org-own' }, plan: 'PRO' } as never);
      db.paymentOrder.findUnique.mockResolvedValueOnce({ organizationId, userId: 'u1' } as never);
      const res = await call('ord-1');
      expect(res.status).toBe(200);
    }
    expect(processUnifiedRefund).toHaveBeenCalledTimes(2);
  });
});

describe('chat safety flags', () => {
  it('another school’s flag looks not found, and its sender can’t be paused', async () => {
    db.safetyFlag.findUnique.mockResolvedValue({ id: 'f1', senderId: 'student-b', conversationId: 'c1', messageId: 'm1', createdAt: new Date() } as never);
    db.user.findFirst.mockResolvedValue(null); // the sender isn't in the admin's school
    await expect(flagContext(admin('org-a'), 'f1')).rejects.toThrow('That flag doesn’t exist.');
    await expect(reviewFlag(admin('org-a'), 'f1', { action: 'pause' })).rejects.toThrow('That flag doesn’t exist.');
    expect(db.message.findMany).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.user.findFirst.mock.calls[0][0]).toMatchObject({ where: { id: 'student-b', organizationId: { in: ['org-a'] } } });
  });

  it('the admin’s own school’s flag works', async () => {
    db.safetyFlag.findUnique.mockResolvedValue({ id: 'f1', senderId: 'student-a', conversationId: 'c1', messageId: 'm1', createdAt: new Date() } as never);
    db.user.findFirst.mockResolvedValue({ id: 'student-a' } as never);
    await expect(reviewFlag(admin('org-a'), 'f1', { action: 'pause' })).resolves.toEqual({ ok: true, paused: true });
    expect(db.user.update).toHaveBeenCalledOnce();
  });
});
