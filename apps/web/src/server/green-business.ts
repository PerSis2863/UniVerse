import { createHash } from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import {
  CATEGORIES, COMMUTE, CURRENCIES, LEVERS, MADE, S3_CATEGORIES, SCREEN, USD_PER, categoryById, commuteKgYear, defaultQuality, factorFor, isPeriod,
  isQuality, kgFor, leverCuts, targetPath, totals, yearOf, type Lever, type LeverId, type Line, type Screen,
} from '@/lib/carbon-ledger';
import { bizCredits, billingOf, needPro, verificationFor, LIMITS } from './green-business-plus';
import { parseDpp, readDpp } from '@/lib/dpp';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from './http';
import { first, str, type Body, type Query } from './body';
import { num, short } from './trace';
import { notify } from './email';
import { spendAi } from './ai-budget';
import { featureOff } from './moderation';
import { geminiJson, geminiJsonImage } from './gemini';
import { logAiUse } from './ai-receipts';

// Green → Business (M269–M275): a company's carbon footprint, GHG Protocol scopes 1–3 (src/lib/carbon.ts). A company
// has members (owner, editor, viewer); a consultancy is a company of kind 'consultancy' whose members work on its
// client companies (consultancyId) as editors (its owners as owners). Every change goes into a hash-chained log
// (green_audit) that an auditor may read through a link. Suppliers, staff and auditors reach the company through
// unguessable codes (S…, C…, A…) on the public page /carbon/[code]: those answers never carry an email or a phone,
// and the log holds no names. The server always works the numbers out itself from quantity × factor.

// M278: a verifier reads like a viewer, and asks questions and signs in Verify.
export type Role = 'owner' | 'editor' | 'viewer' | 'verifier';
const RANK: Record<Role, number> = { verifier: 0, viewer: 0, editor: 1, owner: 2 };
const ROLES: Role[] = ['owner', 'editor', 'viewer'];
const MAX_ORGS = 40, MAX_MEMBERS = 50, MAX_SUPPLIERS = 300, MAX_BATCH = 120, MAX_YEAR_LINES = 5000;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = (prefix: 'S' | 'C' | 'A') => prefix + [...crypto.getRandomValues(new Uint8Array(15))].map((x) => ALPHABET[x % ALPHABET.length]).join('');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const thisYear = () => new Date().getUTCFullYear();
const yearQ = (q: Query) => { const y = Number(first(q.year)); return y >= 2000 && y <= 2100 ? y : thisYear(); };
const fmtKg = (kg: number) => `${r3(kg).toLocaleString('en')} kg`;

export type Org = NonNullable<Awaited<ReturnType<typeof prisma.greenOrg.findUnique>>>;

// ——— Access ———
/** The company and my role in it: as a member, or through the consultancy that manages it. */
export async function access(u: SessionUser, id: string, need: Role): Promise<{ org: Org; role: Role }> {
  const org = await prisma.greenOrg.findUnique({ where: { id } });
  if (!org) throw new NotFoundException('That company isn’t here.');
  const mine = await prisma.greenOrgMember.findUnique({ where: { orgId_userId: { orgId: id, userId: u.id } } });
  let role: Role | null = mine ? (mine.role as Role) : null;
  if (org.consultancyId) {
    const via = await prisma.greenOrgMember.findUnique({ where: { orgId_userId: { orgId: org.consultancyId, userId: u.id } } });
    const viaRole: Role | null = via ? (via.role === 'owner' ? 'owner' : via.role === 'viewer' ? 'viewer' : 'editor') : null;
    if (viaRole && (!role || RANK[viaRole] > RANK[role])) role = viaRole;
  }
  if (!role) throw new NotFoundException('That company isn’t here.');
  if (RANK[role] < RANK[need]) throw new ForbiddenException(need === 'owner' ? 'Only the company’s owners can do that.' : 'You can look, but not change this company’s footprint.');
  return { org, role };
}

// ——— The log ———
/** Adds a link to the company's chain: each row's hash covers the one before it, so a rewrite shows. */
export async function log(orgId: string, userId: string | null, action: string, detail: string) {
  const last = await prisma.greenAudit.findFirst({ where: { orgId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { hash: true } });
  const prevHash = last?.hash ?? '0'.repeat(64), createdAt = new Date();
  const hash = sha([prevHash, orgId, action, detail.slice(0, 400), userId ?? '', createdAt.toISOString()].join('|'));
  // shortcut: two changes at the same instant may both link to the same previous row; verify() then reports a fork.
  await prisma.greenAudit.create({ data: { orgId, userId, action, detail: detail.slice(0, 400), prevHash, hash, createdAt } });
}
/** Re-works every hash in order: the first row whose hash doesn't add up, or null when the chain is whole. */
export function verifyChain(rows: { orgId: string; userId: string | null; action: string; detail: string; prevHash: string; hash: string; createdAt: Date }[]): number | null {
  let prev = '0'.repeat(64);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.prevHash !== prev || sha([r.prevHash, r.orgId, r.action, r.detail, r.userId ?? '', r.createdAt.toISOString()].join('|')) !== r.hash) return i;
    prev = r.hash;
  }
  return null;
}

// ——— Companies ———
function readSettings(b: Body, partial: boolean) {
  const data: Record<string, unknown> = {};
  const has = (k: string) => !partial || k in b;
  if (has('name')) { const n = short(b.name, 80); if (!n) throw new BadRequestException('Give the company a name.'); data.name = n; }
  if (has('country')) { const c = (str(b.country) ?? '').toUpperCase(); data.country = /^[A-Z]{2}$/.test(c) ? c : null; }
  if (has('industry')) data.industry = short(b.industry, 60);
  if (has('employees')) data.employees = b.employees === null || b.employees === '' ? null : num(b.employees, 0, 10_000_000);
  if (has('revenue')) data.revenue = b.revenue === null || b.revenue === '' ? null : num(b.revenue, 0, 1e15);
  if (has('currency')) { const c = (str(b.currency) ?? 'USD').toUpperCase(); data.currency = CURRENCIES.includes(c) ? c : 'USD'; }
  if (has('baseYear')) data.baseYear = b.baseYear === null || b.baseYear === '' ? null : num(b.baseYear, 2000, 2100);
  if (has('targetYear')) data.targetYear = b.targetYear === null || b.targetYear === '' ? null : num(b.targetYear, 2001, 2100);
  if (has('targetPct')) data.targetPct = b.targetPct === null || b.targetPct === '' ? null : num(b.targetPct, 0, 100);
  if (has('carbonPrice')) data.carbonPrice = b.carbonPrice === null || b.carbonPrice === '' ? null : num(b.carbonPrice, 0, 1e7);
  if ('screening' in b && b.screening && typeof b.screening === 'object') {
    // M277: each of scope 3's fifteen categories counted, not relevant, or left out with a reason.
    const out: Record<number, { status: Screen; reason: string | null }> = {};
    for (const c of S3_CATEGORIES) {
      const v = (b.screening as Record<string, Body>)[c.n];
      if (v && SCREEN.includes(v.status as Screen)) out[c.n] = { status: v.status as Screen, reason: short(v.reason, 300) };
    }
    data.screening = JSON.stringify(out);
  }
  if (typeof data.employees === 'number') data.employees = Math.round(data.employees);
  for (const k of ['baseYear', 'targetYear'] as const) if (typeof data[k] === 'number') data[k] = Math.round(data[k] as number);
  return data;
}

