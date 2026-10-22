import prisma from '@/lib/db';
import { SERVER_UPLOAD_MAX, deleteFile } from '@/lib/storage';
import { hasR2Storage } from '@/lib/r2';
import { effectivePlan, hasFeature, type PlanId } from '@/lib/plans';
import type { SessionUser } from '@/lib/server-auth';
import { oneOf, text } from './body';
import { isOwnerEmail } from './auth';
import { notify } from './email';
import { BadRequestException, NotFoundException } from './http';
import { EXPORTS, ROLES, STATUSES, isExportType, type ExportType } from './report-exports';
import { saveToMyFiles } from './space-files';
import { schoolsOf } from './school-scope';

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
/** Files kept per schedule: older ones are deleted when a new one is saved, so My files doesn't fill up. */
export const KEEP = 12;

/**
 * The UTC day the next file is due: a day, a week or a month after the day of the last one (the
 * daily run picks it up whenever it gets to it that day). A month from the 31st is the month's last day.
 */
export function nextDue(every: string, last: Date): Date {
  const y = last.getUTCFullYear(), m = last.getUTCMonth(), d = last.getUTCDate();
  if (every === 'DAY') return new Date(Date.UTC(y, m, d + 1));
  if (every === 'MONTH') return new Date(Date.UTC(y, m + 1, Math.min(d, new Date(Date.UTC(y, m + 2, 0)).getUTCDate())));
  return new Date(Date.UTC(y, m, d + 7));
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

const shape = (s: { id: string; type: string; filters: string | null; every: string; dueAt: Date; lastRunAt: Date | null; lastError: string | null; createdAt: Date }) => ({
  id: s.id, type: s.type, every: s.every, filters: parseFilters(s.filters), label: scheduleLabel(s.type, parseFilters(s.filters)),
  lastRunAt: s.lastRunAt, lastError: s.lastError, nextRunAt: s.lastRunAt ? s.dueAt : null, createdAt: s.createdAt,
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

type Row = { id: string; ownerId: string; type: string; filters: string | null; every: string; lastError?: string | null };

/** Deletes a schedule's oldest files in the folder, keeping `keep` (its files are named "<label> <date>.csv"). */
async function pruneOld(ownerId: string, label: string, keep: number) {
  const old = await prisma.spaceFile.findMany({
    where: { spaceKind: 'me', spaceId: ownerId, folder: { name: FOLDER, parentId: null }, name: { startsWith: `${label} ` } },
    orderBy: { createdAt: 'desc' },
    skip: keep,
    take: 5,
    select: { id: true, url: true },
  });
  for (const f of old) {
    await deleteFile(f.url).catch(() => {});
    await prisma.spaceFile.delete({ where: { id: f.id } });
  }
}

/**
 * Makes one export and saves it to the owner's My files. The schedule is moved on to its next day
 * first, so a run that fails half-way (D1's query limit, the CPU limit) can't try it again and again.
 * Never throws: a problem is kept on the schedule (shown in the tab) and noted in the app once.
 */
export async function runSchedule(s: Row, now = new Date()): Promise<{ ok: boolean; name?: string; error?: string }> {
  const label = scheduleLabel(s.type, parseFilters(s.filters));
  await prisma.reportSchedule.update({ where: { id: s.id }, data: { lastRunAt: now, dueAt: nextDue(s.every, now) } });
  const failed = async (error: string) => {
    await prisma.reportSchedule.update({ where: { id: s.id }, data: { lastError: error } }).catch(() => {});
    // Once per new problem, not every day it happens again.
    if (error !== s.lastError) await notify(s.ownerId, { type: 'info', title: `Scheduled report not saved: ${label}`, body: error, link: '/admin/reports', email: false }).catch(() => {});
    return { ok: false, error };
  };
  try {
    const owner = await prisma.user.findUnique({ where: { id: s.ownerId }, select: { id: true, organizationId: true, role: true, status: true, email: true, ownedOrganization: { select: { plan: true, subscriptionStatus: true } } } });
    if (!owner || owner.role !== 'ADMIN' || owner.status !== 'ACTIVE') return await failed('Only an active admin’s exports are made.');
    const plan: PlanId = isOwnerEmail(owner.email) ? 'ENTERPRISE' : effectivePlan(owner.ownedOrganization as { plan: PlanId; subscriptionStatus: string | null } | null);
    if (!hasFeature(plan, 'data_exports')) return await failed('Data exports need the Pro plan.');
    if (!isExportType(s.type)) return await failed('This report isn’t available any more.');
    const f = parseFilters(s.filters);
    const params = new URLSearchParams(Object.entries(f).filter(([, v]) => typeof v === 'string') as [string, string][]);
    // The admin's own school only, as when they download it (school-scope.ts).
    const schools = await schoolsOf({ id: owner.id, organizationId: owner.organizationId, owner: isOwnerEmail(owner.email) });
    const bytes = Buffer.from('\uFEFF' + (await EXPORTS[s.type](params, schools)), 'utf8');
    // Without R2 a file is kept in the database, whose rows hold at most 2 MB.
    if (bytes.length > (hasR2Storage() ? SERVER_UPLOAD_MAX : 1_900_000)) return await failed(s.type === 'members' ? 'The file is too big to save. Narrow it with a role or status.' : 'The file is too big to save. Download it from Admin → Reports instead.');
    const name = `${label} ${now.toISOString().slice(0, 10)}.csv`;
    await pruneOld(s.ownerId, label, KEEP - 1);
    await saveToMyFiles(s.ownerId, FOLDER, { name, mime: 'text/csv', bytes });
    if (s.lastError !== null && s.lastError !== undefined) await prisma.reportSchedule.update({ where: { id: s.id }, data: { lastError: null } });
    await notify(s.ownerId, { type: 'info', title: `Report saved: ${label}`, body: `${name} is in My files → ${FOLDER}.`, link: '/files', email: false });
    return { ok: true, name };
  } catch (e) {
    return failed((e instanceof Error ? e.message : 'Something went wrong.').slice(0, 300));
  }
}

/** The daily step: the schedules due today, oldest due first, at most 2 a run (each file is CPU work) while the run has room. */
export async function dueReportExports(left: () => number, now = new Date()): Promise<{ done: boolean; info: number }> {
  const rows = await prisma.reportSchedule.findMany({
    where: { dueAt: { lte: now } },
    orderBy: { dueAt: 'asc' },
    take: 3,
    select: { id: true, ownerId: true, type: true, filters: true, every: true, lastError: true },
  });
  let made = 0;
  for (const [i, s] of rows.entries()) {
    if (i >= 2 || left() < 16) return { done: false, info: made };
    if ((await runSchedule(s, now)).ok) made++;
  }
  return { done: true, info: made };
}
