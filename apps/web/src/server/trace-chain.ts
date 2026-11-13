import crypto from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { HANDLER_ROLES, ROLE_NOTE, canRecord, viewFor, type ChainRole } from '@/lib/trace-chain';
import { STAGES, formatCode, toBase32 } from '@/lib/trace';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { oneOf, str, type Body } from './body';
import { publish } from './realtime';
import { brandOf, cfPosition, position, same, short, unitOf } from './trace';

// M173: Trace across the supply chain (the owner, 13 Nov 2026). Who scans a unit decides what they see
// (src/lib/trace-chain.ts SEES): the brand's own people everything; its team (warehouses, drivers,
// shops, added by an invite link) and a driver holding a shipment's link (/carry/<key>) the trip and
// what their job needs, never the price for drivers and warehouses; everyone else the shopper's
// passport. Staff record stops (place from their phone or the network, rounded to 0.1°, and the time);
// their scans aren't shoppers' checks, so they never set a unit's first place or trip the copy alarm.

type Unit = NonNullable<Awaited<ReturnType<typeof unitOf>>>;

/** Who is scanning: a driver with the shipment's link, the brand's people, its team by role, or a buyer. */
export async function chainRole(batch: { brandId: string | null; carrierKey: string | null }, user: SessionUser | null, key: unknown): Promise<ChainRole> {
  const k = str(key);
  if (k && batch.carrierKey && same(k, batch.carrierKey)) return 'DRIVER';
  if (!user || !batch.brandId) return 'BUYER';
  const [member, handler] = await Promise.all([
    prisma.traceBrandMember.findFirst({ where: { brandId: batch.brandId, userId: user.id }, select: { userId: true } }),
    prisma.traceHandler.findUnique({ where: { brandId_userId: { brandId: batch.brandId, userId: user.id } }, select: { role: true } }),
  ]);
  if (member) return 'BRAND';
  return handler && oneOf(HANDLER_ROLES, handler.role) ? handler.role : 'BUYER';
}

/** Where a request is, by the network: "City, CC". */
const placeOf = (req: Request) => { const { cf } = cfPosition(req); return [cf?.city, cf?.country].filter(Boolean).join(', ') || null; };