/** GET /green/biz: the companies I work on: mine, and my consultancies' clients. */
export async function bizList(u: SessionUser) {
  const mine = await prisma.greenOrgMember.findMany({ where: { userId: u.id }, take: MAX_ORGS, orderBy: { createdAt: 'asc' } });
  const direct = mine.length ? await prisma.greenOrg.findMany({ where: { id: { in: mine.map((m) => m.orgId) } }, select: { id: true, name: true, kind: true, consultancyId: true } }) : [];
  const consultancies = direct.filter((o) => o.kind === 'consultancy');
  const clients = consultancies.length ? await prisma.greenOrg.findMany({ where: { consultancyId: { in: consultancies.map((c) => c.id) } }, select: { id: true, name: true, kind: true, consultancyId: true }, orderBy: { name: 'asc' }, take: 200 }) : [];
  const roleOf = (id: string) => mine.find((m) => m.orgId === id)?.role as Role | undefined;
  const nameOf = new Map(direct.map((o) => [o.id, o.name]));
  const seen = new Set<string>();
  const out = [...direct, ...clients].filter((o) => !seen.has(o.id) && seen.add(o.id)).map((o) => {
    const via = o.consultancyId ? roleOf(o.consultancyId) : undefined;
    const role = roleOf(o.id) ?? (via === 'owner' ? 'owner' : via === 'viewer' ? 'viewer' : 'editor');
    return { id: o.id, name: o.name, kind: o.kind, role, consultancy: o.consultancyId ? nameOf.get(o.consultancyId) ?? null : null, consultancyId: o.consultancyId };
  });
  return { orgs: out };
}

/** POST /green/biz { name, kind, country, … , consultancyId? }: a company (or a consultancy, or a consultancy's client). */
export async function createBizOrg(u: SessionUser, b: Body) {
  const data = readSettings(b, false);
  const kind = b.kind === 'consultancy' ? 'consultancy' : 'company';
  let consultancyId: string | null = null;
  if (typeof b.consultancyId === 'string' && b.consultancyId) {
    const { org } = await access(u, b.consultancyId, 'editor');
    if (org.kind !== 'consultancy') throw new BadRequestException('Only a consultancy has clients.');
    if (kind !== 'company') throw new BadRequestException('A client is a company.');
    const clients = await prisma.greenOrg.count({ where: { consultancyId: org.id } });
    if (clients >= 200) throw new BadRequestException('A consultancy has 200 clients at most here.');
    if (clients >= LIMITS.clients && (await billingOf(org)).tier !== 'CONSULTANCY' && (await billingOf(org)).on) throw new ForbiddenException(`The free plan manages ${LIMITS.clients} clients: choose Consultancy in Team & plan for more.`);
    consultancyId = org.id;
  } else if ((await prisma.greenOrgMember.count({ where: { userId: u.id } })) >= MAX_ORGS) throw new BadRequestException(`You work on ${MAX_ORGS} companies already.`);
  const org = await prisma.greenOrg.create({ data: { ...(data as { name: string }), kind, consultancyId, createdById: u.id }, select: { id: true } });
  // A client is reached through its consultancy; a company or consultancy of my own makes me its owner.
  if (!consultancyId) await prisma.greenOrgMember.create({ data: { orgId: org.id, userId: u.id, role: 'owner' } });
  await log(org.id, u.id, 'created', `${kind === 'consultancy' ? 'Consultancy' : 'Company'} created: ${data.name}`);
  return { id: org.id };
}

/** PUT /green/biz/:id: the company's details, base year and target (editors). */
export async function updateBizOrg(u: SessionUser, id: string, b: Body) {
  await access(u, id, 'editor');
  const data = readSettings(b, true);
  if (typeof data.baseYear === 'number' && typeof data.targetYear === 'number' && data.targetYear <= data.baseYear) throw new BadRequestException('The target year comes after the base year.');
  await prisma.greenOrg.update({ where: { id }, data });
  await log(id, u.id, 'settings', `Details changed: ${Object.keys(data).join(', ') || 'nothing'}`);
  return { ok: true };
}

/** DELETE /green/biz/:id: the company and everything in it (its owners). A consultancy's clients stay, unmanaged. */
export async function deleteBizOrg(u: SessionUser, id: string) {
  await access(u, id, 'owner');
  await prisma.greenEntry.deleteMany({ where: { orgId: id } });
  await prisma.greenSupplier.deleteMany({ where: { orgId: id } });
  await prisma.greenCommute.deleteMany({ where: { orgId: id } });
  await prisma.greenAudit.deleteMany({ where: { orgId: id } });
  await prisma.greenOrgMember.deleteMany({ where: { orgId: id } });
  await prisma.greenOrg.updateMany({ where: { consultancyId: id }, data: { consultancyId: null } });
  await prisma.greenOrg.delete({ where: { id } });
  return { ok: true };
}

