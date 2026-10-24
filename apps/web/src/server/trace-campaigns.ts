import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { inArea } from '@/lib/trace';
import { BadRequestException, NotFoundException } from './http';
import { oneOf, str, type Body } from './body';
import { award } from './trace-wallet';

// Pay per verified scan (UniVerse Trace campaigns, migration 0178): a brand offers a bonus for every
// genuine claim of its products in an area (a country, or a circle round a city), up to a budget of
// points. UniVerse's fee is per campaign scan (feeCents), so a brand pays only for proven sales.

const FEE_CENTS = 5;
const n = (v: unknown, min: number, max: number) => { const x = Number(v); return Number.isFinite(x) && x >= min && x <= max ? x : null; };

export function listCampaigns(brandId: string) {
  return prisma.traceCampaign.findMany({ where: { brandId }, orderBy: { createdAt: 'desc' } });
}

export async function createCampaign(brandId: string, u: SessionUser, b: Body) {
  const title = str(b.title)?.trim().slice(0, 100);
  if (!title) throw new BadRequestException('Name the campaign.');
  const bonusPoints = n(b.bonusPoints, 1, 10_000), budgetPoints = n(b.budgetPoints, 1, 100_000_000);
  if (bonusPoints === null || budgetPoints === null || budgetPoints < bonusPoints) throw new BadRequestException('Set a bonus per scan and a budget at least that big.');
  const productId = str(b.productId) || null;
  if (productId) {
    const p = await prisma.traceProduct.findUnique({ where: { id: productId }, select: { brandId: true } });
    if (!p || p.brandId !== brandId) throw new NotFoundException('Product not found');
  }
  const country = str(b.country)?.trim().toUpperCase().slice(0, 2) || null;
  const lat = n(b.lat, -90, 90), lng = n(b.lng, -180, 180), radiusKm = n(b.radiusKm, 1, 3000);
  const circle = lat !== null && lng !== null && radiusKm !== null;
  const endsAt = str(b.endsAt) && !Number.isNaN(Date.parse(str(b.endsAt)!)) ? new Date(str(b.endsAt)!) : null;
  return prisma.traceCampaign.create({
    data: {
      brandId, productId, title, bonusPoints: Math.round(bonusPoints), budgetPoints: Math.round(budgetPoints), feeCents: FEE_CENTS,
      country: country && /^[A-Z]{2}$/.test(country) ? country : null, lat: circle ? lat : null, lng: circle ? lng : null, radiusKm: circle ? radiusKm : null,
      place: str(b.place)?.trim().slice(0, 120) || null, endsAt, createdById: u.id,
    },
  });
}

export async function setCampaignStatus(brandId: string, id: string, status: unknown) {
  const c = await prisma.traceCampaign.findUnique({ where: { id } });
  if (!c || c.brandId !== brandId) throw new NotFoundException('Campaign not found');
  if (!oneOf(['ACTIVE', 'PAUSED', 'ENDED'] as const, status)) throw new BadRequestException('Active, paused or ended.');
  return prisma.traceCampaign.update({ where: { id }, data: { status } });
}

/**
 * After a genuine claim: every running campaign of the brand that covers this product and place pays
 * its bonus, as long as its budget lasts (the budget is taken in one guarded update, so two claims at
 * the same moment can't overspend it).
 */
export async function applyCampaigns(x: { brandId: string; productId: string; userId: string; codeId: string; here: { lat: number; lng: number } | null; country: string | null }) {
  const now = new Date();
  const running = await prisma.traceCampaign.findMany({
    where: { brandId: x.brandId, status: 'ACTIVE', AND: [{ OR: [{ productId: null }, { productId: x.productId }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, { OR: [{ startsAt: null }, { startsAt: { lte: now } }] }] },
  });
  const paid: { campaignId: string; title: string; points: number }[] = [];
  for (const c of running) {
    if (!inArea(c, x.here, x.country)) continue;
    const took = await prisma.traceCampaign.updateMany({ where: { id: c.id, spentPoints: { lte: c.budgetPoints - c.bonusPoints } }, data: { spentPoints: { increment: c.bonusPoints }, scans: { increment: 1 } } });
    if (!took.count) continue;
    await award(x.userId, x.brandId, 'CAMPAIGN', c.bonusPoints, { campaignId: c.id, codeId: x.codeId, note: c.title });
    paid.push({ campaignId: c.id, title: c.title, points: c.bonusPoints });
  }
  return paid;
}
