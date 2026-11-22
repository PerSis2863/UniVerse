import { createHash } from 'node:crypto';
import type Stripe from 'stripe';
import prisma from '@/lib/db';
import { getStripe } from '@/lib/billing';
import type { SessionUser } from '@/lib/server-auth';
import { USD_PER, type Totals } from '@/lib/carbon-ledger';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { str, type Body, type Query } from './body';
import { num, short } from './trace';
import { featureOff } from './moderation';
import { notify } from './email';
import { access, log, yearTotals, type Org } from './green-business';

// Green → Business, second wave (M276–M281).
// - Plans (M280): while the owner's "Green Business plans" switch is off, everything is free. When it's on, a free
//   company keeps LIMITS (lines a year, suppliers, a consultancy's clients) and the paid features (AI bills, the
//   auditor's link, verification, Trace passports) ask for Pro; a consultancy's Consultancy plan covers its clients.
//   Prices come from GREEN_PRO_PRICE_CENTS / GREEN_CONSULTANCY_PRICE_CENTS (US cents a month), never from the browser.
// - Certificates, offsets and removals (M279): a register beside the footprint, never netted off it (GHG Protocol).
// - Verification (M278): an independent verifier (an accredited firm's person, with a UniVerse account) reviews a year,
//   asks questions on lines, and signs a statement over a snapshot of the numbers and the log's fingerprint; when the
//   numbers change after, the report says so. UniVerse never certifies anything itself.
// - Benchmark (M279): a company against others in its industry, only when at least five have data, as quartiles.

export const LIMITS = { lines: 150, suppliers: 5, clients: 2 };
export type Tier = 'FREE' | 'PRO' | 'CONSULTANCY';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const yearQ = (q: Query) => { const y = Number(q.year); return y >= 2000 && y <= 2100 ? y : new Date().getUTCFullYear(); };

