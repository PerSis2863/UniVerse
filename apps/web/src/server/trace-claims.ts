import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { brandMoves, isClaimStatus, isOpen, ownerMayWithdraw, readTimeline, CLAIM_LABEL, type ClaimStatus, type TimelineEntry } from '@/lib/trace-claims';
import { notify, notifyMany } from './email';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { str, text, type Body } from './body';
import { publish } from './realtime';
import { brandOf } from './trace';

// M309: warranty claims from start to finish. The owner of a unit (its vault row) whose warranty is still
// running claims: what's wrong and maybe a photo (an app file). The brand's team works the queue: in
// review, approved, then repaired / replaced / refunded, or refused with a reason, then closed. Each step
// goes into the claim's timeline and is told to the other side in the app (never email). A repair is
// written into the passport's repair history (trace_repairs), as the brand's.

const long = (v: unknown, n: number) => text(v).trim().slice(0, n);
const photo = (v: unknown) => { const s = (str(v) ?? '').trim(); return /^\/api\/files\/(?!.*\.\.)[\w./-]+$/.test(s) ? s : null; };
const step = (status: ClaimStatus, note: string | null, by: 'owner' | 'brand'): TimelineEntry => ({ at: new Date().toISOString(), status, note, by });
const keys = ['/trace/claims', '/trace/claims/mine'];

/** POST /trace/vault/:id/claim { issue, photoUrl? }: the owner claims on a unit's warranty. */
export async function fileClaim(u: SessionUser, ownerRowId: string, b: Body) {
  const own = await prisma.traceOwner.findUnique({ where: { id: ownerRowId } });
  if (!own || own.userId !== u.id) throw new NotFoundException('Not in your vault.');
  const warranty = await prisma.traceWarranty.findFirst({ where: { codeId: own.codeId }, select: { endsAt: true } });
  if (!warranty) throw new BadRequestException('Register the warranty first, from the product’s passport.');
  if (warranty.endsAt < new Date()) throw new BadRequestException('Its warranty has ended.');
  if (await prisma.traceClaim.findFirst({ where: { codeId: own.codeId, status: { notIn: ['CLOSED', 'WITHDRAWN'] } }, select: { id: true } })) throw new BadRequestException('There is already a claim open for it.');
  const issue = long(b.issue, 2000);
  if (issue.length < 10) throw new BadRequestException('Say what’s wrong, in a sentence or two.');
  const claim = await prisma.traceClaim.create({ data: { codeId: own.codeId, brandId: own.brandId, productId: own.productId, userId: u.id, issue, photoUrl: photo(b.photoUrl), timeline: JSON.stringify([step('OPEN', null, 'owner')]) }, select: { id: true } });
  const [team, product] = await Promise.all([
    prisma.traceBrandMember.findMany({ where: { brandId: own.brandId }, select: { userId: true }, take: 50 }),
    prisma.traceProduct.findUnique({ where: { id: own.productId }, select: { name: true } }),
  ]);
  await notifyMany(team.map((m) => m.userId), { type: 'trace', title: `New warranty claim: ${product?.name ?? 'a product'}`, body: issue.slice(0, 140), link: '/trace?view=claims', email: false });
  publish(team.map((m) => m.userId), { type: 'refresh', keys });
  return { claim };
}

const view = (c: { id: string; codeId: string; issue: string; photoUrl: string | null; status: string; timeline: string; createdAt: Date; updatedAt: Date }) =>
  ({ id: c.id, code: c.codeId, issue: c.issue, photoUrl: c.photoUrl, status: c.status as ClaimStatus, timeline: readTimeline(c.timeline), createdAt: c.createdAt, updatedAt: c.updatedAt });

/** GET /trace/claims/mine: my claims, newest first. */
export async function myClaims(u: SessionUser) {
  const rows = await prisma.traceClaim.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  const products = await prisma.traceProduct.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.productId))].slice(0, 90) } }, select: { id: true, name: true } });
  return { claims: rows.map((r) => ({ ...view(r), product: products.find((p) => p.id === r.productId)?.name ?? '' })) };
}

/** GET /trace/claims?open=1: the brand's queue (open ones first), with the owner's first name only. */
export async function brandClaims(u: SessionUser, q: Record<string, unknown>) {
  const brand = await brandOf(u);
  const rows = await prisma.traceClaim.findMany({ where: { brandId: brand.id, ...(q.open === '1' ? { status: { notIn: ['CLOSED', 'WITHDRAWN'] } } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 });
  const [products, people, warranties] = await Promise.all([
    prisma.traceProduct.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.productId))].slice(0, 90) } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))].slice(0, 90) } }, select: { id: true, name: true } }),
    prisma.traceWarranty.findMany({ where: { codeId: { in: rows.map((r) => r.codeId).slice(0, 90) } }, select: { codeId: true, endsAt: true } }),
  ]);
  const claims = rows.map((r) => ({ ...view(r), product: products.find((p) => p.id === r.productId)?.name ?? '', owner: (people.find((p) => p.id === r.userId)?.name ?? 'The owner').split(/\s+/)[0], warrantyEnds: warranties.find((w) => w.codeId === r.codeId)?.endsAt ?? null, next: brandMoves(r.status as ClaimStatus) }));
  return { claims, open: claims.filter((c) => isOpen(c.status)).length };
}

/** POST /trace/claims/:id/status { status, note }: the brand moves a claim on (a refusal needs a reason). */
export async function moveClaim(u: SessionUser, id: string, b: Body) {
  const brand = await brandOf(u);
  const c = await prisma.traceClaim.findUnique({ where: { id } });
  if (!c || c.brandId !== brand.id) throw new NotFoundException('That claim isn’t there any more.');
  if (!isClaimStatus(b.status) || !brandMoves(c.status as ClaimStatus).includes(b.status)) throw new BadRequestException('That step doesn’t follow from where the claim is.');
  const note = long(b.note, 1000) || null;
  if (b.status === 'REFUSED' && !note) throw new BadRequestException('Say why it’s refused: the owner sees it.');
  const done = await prisma.traceClaim.updateMany({ where: { id, status: c.status }, data: { status: b.status, timeline: JSON.stringify([...readTimeline(c.timeline), step(b.status, note, 'brand')]) } });
  if (!done.count) throw new BadRequestException('Someone else just moved this claim. Look again.');
  // A repair goes into the passport's repair history, as the brand's.
  if (b.status === 'REPAIRED') await prisma.traceRepair.create({ data: { codeId: c.codeId, brandId: c.brandId, productId: c.productId, userId: u.id, by: brand.name, what: `Warranty repair${note ? `: ${note}` : ''}`.slice(0, 200) } });
  await notify(c.userId, { type: 'trace', title: `Your warranty claim: ${CLAIM_LABEL[b.status]}`, body: note ?? `${brand.name} updated your claim.`, link: '/trace/vault', email: false });
  publish([c.userId], { type: 'refresh', keys });
  return { ok: true };
}

/** POST /trace/claims/:id/withdraw: the owner takes a claim back before a decision. */
export async function withdrawClaim(u: SessionUser, id: string) {
  const c = await prisma.traceClaim.findUnique({ where: { id } });
  if (!c || c.userId !== u.id) throw new NotFoundException('That claim isn’t yours.');
  if (!ownerMayWithdraw(c.status as ClaimStatus)) throw new ForbiddenException('The brand has decided already.');
  await prisma.traceClaim.update({ where: { id }, data: { status: 'WITHDRAWN', timeline: JSON.stringify([...readTimeline(c.timeline), step('WITHDRAWN', null, 'owner')]) } });
  return { ok: true };
}
