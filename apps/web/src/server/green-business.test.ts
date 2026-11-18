import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { addBizEntry, addBizEntries, addBizSupplier, answerCarbonLink, bizOrg, carbonLink, createBizOrg, readBill, removeBizMember, supplierShareKg, updateBizEntry, verifyChain } from './green-business';
import type { SessionUser } from '@/lib/server-auth';

// M269–M275: Green → Business keeps to who may do what, works numbers out itself, and keeps an honest log.
const db = vi.hoisted(() => ({
  greenOrg: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
  greenOrgMember: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
  greenEntry: { create: vi.fn(), createMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
  greenAudit: { findFirst: vi.fn(), create: vi.fn() },
  greenSupplier: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn(), create: vi.fn() },
  greenCommute: { count: vi.fn(), create: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
}));
vi.mock('@/lib/db', () => ({ default: db }));
vi.mock('./email', () => ({ notify: vi.fn() }));
vi.mock('./ai-budget', () => ({ spendAi: vi.fn() }));
const featureOff = vi.hoisted(() => vi.fn());
vi.mock('./moderation', () => ({ featureOff }));
vi.mock('./gemini', () => ({ geminiJson: vi.fn(), geminiJsonImage: vi.fn() }));
vi.mock('./ai-receipts', () => ({ logAiUse: vi.fn() }));

const me = { id: 'me', name: 'Sam Lee', email: 'sam@x.test', role: 'STUDENT' } as SessionUser;
const org = { id: 'o1', name: 'Acme', kind: 'company', country: 'IN', currency: 'INR', consultancyId: null, plan: '{}', employees: 10, revenue: null, baseYear: null, targetYear: null, targetPct: null, surveyCode: 'CABC', auditCode: null, industry: null };
beforeEach(() => {
  vi.clearAllMocks();
  db.greenOrg.findUnique.mockResolvedValue(org);
  db.greenAudit.findFirst.mockResolvedValue(null);
  db.greenEntry.create.mockResolvedValue({ id: 'e1' });
  db.greenEntry.findMany.mockResolvedValue([]);
  featureOff.mockResolvedValue(true); // the owner's plans are off, as they start: everything open
});

describe('access', () => {
  it('hides a company from someone who isn’t in it', async () => {
    db.greenOrgMember.findUnique.mockResolvedValue(null);
    await expect(bizOrg(me, 'o1', {})).rejects.toThrow(/isn’t here/);
  });
  it('lets a viewer look but not change', async () => {
    db.greenOrgMember.findUnique.mockResolvedValue({ role: 'viewer' });
    await expect(addBizEntry(me, 'o1', { period: '2026-01', category: 'diesel', quantity: 10 })).rejects.toThrow(/look/);
  });
  it('gives a consultancy’s member the client company as an editor', async () => {
    db.greenOrg.findUnique.mockResolvedValue({ ...org, consultancyId: 'c1' });
    db.greenOrgMember.findUnique.mockImplementation(({ where }: { where: { orgId_userId: { orgId: string } } }) => Promise.resolve(where.orgId_userId.orgId === 'c1' ? { role: 'editor' } : null));
    await expect(addBizEntry(me, 'o1', { period: '2026-01', category: 'diesel', quantity: 10 })).resolves.toMatchObject({ kg: 25.1 });
  });
  it('keeps the last owner', async () => {
    db.greenOrgMember.findUnique.mockResolvedValue({ role: 'owner' });
    db.greenOrgMember.count.mockResolvedValue(1);
    await expect(removeBizMember(me, 'o1', 'me')).rejects.toThrow(/owner role/);
  });
});

describe('the ledger', () => {
  beforeEach(() => db.greenOrgMember.findUnique.mockResolvedValue({ role: 'editor' }));
  it('works kg out itself, with the country’s grid, and logs it', async () => {
    const r = await addBizEntry(me, 'o1', { period: '2026-03', category: 'electricity', quantity: 1000, kg: 1 });
    expect(r.kg).toBe(716);
    expect(db.greenEntry.create.mock.calls[0][0].data).toMatchObject({ orgId: 'o1', scope: 2, factor: 0.716, kg: 716, source: 'manual' });
    expect(db.greenAudit.create).toHaveBeenCalledTimes(1);
  });
  it('takes the company’s own factor when given', async () => {
    const r = await addBizEntry(me, 'o1', { period: '2026-03', category: 'electricity', quantity: 1000, factor: 0.5, factorSource: 'Our supplier' });
    expect(r.kg).toBe(500);
    expect(db.greenEntry.create.mock.calls[0][0].data.factorSource).toBe('Our supplier');
  });
  it('refuses the supplier and survey lines, a bad month or amount', async () => {
    await expect(addBizEntry(me, 'o1', { period: '2026-03', category: 'supplier', quantity: 1 })).rejects.toThrow(/what this line is/);
    await expect(addBizEntry(me, 'o1', { period: '2026-13', category: 'diesel', quantity: 1 })).rejects.toThrow(/month/);
    await expect(addBizEntry(me, 'o1', { period: '2026-03', category: 'diesel', quantity: 'lots' })).rejects.toThrow(/number/);
  });
  it('imports in fives (D1’s bound values), naming a bad line', async () => {
    const rows = Array.from({ length: 12 }, () => ({ period: '2026-01', category: 'diesel', quantity: 1 }));
    expect(await addBizEntries(me, 'o1', { rows })).toMatchObject({ added: 12 });
    expect(db.greenEntry.createMany).toHaveBeenCalledTimes(3);
    await expect(addBizEntries(me, 'o1', { rows: [...rows, { period: 'x', category: 'diesel', quantity: 1 }] })).rejects.toThrow(/Line 13/);
  });
  it('leaves supplier lines to the supplier', async () => {
    db.greenEntry.findFirst.mockResolvedValue({ id: 'e1', source: 'supplier', category: 'supplier', period: '2026-12', quantity: 1, kg: 1 });
    await expect(updateBizEntry(me, 'o1', 'e1', { period: '2026-01', category: 'diesel', quantity: 1 })).rejects.toThrow(/supplier/);
  });
});

describe('the log', () => {
  it('finds a rewritten row', async () => {
    db.greenOrgMember.findUnique.mockResolvedValue({ role: 'editor' });
    await addBizEntry(me, 'o1', { period: '2026-03', category: 'diesel', quantity: 10 });
    const first = db.greenAudit.create.mock.calls[0][0].data;
    db.greenAudit.findFirst.mockResolvedValue({ hash: first.hash });
    await addBizEntry(me, 'o1', { period: '2026-04', category: 'diesel', quantity: 20 });
    const second = db.greenAudit.create.mock.calls[1][0].data;
    expect(second.prevHash).toBe(first.hash);
    expect(verifyChain([first, second])).toBeNull();
    expect(verifyChain([{ ...first, detail: 'Diesel, 2026-03: 1 L = 2.5 kg' }, second])).toBe(0);
  });
});

describe('companies', () => {
  it('makes me the owner of a company I start', async () => {
    db.greenOrgMember.count.mockResolvedValue(0);
    db.greenOrg.create.mockResolvedValue({ id: 'new' });
    await createBizOrg(me, { name: 'Acme', country: 'in', currency: 'inr' });
    expect(db.greenOrg.create.mock.calls[0][0].data).toMatchObject({ name: 'Acme', country: 'IN', currency: 'INR', kind: 'company', consultancyId: null });
    expect(db.greenOrgMember.create.mock.calls[0][0].data).toMatchObject({ orgId: 'new', userId: 'me', role: 'owner' });
  });
  it('makes a client only for a consultancy I work in', async () => {
    db.greenOrgMember.findUnique.mockResolvedValue({ role: 'editor' });
    await expect(createBizOrg(me, { name: 'Client', consultancyId: 'o1' })).rejects.toThrow(/Only a consultancy/);
  });
});

describe('share links', () => {
  it('shares a supplier’s emissions by what we spent with them', () => {
    expect(supplierShareKg(100_000, 1_000_000, 'USD', 100_000, 'USD')).toBe(10_000);
    expect(supplierShareKg(100_000, 1_000, 'USD', 5_000, 'USD')).toBe(100_000);
    expect(supplierShareKg(100_000, 0, 'USD', 5_000, 'USD')).toBe(0);
  });
  it('shows a supplier their form without the contact', async () => {
    db.greenSupplier.findUnique.mockResolvedValue({ id: 's1', orgId: 'o1', name: 'Steel Co', contact: 'ops@steel.test', year: 2026, status: 'asked', answer: null });
    const r = await carbonLink('s-abc');
    expect(JSON.stringify(r)).not.toContain('ops@steel.test');
    expect(r).toMatchObject({ kind: 'supplier', org: 'Acme', supplier: 'Steel Co' });
  });
  it('adds our share of a supplier’s answer to scope 3', async () => {
    db.greenSupplier.findUnique.mockResolvedValue({ id: 's1', orgId: 'o1', name: 'Steel Co', spend: 1_000_000, year: 2026, status: 'asked' });
    db.greenOrgMember.findMany.mockResolvedValue([]);
    await answerCarbonLink('S1', { scope1: 50, scope2: 50, revenue: 10_000_000, currency: 'INR' });
    expect(db.greenEntry.create.mock.calls[0][0].data).toMatchObject({ category: 'supplier', scope: 3, kg: 10_000, refId: 's1' });
  });
  it('counts a commute answer and keeps the survey within its cap', async () => {
    db.greenCommute.count.mockResolvedValue(0);
    db.greenCommute.findMany.mockResolvedValue([{ kgYear: 100 }]);
    const r = await answerCarbonLink('CABC', { mode: 'car', kmOneWay: 10, daysWeek: 5 });
    expect(r).toMatchObject({ kgYear: expect.any(Number) });
    expect(db.greenEntry.create.mock.calls[0][0].data).toMatchObject({ category: 'commute', kg: 1000 }); // 1 answer scaled to 10 staff
    db.greenCommute.count.mockResolvedValue(300);
    await expect(answerCarbonLink('CABC', { mode: 'car', kmOneWay: 10, daysWeek: 5 })).rejects.toThrow(/full/);
  });
});

describe('plans (M280)', () => {
  beforeEach(() => { db.greenOrgMember.findUnique.mockResolvedValue({ role: 'owner' }); featureOff.mockResolvedValue(false); });
  it('keeps a free company to its yearly lines and suppliers when the owner’s plans are on', async () => {
    db.greenEntry.count.mockResolvedValue(150);
    await expect(addBizEntry(me, 'o1', { period: '2026-01', category: 'diesel', quantity: 1 })).rejects.toThrow(/150 lines/);
    db.greenSupplier.count.mockResolvedValue(5);
    await expect(addBizSupplier(me, 'o1', { name: 'X' })).rejects.toThrow(/5 suppliers/);
    await expect(readBill(me, 'o1', { text: 'bill' })).rejects.toThrow(/Pro/);
  });
  it('lets a Pro company and a paying consultancy’s client through', async () => {
    db.greenEntry.count.mockResolvedValue(150);
    db.greenOrg.findUnique.mockResolvedValue({ ...org, tier: 'PRO' });
    await expect(addBizEntry(me, 'o1', { period: '2026-01', category: 'diesel', quantity: 1 })).resolves.toBeTruthy();
    db.greenOrg.findUnique.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(where.id === 'c1' ? { ...org, id: 'c1', kind: 'consultancy', tier: 'CONSULTANCY' } : { ...org, tier: 'FREE', consultancyId: 'c1' }));
    await expect(addBizEntry(me, 'o1', { period: '2026-01', category: 'diesel', quantity: 1 })).resolves.toBeTruthy();
  });
});

describe('data quality and sites (M276)', () => {
  beforeEach(() => db.greenOrgMember.findUnique.mockResolvedValue({ role: 'editor' }));
  it('keeps a line’s quality and site, money lines counting as spend', async () => {
    await addBizEntry(me, 'o1', { period: '2026-01', category: 'diesel', quantity: 1, quality: 'measured', site: 'Pune plant' });
    expect(db.greenEntry.create.mock.calls[0][0].data).toMatchObject({ quality: 'measured', site: 'Pune plant' });
    await addBizEntry(me, 'o1', { period: '2026-01', category: 'buy-it', quantity: 1000, quality: 'nonsense' });
    expect(db.greenEntry.create.mock.calls[1][0].data.quality).toBe('spend');
  });
  it('never lets a person type a worked-out line', async () => {
    await expect(addBizEntry(me, 'o1', { period: '2026-01', category: 'upstream', quantity: 1 })).rejects.toThrow(/what this line is/);
  });
});