// ——— Plans (M280) ———
const price = (tier: 'PRO' | 'CONSULTANCY') => { const c = Number(process.env[tier === 'PRO' ? 'GREEN_PRO_PRICE_CENTS' : 'GREEN_CONSULTANCY_PRICE_CENTS']); return Number.isInteger(c) && c >= 100 ? c : null; };
/** The company's plan: `on` false means the owner's plans are off and everything is open. */
export async function billingOf(org: Pick<Org, 'tier' | 'consultancyId'>) {
  const on = !(await featureOff('green-payments'));
  let tier = (org.tier as Tier) ?? 'FREE';
  if (tier === 'FREE' && org.consultancyId) {
    const c = await prisma.greenOrg.findUnique({ where: { id: org.consultancyId }, select: { tier: true } });
    if (c?.tier === 'CONSULTANCY') tier = 'PRO';
  }
  return { on, tier, pro: !on || tier !== 'FREE', limits: LIMITS, prices: on ? { pro: price('PRO'), consultancy: price('CONSULTANCY') } : null };
}
export async function needPro(org: Pick<Org, 'tier' | 'consultancyId'>, what: string) {
  if (!(await billingOf(org)).pro) throw new ForbiddenException(`${what} comes with Pro: choose it in Team & plan.`);
}
/** POST /green/biz/:id/billing { tier }: a Stripe Checkout address (the company's owners). */
export async function bizCheckout(u: SessionUser, id: string, b: Body, origin: string) {
  const { org } = await access(u, id, 'owner');
  if (await featureOff('green-payments')) throw new BadRequestException('Plans aren’t open yet: everything is free for now.');
  const stripe = getStripe();
  if (!stripe) throw new BadRequestException('Payments aren’t set up yet.');
  const tier = b.tier === 'CONSULTANCY' ? 'CONSULTANCY' : 'PRO';
  if (tier === 'CONSULTANCY' && org.kind !== 'consultancy') throw new BadRequestException('The Consultancy plan is for consultancies.');
  const cents = price(tier);
  if (!cents) throw new BadRequestException('That plan has no price yet. Ask UniVerse’s team.');
  if (org.tier !== 'FREE' && org.stripeSubscriptionId) throw new BadRequestException('You already pay: use “Manage billing” to change it.');
  const meta = { greenOrgId: org.id, greenTier: tier };
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription', customer: org.stripeCustomerId ?? undefined, customer_email: org.stripeCustomerId ? undefined : u.email,
    line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: cents, recurring: { interval: 'month' }, product_data: { name: `UniVerse Trace Carbon ${tier === 'PRO' ? 'Pro' : 'Consultancy'}: ${org.name.slice(0, 60)}` } } }],
    metadata: meta, subscription_data: { metadata: meta },
    success_url: `${origin}/green?view=business&b=team&paid=1`, cancel_url: `${origin}/green?view=business&b=team`,
  });
  return { url: session.url };
}
/** POST /green/biz/:id/billing/portal: Stripe's own page to change or cancel, and invoices. */
export async function bizPortal(u: SessionUser, id: string, origin: string) {
  const { org } = await access(u, id, 'owner');
  const stripe = getStripe();
  if (!stripe || !org.stripeCustomerId) throw new BadRequestException('Nothing to manage yet.');
  const s = await stripe.billingPortal.sessions.create({ customer: org.stripeCustomerId, return_url: `${origin}/green?view=business&b=team` });
  return { url: s.url };
}
/** From the Stripe webhook: a Green plan's subscription changed. True when it was one. */
export async function greenSubscription(sub: Stripe.Subscription): Promise<boolean> {
  const orgId = sub.metadata?.greenOrgId;
  if (!orgId) return false;
  const on = sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due';
  const tier = sub.metadata?.greenTier === 'CONSULTANCY' ? 'CONSULTANCY' : 'PRO';
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  await prisma.greenOrg.updateMany({ where: { id: orgId }, data: { tier: on ? tier : 'FREE', stripeCustomerId: customer, stripeSubscriptionId: on ? sub.id : null } });
  return true;
}

// ——— Certificates, offsets, removals (M279) ———
const CREDIT_KINDS = ['rec', 'offset', 'removal'] as const;
/** The year's register and its sums: certificates in MWh against the renewable-tariff electricity they back. */
export async function bizCredits(orgId: string, year: number) {
  const [rows, green] = await Promise.all([
    prisma.greenCredit.findMany({ where: { orgId, year }, orderBy: { createdAt: 'asc' }, take: 300 }),
    prisma.greenEntry.aggregate({ where: { orgId, category: 'electricity-green', period: { gte: `${year}-01`, lte: `${year}-12` } }, _sum: { quantity: true } }),
  ]);
  const sum = (k: string, retired?: boolean) => r3(rows.filter((r) => r.kind === k && (retired === undefined || r.retired === retired)).reduce((a, r) => a + r.quantity, 0));
  const greenMwh = r3((green._sum.quantity ?? 0) / 1000);
  return { rows, recMwh: sum('rec'), greenMwh, backed: sum('rec') >= greenMwh, offsetT: sum('offset'), removalT: sum('removal'), retiredT: r3(sum('offset', true) + sum('removal', true)) };
}
/** GET /green/biz/:id/credits?year= */
export async function bizCreditList(u: SessionUser, id: string, q: Query) {
  await access(u, id, 'viewer');
  return bizCredits(id, yearQ(q));
}
/** POST /green/biz/:id/credits { kind, year, quantity, registry, project, serial, vintage, retired, note } */
export async function addBizCredit(u: SessionUser, id: string, b: Body) {
  await access(u, id, 'editor');
  const kind = CREDIT_KINDS.find((k) => k === b.kind);
  const quantity = num(b.quantity, 0.001, 1e9), year = num(b.year, 2000, 2100);
  if (!kind || quantity === null || year === null) throw new BadRequestException('What it is, how much and for which year.');
  if ((await prisma.greenCredit.count({ where: { orgId: id } })) >= 1000) throw new BadRequestException('1,000 entries at most.');
  const vintage = num(b.vintage, 1990, 2100);
  const row = await prisma.greenCredit.create({ data: {
    orgId: id, kind, quantity, year: Math.round(year), registry: short(b.registry, 60), project: short(b.project, 120), serial: short(b.serial, 120),
    vintage: vintage === null ? null : Math.round(vintage), retired: b.retired === true, note: short(b.note, 200),
  } });
  await log(id, u.id, 'credit', `${kind === 'rec' ? 'Energy certificates' : kind === 'offset' ? 'Offsets' : 'Removals'} added for ${row.year}: ${quantity.toLocaleString('en')} ${kind === 'rec' ? 'MWh' : 't'}${row.registry ? ` (${row.registry})` : ''}${row.retired ? ', retired' : ''}`);
  return { id: row.id };
}
/** DELETE /green/biz/:id/credits/:cid */
export async function removeBizCredit(u: SessionUser, id: string, cid: string) {
  await access(u, id, 'editor');
  const c = await prisma.greenCredit.findFirst({ where: { id: cid, orgId: id } });
  if (!c) throw new NotFoundException('That entry isn’t here.');
  await prisma.greenCredit.delete({ where: { id: cid } });
  await log(id, u.id, 'credit', `Removed: ${c.quantity.toLocaleString('en')} ${c.kind === 'rec' ? 'MWh of certificates' : `t of ${c.kind === 'offset' ? 'offsets' : 'removals'}`} for ${c.year}`);
  return { ok: true };
}

