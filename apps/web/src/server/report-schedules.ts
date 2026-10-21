import prisma from '@/lib/db';
import { SERVER_UPLOAD_MAX } from '@/lib/storage';
import { hasR2Storage } from '@/lib/r2';
import { effectivePlan, hasFeature, type PlanId } from '@/lib/plans';
import type { SessionUser } from '@/lib/server-auth';
import { oneOf, text } from './body';
import { isOwnerEmail } from './auth';
import { notify } from './email';
import { BadRequestException, NotFoundException } from './http';
import { EXPORTS, ROLES, STATUSES, isExportType, type ExportType } from './report-exports';
import { saveToMyFiles } from './space-files';

// Scheduled report exports (Stage 5 · Phase E; Admin → Reports → Scheduled exports). An admin picks
// a data export and how often; the daily jobs (daily-jobs.ts `report-exports`) save a fresh CSV to
// their My files, in a "Scheduled reports" folder, and tell them in the app. No email: the file is
// in My files, where they can open, share or download it.

export const EVERY = ['DAY', 'WEEK', 'MONTH'] as const;
export type Every = (typeof EVERY)[number];
export const LABELS: Record<ExportType, string> = { members: 'Members', impact: 'Impact points ledger', applications: 'NGO applications' };
export const FOLDER = 'Scheduled reports';
/** Per admin. */
export const MAX_SCHEDULES = 10;
const HOUR = 3_600_000;

/** When a schedule is next due: a day, a week or a calendar month after the last file (2 hours early, so the daily run never slips a day). */
export function nextRun(every: string, lastRunAt: Date | null): Date {
  if (!lastRunAt) return new Date(0);
  const next = new Date(lastRunAt);
  if (every === 'DAY') next.setUTCDate(next.getUTCDate() + 1);
  else if (every === 'MONTH') next.setUTCMonth(next.getUTCMonth() + 1);
  else next.setUTCDate(next.getUTCDate() + 7);
  return new Date(next.getTime() - 2 * HOUR);
}

type Filters = { role?: string; status?: string };
function parseFilters(raw: string | null): Filters {
  try { const f = JSON.parse(raw ?? '{}') as Filters; return f && typeof f === 'object' ? f : {}; } catch { return {}; }
}

/** A short file-name-safe name, e.g. "Members (teachers, active)". */
export function scheduleLabel(type: string, f: Filters) {
  const label = isExportType(type) ? LABELS[type] : type;
  const parts = [f.role && `${f.role.toLowerCase().replace('_', ' ')}s`, f.status?.toLowerCase()].filter(Boolean);
  return parts.length ? `${label} (${parts.join(', ')})` : label;
}

const shape = (s: { id: string; type: string; filters: string | null; every: string; lastRunAt: Date | null; lastError: string | null; createdAt: Date }) => ({
  id: s.id, type: s.type, every: s.every, filters: parseFilters(s.filters), label: scheduleLabel(s.type, parseFilters(s.filters)),
  lastRunAt: s.lastRunAt, lastError: s.lastError, nextRunAt: s.lastRunAt ? nextRun(s.every, s.lastRunAt) : null, createdAt: s.createdAt,
});

/** GET /api/admin/report-schedules — this admin's schedules. */
export async function listSchedules(user: SessionUser) {
  const rows = await prisma.reportSchedule.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: 'asc' }, take: MAX_SCHEDULES });
  return { schedules: rows.map(shape), max: MAX_SCHEDULES, folder: FOLDER };
}

/** POST /api/admin/report-schedules { type, every, role?, status? } */
export async function createSchedule(user: SessionUser, b: Record<string, unknown>) {
  if (!isExportType(b.type)) throw new BadRequestException('Choose a report.');
  if (!oneOf(EVERY, b.every)) throw new BadRequestException('Choose how often: every day, week or month.');
  const filters: Filters = {};
  if (b.type === 'members') {
    const role = text(b.role).toUpperCase(), status = text(b.status).toUpperCase();
    if (oneOf(ROLES, role)) filters.role = role;
    if (oneOf(STATUSES, status)) filters.status = status;
  }
  if ((await prisma.reportSchedule.count({ where: { ownerId: user.id } })) >= MAX_SCHEDULES) throw new BadRequestException(`You can have up to ${MAX_SCHEDULES} scheduled exports. Remove one first.`);
  const s = await prisma.reportSchedule.create({ data: { ownerId: user.id, type: b.type, every: b.every, filters: Object.keys(filters).length ? JSON.stringify(filters) : null } });
  return shape(s);
}

