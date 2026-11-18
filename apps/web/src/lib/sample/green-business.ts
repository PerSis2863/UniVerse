import { CATEGORIES, COMMUTE, CURRENCIES, factorFor, kgFor, leverCuts, targetPath, totals, type Line } from '@/lib/carbon-ledger';

// "Explore with sample data" for Green → Business (M269–M275): a made-up textile company in India, managed by a
// made-up consultancy, with a year and a half of ledger lines, suppliers, a commute survey and a log. Answered in the
// browser; nothing reaches the server.

const SCREEN = { 8: { status: 'not-relevant', reason: 'We own our offices and vehicles' }, 13: { status: 'not-relevant', reason: 'Nothing leased out' }, 14: { status: 'not-relevant', reason: 'No franchises' }, 15: { status: 'not-relevant', reason: 'No investments' }, 11: { status: 'excluded', reason: 'Fabric uses no energy; washing by customers estimated next year' } };
const CO = { id: 'smp-green-co', name: 'Sample Looms Pvt Ltd', kind: 'company' as const, country: 'IN', industry: 'Textiles', employees: 140, revenue: 420_000_000, currency: 'INR', baseYear: new Date().getFullYear() - 1, targetYear: 2030, targetPct: 42, consultancyId: 'smp-green-cons', carbonPrice: 2500, screening: SCREEN };
const CONS = { id: 'smp-green-cons', name: 'Sample Carbon Advisors', kind: 'consultancy' as const, country: 'IN', industry: 'Sustainability consulting', employees: 12, revenue: 30_000_000, currency: 'INR', baseYear: null, targetYear: null, targetPct: null, consultancyId: null, carbonPrice: null, screening: {} };
const SITES = ['Tiruppur mill', 'Bengaluru office'];
const T = (ls: Line[], year: number) => totals(ls, year, { country: 'IN', upstream: true });
const BILLING = { on: false, tier: 'FREE', pro: true, limits: { lines: 150, suppliers: 5, clients: 2 }, prices: null };
const orgOf = (id: string) => (id === CONS.id ? CONS : CO);
const MONTHLY: [string, number][] = [['electricity', 42_000], ['diesel', 900], ['gas', 18_000], ['flight-short', 9_000], ['hotel', 14], ['freight-road', 60_000], ['waste-landfill', 2_400], ['waste-recycled', 1_800], ['buy-materials', 2_600_000], ['water', 900]];

function lines(year: number) {
  const now = new Date(), last = year < now.getFullYear() ? 12 : now.getMonth() + 1;
  const out: (Line & { id: string; factor: number; factorSource: string; note: string | null; source: string; refId: string | null; quality: string; site: string | null; updatedAt: string })[] = [];
  for (let m = 1; m <= last; m++) {
    const period = `${year}-${String(m).padStart(2, '0')}`, wobble = 1 + Math.sin(m * 1.7 + year) * 0.12 - (year - CO.baseYear) * 0.06;
    for (const [id, q] of MONTHLY) {
      const c = CATEGORIES.find((x) => x.id === id)!, quantity = Math.round(q * wobble), factor = factorFor(c, CO.country, CO.currency);
      out.push({ id: `smp-gl-${period}-${id}`, period, category: id, scope: c.scope, quantity, factor, factorSource: c.source, kg: kgFor(quantity, factor), note: null, source: m % 4 === 0 ? 'import' : 'manual', refId: null, quality: c.unit === 'money' ? 'spend' : id === 'electricity' || id === 'diesel' || id === 'gas' ? 'measured' : 'calculated', site: id === 'flight-short' || id === 'hotel' ? SITES[1] : SITES[0], updatedAt: `${period}-28T10:00:00Z` });
    }
  }
  if (last === 12 || year === now.getFullYear()) out.push({ id: `smp-gl-${year}-commute`, period: `${year}-12`, category: 'commute', scope: 3, quantity: 61_000, factor: 1, factorSource: 'The staff commute survey', kg: 61_000, note: '88 answers, scaled to 140 staff', source: 'survey', refId: null, quality: 'estimated', site: null, updatedAt: `${year}-12-01T10:00:00Z` });
  return out;
}
const yearOf = (q: URLSearchParams) => Number(q.get('year')) || new Date().getFullYear();