async function yearLines(orgId: string, year: number): Promise<Line[]> {
  return prisma.greenEntry.findMany({ where: { orgId, period: { gte: `${year}-01`, lte: `${year}-12` } }, select: { period: true, category: true, scope: true, kg: true, quantity: true, quality: true, site: true }, take: MAX_YEAR_LINES });
}
const publicOrg = (o: Org) => ({
  id: o.id, name: o.name, kind: o.kind, country: o.country, industry: o.industry, employees: o.employees, revenue: o.revenue, currency: o.currency,
  baseYear: o.baseYear, targetYear: o.targetYear, targetPct: o.targetPct, consultancyId: o.consultancyId, carbonPrice: o.carbonPrice,
  screening: readScreening(o.screening),
});
export function readScreening(json: string | null | undefined): Record<number, { status: Screen; reason: string | null }> {
  try { const v = JSON.parse(json || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
/** The year's totals with the worked-out upstream (scope 3 category 3) and scope 2 both ways. */
export const yearTotals = (org: { country: string | null }, lines: Line[], year: number) => totals(lines, year, { country: org.country, upstream: true });

/** GET /green/biz/:id?year=: the company with its year (scopes, categories, months) against the year before. */
export async function bizOrg(u: SessionUser, id: string, q: Query) {
  const { org, role } = await access(u, id, 'viewer');
  const year = yearQ(q);
  const [now, before, suppliers, answered, commutes, consultancy, years] = await Promise.all([
    yearLines(id, year), yearLines(id, year - 1),
    prisma.greenSupplier.count({ where: { orgId: id, year } }), prisma.greenSupplier.count({ where: { orgId: id, year, status: 'answered' } }),
    prisma.greenCommute.count({ where: { orgId: id, year } }),
    org.consultancyId ? prisma.greenOrg.findUnique({ where: { id: org.consultancyId }, select: { name: true } }) : null,
    prisma.greenEntry.findMany({ where: { orgId: id }, select: { period: true }, distinct: ['period'], take: 600 }),
  ]);
  return {
    org: publicOrg(org), role, year, consultancy: consultancy?.name ?? null,
    totals: yearTotals(org, now, year), before: yearTotals(org, before, year - 1),
    years: [...new Set(years.map((p) => yearOf(p.period)))].sort((a, b) => b - a),
    counts: { lines: now.length, suppliers, answered, commutes },
    plan: readPlan(org.plan), billing: await billingOf(org), sites: [...new Set(now.map((l) => l.site).filter((x): x is string => !!x))].sort(),
  };
}

// ——— The ledger ———
function readLine(org: Org, b: Body) {
  const cat = categoryById(b.category);
  if (!cat || MADE.includes(cat.id)) throw new BadRequestException('Pick what this line is.');
  if (!isPeriod(b.period)) throw new BadRequestException('Pick the month.');
  const quantity = num(b.quantity, 0, 1e12);
  if (quantity === null) throw new BadRequestException('Give the amount as a number.');
  const own = b.factor === undefined || b.factor === null || b.factor === '' ? null : num(b.factor, 0, 100_000);
  const factor = own ?? factorFor(cat, org.country, org.currency);
  const factorSource = own !== null ? short(b.factorSource, 160) ?? 'The company’s own factor' : cat.source;
  return {
    period: b.period as string, category: cat.id, scope: cat.scope, quantity, factor, factorSource, kg: kgFor(quantity, factor), note: short(b.note, 200),
    quality: isQuality(b.quality) ? b.quality : defaultQuality(cat.id), site: short(b.site, 60),
  };
}
const describe = (l: { category: string; period: string; quantity: number; kg: number }) => `${categoryById(l.category)?.label ?? l.category}, ${l.period}: ${r3(l.quantity).toLocaleString('en')} ${categoryById(l.category)?.unit ?? ''} = ${fmtKg(l.kg)}`;

/** GET /green/biz/:id/entries?year= */
export async function bizEntries(u: SessionUser, id: string, q: Query) {
  await access(u, id, 'viewer');
  const year = yearQ(q);
  const rows = await prisma.greenEntry.findMany({
    where: { orgId: id, period: { gte: `${year}-01`, lte: `${year}-12` } }, orderBy: [{ period: 'desc' }, { createdAt: 'desc' }], take: MAX_YEAR_LINES,
    select: { id: true, period: true, category: true, scope: true, quantity: true, factor: true, factorSource: true, kg: true, note: true, source: true, refId: true, quality: true, site: true, updatedAt: true },
  });
  return { year, entries: rows };
}

/** POST /green/biz/:id/entries { period, category, quantity, factor?, factorSource?, note? } */
export async function addBizEntry(u: SessionUser, id: string, b: Body) {
  const { org } = await access(u, id, 'editor');
  const line = readLine(org, b);
  await roomFor(org, [line.period], 1);
  const row = await prisma.greenEntry.create({ data: { ...line, orgId: id, source: 'manual', createdById: u.id }, select: { id: true } });
  await log(id, u.id, 'added', describe(line));
  return { id: row.id, kg: line.kg };
}

/** POST /green/biz/:id/entries/batch { rows: [...], source: 'import' | 'ai' }: up to 120 lines at once (an import). */
export async function addBizEntries(u: SessionUser, id: string, b: Body) {
  const { org } = await access(u, id, 'editor');
  const raw = Array.isArray(b.rows) ? b.rows.slice(0, MAX_BATCH + 1) : [];
  if (!raw.length) throw new BadRequestException('Nothing to add.');
  if (raw.length > MAX_BATCH) throw new BadRequestException(`${MAX_BATCH} lines at a time.`);
  const source = b.source === 'ai' ? 'ai' : 'import';
  const lines = raw.map((r, i) => {
    try { return readLine(org, (r && typeof r === 'object' ? r : {}) as Body); }
    catch (e) { throw new BadRequestException(`Line ${i + 1}: ${(e as Error).message}`); }
  });
  await roomFor(org, lines.map((l) => l.period), lines.length);
  // D1 takes at most 100 bound values a query: five rows a query.
  for (let i = 0; i < lines.length; i += 5) {
    await prisma.greenEntry.createMany({ data: lines.slice(i, i + 5).map((l) => ({ ...l, orgId: id, source, createdById: u.id })) });
  }
  const kg = r3(lines.reduce((a, l) => a + l.kg, 0));
  await log(id, u.id, source === 'ai' ? 'read-bill' : 'imported', `${lines.length} lines ${source === 'ai' ? 'read from a bill' : 'imported'} = ${fmtKg(kg)}`);
  return { added: lines.length, kg };
}

/** PUT /green/biz/:id/entries/:eid */
export async function updateBizEntry(u: SessionUser, id: string, eid: string, b: Body) {
  const { org } = await access(u, id, 'editor');
  const old = await prisma.greenEntry.findFirst({ where: { id: eid, orgId: id } });
  if (!old) throw new NotFoundException('That line isn’t here.');
  if (old.source === 'supplier' || old.source === 'survey') throw new BadRequestException('This line comes from a supplier or the staff survey: change it there.');
  const line = readLine(org, b);
  await prisma.greenEntry.update({ where: { id: eid }, data: line });
  await log(id, u.id, 'changed', `${describe(old)} → ${describe(line)}`);
  return { kg: line.kg };
}

/** DELETE /green/biz/:id/entries/:eid */
export async function deleteBizEntry(u: SessionUser, id: string, eid: string) {
  await access(u, id, 'editor');
  const old = await prisma.greenEntry.findFirst({ where: { id: eid, orgId: id } });
  if (!old) throw new NotFoundException('That line isn’t here.');
  await prisma.greenEntry.delete({ where: { id: eid } });
  if (old.source === 'supplier' && old.refId) await prisma.greenSupplier.updateMany({ where: { id: old.refId, orgId: id }, data: { kg: null } });
  await log(id, u.id, 'removed', describe(old));
  return { ok: true };
}

/** M280: a free company (while the owner's plans are on) keeps LIMITS.lines lines a year. */
async function roomFor(org: Org, periods: string[], adding: number) {
  const bill = await billingOf(org);
  if (bill.pro) return;
  for (const y of new Set(periods.map(yearOf))) {
    const have = await prisma.greenEntry.count({ where: { orgId: org.id, period: { gte: `${y}-01`, lte: `${y}-12` } } });
    if (have + adding > LIMITS.lines) throw new ForbiddenException(`The free plan keeps ${LIMITS.lines} lines a year: choose Pro in Team & plan for more.`);
  }
}

// ——— Reading a bill with AI (M270) ———
const BILL_SYSTEM = `You read a company's utility bill, fuel receipt, travel invoice or expense report and list the activity in it for a carbon footprint.
Only list amounts that are written on it. Categories (use the id): ${CATEGORIES.filter((c) => !MADE.includes(c.id)).map((c) => `${c.id} = ${c.label} (${c.unit === 'money' ? 'amount spent' : c.unit})`).join('; ')}.
Give each line the month it covers as YYYY-MM (the end of the billing period), the quantity in the category's unit (convert units you are sure of: MWh to kWh ×1000, gallons to litres ×3.785, tonnes to kg ×1000), and a short note (the supplier and what it is). If nothing fits, return no lines.`;
const BILL_SCHEMA = {
  type: 'OBJECT',
  properties: { lines: { type: 'ARRAY', items: { type: 'OBJECT', properties: { category: { type: 'STRING' }, period: { type: 'STRING' }, quantity: { type: 'NUMBER' }, note: { type: 'STRING' } }, required: ['category', 'period', 'quantity'] } } },
  required: ['lines'],
};
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
/** POST /green/biz/:id/read-bill { text } or { image: { mimeType, data } }: lines the AI found, for a person to check (not saved). */
export async function readBill(u: SessionUser, id: string, b: Body) {
  const { org } = await access(u, id, 'editor');
  await needPro(org, 'Reading bills with AI');
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) throw new HttpException('Reading bills with AI is off right now. Type the lines in, or import a spreadsheet.', 503);
  const textIn = (str(b.text) ?? '').slice(0, 12_000).trim();
  const img = b.image && typeof b.image === 'object' ? (b.image as Body) : null;
  const mime = img && typeof img.mimeType === 'string' && IMAGE_TYPES.includes(img.mimeType) ? img.mimeType : null;
  const data = img && typeof img.data === 'string' && img.data.length <= 6_000_000 ? img.data : null;
  if (!textIn && !(mime && data)) throw new BadRequestException('Add the bill: a photo, a PDF or its text.');
  const spend = await spendAi(u);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  await logAiUse(u.id, { kind: 'carbon-bill', detail: 'Read a bill for Green → Business' });
  const prompt = `This year is ${thisYear()}. List the activity lines.${textIn ? `\n\n${textIn}` : ''}`;
  const out = mime && data ? await geminiJsonImage<{ lines: Body[] }>(BILL_SYSTEM, prompt, { mimeType: mime, data }, BILL_SCHEMA, 1500) : await geminiJson<{ lines: Body[] }>(BILL_SYSTEM, prompt, BILL_SCHEMA, 1500);
  const lines = (out?.lines ?? []).slice(0, 40).map((l) => ({
    category: categoryById(l.category) && !MADE.includes(l.category as string) ? (l.category as string) : null,
    period: isPeriod(l.period) ? l.period : null, quantity: num(l.quantity, 0, 1e12), note: short(l.note, 200),
  })).filter((l) => l.category && l.quantity !== null);
  return { lines, left: spend.left };
}

// ——— Members ———
/** GET /green/biz/:id/members: names and roles (no emails). */
export async function bizMembers(u: SessionUser, id: string) {
  const { org } = await access(u, id, 'viewer');
  const rows = await prisma.greenOrgMember.findMany({ where: { orgId: id }, orderBy: { createdAt: 'asc' }, take: MAX_MEMBERS });
  const users = rows.length ? await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, name: true } }) : [];
  const consultancy = org.consultancyId ? await prisma.greenOrg.findUnique({ where: { id: org.consultancyId }, select: { name: true } }) : null;
  return { members: rows.map((r) => ({ userId: r.userId, name: users.find((x) => x.id === r.userId)?.name ?? 'Someone', role: r.role, me: r.userId === u.id })), consultancy: consultancy?.name ?? null };
}
/** POST /green/biz/:id/members { email, role }: someone with a UniVerse account (its owners). */
export async function addBizMember(u: SessionUser, id: string, b: Body) {
  const { org } = await access(u, id, 'owner');
  const email = (str(b.email) ?? '').trim().toLowerCase();
  const role: Role = ROLES.includes(b.role as Role) ? (b.role as Role) : 'editor';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Type their email address.');
  const who = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!who) throw new NotFoundException('Nobody uses UniVerse with that email yet: ask them to sign up first.');
  if ((await prisma.greenOrgMember.count({ where: { orgId: id } })) >= MAX_MEMBERS) throw new BadRequestException(`${MAX_MEMBERS} people at most.`);
  await prisma.greenOrgMember.upsert({ where: { orgId_userId: { orgId: id, userId: who.id } }, create: { orgId: id, userId: who.id, role }, update: { role } });
  await log(id, u.id, 'member', `Someone was given the ${role} role`);
  if (who.id !== u.id) await notify(who.id, { title: `${org.name} on UniVerse Trace Carbon`, body: `You can now work on ${org.name}’s carbon footprint (${role}).`, link: '/trace/carbon', type: 'info', email: false });
  return { userId: who.id, name: who.name, role };
}
/** DELETE /green/biz/:id/members/:uid (its owners, or leaving myself). The last owner stays. */
export async function removeBizMember(u: SessionUser, id: string, uid: string) {
  await access(u, id, uid === u.id ? 'viewer' : 'owner');
  const m = await prisma.greenOrgMember.findUnique({ where: { orgId_userId: { orgId: id, userId: uid } } });
  if (!m) throw new NotFoundException('They aren’t a member.');
  if (m.role === 'owner' && (await prisma.greenOrgMember.count({ where: { orgId: id, role: 'owner' } })) <= 1) throw new BadRequestException('Give someone else the owner role first.');
  await prisma.greenOrgMember.delete({ where: { orgId_userId: { orgId: id, userId: uid } } });
  await log(id, u.id, 'member', uid === u.id ? 'A member left' : 'A member was removed');
  return { ok: true };
}