// ——— Verification (M278) ———
const STANDARDS = ['ISO 14064-3', 'ISAE 3410', 'AA1000AS v3'] as const;
const LEVELS = ['limited', 'reasonable'] as const;
type Snapshot = { year: number; kg: number; scope: Record<1 | 2 | 3, number>; location: number; lines: number; log: string | null };
const snap = (year: number, t: Totals, lines: number, logHead: string | null): Snapshot => ({ year, kg: t.kg, scope: t.scope, location: t.scope2.location, lines, log: logHead });
const signatureOf = (v: { verifierId: string; firm: string; standard: string; level: string; opinion: string; snapshot: string; signedAt: Date }) =>
  sha([v.snapshot, v.verifierId, v.firm, v.standard, v.level, v.opinion, v.signedAt.toISOString()].join('|'));

async function verification(u: SessionUser, id: string, vid: string) {
  const v = await prisma.greenVerification.findFirst({ where: { id: vid, orgId: id } });
  if (!v) throw new NotFoundException('That verification isn’t here.');
  return v;
}
/** GET /green/biz/:id/verifications: every year's reviews with their questions (anyone in the company, and the verifier). */
export async function bizVerifications(u: SessionUser, id: string) {
  const { role } = await access(u, id, 'viewer');
  const rows = await prisma.greenVerification.findMany({ where: { orgId: id }, orderBy: { createdAt: 'desc' }, take: 30 });
  const [queries, people] = await Promise.all([
    rows.length ? prisma.greenQuery.findMany({ where: { verificationId: { in: rows.map((r) => r.id) } }, orderBy: { createdAt: 'asc' }, take: 1000 }) : [],
    rows.length ? prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.verifierId))] } }, select: { id: true, name: true } }) : [],
  ]);
  return {
    role, me: u.id,
    verifications: rows.map((v) => ({
      id: v.id, year: v.year, firm: v.firm, verifier: people.find((p) => p.id === v.verifierId)?.name ?? 'A verifier', mine: v.verifierId === u.id, status: v.status,
      standard: v.standard, level: v.level, scopes: v.scopes ? JSON.parse(v.scopes) : null, accreditation: v.accreditation, opinion: v.opinion,
      snapshot: v.snapshot ? JSON.parse(v.snapshot) : null, signature: v.signature, signedAt: v.signedAt, createdAt: v.createdAt,
      queries: queries.filter((q) => q.verificationId === v.id).map((q) => ({ id: q.id, entryId: q.entryId, question: q.question, answer: q.answer, status: q.status, createdAt: q.createdAt, answeredAt: q.answeredAt })),
    })),
  };
}
/** POST /green/biz/:id/verifications { email, firm, year }: invites a verifier (an existing account) to review a year (owners). */
export async function inviteVerifier(u: SessionUser, id: string, b: Body) {
  const { org } = await access(u, id, 'owner');
  await needPro(org, 'Verification');
  const email = (str(b.email) ?? '').trim().toLowerCase(), firm = short(b.firm, 100), year = num(b.year, 2000, 2100);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !firm || year === null) throw new BadRequestException('The verifier’s UniVerse email, their firm and the year.');
  const who = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!who) throw new NotFoundException('Nobody uses UniVerse with that email yet: ask them to sign up first.');
  if (who.id === u.id) throw new BadRequestException('A verifier must be independent of the company.');
  const member = await prisma.greenOrgMember.findUnique({ where: { orgId_userId: { orgId: id, userId: who.id } } });
  if (member && member.role !== 'verifier') throw new BadRequestException('They work on this footprint: a verifier must be independent.');
  if (!member) await prisma.greenOrgMember.create({ data: { orgId: id, userId: who.id, role: 'verifier' } });
  const v = await prisma.greenVerification.create({ data: { orgId: id, year: Math.round(year), verifierId: who.id, firm }, select: { id: true } });
  await log(id, u.id, 'verification', `Verifier from ${firm} invited for ${Math.round(year)}`);
  await notify(who.id, { title: `${org.name} asks you to verify its ${Math.round(year)} footprint`, body: `Review the lines, ask questions and sign your statement in UniVerse Trace → Carbon (for ${firm}).`, link: '/trace/carbon?b=verify', type: 'info', email: false });
  return v;
}
/** POST /green/biz/:id/verifications/:vid/queries { entryId?, question }: the verifier asks. */
export async function askQuery(u: SessionUser, id: string, vid: string, b: Body) {
  await access(u, id, 'viewer');
  const v = await verification(u, id, vid);
  if (v.verifierId !== u.id || v.status !== 'reviewing') throw new ForbiddenException('Only the verifier asks, while reviewing.');
  const question = short(b.question, 800);
  if (!question) throw new BadRequestException('Type the question.');
  const entryId = typeof b.entryId === 'string' && (await prisma.greenEntry.findFirst({ where: { id: b.entryId, orgId: id }, select: { id: true } })) ? b.entryId : null;
  if ((await prisma.greenQuery.count({ where: { verificationId: vid } })) >= 300) throw new BadRequestException('300 questions at most.');
  const q = await prisma.greenQuery.create({ data: { orgId: id, verificationId: vid, entryId, question }, select: { id: true } });
  const editors = await prisma.greenOrgMember.findMany({ where: { orgId: id, role: { in: ['owner', 'editor'] } }, select: { userId: true }, take: 20 });
  for (const e of editors) await notify(e.userId, { title: 'Your verifier has a question', body: question.slice(0, 140), link: '/trace/carbon?b=verify', type: 'info', email: false });
  return q;
}
/** POST …/queries/:qid/answer { answer } (editors) and …/queries/:qid/close (the verifier). */
export async function answerQuery(u: SessionUser, id: string, vid: string, qid: string, b: Body) {
  await access(u, id, 'editor');
  const answer = short(b.answer, 1500);
  if (!answer) throw new BadRequestException('Type the answer.');
  const r = await prisma.greenQuery.updateMany({ where: { id: qid, verificationId: vid, orgId: id, status: { not: 'closed' } }, data: { answer, status: 'answered', answeredAt: new Date() } });
  if (!r.count) throw new NotFoundException('That question isn’t open.');
  return { ok: true };
}
export async function closeQuery(u: SessionUser, id: string, vid: string, qid: string) {
  const v = await verification(u, id, vid);
  if (v.verifierId !== u.id) throw new ForbiddenException('Only the verifier closes a question.');
  await prisma.greenQuery.updateMany({ where: { id: qid, verificationId: vid }, data: { status: 'closed' } });
  return { ok: true };
}
/** POST …/:vid/sign { standard, level, scopes, accreditation, opinion }: the verifier's statement over today's numbers. */
export async function signVerification(u: SessionUser, id: string, vid: string, b: Body) {
  const { org } = await access(u, id, 'viewer');
  const v = await verification(u, id, vid);
  if (v.verifierId !== u.id) throw new ForbiddenException('Only the invited verifier signs.');
  if (v.status !== 'reviewing') throw new BadRequestException('This review is already closed.');
  const standard = STANDARDS.find((s) => s === b.standard), level = LEVELS.find((l) => l === b.level), opinion = short(b.opinion, 2000);
  const scopes = (Array.isArray(b.scopes) ? b.scopes : []).map(Number).filter((s) => s === 1 || s === 2 || s === 3);
  if (!standard || !level || !opinion || !scopes.length) throw new BadRequestException('The standard, the level of assurance, the scopes covered and your opinion.');
  if (await prisma.greenQuery.count({ where: { verificationId: vid, status: 'open' } })) throw new BadRequestException('Some questions haven’t been answered yet.');
  const lines = await prisma.greenEntry.findMany({ where: { orgId: id, period: { gte: `${v.year}-01`, lte: `${v.year}-12` } }, select: { period: true, category: true, scope: true, kg: true, quantity: true, quality: true, site: true }, take: 5000 });
  const head = await prisma.greenAudit.findFirst({ where: { orgId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { hash: true } });
  const snapshot = JSON.stringify(snap(v.year, yearTotals(org, lines, v.year), lines.length, head?.hash ?? null)), signedAt = new Date();
  const data = { standard, level, opinion, scopes: JSON.stringify([...new Set(scopes)].sort()), accreditation: short(b.accreditation, 120), snapshot, signedAt, status: 'signed' };
  const signature = signatureOf({ verifierId: u.id, firm: v.firm, standard, level, opinion, snapshot, signedAt });
  await prisma.greenVerification.update({ where: { id: vid }, data: { ...data, signature } });
  await log(id, u.id, 'verified', `${v.year} verified by ${v.firm}: ${level} assurance, ${standard}, scopes ${[...new Set(scopes)].sort().join('+')}`);
  return { signature };
}
/** POST …/:vid/withdraw: the verifier or the company's owners end a review (a signed one stays in the record as withdrawn). */
export async function withdrawVerification(u: SessionUser, id: string, vid: string) {
  const v = await verification(u, id, vid);
  if (v.verifierId !== u.id) await access(u, id, 'owner');
  await prisma.greenVerification.update({ where: { id: vid }, data: { status: 'withdrawn' } });
  await log(id, u.id, 'verification', `Verification of ${v.year} by ${v.firm} withdrawn`);
  return { ok: true };
}
/** For the report: the year's latest signed statement, its signature checked, and whether the numbers moved since. */
export async function verificationFor(orgId: string, year: number, t: Totals, head: string | null) {
  const v = await prisma.greenVerification.findFirst({ where: { orgId, year, status: 'signed' }, orderBy: { signedAt: 'desc' } });
  if (!v || !v.snapshot || !v.signedAt) return null;
  const s = JSON.parse(v.snapshot) as Snapshot;
  const who = await prisma.user.findUnique({ where: { id: v.verifierId }, select: { name: true } });
  const intact = signatureOf({ verifierId: v.verifierId, firm: v.firm, standard: v.standard ?? '', level: v.level ?? '', opinion: v.opinion ?? '', snapshot: v.snapshot, signedAt: v.signedAt }) === v.signature;
  const changed = Math.abs(s.kg - t.kg) > 0.5 || [1, 2, 3].some((k) => Math.abs(s.scope[k as 1] - t.scope[k as 1]) > 0.5);
  return { firm: v.firm, verifier: who?.name ?? 'A verifier', standard: v.standard, level: v.level, scopes: v.scopes ? JSON.parse(v.scopes) as number[] : [], accreditation: v.accreditation, opinion: v.opinion, signedAt: v.signedAt, signature: v.signature, intact, changed, snapshot: s, logAtSigning: s.log, logNow: head };
}

// ——— Benchmark (M279) ———
const MIN_PEERS = 5;
const quart = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; return { p25: r3(q(0.25)), median: r3(q(0.5)), p75: r3(q(0.75)) }; };
/** GET /green/biz/:id/benchmark?year=: tonnes per person and per million dollars of revenue against companies in the same
 *  industry, as quartiles, once at least five others have data; never any company's name or number. */
