import crypto from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { dppScore, gtin14, hasDpp, mergeSupply, parseDpp, parseSupplyAnswer, readDpp, type SupplyAnswer } from '@/lib/dpp';
import { toBase32 } from '@/lib/trace';
import { BadRequestException, NotFoundException } from './http';
import { str, type Body } from './body';
import { notifyMany } from './email';
import { brandOf, short } from './trace';

// The EU Digital Product Passport for UniVerse Trace (M108, migration 0194; rules in src/lib/dpp.ts).
// A brand gives a product its GTIN and passport; anyone reads it on the unit's page (/t/<code>), on
// the product's page (/dpp?g=<GTIN>) and as JSON (GET /trace/dpp/<GTIN>), and GS1 Digital Link
// addresses (/01/<GTIN>/21/<code>) lead there (cloudflare/page-match.ts). Suppliers fill in their own
// material from a link, without an account (/supply?k=<secret>); only a hash of the secret is kept,
// and nothing they send reaches the passport until the brand adds it.

const DAY = 86_400_000;
const LINK_DAYS = 60;
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => toBase32(crypto.randomBytes(20), 32);

async function ownProduct(u: SessionUser, id: string) {
  const b = await brandOf(u);
  const p = await prisma.traceProduct.findUnique({ where: { id } });
  if (!p || p.brandId !== b.id) throw new NotFoundException('Product not found');
  return { b, p };
}

/** PUT /trace/products/:id/dpp { gtin, dpp }: the product's GTIN and passport (the brand). */
export async function saveDpp(u: SessionUser, id: string, body: Body) {
  await ownProduct(u, id);
  const raw = typeof body.gtin === 'string' ? body.gtin.trim() : '';
  const gtin = raw ? gtin14(raw) : null;
  if (raw && !gtin) throw new BadRequestException('That GTIN isn’t right: 8, 12, 13 or 14 digits, the last one the check digit.');
  if (gtin && (await prisma.traceProduct.findFirst({ where: { gtin, id: { not: id } }, select: { id: true } }))) throw new BadRequestException('Another product already uses that GTIN.');
  const dpp = parseDpp(body.dpp);
  await prisma.traceProduct.update({ where: { id }, data: { gtin, dpp: JSON.stringify(dpp), dppUpdatedAt: new Date() } });
  return { gtin, dpp, score: dppScore(dpp, gtin) };
}

/** What anyone may see of a product's passport (no unit, nothing about people). */
function publicView(p: { name: string; category: string | null; description: string | null; imageUrl: string | null; gtin: string | null; dpp: string | null; dppUpdatedAt: Date | null }, brand: { name: string; slug: string; logoUrl: string | null } | null) {
  const dpp = readDpp(p.dpp);
  return {
    gtin: p.gtin, product: { name: p.name, category: p.category, description: p.description, imageUrl: p.imageUrl },
    brand: brand ? { name: brand.name, slug: brand.slug, logoUrl: brand.logoUrl } : null,
    dpp: hasDpp(dpp) ? dpp : null, updatedAt: p.dppUpdatedAt,
  };
}

/** GET /trace/dpp/:gtin (public): the product's passport, also machine-readable for customs and recyclers. */
export async function publicDpp(raw: string) {
  const gtin = gtin14(raw);
  const p = gtin ? await prisma.traceProduct.findUnique({ where: { gtin } }) : null;
  if (!p || p.sample) throw new NotFoundException('No product passport has that GTIN.');
  const brand = p.brandId ? await prisma.traceBrand.findUnique({ where: { id: p.brandId }, select: { name: true, slug: true, logoUrl: true } }) : null;
  return publicView(p, brand);
}

// ─── Supplier requests ──────────────────────────────────────────────────────────────────────

type Req = { id: string; supplier: string; asks: string; status: string; answer: string | null; answeredAt: Date | null; usedAt: Date | null; createdAt: Date; expiresAt: Date };
const view = (r: Req) => ({ id: r.id, supplier: r.supplier, asks: r.asks, status: r.status, answer: r.answer ? parseSupplyAnswer(JSON.parse(r.answer)) : null, answeredAt: r.answeredAt, usedAt: r.usedAt, createdAt: r.createdAt, expiresAt: r.expiresAt });

/** GET /trace/products/:id/supply: this product's supplier requests (never their links' secrets). */
export async function supplyRequests(u: SessionUser, id: string) {
  await ownProduct(u, id);
  const rows = await prisma.traceSupplyRequest.findMany({ where: { productId: id }, orderBy: { createdAt: 'desc' }, take: 50 });
  return rows.map(view);
}

/** POST /trace/products/:id/supply { supplier, asks }: a link to send the supplier (shown this once). */
export async function askSupplier(u: SessionUser, id: string, body: Body) {
  const { b } = await ownProduct(u, id);
  const supplier = short(body.supplier, 120), asks = short(body.asks, 200);
  if (!supplier || !asks) throw new BadRequestException('Say who the supplier is and which material or part to describe.');
  if ((await prisma.traceSupplyRequest.count({ where: { productId: id, status: 'OPEN' } })) >= 30) throw new BadRequestException('This product has 30 open requests. Close some first.');
  const token = newToken();
  const r = await prisma.traceSupplyRequest.create({ data: { brandId: b.id, productId: id, supplier, asks, tokenHash: sha(token), createdById: u.id, expiresAt: new Date(Date.now() + LINK_DAYS * DAY) } });
  return { id: r.id, link: `/supply?k=${token}` };
}