// ——— Suppliers (M271) ———
/** GET /green/biz/:id/suppliers?year= */
export async function bizSuppliers(u: SessionUser, id: string, q: Query) {
  const { org } = await access(u, id, 'viewer');
  const year = yearQ(q);
  const rows = await prisma.greenSupplier.findMany({ where: { orgId: id, year }, orderBy: { createdAt: 'asc' }, take: MAX_SUPPLIERS });
  return { year, currency: org.currency, suppliers: rows.map((s) => ({ id: s.id, name: s.name, contact: s.contact, spend: s.spend, code: s.code, status: s.status, kg: s.kg, answer: s.answer ? JSON.parse(s.answer) : null, answeredAt: s.answeredAt })) };
}
/** POST /green/biz/:id/suppliers { name, contact?, spend, year } */
export async function addBizSupplier(u: SessionUser, id: string, b: Body) {
  const name = short(b.name, 80);
  if (!name) throw new BadRequestException('The supplier’s name.');
  const year = num(b.year, 2000, 2100) ?? thisYear();
  const { org } = await access(u, id, 'editor');
  const have = await prisma.greenSupplier.count({ where: { orgId: id } });
  if (have >= MAX_SUPPLIERS) throw new BadRequestException(`${MAX_SUPPLIERS} suppliers at most.`);
  if (have >= LIMITS.suppliers && !(await billingOf(org)).pro) throw new ForbiddenException(`The free plan asks ${LIMITS.suppliers} suppliers: choose Pro in Team & plan for more.`);
  const s = await prisma.greenSupplier.create({ data: { orgId: id, name, contact: short(b.contact, 120), spend: num(b.spend, 0, 1e13), year: Math.round(year), code: newCode('S') }, select: { id: true, code: true } });
  await log(id, u.id, 'supplier', `Supplier asked for ${Math.round(year)}: ${name}`);
  return s;
}
/** DELETE /green/biz/:id/suppliers/:sid: and its line. */
export async function removeBizSupplier(u: SessionUser, id: string, sid: string) {
  await access(u, id, 'editor');
  const s = await prisma.greenSupplier.findFirst({ where: { id: sid, orgId: id } });
  if (!s) throw new NotFoundException('That supplier isn’t here.');
  await prisma.greenEntry.deleteMany({ where: { orgId: id, refId: sid } });
  await prisma.greenSupplier.delete({ where: { id: sid } });
  await log(id, u.id, 'supplier', `Supplier removed: ${s.name}`);
  return { ok: true };
}
/** Our share of a supplier's emissions: theirs × what we spent ÷ their revenue (both in dollars), at most all of it. */
export function supplierShareKg(answerKg: number, theirRevenue: number, theirCurrency: string, ourSpend: number, ourCurrency: string) {
  const rev = theirRevenue * (USD_PER[theirCurrency] ?? 1), spend = ourSpend * (USD_PER[ourCurrency] ?? 1);
  if (!(rev > 0) || !(spend > 0)) return 0;
  return r3(answerKg * Math.min(1, spend / rev));
}

