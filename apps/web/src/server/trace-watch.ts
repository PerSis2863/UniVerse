import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { areaOf, cleanWatch, mayTell, prune, THRESHOLDS } from '@/lib/trace-watch';
import { notifyMany } from './email';
import { ForbiddenException } from './http';
import { type Body } from './body';
import { brandOf } from './trace';

// M308: area alerts for copies. When a scan comes out suspect or a buyer reports a fake, the brand's
// watch (src/lib/trace-watch.ts) names the area; once that area has had `threshold` likely copies in a
// day, the brand's team hears it in the app (one alert per area per day). Runs after the answer (later()),
// only for suspect scans and reports, so ordinary checks cost nothing more.

const DAY = 86_400_000;
const readSent = (s: string | null): Record<string, string> => { try { const v = JSON.parse(s ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };

/** A likely copy was seen (a suspect scan or a reported fake): tell the brand if its area crossed the line. */
export async function copySeen(brandId: string, at: { country: string | null; lat: number | null; lng: number | null }, product: string | null) {
  const brand = await prisma.traceBrand.findUnique({ where: { id: brandId }, select: { watch: true, watchSent: true } });
  if (!brand) return 0;
  const w = cleanWatch(brand.watch);
  const area = areaOf(w, at);
  const sent = readSent(brand.watchSent);
  if (!area || !mayTell(sent, area)) return 0;
  const since = new Date(Date.now() - DAY);
  const where = area.startsWith('c:')
    ? { country: area.slice(2) }
    : (() => { const [la, ln] = area.slice(2).split(',').map(Number); return { lat: { gte: la, lt: la + 0.5 }, lng: { gte: ln, lt: ln + 0.5 } }; })();
  const [scans, reports] = await Promise.all([
    prisma.traceScan.count({ where: { brandId, verdict: 'SUSPECT', createdAt: { gt: since }, ...(area.startsWith('c:') ? where : { geoLat: (where as { lat: object }).lat, geoLng: (where as { lng: object }).lng }) } }),
    prisma.traceFakeReport.count({ where: { brandId, createdAt: { gt: since }, ...where } }),
  ]);
  const n = scans + reports;
  if (n < w.threshold) return 0;
  // Claim the area for today first (no transactions in D1: a second alert at the same moment is the worst case).
  await prisma.traceBrand.update({ where: { id: brandId }, data: { watchSent: JSON.stringify({ ...prune(sent), [area]: new Date().toISOString() }) } });
  const team = await prisma.traceBrandMember.findMany({ where: { brandId }, select: { userId: true }, take: 50 });
  const where2 = area.startsWith('c:') ? `in ${area.slice(2)}` : `around ${area.slice(2).replace(',', ', ')}`;
  await notifyMany(team.map((m) => m.userId), { type: 'trace', title: `${n} likely ${n === 1 ? 'copy' : 'copies'} ${where2} today`, body: `${product ? `${product}: ` : ''}${scans} suspect ${scans === 1 ? 'check' : 'checks'} and ${reports} ${reports === 1 ? 'report' : 'reports'} of fakes in the last 24 hours. See them on your Radar.`, link: '/trace/radar', email: false });
  return n;
}

/** GET /trace/watch: the brand's area alerts and the areas told in the last two days. */
export async function getWatch(u: SessionUser) {
  const b = await brandOf(u);
  const row = await prisma.traceBrand.findUnique({ where: { id: b.id }, select: { watch: true, watchSent: true } });
  return { watch: cleanWatch(row?.watch), thresholds: THRESHOLDS, recent: Object.entries(prune(readSent(row?.watchSent ?? null))).map(([area, at]) => ({ area, at })) };
}

/** PUT /trace/watch { countries, threshold, anywhere } (the brand's owner). */
export async function setWatch(u: SessionUser, b: Body) {
  const brand = await brandOf(u);
  const me = await prisma.traceBrandMember.findFirst({ where: { brandId: brand.id, userId: u.id }, select: { role: true } });
  if (me?.role !== 'OWNER' && !u.owner) throw new ForbiddenException('Only the brand’s owner changes its alerts.');
  const watch = cleanWatch(b);
  await prisma.traceBrand.update({ where: { id: brand.id }, data: { watch: JSON.stringify(watch) } });
  return { watch };
}