/** A staff member's view of a unit: its trip so far and what their role needs. */
export async function staffView(unit: Unit, role: ChainRole, req: Request) {
  const { batch, id, serial } = unit, p = batch.product;
  const [events, brand, code] = await Promise.all([
    // The newest 80 stops (put back in order below): the oldest 80 would hide where it is now.
    prisma.traceEvent.findMany({ where: { batchId: batch.id }, orderBy: { createdAt: 'desc' }, take: 80, select: { stage: true, place: true, createdAt: true, role: true, actorId: true } }).then((e) => e.reverse()),
    batch.brandId ? prisma.traceBrand.findUnique({ where: { id: batch.brandId }, select: { name: true, logoUrl: true } }) : null,
    prisma.traceCode.findUnique({ where: { id }, select: { scanCount: true } }),
  ]);
  // Names only for the brand, and only of the people who recorded a stop.
  const ids = role === 'BRAND' ? [...new Set(events.map((e) => e.actorId).filter(Boolean))].slice(0, 80) as string[] : [];
  const names = new Map((ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  const view = viewFor(role, {
    price: p.price, currency: p.currency,
    batch: { label: batch.label, quantity: batch.quantity },
    handling: { maxTempC: p.maxTempC, weightKg: p.weightKg },
    destination: batch.destPlace,
    stops: events.map((e) => ({ stage: e.stage, place: e.place, at: e.createdAt.toISOString(), role: e.role, by: e.actorId ? names.get(e.actorId) ?? null : null })),
    scans: code?.scanCount ?? 0,
  });
  return {
    result: 'STAFF' as const, code: formatCode(id), serial: serial + 1, note: ROLE_NOTE[role], status: batch.status,
    brand: { name: brand?.name ?? 'UniVerse', logoUrl: brand?.logoUrl ?? null },
    product: { name: p.name, category: p.category, description: p.description, imageUrl: p.imageUrl },
    here: { place: placeOf(req), at: new Date().toISOString() },
    ...view,
  };
}

/**
 * POST /trace/scan/:code/stop { stage, lat?, lng?, place?, note?, key? }: the scanner records a stop of
 * the unit's batch, if their role may (ROLE_STOPS). The same stop of the batch at the same place within ten
 * minutes is the same stop (a double tap, every unit of a pallet). Positions are rounded to 0.1° (no shop or person can
 * be found); the brand's team sees it live on Tracking.
 */
export async function recordStop(raw: string, body: Body, user: SessionUser | null, req: Request) {
  const unit = await unitOf(raw);
  if (!unit) throw new NotFoundException('That code isn’t one of ours.');
  const { batch, id } = unit;
  const role = await chainRole(batch, user, body.key);
  if (!oneOf(STAGES, body.stage) || !canRecord(role, body.stage)) throw new ForbiddenException(role === 'BUYER' ? 'Only the brand and its supply-chain team record stops.' : 'Your role can’t record that stop.');
  const stage = body.stage;
  const pos = position(body) ?? cfPosition(req).geo;
  const at = pos && { lat: Math.round(pos.lat * 10) / 10, lng: Math.round(pos.lng * 10) / 10 };
  // A stop is the batch's, so scanning each unit of a pallet in one place records it once (not once a unit).
  const recent = await prisma.traceEvent.findFirst({ where: { batchId: batch.id, stage, lat: at?.lat ?? null, lng: at?.lng ?? null, createdAt: { gt: new Date(Date.now() - 10 * 60_000) } }, select: { id: true } });
  if (!recent) {
    await prisma.traceEvent.create({ data: { batchId: batch.id, brandId: batch.brandId, stage, place: short(body.place, 160) ?? placeOf(req), lat: at?.lat, lng: at?.lng, note: short(body.note, 300), actorId: user?.id ?? null, role, codeId: id } });
    const status = stage === 'SHOP' ? 'DELIVERED' : stage === 'SHIPPED' || stage === 'DISTRIBUTOR' ? 'IN_TRANSIT' : null;
    if (status && batch.status !== status) await prisma.traceBatch.update({ where: { id: batch.id }, data: { status } });
    if (batch.brandId) {
      const team = await prisma.traceBrandMember.findMany({ where: { brandId: batch.brandId }, select: { userId: true } });
      publish(team.map((m) => m.userId), { type: 'refresh', keys: ['/trace/tracking*'] });
    }
  }
  return { ok: true, again: !!recent, view: await staffView(unit, role, req) };
}

// ─── The brand's team ───

/** GET /trace/team: the brand's warehouses, drivers and shops, and its invite links. */
export async function team(u: SessionUser) {
  const brand = await brandOf(u);
  const [handlers, invites] = await Promise.all([
    prisma.traceHandler.findMany({ where: { brandId: brand.id }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, role: true, createdAt: true, userId: true } }),
    prisma.traceHandlerInvite.findMany({ where: { brandId: brand.id }, orderBy: { createdAt: 'desc' }, take: 20, select: { code: true, role: true, uses: true, createdAt: true } }),
  ]);
  const ids = handlers.map((h) => h.userId); // long lists are split for D1 (src/lib/d1-split.ts)
  const people = new Map((ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((x) => [x.id, x.name]));
  return { handlers: handlers.map((h) => ({ id: h.id, role: h.role, since: h.createdAt, name: people.get(h.userId) ?? 'Someone' })), invites };
}

/** POST /trace/team/invites { role }: a link that adds whoever opens it (signed in) as a warehouse, driver or shop. */
export async function createInvite(u: SessionUser, body: Body) {
  const brand = await brandOf(u);
  if (!oneOf(HANDLER_ROLES, body.role)) throw new BadRequestException('Pick warehouse, driver or shop.');
  const count = await prisma.traceHandlerInvite.count({ where: { brandId: brand.id } });
  if (count >= 20) throw new BadRequestException('You have 20 invite links: remove one first.');
  const code = toBase32(crypto.randomBytes(10), 16);
  await prisma.traceHandlerInvite.create({ data: { code, brandId: brand.id, role: body.role, createdById: u.id } });
  return { code, role: body.role, path: `/trace?join=${code}` };
}

export async function removeInvite(u: SessionUser, code: string) {
  const brand = await brandOf(u);
  await prisma.traceHandlerInvite.deleteMany({ where: { code, brandId: brand.id } });
  return { ok: true };
}

export async function removeHandler(u: SessionUser, id: string) {
  const brand = await brandOf(u);
  await prisma.traceHandler.deleteMany({ where: { id, brandId: brand.id } });
  return { ok: true };
}

const inviteOf = async (code: string) => {
  const inv = /^[0-9A-Z]{16}$/.test(code) ? await prisma.traceHandlerInvite.findUnique({ where: { code } }) : null;
  const brand = inv ? await prisma.traceBrand.findUnique({ where: { id: inv.brandId }, select: { id: true, name: true, logoUrl: true } }) : null;
  if (!inv || !brand || !oneOf(HANDLER_ROLES, inv.role)) throw new NotFoundException('This invite link no longer works. Ask the brand for a new one.');
  return { inv, brand, role: inv.role };
};

/** GET /trace/join/:code (signed in): which brand and role the link is for. */
export async function joinInfo(u: SessionUser, code: string) {
  const { brand, role } = await inviteOf(code);
  const already = await prisma.traceHandler.findUnique({ where: { brandId_userId: { brandId: brand.id, userId: u.id } }, select: { role: true } });
  return { brand: { name: brand.name, logoUrl: brand.logoUrl }, role, already: already?.role ?? null };
}

/** POST /trace/join/:code: joins the brand's team in the link's role (the brand's own people can't). */
export async function join(u: SessionUser, code: string) {
  const { inv, brand, role } = await inviteOf(code);
  const member = await prisma.traceBrandMember.findFirst({ where: { brandId: brand.id, userId: u.id }, select: { userId: true } });
  if (member) throw new BadRequestException('You run this brand: you already see everything.');
  await prisma.traceHandler.upsert({ where: { brandId_userId: { brandId: brand.id, userId: u.id } }, create: { brandId: brand.id, userId: u.id, role }, update: { role } });
  await prisma.traceHandlerInvite.update({ where: { code: inv.code }, data: { uses: { increment: 1 } } });
  return { ok: true, brand: brand.name, role };
}

