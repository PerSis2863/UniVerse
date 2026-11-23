import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { HOME_ENERGY, homeEnergyKg, type HomeEnergyKind } from '@/lib/green';
import { byMonth, compareLatest, MONTH_RE } from '@/lib/home-energy';
import { BadRequestException, HttpException, NotFoundException } from './http';
import { oneOf, str, type Body } from './body';
import { featureOff } from './moderation';
import { spendAi } from './ai-budget';
import { logAiUse } from './ai-receipts';
import { ghidraJsonImage } from './ghidra/brain';

// M317: home energy from bills (Green → Footprint). A person keeps each month's electricity, gas, oil or LPG
// bill (the amount on it), and sees the kg CO₂e per month and per person, against the same month a year
// before and their average. A photo of a bill can be read by AI to fill the form (one request, checked
// by the person before saving). Factors only from src/lib/green.ts.

const MAX_BILLS = 240;
const KINDS = Object.keys(HOME_ENERGY) as HomeEnergyKind[];
const country = (v: unknown) => { const s = (str(v) ?? '').trim().toUpperCase(); return /^[A-Z]{2}$/.test(s) ? s : null; };

/** GET /green/home */
export async function greenHome(u: SessionUser) {
  const [home, bills] = await Promise.all([
    prisma.greenHome.findUnique({ where: { userId: u.id } }),
    prisma.greenBill.findMany({ where: { userId: u.id }, orderBy: [{ month: 'desc' }, { kind: 'asc' }], take: MAX_BILLS }),
  ]);
  const people = home?.people ?? 1;
  const months = byMonth(bills.map((b) => ({ month: b.month, kind: b.kind as HomeEnergyKind, kg: b.kg })), people);
  const electricity = bills.filter((b) => b.kind === 'ELECTRICITY').slice(0, 12);
  return {
    home: { people, country: home?.country ?? null },
    bills: bills.map((b) => ({ id: b.id, month: b.month, kind: b.kind, amount: b.amount, unit: b.unit, greenTariff: b.greenTariff, kg: b.kg })),
    months: months.slice(-24), compare: compareLatest(months),
    // For the footprint's question: the bills' electricity in a typical month.
    kwhMonth: electricity.length ? Math.round(electricity.reduce((s, b) => s + b.amount, 0) / electricity.length) : null,
  };
}

/** PUT /green/home { people, country } */
export async function setGreenHome(u: SessionUser, b: Body) {
  const people = Math.min(20, Math.max(1, Math.round(Number(b.people) || 1)));
  const c = country(b.country);
  await prisma.greenHome.upsert({ where: { userId: u.id }, create: { userId: u.id, people, country: c }, update: { people, country: c } });
  // The grid changed: the electricity bills' kg follow it.
  const bills = await prisma.greenBill.findMany({ where: { userId: u.id, kind: 'ELECTRICITY' }, select: { id: true, amount: true, unit: true, greenTariff: true }, take: 60 });
  for (const x of bills) await prisma.greenBill.update({ where: { id: x.id }, data: { kg: homeEnergyKg('ELECTRICITY', x.amount, x.unit, { country: c, greenTariff: x.greenTariff }) } });
  return greenHome(u);
}

/** POST /green/home/bills { month, kind, amount, unit, greenTariff }: a month's bill (again for the same month and kind replaces it). */
export async function saveBill(u: SessionUser, b: Body) {
  const month = str(b.month) ?? '';
  if (!MONTH_RE.test(month) || month > new Date().toISOString().slice(0, 7)) throw new BadRequestException('Choose the month the bill is for.');
  if (!oneOf(KINDS, b.kind)) throw new BadRequestException('Choose what the bill is for.');
  const units = HOME_ENERGY[b.kind].units as readonly string[];
  const unit = typeof b.unit === 'string' && units.includes(b.unit) ? b.unit : units[0];
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) throw new BadRequestException('Type the amount on the bill.');
  if ((await prisma.greenBill.count({ where: { userId: u.id } })) >= MAX_BILLS) throw new BadRequestException('That’s 20 years of bills: remove some old ones first.');
  const home = await prisma.greenHome.findUnique({ where: { userId: u.id }, select: { country: true } });
  const greenTariff = b.kind === 'ELECTRICITY' && b.greenTariff === true;
  const kg = homeEnergyKg(b.kind, amount, unit, { country: home?.country, greenTariff });
  await prisma.greenBill.upsert({ where: { userId_month_kind: { userId: u.id, month, kind: b.kind } }, create: { userId: u.id, month, kind: b.kind, amount, unit, greenTariff, kg }, update: { amount, unit, greenTariff, kg } });
  return greenHome(u);
}

/** DELETE /green/home/bills/:id */
export async function removeBill(u: SessionUser, id: string) {
  const n = await prisma.greenBill.deleteMany({ where: { id, userId: u.id } });
  if (!n.count) throw new NotFoundException('That bill isn’t there any more.');
  return greenHome(u);
}

const SYSTEM = 'You read a household energy bill. Give what it is for (ELECTRICITY, GAS, OIL or LPG), the month it covers (YYYY-MM, the end of the period if it spans two), the amount used and its unit (kWh, m3 or L). Use the amount used, never the price. If it shows several kinds, give the main one.';
const SCHEMA = { type: 'OBJECT', properties: { kind: { type: 'STRING' }, month: { type: 'STRING' }, amount: { type: 'NUMBER' }, unit: { type: 'STRING' } }, required: ['kind', 'amount'] };
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

/** POST /green/home/read { image: { mimeType, data } }: what a bill's photo says, to fill the form (not saved). */
export async function readHomeBill(u: SessionUser, b: Body) {
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) throw new HttpException('Reading bills is off right now: type the amount in.', 503);
  const img = b.image && typeof b.image === 'object' ? (b.image as Body) : null;
  const mimeType = img && typeof img.mimeType === 'string' && IMAGE_TYPES.includes(img.mimeType) ? img.mimeType : null;
  const data = img && typeof img.data === 'string' && img.data.length <= 6_000_000 ? img.data : null;
  if (!mimeType || !data) throw new BadRequestException('Add a photo or PDF of the bill (6 MB at most).');
  const spend = await spendAi(u);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  await logAiUse(u.id, { kind: 'home-bill', detail: 'Read an energy bill for Green' });
  const out = await ghidraJsonImage<Body>('home-energy', SYSTEM, 'Read this bill.', { mimeType, data }, SCHEMA, 300);
  const kind = oneOf(KINDS, out?.kind) ? out.kind : null;
  const units = kind ? (HOME_ENERGY[kind].units as readonly string[]) : [];
  const amount = Number(out?.amount);
  return {
    kind, month: typeof out?.month === 'string' && MONTH_RE.test(out.month) ? out.month : null,
    amount: Number.isFinite(amount) && amount > 0 && amount <= 100_000 ? Math.round(amount * 10) / 10 : null,
    unit: typeof out?.unit === 'string' && units.includes(out.unit) ? out.unit : units[0] ?? null,
    left: spend.left,
  };
}