/** GET /green/biz */
export const sampleBizList = () => ({ orgs: [
  { id: CONS.id, name: CONS.name, kind: 'consultancy', role: 'owner', consultancy: null, consultancyId: null },
  { id: CO.id, name: CO.name, kind: 'company', role: 'owner', consultancy: CONS.name, consultancyId: CONS.id },
] });
/** GET /green/biz/:id */
export function sampleBizOrg(id: string, q: URLSearchParams) {
  const org = orgOf(id), year = yearOf(q), mine = org === CO;
  return {
    org, role: 'owner', year, consultancy: mine ? CONS.name : null,
    totals: T(mine ? lines(year) : [], year), before: T(mine ? lines(year - 1) : [], year - 1), billing: BILLING, sites: mine ? SITES : [],
    years: [year, year - 1], counts: { lines: mine ? lines(year).length : 0, suppliers: mine ? 4 : 0, answered: mine ? 2 : 0, commutes: mine ? 88 : 0 },
    plan: { levers: mine ? { renewable: { share: 0.5, cost: 0, saving: 0 }, rail: { share: 0.4, cost: 0, saving: 0 }, recycling: { share: 0.6, cost: 50_000, saving: 20_000 } } : {} },
  };
}
/** GET /green/biz/:id/entries */
export const sampleBizEntries = (id: string, q: URLSearchParams) => ({ year: yearOf(q), entries: orgOf(id) === CO ? lines(yearOf(q)).reverse() : [] });
/** GET /green/biz/:id/suppliers */
export const sampleBizSuppliers = (_id: string, q: URLSearchParams) => ({ year: yearOf(q), currency: 'INR', suppliers: [
  { id: 'smp-gs-1', name: 'Sample Cotton Mills', contact: null, spend: 18_000_000, code: 'SSAMPLE1', status: 'answered', kg: 96_400, answer: { scope1: 2100, scope2: 6800, scope3: null, revenue: 1_660_000_000, currency: 'INR', method: 'GHG Protocol' }, answeredAt: new Date().toISOString() },
  { id: 'smp-gs-2', name: 'Sample Dyes & Chemicals', contact: null, spend: 6_500_000, code: 'SSAMPLE2', status: 'answered', kg: 31_200, answer: { scope1: 900, scope2: 1500, scope3: 4100, revenue: 500_000_000, currency: 'INR', method: null }, answeredAt: new Date().toISOString() },
  { id: 'smp-gs-3', name: 'Sample Packaging Co', contact: null, spend: 2_100_000, code: 'SSAMPLE3', status: 'asked', kg: null, answer: null, answeredAt: null },
  { id: 'smp-gs-4', name: 'Sample Freight Lines', contact: null, spend: 3_400_000, code: 'SSAMPLE4', status: 'asked', kg: null, answer: null, answeredAt: null },
] });
/** GET /green/biz/:id/staff */
export const sampleBizStaff = () => ({
  surveyCode: 'CSAMPLE', answers: 88, employees: 140, kg: 38_800, linked: 21, greenSaved: { kg: 1_240, actions: 312 },
  byMode: { car: { people: 22, kg: 25_400 }, motorbike: { people: 31, kg: 9_800 }, bus: { people: 18, kg: 3_100 }, metro: { people: 9, kg: 500 }, cycle: { people: 5, kg: 0 }, home: { people: 3, kg: 0 } },
});
/** GET /green/biz/:id/members */
export const sampleBizMembers = (me: { id: string; name: string }) => ({ consultancy: CONS.name, members: [{ userId: me.id, name: me.name, role: 'owner', me: true }, { userId: 'smp-u-2', name: 'Priya Raman', role: 'editor', me: false }, { userId: 'smp-u-3', name: 'Arjun Mehta', role: 'viewer', me: false }] });
/** GET /green/biz/:id/audit */
export const sampleBizAudit = () => ({
  auditCode: null, whole: true, count: 214, head: 'a3f1c09e5b77d2a41c8e0f6b93d5e2a17c4b8f0e9d6a5c3b2e1f0a9d8c7b6a5f4',
  rows: ['Supplier asked: Sample Freight Lines', '12 lines imported = 41,220 kg', 'Electricity from the grid, 2026-03: 41,000 kWh = 29,356 kg', 'Sample Cotton Mills answered: our share 96,400 kg', 'Reduction plan saved: renewable 50%, rail 40%, recycling 60%']
    .map((detail, i) => ({ id: `smp-ga-${i}`, action: 'added', detail, who: i === 3 ? null : 'Priya Raman', hash: `${(i + 10).toString(16)}f1c09e5b77d2a41c8e0f6b93d5e2a17c4b8f0e9d6a5c3b2e1f0a9d8c7b6a5f4`, createdAt: new Date(Date.now() - i * 86_400_000).toISOString() })),
});
/** GET /green/biz/:id/report */
export function sampleBizReport(id: string, q: URLSearchParams) {
  const org = orgOf(id), year = yearOf(q), ls = org === CO ? lines(year) : [], t = T(ls, year), base = T(org === CO ? lines(CO.baseYear) : [], CO.baseYear);
  const byS3: Record<number, number> = {};
  for (const [cat, kg] of Object.entries(t.byCategory)) { const c = CATEGORIES.find((x) => x.id === cat); if (c?.s3) byS3[c.s3] = (byS3[c.s3] ?? 0) + kg; }
  const cuts = leverCuts(t.byCategory, { renewable: { share: 0.5, cost: 0, saving: 0 }, rail: { share: 0.4, cost: 0, saving: 0 }, recycling: { share: 0.6, cost: 0, saving: 0 } }, 'IN');
  return {
    org, year, preparedBy: org === CO ? CONS.name : null, generatedAt: new Date().toISOString(), totals: t, byS3,
    base: { year: CO.baseYear, kg: base.kg, scope: base.scope },
    intensity: { perEmployee: org.employees ? t.kg / org.employees : null, s12PerMillionRevenue: ((t.scope[1] + t.scope[2]) / org.revenue) * 1e6, perMillionRevenue: (t.kg / org.revenue) * 1e6 },
    target: { baseYear: CO.baseYear, targetYear: 2030, pct: 42, path: targetPath(base.kg, CO.baseYear, 2030, 42) },
    plan: { cutsKg: cuts, totalKg: Object.values(cuts).reduce((a, b) => a + b, 0) },
    factors: MONTHLY.map(([id]) => { const c = CATEGORIES.find((x) => x.id === id)!; return { category: id, label: c.label, unit: c.unit, factor: factorFor(c, 'IN', 'INR'), source: c.source }; }),
    data: { lines: ls.length, suppliers: 4, suppliersAnswered: 2, commuteAnswers: 88 },
    audit: { hash: sampleBizAudit().head, at: new Date().toISOString() },
    scope2: t.scope2, quality: t.quality, bySite: t.bySite, screening: org.screening, carbonCost: org.carbonPrice ? Math.round((t.kg / 1000) * org.carbonPrice) : null,
    credits: { recMwh: 120, greenMwh: 0, backed: true, offsetT: 0, removalT: 40, retiredT: 40 }, verification: null,
  };
}
/** GET /green/biz/:id/trace */
export const sampleBizTrace = () => ({ brand: null, products: [] });
/** GET /green/biz/:id/clients */
export function sampleBizClients(_id: string, q: URLSearchParams) {
  const year = yearOf(q), t = T(lines(year), year), b = T(lines(year - 1), year - 1);
  return { year, clients: [
    { id: CO.id, name: CO.name, industry: CO.industry, country: 'IN', employees: CO.employees, baseYear: CO.baseYear, targetPct: 42, targetYear: 2030, kg: t.kg, scope: t.scope, before: b.kg, months: Object.keys(t.byMonth).length, asked: 4, answered: 2, quality: t.quality.score },
    { id: 'smp-green-co2', name: 'Sample Spice Exports', industry: 'Food', country: 'IN', employees: 60, baseYear: null, targetPct: null, targetYear: null, kg: 412_000, scope: { 1: 98_000, 2: 141_000, 3: 173_000 }, before: 455_000, months: 9, asked: 3, answered: 1 },
  ] };
}
/** GET /green/link/:code: the staff survey, as a visitor would see it. */
export const sampleCarbonLink = () => ({ kind: 'survey', org: CO.name, year: new Date().getFullYear(), modes: Object.entries(COMMUTE).map(([id, m]) => ({ id, label: m.label })), currencies: CURRENCIES });
/** GET /green/biz/:id/credits (M279) */
export const sampleBizCredits = (_id: string, q: URLSearchParams) => ({
  rows: [
    { id: 'smp-gc-1', kind: 'rec', year: yearOf(q), quantity: 120, registry: 'I-REC Standard', project: 'Sample wind farm, Tamil Nadu', serial: 'SMP-0001–0120', vintage: yearOf(q), retired: true, note: null },
    { id: 'smp-gc-2', kind: 'removal', year: yearOf(q), quantity: 40, registry: 'Puro.earth', project: 'Sample biochar', serial: 'SMP-BC-40', vintage: yearOf(q), retired: true, note: null },
  ], recMwh: 120, greenMwh: 0, backed: true, offsetT: 0, removalT: 40, retiredT: 40,
});
/** GET /green/biz/:id/verifications (M278) */
export const sampleBizVerifications = (me: { id: string }) => ({ role: 'owner', me: me.id, verifications: [{
  id: 'smp-gv-1', year: new Date().getFullYear() - 1, firm: 'Sample Assurance LLP', verifier: 'Kavya Nair', mine: false, status: 'reviewing', standard: null, level: null, scopes: null, accreditation: null, opinion: null, snapshot: null, signature: null, signedAt: null, createdAt: new Date().toISOString(),
  queries: [
    { id: 'smp-gq-1', entryId: null, question: 'Please share the March electricity bill for the Tiruppur mill.', answer: 'Attached in our drive: bill 4471, 41,000 kWh.', status: 'answered', createdAt: new Date().toISOString(), answeredAt: new Date().toISOString() },
    { id: 'smp-gq-2', entryId: null, question: 'How was the commuting survey scaled to all staff?', answer: null, status: 'open', createdAt: new Date().toISOString(), answeredAt: null },
  ],
}] });
/** GET /green/biz/:id/benchmark (M279) */
export const sampleBizBenchmark = (_id: string, q: URLSearchParams) => ({ year: yearOf(q), industry: 'Textiles', peers: 12, enough: true, perPerson: { p25: 3.1, median: 5.4, p75: 8.2, mine: 4.6, rank: 42 }, perMusd: { p25: 120, median: 210, p75: 330, mine: 180, rank: 45 } });
