import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { kmBetween } from '@/lib/relief';
import { ForbiddenException, NotFoundException } from './http';
import { orgRole } from './relief-orgs';

// M314: an emergency's timeline and report (Relief → Organisations → Overview). For one incident an
// organisation declared: when it started and ended, people marking themselves safe hour by hour, the
// needs and offers posted inside its area while it ran (taken, delivered, people helped), what went out
// of the organisation's supplies and its volunteer shifts. Members of the organisation only; counts and
// titles, never who asked or where exactly (posts are already rounded to about 500 m).

const HOUR = 3600_000;

/** GET /relief/orgs/:id/incidents: the organisation's emergencies, newest first. */
export async function orgIncidents(u: SessionUser, orgId: string) {
  if (!(await orgRole(u.id, orgId))) throw new ForbiddenException('Only its members see its emergencies.');
  const rows = await prisma.reliefIncident.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, title: true, place: true, createdAt: true, endsAt: true } });
  const safe = rows.length ? await prisma.reliefSafe.groupBy({ by: ['incidentId'], where: { incidentId: { in: rows.map((r) => r.id) } }, _count: { _all: true } }) : [];
  return { incidents: rows.map((r) => ({ id: r.id, title: r.title, place: r.place, startedAt: r.createdAt, endsAt: r.endsAt, safe: safe.find((x) => x.incidentId === r.id)?._count._all ?? 0, over: r.endsAt <= new Date() })) };
}

/** GET /relief/incidents/:id/report */
export async function incidentReport(u: SessionUser, id: string) {
  const i = await prisma.reliefIncident.findUnique({ where: { id } });
  if (!i) throw new NotFoundException('That emergency is gone.');
  if (!(await orgRole(u.id, i.orgId))) throw new ForbiddenException('Only its organisation’s members see its report.');
  const start = i.createdAt, end = i.endsAt < new Date() ? i.endsAt : new Date();
  const dLat = i.radiusKm / 111, dLng = i.radiusKm / (111 * Math.max(0.1, Math.cos((i.lat * Math.PI) / 180)));
  const [safe, near, moves, shifts, org] = await Promise.all([
    prisma.reliefSafe.findMany({ where: { incidentId: id }, select: { createdAt: true }, take: 5000 }),
    prisma.reliefPost.findMany({ where: { createdAt: { gte: start, lte: end }, lat: { gte: i.lat - dLat, lte: i.lat + dLat }, lng: { gte: i.lng - dLng, lte: i.lng + dLng } }, select: { id: true, type: true, kind: true, title: true, people: true, status: true, lat: true, lng: true, createdAt: true, takenAt: true, doneAt: true }, take: 1000 }),
    prisma.reliefSupplyMove.findMany({ where: { orgId: i.orgId, change: { lt: 0 }, createdAt: { gte: start, lte: end } }, select: { supplyId: true, change: true }, take: 3000 }),
    prisma.reliefShift.findMany({ where: { orgId: i.orgId, startsAt: { lte: end }, endsAt: { gte: start } }, select: { title: true, startsAt: true, endsAt: true, filled: true }, take: 100 }),
    prisma.reliefOrg.findUnique({ where: { id: i.orgId }, select: { name: true } }),
  ]);
  const posts = near.filter((p) => kmBetween(i, p) <= i.radiusKm);
  const needs = posts.filter((p) => p.type === 'NEED');
  const supplyIds = [...new Set(moves.map((m) => m.supplyId))].slice(0, 90);
  const supplies = supplyIds.length ? await prisma.reliefSupply.findMany({ where: { id: { in: supplyIds } }, select: { id: true, name: true, unit: true } }) : [];
  const used = supplies.map((s) => ({ name: s.name, unit: s.unit, out: moves.filter((m) => m.supplyId === s.id).reduce((a, m) => a - m.change, 0) })).sort((a, b) => b.out - a.out).slice(0, 8);
  // Safe check-ins per hour from the start (at most 7 days of hours).
  const hours = Math.min(168, Math.max(1, Math.ceil((end.getTime() - start.getTime()) / HOUR)));
  const safeByHour = Array.from({ length: hours }, (_, h) => safe.filter((s) => Math.floor((s.createdAt.getTime() - start.getTime()) / HOUR) === h).length);
  const timeline = [
    { at: start, kind: 'start', text: `Declared: ${i.title}${i.place ? ` (${i.place})` : ''}` },
    ...needs.map((p) => ({ at: p.createdAt, kind: 'need', text: `Need: ${p.title} (${p.people} ${p.people === 1 ? 'person' : 'people'})` })),
    ...needs.filter((p) => p.doneAt).map((p) => ({ at: p.doneAt!, kind: 'done', text: `Delivered: ${p.title}` })),
    ...shifts.map((s) => ({ at: s.startsAt, kind: 'shift', text: `Shift: ${s.title} (${s.filled} volunteers)` })),
    ...(i.endsAt <= new Date() ? [{ at: i.endsAt, kind: 'end', text: 'Ended' }] : []),
  ].sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 80);
  return {
    incident: { id: i.id, title: i.title, place: i.place, radiusKm: i.radiusKm, startedAt: start, endsAt: i.endsAt, over: i.endsAt <= new Date(), org: org?.name ?? '' },
    numbers: {
      hours: Math.round(((end.getTime() - start.getTime()) / HOUR) * 10) / 10,
      safe: safe.length,
      needs: needs.length, offers: posts.length - needs.length,
      taken: needs.filter((p) => p.status === 'TAKEN' || p.status === 'DONE').length,
      delivered: needs.filter((p) => p.status === 'DONE').length,
      helped: needs.filter((p) => p.status === 'DONE').reduce((a, p) => a + p.people, 0),
      shifts: shifts.length, volunteers: shifts.reduce((a, s) => a + s.filled, 0),
    },
    byKind: Object.entries(needs.reduce<Record<string, number>>((m, p) => ({ ...m, [p.kind]: (m[p.kind] ?? 0) + 1 }), {})).map(([kind, n]) => ({ kind, n })).sort((a, b) => b.n - a.n),
    safeByHour, used, timeline,
  };
}