// ——— Staff commuting (M272) ———
async function syncCommute(org: Org, year: number) {
  const rows = await prisma.greenCommute.findMany({ where: { orgId: org.id, year }, select: { kgYear: true }, take: 5000 });
  const refId = `commute-${org.id}-${year}`;
  await prisma.greenEntry.deleteMany({ where: { orgId: org.id, refId } });
  if (!rows.length) return;
  const sum = rows.reduce((a, r) => a + r.kgYear, 0);
  // Scaled up to everyone when the company gave its headcount: the answers are a sample.
  const scale = org.employees && org.employees > rows.length ? org.employees / rows.length : 1;
  const kg = r3(sum * scale);
  await prisma.greenEntry.create({ data: {
    orgId: org.id, period: `${year}-12`, category: 'commute', scope: 3, quantity: kg, factor: 1, kg, source: 'survey', refId,
    factorSource: categoryById('commute')!.source, note: scale > 1 ? `${rows.length} answers, scaled to ${org.employees} staff` : `${rows.length} answers`,
  } });
}
/** GET /green/biz/:id/staff?year=: the survey link, how staff get to work, and what staff saved in their own Green. */
export async function bizStaff(u: SessionUser, id: string, q: Query) {
  const { org } = await access(u, id, 'viewer');
  const year = yearQ(q);
  const rows = await prisma.greenCommute.findMany({ where: { orgId: id, year }, select: { mode: true, kgYear: true, userId: true }, take: 5000 });
  const byMode: Record<string, { people: number; kg: number }> = {};
  for (const r of rows) { const m = (byMode[r.mode] ??= { people: 0, kg: 0 }); m.people++; m.kg = r3(m.kg + r.kgYear); }
  const people = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))].slice(0, 90);
  const saved = people.length ? await prisma.greenAction.aggregate({ where: { userId: { in: people }, createdAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } }, _sum: { co2Kg: true }, _count: true }) : null;
  return {
    year, surveyCode: org.surveyCode, answers: rows.length, employees: org.employees, byMode,
    kg: r3(rows.reduce((a, r) => a + r.kgYear, 0)), linked: people.length,
    greenSaved: { kg: r3(saved?._sum.co2Kg ?? 0), actions: saved?._count ?? 0 },
  };
}
/** POST /green/biz/:id/survey { on }: the staff survey link on (a new code) or off. */
export async function bizSurveyLink(u: SessionUser, id: string, b: Body) {
  await access(u, id, 'editor');
  const surveyCode = b.on === false ? null : newCode('C');
  await prisma.greenOrg.update({ where: { id }, data: { surveyCode } });
  await log(id, u.id, 'link', surveyCode ? 'Staff survey link made' : 'Staff survey link turned off');
  return { surveyCode };
}
function readCommute(b: Body) {
  const mode = typeof b.mode === 'string' && b.mode in COMMUTE ? b.mode : null;
  const km = num(b.kmOneWay, 0, 300), days = num(b.daysWeek, 0, 7);
  if (!mode || km === null || days === null) throw new BadRequestException('How you come to work, how far (one way) and how many days a week.');
  return { mode, kmOneWay: km, daysWeek: days, kgYear: commuteKgYear(mode, km, days) };
}

