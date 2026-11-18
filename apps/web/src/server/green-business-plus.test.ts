import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { addBizCredit, askQuery, bizBenchmark, greenSubscription, inviteVerifier, signVerification, verificationFor } from './green-business-plus';
import type { SessionUser } from '@/lib/server-auth';
import { totals } from '@/lib/carbon-ledger';

// M276–M281: verification stays independent and tamper-evident; credits are kept apart; the benchmark hides companies.
const db = vi.hoisted(() => ({
  greenOrg: { findUnique: vi.fn(), updateMany: vi.fn() },
  greenOrgMember: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  greenEntry: { findMany: vi.fn(), findFirst: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
  greenAudit: { findFirst: vi.fn(), create: vi.fn() },
  greenVerification: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  greenQuery: { count: vi.fn(), create: vi.fn() },
  greenCredit: { count: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn() },
  $queryRawUnsafe: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ default: db }));
vi.mock('./email', () => ({ notify: vi.fn() }));
const featureOff = vi.hoisted(() => vi.fn());
vi.mock('./moderation', () => ({ featureOff }));
vi.mock('./ai-budget', () => ({ spendAi: vi.fn() }));
vi.mock('./gemini', () => ({ geminiJson: vi.fn(), geminiJsonImage: vi.fn() }));
vi.mock('./ai-receipts', () => ({ logAiUse: vi.fn() }));
vi.mock('@/lib/billing', () => ({ getStripe: () => null }));

const owner = { id: 'owner', name: 'Owner', email: 'o@x.test', role: 'STUDENT' } as SessionUser;
const verifier = { id: 'ver', name: 'Vera', email: 'v@firm.test', role: 'STUDENT' } as SessionUser;
const org = { id: 'o1', name: 'Acme', kind: 'company', country: 'IN', currency: 'INR', consultancyId: null, tier: 'FREE', industry: 'Textiles', employees: 10, revenue: 1_000_000 };
beforeEach(() => {
  vi.clearAllMocks();
  featureOff.mockResolvedValue(true);
  db.greenOrg.findUnique.mockResolvedValue(org);
  db.greenAudit.findFirst.mockResolvedValue(null);
  db.greenOrgMember.findUnique.mockImplementation(({ where }: { where: { orgId_userId: { userId: string } } }) => Promise.resolve(where.orgId_userId.userId === 'owner' ? { role: 'owner' } : where.orgId_userId.userId === 'ver' ? { role: 'verifier' } : null));
});

describe('verification', () => {
  it('invites only an outsider', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'owner' });
    await expect(inviteVerifier(owner, 'o1', { email: 'o@x.test', firm: 'Firm', year: 2026 })).rejects.toThrow(/independent/);
    db.user.findUnique.mockResolvedValue({ id: 'ver' });
    db.greenVerification.create.mockResolvedValue({ id: 'v1' });
    await inviteVerifier(owner, 'o1', { email: 'v@firm.test', firm: 'Firm', year: 2026 });
    expect(db.greenVerification.create.mock.calls[0][0].data).toMatchObject({ verifierId: 'ver', firm: 'Firm', year: 2026 });
  });
  it('asks Pro for it when the owner’s plans are on', async () => {
    featureOff.mockResolvedValue(false);
    await expect(inviteVerifier(owner, 'o1', { email: 'v@firm.test', firm: 'Firm', year: 2026 })).rejects.toThrow(/Pro/);
  });
  it('lets only the verifier ask and sign, and not with questions unanswered', async () => {
    db.greenVerification.findFirst.mockResolvedValue({ id: 'v1', orgId: 'o1', verifierId: 'ver', firm: 'Firm', year: 2026, status: 'reviewing' });
    await expect(askQuery(owner, 'o1', 'v1', { question: 'Why?' })).rejects.toThrow(/Only the verifier/);
    db.greenQuery.count.mockResolvedValue(1);
    await expect(signVerification(verifier, 'o1', 'v1', { standard: 'ISO 14064-3', level: 'limited', scopes: [1, 2], opinion: 'Fine.' })).rejects.toThrow(/answered/);
    await expect(signVerification(owner, 'o1', 'v1', { standard: 'ISO 14064-3', level: 'limited', scopes: [1, 2], opinion: 'Fine.' })).rejects.toThrow(/Only the invited/);
  });
  it('signs over the numbers, and shows when they change or the statement is altered', async () => {
    db.greenVerification.findFirst.mockResolvedValue({ id: 'v1', orgId: 'o1', verifierId: 'ver', firm: 'Firm', year: 2026, status: 'reviewing' });
    db.greenQuery.count.mockResolvedValue(0);
    const lines = [{ period: '2026-01', category: 'diesel', scope: 1, kg: 251, quantity: 100, quality: 'measured', site: null }];
    db.greenEntry.findMany.mockResolvedValue(lines);
    await signVerification(verifier, 'o1', 'v1', { standard: 'ISO 14064-3', level: 'limited', scopes: [1, 2], opinion: 'Fairly stated.' });
    const data = db.greenVerification.update.mock.calls[0][0].data;
    const signed = { ...data, verifierId: 'ver', firm: 'Firm', status: 'signed' };
    db.greenVerification.findFirst.mockResolvedValue(signed);
    db.user.findUnique.mockResolvedValue({ name: 'Vera' });
    const t = totals(lines, 2026, { country: 'IN', upstream: true });
    expect(await verificationFor('o1', 2026, t, null)).toMatchObject({ intact: true, changed: false, firm: 'Firm' });
    expect(await verificationFor('o1', 2026, { ...t, kg: t.kg + 100 }, null)).toMatchObject({ changed: true });
    db.greenVerification.findFirst.mockResolvedValue({ ...signed, opinion: 'Rewritten.' });
    expect(await verificationFor('o1', 2026, t, null)).toMatchObject({ intact: false });
  });
});

