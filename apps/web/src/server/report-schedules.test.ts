import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { saveToMyFiles } from './space-files';
import { notify } from './email';
import { createSchedule, dueReportExports, nextRun, runSchedule, scheduleLabel } from './report-schedules';

vi.mock('@/lib/db', () => ({
  default: {
    reportSchedule: { count: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock('@/lib/r2', () => ({ hasR2Storage: () => false }));
vi.mock('./auth', () => ({ isOwnerEmail: (e: string) => e === 'owner@x.test' }));
vi.mock('./email', () => ({ notify: vi.fn() }));
vi.mock('./space-files', () => ({ saveToMyFiles: vi.fn() }));

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as Record<string, Record<string, Fn>>;
const admin = { id: 'a1' } as never;
const row = { id: 's1', ownerId: 'a1', type: 'members', filters: '{"role":"TEACHER"}', every: 'WEEK' };
const now = new Date('2026-10-21T08:00:00Z');

describe('scheduled report exports (Phase E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.reportSchedule.update.mockResolvedValue({});
    db.user.findMany.mockResolvedValue([{ name: 'T', email: 't@x.test', phone: null, role: 'TEACHER', status: 'ACTIVE', createdAt: now, impactLevel: 1, impactXP: 0, lastSeenAt: null }]);
  });

  it('is next due a day, a week or a calendar month after the last file (2 hours early)', () => {
    const last = new Date('2026-01-31T08:00:00Z');
    expect(nextRun('DAY', last).toISOString()).toBe('2026-02-01T06:00:00.000Z');
    expect(nextRun('WEEK', last).toISOString()).toBe('2026-02-07T06:00:00.000Z');
    expect(nextRun('MONTH', new Date('2026-03-15T08:00:00Z')).toISOString()).toBe('2026-04-15T06:00:00.000Z');
    expect(nextRun('WEEK', null).getTime()).toBe(0);
  });

  it('names a members export by its filters', () => {
    expect(scheduleLabel('members', { role: 'TEACHER', status: 'ACTIVE' })).toBe('Members (teachers, active)');
    expect(scheduleLabel('impact', {})).toBe('Impact points ledger');
  });

  it('checks the report, how often and the filters, and stops at 10', async () => {
    await expect(createSchedule(admin, { type: 'toString', every: 'WEEK' })).rejects.toThrow('Choose a report');
    await expect(createSchedule(admin, { type: 'members', every: 'HOURLY' })).rejects.toThrow('how often');
    db.reportSchedule.count.mockResolvedValue(10);
    await expect(createSchedule(admin, { type: 'members', every: 'DAY' })).rejects.toThrow('up to 10');
    db.reportSchedule.count.mockResolvedValue(0);
    db.reportSchedule.create.mockImplementation(({ data }) => ({ id: 's2', lastRunAt: null, lastError: null, createdAt: now, ...data }));
    const s = await createSchedule(admin, { type: 'members', every: 'DAY', role: 'teacher', status: 'nonsense' });
    expect(db.reportSchedule.create.mock.calls[0][0].data.filters).toBe('{"role":"TEACHER"}');
    expect(s.label).toBe('Members (teachers)');
  });

  it('saves a CSV to My files and notes it in the app (no email)', async () => {
    db.user.findUnique.mockResolvedValue({ role: 'ADMIN', status: 'ACTIVE', email: 'a@x.test', ownedOrganization: { plan: 'PRO', subscriptionStatus: 'active' } });
    const r = await runSchedule(row, now);
    expect(r).toEqual({ ok: true, name: 'Members (teachers) 2026-10-21.csv' });
    expect(db.user.findMany.mock.calls[0][0].where).toEqual({ role: 'TEACHER' });
    const [owner, folder, file] = (saveToMyFiles as unknown as Fn).mock.calls[0];
    expect([owner, folder, file.mime]).toEqual(['a1', 'Scheduled reports', 'text/csv']);
    expect(file.bytes.toString('utf8')).toContain('t@x.test');
    expect((notify as unknown as Fn).mock.calls[0][1].email).toBe(false);
    expect(db.reportSchedule.update.mock.calls[0][0].data).toEqual({ lastRunAt: now, lastError: null });
  });

  it('keeps a problem on the schedule instead of failing: no Pro plan, no longer an admin', async () => {
    db.user.findUnique.mockResolvedValue({ role: 'ADMIN', status: 'ACTIVE', email: 'a@x.test', ownedOrganization: { plan: 'STARTER', subscriptionStatus: null } });
    expect(await runSchedule(row, now)).toEqual({ ok: false, error: 'Data exports need the Pro plan.' });
    db.user.findUnique.mockResolvedValue({ role: 'ADMIN', status: 'ACTIVE', email: 'owner@x.test', ownedOrganization: null });
    expect((await runSchedule(row, now)).ok).toBe(true);
    db.user.findUnique.mockResolvedValue({ role: 'TEACHER', status: 'ACTIVE', email: 'a@x.test', ownedOrganization: null });
    expect((await runSchedule(row, now)).ok).toBe(false);
    expect(saveToMyFiles).toHaveBeenCalledTimes(1);
  });

  it('runs only the schedules that are due, while the run has room', async () => {
    db.user.findUnique.mockResolvedValue({ role: 'ADMIN', status: 'ACTIVE', email: 'owner@x.test', ownedOrganization: null });
    db.reportSchedule.findMany.mockResolvedValue([
      { ...row, id: 'new', lastRunAt: null },
      { ...row, id: 'weekly-not-yet', lastRunAt: new Date('2026-10-18T08:00:00Z') },
      { ...row, id: 'daily-due', every: 'DAY', lastRunAt: new Date('2026-10-20T08:00:00Z') },
    ]);
    expect(await dueReportExports(() => 40, now)).toEqual({ done: true, info: 2 });
    expect(await dueReportExports(() => 10, now)).toEqual({ done: false, info: 0 });
  });
});