/** DELETE /api/admin/report-schedules/:id — stops it (the files already saved stay). */
export async function deleteSchedule(user: SessionUser, id: string) {
  const s = await prisma.reportSchedule.findFirst({ where: { id, ownerId: user.id }, select: { id: true, type: true, filters: true } });
  if (!s) throw new NotFoundException('That scheduled export isn’t there any more.');
  await prisma.reportSchedule.delete({ where: { id: s.id } });
  return { ok: true, label: scheduleLabel(s.type, parseFilters(s.filters)) };
}

type Row = { id: string; ownerId: string; type: string; filters: string | null; every: string };

/** Makes one export and saves it to the owner's My files. Never throws: a problem is kept on the schedule (shown in the tab). */
export async function runSchedule(s: Row, now = new Date()): Promise<{ ok: boolean; name?: string; error?: string }> {
  const finish = async (error: string | null) => {
    await prisma.reportSchedule.update({ where: { id: s.id }, data: { lastRunAt: now, lastError: error } });
    return error ? { ok: false, error } : { ok: true };
  };
  try {
    const owner = await prisma.user.findUnique({ where: { id: s.ownerId }, select: { role: true, status: true, email: true, ownedOrganization: { select: { plan: true, subscriptionStatus: true } } } });
    if (!owner || owner.role !== 'ADMIN' || owner.status !== 'ACTIVE') return await finish('Only an active admin’s exports are made.');
    const plan: PlanId = isOwnerEmail(owner.email) ? 'ENTERPRISE' : effectivePlan(owner.ownedOrganization as { plan: PlanId; subscriptionStatus: string | null } | null);
    if (!hasFeature(plan, 'data_exports')) return await finish('Data exports need the Pro plan.');
    if (!isExportType(s.type)) return await finish('This report isn’t available any more.');
    const f = parseFilters(s.filters);
    const params = new URLSearchParams(Object.entries(f).filter(([, v]) => typeof v === 'string') as [string, string][]);
    const bytes = Buffer.from('﻿' + (await EXPORTS[s.type](params)), 'utf8');
    // Without R2 a file is kept in the database, whose rows hold at most 2 MB.
    if (bytes.length > (hasR2Storage() ? SERVER_UPLOAD_MAX : 1_900_000)) return await finish('The file is too big to save. Narrow it with a role or status.');
    const label = scheduleLabel(s.type, f);
    const name = `${label} ${now.toISOString().slice(0, 10)}.csv`;
    await saveToMyFiles(s.ownerId, FOLDER, { name, mime: 'text/csv', bytes });
    await finish(null);
    await notify(s.ownerId, { type: 'info', title: `Report saved: ${label}`, body: `${name} is in My files → ${FOLDER}.`, link: '/files', email: false });
    return { ok: true, name };
  } catch (e) {
    return finish((e instanceof Error ? e.message : 'Something went wrong.').slice(0, 300)).catch(() => ({ ok: false, error: 'Something went wrong.' }));
  }
}

/** The daily step: the schedules that are due, while the run has room (about 12 queries each). */
export async function dueReportExports(left: () => number, now = new Date()): Promise<{ done: boolean; info: number }> {
  const rows = await prisma.reportSchedule.findMany({
    where: { OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(now.getTime() - 20 * HOUR) } }] },
    orderBy: { createdAt: 'asc' },
    take: 50,
    select: { id: true, ownerId: true, type: true, filters: true, every: true, lastRunAt: true },
  });
  let made = 0;
  for (const s of rows.filter((r) => nextRun(r.every, r.lastRunAt) <= now)) {
    if (left() < 14) return { done: false, info: made };
    if ((await runSchedule(s, now)).ok) made++;
  }
  return { done: true, info: made };
}