describe('credits and the benchmark', () => {
  it('keeps certificates, offsets and removals in a register', async () => {
    db.greenCredit.count.mockResolvedValue(0);
    db.greenCredit.create.mockResolvedValue({ id: 'c1', year: 2026, registry: 'Verra', retired: true });
    await addBizCredit(owner, 'o1', { kind: 'offset', year: 2026, quantity: 10, registry: 'Verra', retired: true });
    expect(db.greenCredit.create.mock.calls[0][0].data).toMatchObject({ kind: 'offset', quantity: 10, retired: true });
    await expect(addBizCredit(owner, 'o1', { kind: 'magic', year: 2026, quantity: 10 })).rejects.toThrow(/What it is/);
  });
  it('shows quartiles only once five others have data', async () => {
    db.$queryRawUnsafe.mockResolvedValue([1, 2, 3, 4].map((i) => ({ id: `p${i}`, employees: 10, revenue: null, currency: 'USD', country: 'IN' })));
    db.greenEntry.groupBy.mockResolvedValue([1, 2, 3, 4].map((i) => ({ orgId: `p${i}`, _sum: { kg: i * 1000 } })));
    expect(await bizBenchmark(owner, 'o1', { year: '2026' })).toMatchObject({ enough: false, peers: 4 });
    db.$queryRawUnsafe.mockResolvedValue([1, 2, 3, 4, 5].map((i) => ({ id: `p${i}`, employees: 10, revenue: null, currency: 'USD', country: 'IN' })));
    db.greenEntry.groupBy.mockResolvedValue([1, 2, 3, 4, 5].map((i) => ({ orgId: `p${i}`, _sum: { kg: i * 1000 } })));
    db.greenEntry.aggregate.mockResolvedValue({ _sum: { kg: 2000 } });
    const r = await bizBenchmark(owner, 'o1', { year: '2026' });
    expect(r).toMatchObject({ enough: true, peers: 5, perPerson: { median: 0.3, mine: 0.2, rank: 40 } });
    expect(JSON.stringify(r)).not.toMatch(/"p[1-5]"/);
  });
});

describe('plans', () => {
  it('sets the plan from the subscription, and back to free when it ends', async () => {
    const sub = (status: string) => ({ status, customer: 'cus_1', id: 'sub_1', metadata: { greenOrgId: 'o1', greenTier: 'CONSULTANCY' } }) as unknown as Stripe.Subscription;
    expect(await greenSubscription(sub('active'))).toBe(true);
    expect(db.greenOrg.updateMany.mock.calls[0][0].data).toMatchObject({ tier: 'CONSULTANCY', stripeSubscriptionId: 'sub_1' });
    await greenSubscription(sub('canceled'));
    expect(db.greenOrg.updateMany.mock.calls[1][0].data).toMatchObject({ tier: 'FREE', stripeSubscriptionId: null });
    expect(await greenSubscription({ metadata: {} } as unknown as Stripe.Subscription)).toBe(false);
  });
});