export async function bizBenchmark(u: SessionUser, id: string, q: Query) {
  const { org } = await access(u, id, 'viewer');
  const year = yearQ(q);
  if (!org.industry) return { year, industry: null, peers: 0, enough: false };
  const peers = (await prisma.$queryRawUnsafe<{ id: string; employees: number | null; revenue: number | null; currency: string; country: string | null }[]>(
    `SELECT "id", "employees", "revenue", "currency", "country" FROM "green_orgs" WHERE lower("industry") = lower(?) AND "kind" = 'company' AND "id" <> ? AND "id" NOT LIKE 'smp%' LIMIT 300`, org.industry, id,
  ));
  const rows: { perPerson: number | null; perMusd: number | null }[] = [];
  for (let i = 0; i < peers.length; i += 90) {
    const chunk = peers.slice(i, i + 90);
    const sums = await prisma.greenEntry.groupBy({ by: ['orgId'], where: { orgId: { in: chunk.map((p) => p.id) }, period: { gte: `${year}-01`, lte: `${year}-12` } }, _sum: { kg: true } });
    for (const s of sums) {
      const p = chunk.find((c) => c.id === s.orgId)!, t = (s._sum.kg ?? 0) / 1000, usd = p.revenue ? p.revenue * (USD_PER[p.currency] ?? 1) : 0;
      if (t > 0) rows.push({ perPerson: p.employees ? t / p.employees : null, perMusd: usd ? t / (usd / 1e6) : null });
    }
  }
  if (rows.length < MIN_PEERS) return { year, industry: org.industry, peers: rows.length, enough: false };
  const mine = await prisma.greenEntry.aggregate({ where: { orgId: id, period: { gte: `${year}-01`, lte: `${year}-12` } }, _sum: { kg: true } });
  const t = (mine._sum.kg ?? 0) / 1000, usd = org.revenue ? org.revenue * (USD_PER[org.currency] ?? 1) : 0;
  const pp = rows.map((r) => r.perPerson).filter((x): x is number => x !== null), pm = rows.map((r) => r.perMusd).filter((x): x is number => x !== null);
  const below = (xs: number[], v: number) => Math.round((xs.filter((x) => x <= v).length / xs.length) * 100);
  return {
    year, industry: org.industry, peers: rows.length, enough: true,
    perPerson: pp.length >= MIN_PEERS ? { ...quart(pp), mine: org.employees ? r3(t / org.employees) : null, rank: org.employees ? below(pp, t / org.employees) : null } : null,
    perMusd: pm.length >= MIN_PEERS ? { ...quart(pm), mine: usd ? r3(t / (usd / 1e6)) : null, rank: usd ? below(pm, t / (usd / 1e6)) : null } : null,
  };
}