// ——— Auditor link and the log ———
/** POST /green/biz/:id/audit-link { on }: a read-only link for an auditor (its owners). */
export async function bizAuditLink(u: SessionUser, id: string, b: Body) {
  const { org } = await access(u, id, 'owner');
  if (b.on !== false) await needPro(org, 'The auditor’s link');
  const auditCode = b.on === false ? null : newCode('A');
  await prisma.greenOrg.update({ where: { id }, data: { auditCode } });
  await log(id, u.id, 'link', auditCode ? 'Auditor link made' : 'Auditor link turned off');
  return { auditCode };
}
async function chain(orgId: string) {
  const rows = await prisma.greenAudit.findMany({ where: { orgId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 5000 });
  const broken = verifyChain(rows);
  return { rows, broken };
}
/** GET /green/biz/:id/audit: the change log, newest first, and whether the chain is whole. */
export async function bizAudit(u: SessionUser, id: string) {
  const { org } = await access(u, id, 'viewer');
  const { rows, broken } = await chain(id);
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))].slice(0, 90) } }, select: { id: true, name: true } });
  return {
    auditCode: org.auditCode, whole: broken === null, count: rows.length, head: rows.at(-1)?.hash ?? null,
    rows: rows.slice(-300).reverse().map((r) => ({ id: r.id, action: r.action, detail: r.detail, who: users.find((x) => x.id === r.userId)?.name ?? null, hash: r.hash, createdAt: r.createdAt })),
  };
}

// ——— The reduction plan (M273) ———
type Plan = { levers: Partial<Record<LeverId, Lever>> };
function readPlan(json: string): Plan {
  try {
    const v = JSON.parse(json) as Plan, levers: Plan['levers'] = {};
    for (const l of LEVERS) {
      const x = v?.levers?.[l.id];
      if (x) levers[l.id] = { share: Math.min(1, Math.max(0, Number(x.share) || 0)), cost: Math.max(0, Number(x.cost) || 0), saving: Math.max(0, Number(x.saving) || 0) };
    }
    return { levers };
  } catch { return { levers: {} }; }
}
/** PUT /green/biz/:id/plan { levers } */
export async function saveBizPlan(u: SessionUser, id: string, b: Body) {
  await access(u, id, 'editor');
  const plan = readPlan(JSON.stringify({ levers: b.levers ?? {} }));
  await prisma.greenOrg.update({ where: { id }, data: { plan: JSON.stringify(plan) } });
  await log(id, u.id, 'plan', `Reduction plan saved: ${Object.entries(plan.levers).filter(([, l]) => l && l.share > 0).map(([k, l]) => `${k} ${Math.round((l?.share ?? 0) * 100)}%`).join(', ') || 'no levers'}`);
  return plan;
}

