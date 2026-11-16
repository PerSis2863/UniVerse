import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { PLAN_EMPTY, readAlerts, readKit, readPlan, type Alert } from '@/lib/relief-plus';
import type { Body } from './body';
import { cached } from './travel';

// UniVerse Relief's second wave (M217): live disaster alerts (read once for everyone, kept 15 minutes: one
// fetch however many people look), a person's own emergency plan and go-bag, and their volunteer hours.

const MIN = 60_000, UA = 'UniVerseRelief/1.0 (https://github.com/PerSis2863/UniVerse; disaster alerts)';
const get = async (url: string) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  return r.ok ? r.json() : null;
};

/** GET /relief/alerts: GDACS's orange and red alerts and USGS's week of M4.5+ earthquakes. */
export async function reliefAlerts() {
  const alerts = await cached<Alert[]>('relief:alerts', 15 * MIN, async () => {
    const [gdacs, usgs] = await Promise.all([
      get('https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ,TC,FL,VO,DR,WF&alertlevel=Orange;Red').catch(() => null),
      get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson').catch(() => null),
    ]);
    if (!gdacs && !usgs) return null; // keep the last good list
    return readAlerts(gdacs, usgs, Date.now());
  });
  return { alerts: alerts ?? [], credit: 'Alerts: GDACS (UN and European Commission) and the US Geological Survey' };
}

/** GET /relief/plan: my own plan and go-bag. */
export async function reliefPlan(u: SessionUser) {
  const row = await prisma.reliefPlan.findUnique({ where: { userId: u.id } });
  return { plan: row ? readPlan(JSON.parse(row.plan)) : PLAN_EMPTY, kit: row ? readKit(JSON.parse(row.kit)) : [], updatedAt: row?.updatedAt ?? null };
}
/** PUT /relief/plan { plan?, kit? } */
export async function saveReliefPlan(u: SessionUser, b: Body) {
  const data: { plan?: string; kit?: string } = {};
  if ('plan' in b) data.plan = JSON.stringify(readPlan(b.plan));
  if ('kit' in b) data.kit = JSON.stringify(readKit(b.kit));
  await prisma.reliefPlan.upsert({ where: { userId: u.id }, create: { userId: u.id, ...data }, update: data });
  return reliefPlan(u);
}

/** GET /relief/hours: shifts I signed up for that are over, their hours, by organisation. */
export async function reliefHours(u: SessionUser) {
  const signups = await prisma.reliefShiftSignup.findMany({ where: { userId: u.id }, select: { shiftId: true }, take: 500 });
  const shifts = signups.length ? await prisma.reliefShift.findMany({ where: { id: { in: signups.map((s) => s.shiftId) }, endsAt: { lt: new Date() } }, select: { id: true, orgId: true, title: true, startsAt: true, endsAt: true }, orderBy: { startsAt: 'desc' } }) : [];
  const orgs = shifts.length ? await prisma.reliefOrg.findMany({ where: { id: { in: [...new Set(shifts.map((s) => s.orgId))] } }, select: { id: true, name: true } }) : [];
  const hours = (s: { startsAt: Date; endsAt: Date }) => Math.max(0, Math.min(24, (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000));
  return {
    total: Math.round(shifts.reduce((n, s) => n + hours(s), 0) * 10) / 10,
    shifts: shifts.map((s) => ({ id: s.id, title: s.title, org: orgs.find((o) => o.id === s.orgId)?.name ?? 'An organisation', startsAt: s.startsAt, hours: Math.round(hours(s) * 10) / 10 })),
  };
}
