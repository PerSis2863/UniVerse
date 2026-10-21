import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { saveToMyFiles } from './space-files';
import { notify } from './email';
import { deleteFile } from '@/lib/storage';
import { createSchedule, dueReportExports, nextDue, runSchedule, scheduleLabel } from './report-schedules';

vi.mock('@/lib/db', () => ({
  default: {
    reportSchedule: { count: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    spaceFile: { findMany: vi.fn(), delete: vi.fn() },
    $queryRawUnsafe: vi.fn(),
  },
}));
vi.mock('@/lib/storage', () => ({ SERVER_UPLOAD_MAX: 4 * 1024 * 1024, deleteFile: vi.fn(async () => {}) }));
vi.mock('@/lib/r2', () => ({ hasR2Storage: () => false }));
vi.mock('./auth', () => ({ isOwnerEmail: (e: string) => e === 'owner@x.test' }));
vi.mock('./email', () => ({ notify: vi.fn(async () => {}) }));
vi.mock('./space-files', () => ({ saveToMyFiles: vi.fn() }));

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as Record<string, Record<string, Fn>> & { $queryRawUnsafe: Fn };
const admin = { id: 'a1' } as never;
const row = { id: 's1', ownerId: 'a1', type: 'members', filters: '{"role":"TEACHER"}', every: 'WEEK', lastError: null };
const now = new Date('2026-10-21T08:15:00Z');
const pro = { role: 'ADMIN', status: 'ACTIVE', email: 'a@x.test', ownedOrganization: { plan: 'PRO', subscriptionStatus: 'active' } };

describe('scheduled report exports (Phase E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.reportSchedule.update.mockResolvedValue({});
    db.spaceFile.findMany.mockResolvedValue([]);
    db.$queryRawUnsafe.mockResolvedValue([{ name: 'T', email: 't@x.test', phone: null, role: 'TEACHER', status: 'ACTIVE', accountType: null, impactLevel: 1, impactXP: 0, lastSeenAt: null, createdAt: '2026-01-01T00:00:00.000+00:00', sDept: null, year: null, gpa: null, tDept: 'Physics', designation: null }]);
  });

  it('is next due on the UTC day a day, a week or a month after the last file', () => {
    const last = new Date('2026-01-31T15:00:00Z');
    expect(nextDue('DAY', last).toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(nextDue('WEEK', last).toISOString()).toBe('2026-02-07T00:00:00.000Z');
    expect(nextDue('MONTH', last).toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(nextDue('MONTH', new Date('2026-03-15T08:00:00Z')).toISOString()).toBe('2026-04-15T00:00:00.000Z');
    // "Save now" late in the day: tomorrow's run still makes the daily file.
    expect(nextDue('DAY', new Date('2026-10-20T23:00:00Z')) <= now).toBe(true);
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
    db.reportSchedule.create.mockImplementation(({ data }) => ({ id: 's2', dueAt: now, lastRunAt: null, lastError: null, createdAt: now, ...data }));
    const s = await createSchedule(admin, { type: 'members', every: 'DAY', role: 'teacher', status: 'nonsense' });
    expect(db.reportSchedule.create.mock.calls[0][0].data.filters).toBe('{"role":"TEACHER"}');
    expect(s.label).toBe('Members (teachers)');
  });

  it('moves the schedule on first, then saves a CSV to My files and notes it in the app (no email)', async () => {
    db.user.findUnique.mockResolvedValue(pro);
    const r = await runSchedule(row, now);
    expect(r).toEqual({ ok: true, name: 'Members (teachers) 2026-10-21.csv' });
    expect(db.reportSchedule.update.mock.calls[0][0].data).toEqual({ lastRunAt: now, dueAt: new Date('2026-10-28T00:00:00Z') });
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(db.$queryRawUnsafe.mock.calls[0].slice(1, 3)).toEqual(['TEACHER', 'TEACHER']);
    const [owner, folder, file] = (saveToMyFiles as unknown as Fn).mock.calls[0];
    expect([owner, folder, file.mime]).toEqual(['a1', 'Scheduled reports', 'text/csv']);
    expect(file.bytes.toString('utf8')).toContain('t@x.test,,TEACHER,ACTIVE,,Physics');
    expect((notify as unknown as Fn).mock.calls[0][1].email).toBe(false);
  });

  it('keeps the newest files of a schedule, deleting older ones', async () => {
    db.user.findUnique.mockResolvedValue(pro);
    db.spaceFile.findMany.mockResolvedValue([{ id: 'old', url: '/api/files/k/old.csv' }]);
    await runSchedule(row, now);
    expect(db.spaceFile.findMany.mock.calls[0][0]).toMatchObject({ skip: 11, where: { name: { startsWith: 'Members (teachers) ' } } });
    expect(deleteFile).toHaveBeenCalledWith('/api/files/k/old.csv');
    expect(db.spaceFile.delete).toHaveBeenCalledWith({ where: { id: 'old' } });
  });

  it('keeps a problem on the schedule and notes it once: no Pro plan, no longer an admin, My files full', async () => {
    db.user.findUnique.mockResolvedValue({ ...pro, ownedOrganization: { plan: 'STARTER', subscriptionStatus: null } });
    expect(await runSchedule(row, now)).toEqual({ ok: false, error: 'Data exports need the Pro plan.' });
    expect((notify as unknown as Fn).mock.calls[0][1]).toMatchObject({ title: 'Scheduled report not saved: Members (teachers)', email: false });
    await runSchedule({ ...row, lastError: 'Data exports need the Pro plan.' }, now);
    expect(notify).toHaveBeenCalledTimes(1);
    db.user.findUnique.mockResolvedValue({ ...pro, email: 'owner@x.test', ownedOrganization: null });
    expect((await runSchedule(row, now)).ok).toBe(true);
    db.user.findUnique.mockResolvedValue({ ...pro, role: 'TEACHER' });
    expect((await runSchedule(row, now)).ok).toBe(false);
    db.user.findUnique.mockResolvedValue(pro);
    (saveToMyFiles as unknown as Fn).mockRejectedValueOnce(new Error('Your files are full (100 MB).'));
    expect(await runSchedule(row, now)).toEqual({ ok: false, error: 'Your files are full (100 MB).' });
  });

  it('runs the schedules due by today, at most 2 a run, while the run has room', async () => {
    db.user.findUnique.mockResolvedValue(pro);
    db.reportSchedule.findMany.mockResolvedValue([{ ...row, id: 'a' }, { ...row, id: 'b' }, { ...row, id: 'c' }]);
    expect(await dueReportExports(() => 40, now)).toEqual({ done: false, info: 2 });
    expect(db.reportSchedule.findMany.mock.calls[0][0]).toMatchObject({ where: { dueAt: { lte: now } }, orderBy: { dueAt: 'asc' } });
    db.reportSchedule.findMany.mockResolvedValue([{ ...row, id: 'a' }]);
    expect(await dueReportExports(() => 40, now)).toEqual({ done: true, info: 1 });
    expect(await dueReportExports(() => 10, now)).toEqual({ done: false, info: 0 });
  });
});