async function ownRequest(u: SessionUser, rid: string) {
  const b = await brandOf(u);
  const r = await prisma.traceSupplyRequest.findUnique({ where: { id: rid } });
  if (!r || r.brandId !== b.id) throw new NotFoundException('Request not found');
  return r;
}

/** POST /trace/supply/:rid/link: a new link (the old one stops working), for another 60 days. */
export async function newSupplyLink(u: SessionUser, rid: string) {
  const r = await ownRequest(u, rid);
  if (r.status === 'USED' || r.status === 'CLOSED') throw new BadRequestException('This request is finished.');
  const token = newToken();
  await prisma.traceSupplyRequest.update({ where: { id: rid }, data: { tokenHash: sha(token), expiresAt: new Date(Date.now() + LINK_DAYS * DAY) } });
  return { link: `/supply?k=${token}` };
}

/** POST /trace/supply/:rid/use: the supplier's answer goes into the passport. */
export async function useSupplyAnswer(u: SessionUser, rid: string) {
  const r = await ownRequest(u, rid);
  const answer = r.answer ? parseSupplyAnswer(JSON.parse(r.answer)) : null;
  if (r.status !== 'ANSWERED' || !answer) throw new BadRequestException('There is no answer to add yet.');
  const p = await prisma.traceProduct.findUnique({ where: { id: r.productId }, select: { dpp: true, gtin: true } });
  const dpp = mergeSupply(readDpp(p?.dpp), answer);
  await prisma.traceProduct.update({ where: { id: r.productId }, data: { dpp: JSON.stringify(dpp), dppUpdatedAt: new Date() } });
  await prisma.traceSupplyRequest.update({ where: { id: rid }, data: { status: 'USED', usedAt: new Date() } });
  return { dpp, score: dppScore(dpp, p?.gtin ?? null) };
}

/** POST /trace/supply/:rid/close: no longer needed (the link stops working). */
export async function closeSupplyRequest(u: SessionUser, rid: string) {
  await ownRequest(u, rid);
  await prisma.traceSupplyRequest.update({ where: { id: rid }, data: { status: 'CLOSED' } });
  return { ok: true };
}

/** The request behind a supplier's link, if it's still open to answers. */
async function byToken(raw: unknown) {
  const token = str(raw)?.trim().toUpperCase();
  const r = token && /^[0-9A-Z]{32}$/.test(token) ? await prisma.traceSupplyRequest.findUnique({ where: { tokenHash: sha(token) } }) : null;
  if (!r || r.status === 'USED' || r.status === 'CLOSED' || r.expiresAt.getTime() < Date.now()) throw new NotFoundException('This link has ended. Ask the brand for a new one.');
  return r;
}

/** GET /trace/supplier?k= (public): what the brand asks, and the answer so far. */
export async function supplierView(k: unknown) {
  const r = await byToken(k);
  const [p, b] = await Promise.all([
    prisma.traceProduct.findUnique({ where: { id: r.productId }, select: { name: true, category: true } }),
    prisma.traceBrand.findUnique({ where: { id: r.brandId }, select: { name: true, logoUrl: true } }),
  ]);
  return { brand: b?.name ?? 'A brand', logoUrl: b?.logoUrl ?? null, product: p?.name ?? 'a product', category: p?.category ?? null, supplier: r.supplier, asks: r.asks, answer: r.answer ? parseSupplyAnswer(JSON.parse(r.answer)) : null, expiresAt: r.expiresAt };
}

/** POST /trace/supplier { k, answer } (public): the supplier's answer (they can correct it until it's used). */
export async function supplierAnswer(body: Body) {
  const r = await byToken(body.k);
  const answer: SupplyAnswer | null = parseSupplyAnswer(body.answer);
  if (!answer) throw new BadRequestException('Name the material at least.');
  await prisma.traceSupplyRequest.update({ where: { id: r.id }, data: { answer: JSON.stringify(answer), status: 'ANSWERED', answeredAt: new Date() } });
  // The brand hears about the first answer; corrections after it don't ring again.
  if (r.status !== 'OPEN') return { ok: true };
  const members = await prisma.traceBrandMember.findMany({ where: { brandId: r.brandId }, select: { userId: true }, take: 20 });
  const p = await prisma.traceProduct.findUnique({ where: { id: r.productId }, select: { name: true } });
  await notifyMany(members.map((m) => m.userId), { type: 'trace', title: `${r.supplier} answered for ${p?.name ?? 'a product'}`, body: `${answer.material.name}${answer.material.origin ? ` from ${answer.material.origin}` : ''}. Add it to the passport from the product.`, link: '/trace', email: false });
  return { ok: true };
}