// ——— The report (M274) ———
async function reportFor(org: Org, year: number) {
  const [lines, baseLines, factorRows, supplierRows, commutes, head, consultancy] = await Promise.all([
    yearLines(org.id, year), org.baseYear && org.baseYear !== year ? yearLines(org.id, org.baseYear) : Promise.resolve(null),
    prisma.greenEntry.findMany({ where: { orgId: org.id, period: { gte: `${year}-01`, lte: `${year}-12` } }, select: { category: true, factor: true, factorSource: true }, distinct: ['category', 'factor'], take: 200 }),
    prisma.greenSupplier.findMany({ where: { orgId: org.id, year }, select: { status: true } }),
    prisma.greenCommute.count({ where: { orgId: org.id, year } }),
    prisma.greenAudit.findFirst({ where: { orgId: org.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { hash: true, createdAt: true } }),
    org.consultancyId ? prisma.greenOrg.findUnique({ where: { id: org.consultancyId }, select: { name: true } }) : null,
  ]);
  const t = yearTotals(org, lines, year), base = baseLines ? yearTotals(org, baseLines, org.baseYear!) : org.baseYear === year ? t : null;
  const byS3: Record<number, number> = {};
  for (const [cat, kg] of Object.entries(t.byCategory)) { const c = categoryById(cat); if (c?.scope === 3 && c.s3) byS3[c.s3] = r3((byS3[c.s3] ?? 0) + kg); }
  const plan = readPlan(org.plan), cuts = leverCuts(t.byCategory, plan.levers, org.country);
  return {
    org: publicOrg(org), year, preparedBy: consultancy?.name ?? null, generatedAt: new Date().toISOString(),
    totals: t, base: base ? { year: org.baseYear, kg: base.kg, scope: base.scope } : null, byS3,
    intensity: { perEmployee: org.employees ? r3(t.kg / org.employees) : null, s12PerMillionRevenue: org.revenue ? r3(((t.scope[1] + t.scope[2]) / org.revenue) * 1e6) : null, perMillionRevenue: org.revenue ? r3((t.kg / org.revenue) * 1e6) : null },
    target: org.baseYear && org.targetYear && org.targetPct !== null && base ? { baseYear: org.baseYear, targetYear: org.targetYear, pct: org.targetPct, path: targetPath(base.kg, org.baseYear, org.targetYear, org.targetPct ?? 0) } : null,
    plan: { cutsKg: cuts, totalKg: r3(Object.values(cuts).reduce((a, b) => a + b, 0)) },
    factors: factorRows.map((f) => ({ category: f.category, label: categoryById(f.category)?.label ?? f.category, unit: categoryById(f.category)?.unit ?? '', factor: f.factor, source: f.factorSource })),
    data: { lines: lines.length, suppliers: supplierRows.length, suppliersAnswered: supplierRows.filter((s) => s.status === 'answered').length, commuteAnswers: commutes },
    audit: head ? { hash: head.hash, at: head.createdAt } : null,
    // M276–M279: scope 2 both ways, data quality, the scope 3 screening, sites, the carbon price, certificates and
    // offsets (beside the footprint, never netted off), and the year's verification.
    scope2: t.scope2, quality: t.quality, bySite: t.bySite, screening: readScreening(org.screening),
    carbonCost: org.carbonPrice ? Math.round((t.kg / 1000) * org.carbonPrice) : null,
    credits: await bizCredits(org.id, year), verification: await verificationFor(org.id, year, t, head?.hash ?? null),
  };
}
/** GET /green/biz/:id/report?year= */
export async function bizReport(u: SessionUser, id: string, q: Query) {
  const { org } = await access(u, id, 'viewer');
  return reportFor(org, yearQ(q));
}

// ——— Trace (M271): the company's carbon per unit on its products' passports ———
/** GET /green/biz/:id/trace: my Trace brand's products with the carbon on their passports (none: no brand). */
export async function bizTrace(u: SessionUser, id: string) {
  await access(u, id, 'viewer');
  const m = await prisma.traceBrandMember.findFirst({ where: { userId: u.id }, orderBy: { createdAt: 'asc' }, select: { brandId: true } });
  if (!m) return { brand: null, products: [] };
  const [brand, products] = await Promise.all([
    prisma.traceBrand.findUnique({ where: { id: m.brandId }, select: { name: true } }),
    prisma.traceProduct.findMany({ where: { brandId: m.brandId, sample: false }, select: { id: true, name: true, dpp: true }, orderBy: { name: 'asc' }, take: 200 }),
  ]);
  return { brand: brand?.name ?? null, products: products.map((p) => { const d = readDpp(p.dpp); return { id: p.id, name: p.name, carbonKg: d.carbonKg, carbonMethod: d.carbonMethod }; }) };
}
/** POST /green/biz/:id/trace { year, scopes: [1,2,3], products: [{ id, units }] }: the year's footprint shared over the
 *  units made, written on each product's passport (the brand's members only; the company's editors). */
export async function pushBizTrace(u: SessionUser, id: string, b: Body) {
  const { org } = await access(u, id, 'editor');
  await needPro(org, 'Carbon on Trace passports');
  const m = await prisma.traceBrandMember.findFirst({ where: { userId: u.id }, orderBy: { createdAt: 'asc' }, select: { brandId: true } });
  if (!m) throw new ForbiddenException('Start your brand in Trace first.');
  const year = num(b.year, 2000, 2100) ?? thisYear();
  const scopes = new Set((Array.isArray(b.scopes) ? b.scopes : [1, 2]).map(Number).filter((s) => s === 1 || s === 2 || s === 3));
  const picks = (Array.isArray(b.products) ? b.products : []).slice(0, 200).map((p) => (p && typeof p === 'object' ? p as Body : {}))
    .map((p) => ({ id: str(p.id) ?? '', units: num(p.units, 1, 1e12) ?? 0 })).filter((p) => p.id && p.units > 0);
  if (!picks.length || !scopes.size) throw new BadRequestException('Pick the products and how many of each you made.');
  const products = await prisma.traceProduct.findMany({ where: { id: { in: picks.map((p) => p.id) }, brandId: m.brandId }, select: { id: true, dpp: true } });
  if (products.length !== picks.length) throw new NotFoundException('Some of those products aren’t your brand’s.');
  const t = yearTotals(org, await yearLines(id, year), year);
  const kg = [...scopes].reduce((a, s) => a + t.scope[s as 1 | 2 | 3], 0), units = picks.reduce((a, p) => a + p.units, 0);
  if (!(kg > 0)) throw new BadRequestException(`There’s no footprint for ${year} yet.`);
  const perUnit = r3(kg / units), method = `Company footprint ÷ units, ${year}, scope ${[...scopes].sort().join('+')}`.slice(0, 60);
  for (const p of products) {
    const dpp = parseDpp({ ...readDpp(p.dpp), carbonKg: perUnit, carbonMethod: method });
    await prisma.traceProduct.update({ where: { id: p.id }, data: { dpp: JSON.stringify(dpp), dppUpdatedAt: new Date() } });
  }
  await log(id, u.id, 'trace', `${perUnit} kg a unit written on ${products.length} Trace passports (${year}, scope ${[...scopes].sort().join('+')})`);
  return { perUnit, products: products.length, method };
}

// ——— A consultancy's clients (M275) ———
/** GET /green/biz/:id/clients?year=: each client's footprint this year and last, and how complete its data is. */
export async function bizClients(u: SessionUser, id: string, q: Query) {
  const { org } = await access(u, id, 'viewer');
  if (org.kind !== 'consultancy') throw new BadRequestException('Only a consultancy has clients.');
  const year = yearQ(q);
  const clients = await prisma.greenOrg.findMany({ where: { consultancyId: id }, orderBy: { name: 'asc' }, take: 200, select: { id: true, name: true, industry: true, country: true, employees: true, baseYear: true, targetPct: true, targetYear: true } });
  if (!clients.length) return { year, clients: [] };
  const ids = clients.map((c) => c.id);
  const lines = await prisma.greenEntry.findMany({ where: { orgId: { in: ids }, period: { gte: `${year - 1}-01`, lte: `${year}-12` } }, select: { orgId: true, period: true, scope: true, kg: true, category: true, quantity: true, quality: true }, take: 20_000 });
  const suppliers = await prisma.greenSupplier.groupBy({ by: ['orgId', 'status'], where: { orgId: { in: ids }, year }, _count: true });
  return {
    year,
    clients: clients.map((c) => {
      const mine = lines.filter((l) => l.orgId === c.id), now = mine.filter((l) => yearOf(l.period) === year), before = mine.filter((l) => yearOf(l.period) === year - 1);
      const tn = yearTotals(c, now, year), tb = yearTotals(c, before, year - 1);
      const months = new Set(now.map((l) => l.period)).size;
      const asked = suppliers.filter((s) => s.orgId === c.id).reduce((a, s) => a + s._count, 0), answered = suppliers.find((s) => s.orgId === c.id && s.status === 'answered')?._count ?? 0;
      return { ...c, kg: tn.kg, scope: tn.scope, before: tb.kg, months, asked, answered, quality: tn.quality.score };
    }),
  };
}

// ——— The public links: /carbon/[code] ———
/** GET /green/link/:code (public): a supplier's form, the staff survey, or the auditor's view. Never an email or a phone. */
export async function carbonLink(raw: string) {
  const code = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
  if (code.startsWith('S')) {
    const s = await prisma.greenSupplier.findUnique({ where: { code } });
    if (!s) throw new NotFoundException('This link isn’t working any more.');
    const org = await prisma.greenOrg.findUnique({ where: { id: s.orgId }, select: { name: true } });
    return { kind: 'supplier' as const, org: org?.name ?? 'A customer', supplier: s.name, year: s.year, answered: s.status === 'answered', answer: s.answer ? JSON.parse(s.answer) : null, currencies: CURRENCIES };
  }
  if (code.startsWith('C')) {
    const org = await prisma.greenOrg.findUnique({ where: { surveyCode: code }, select: { name: true } });
    if (!org) throw new NotFoundException('This link isn’t working any more.');
    return { kind: 'survey' as const, org: org.name, year: thisYear(), modes: Object.entries(COMMUTE).map(([id, m]) => ({ id, label: m.label })) };
  }
  if (code.startsWith('A')) {
    const org = await prisma.greenOrg.findUnique({ where: { auditCode: code } });
    if (!org) throw new NotFoundException('This link isn’t working any more.');
    const latest = await prisma.greenEntry.findFirst({ where: { orgId: org.id }, orderBy: { period: 'desc' }, select: { period: true } });
    const { rows, broken } = await chain(org.id);
    return {
      kind: 'audit' as const, report: await reportFor(org, latest ? yearOf(latest.period) : thisYear()), whole: broken === null,
      log: rows.slice(-300).reverse().map((r) => ({ action: r.action, detail: r.detail, hash: r.hash, prevHash: r.prevHash, createdAt: r.createdAt })),
    };
  }
  throw new NotFoundException('This link isn’t working any more.');
}

/** POST /green/link/:code (public): a supplier's answer, or one anonymous commute answer. */
export async function answerCarbonLink(raw: string, b: Body, u: SessionUser | null = null) {
  const code = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
  if (code.startsWith('S')) {
    const s = await prisma.greenSupplier.findUnique({ where: { code } });
    if (!s) throw new NotFoundException('This link isn’t working any more.');
    const org = await prisma.greenOrg.findUnique({ where: { id: s.orgId } });
    if (!org) throw new NotFoundException('This link isn’t working any more.');
    const t1 = num(b.scope1, 0, 1e9), t2 = num(b.scope2, 0, 1e9), t3 = b.scope3 === '' || b.scope3 === null || b.scope3 === undefined ? null : num(b.scope3, 0, 1e10);
    const revenue = num(b.revenue, 1, 1e15), currency = CURRENCIES.includes(String(b.currency).toUpperCase()) ? String(b.currency).toUpperCase() : null;
    if (t1 === null || t2 === null || revenue === null || !currency) throw new BadRequestException('Your scope 1 and 2 emissions (tonnes CO₂e), and your total revenue for the year with its currency.');
    const answer = { scope1: t1, scope2: t2, scope3: t3, revenue, currency, method: short(b.method, 160) };
    // Our share counts their scopes 1 and 2 (and 3 when given) over what we spent with them.
    const kg = s.spend ? supplierShareKg((t1 + t2 + (t3 ?? 0)) * 1000, revenue, currency, s.spend, org.currency) : null;
    await prisma.greenSupplier.update({ where: { id: s.id }, data: { status: 'answered', answer: JSON.stringify(answer), kg, answeredAt: new Date() } });
    await prisma.greenEntry.deleteMany({ where: { orgId: org.id, refId: s.id } });
    if (kg !== null && kg > 0) await prisma.greenEntry.create({ data: {
      orgId: org.id, period: `${s.year}-12`, category: 'supplier', scope: 3, quantity: kg, factor: 1, kg, source: 'supplier', refId: s.id,
      factorSource: categoryById('supplier')!.source, note: `${s.name}: our share of their reported emissions`,
    } });
    await log(org.id, null, 'supplier-answer', `${s.name} answered for ${s.year}${kg !== null ? `: our share ${fmtKg(kg)}` : ' (no spend given, so nothing added)'}`);
    const editors = await prisma.greenOrgMember.findMany({ where: { orgId: org.id, role: { in: ['owner', 'editor'] } }, select: { userId: true }, take: 20 });
    for (const e of editors) await notify(e.userId, { title: `${s.name} sent their emissions`, body: `${org.name}: ${kg !== null ? `${fmtKg(kg)} added to scope 3` : 'add what you spent with them to count it'}.`, link: '/trace/carbon', type: 'info', email: false });
    return { ok: true };
  }
  if (code.startsWith('C')) {
    const org = await prisma.greenOrg.findUnique({ where: { surveyCode: code } });
    if (!org) throw new NotFoundException('This link isn’t working any more.');
    const c = readCommute(b), year = thisYear();
    const cap = Math.max(300, (org.employees ?? 0) * 2);
    if ((await prisma.greenCommute.count({ where: { orgId: org.id, year } })) >= cap) throw new BadRequestException('This survey is full for this year.');
    if (u) await prisma.greenCommute.upsert({ where: { orgId_userId_year: { orgId: org.id, userId: u.id, year } }, create: { ...c, orgId: org.id, userId: u.id, year }, update: c });
    else await prisma.greenCommute.create({ data: { ...c, orgId: org.id, year } });
    await syncCommute(org, year);
    return { kgYear: c.kgYear };
  }
  throw new NotFoundException('This link isn’t working any more.');
}
