import { createHash, randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import { COMPANY } from '@/lib/company';
import { CredentialSigner, publicAppUrl } from './services/credential-signer';

// Verified impact reports for sponsors and partner organisations (e.g. for CSRD / ESRS social
// disclosures). A report counts only verified credentials — work checked by staff and signed —
// for a period (and optionally one organisation), freezes the figures, and signs the snapshot
// with the platform key. The public report page re-checks the signature, so a sponsor or auditor
// can see the figures haven't been changed since they were issued.

export const reportUrl = (slug: string) => `${publicAppUrl()}/reports/${slug}`;

export interface ReportData {
  version: 1;
  title: string;
  issuer: string;
  organization: string | null;
  period: { from: string; to: string };
  generatedAt: string;
  totals: { verifiedHours: number; peopleReached: number; credentials: number; students: number; organizations: number };
  byOrganization: { name: string; hours: number; people: number; credentials: number; students: number }[];
  byMonth: { month: string; hours: number; credentials: number }[];
  byProject: { project: string; organization: string; hours: number; people: number; credentials: number }[];
  sdgs: { goal: number; credentials: number }[];
  /** SHA-256 of each counted credential id, so an auditor can check any one of them with us. */
  evidence: { count: number; root: string; fingerprints: string[] };
  method: string;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Figures for a period from verified, signed, non-revoked credentials. */
export async function computeReport(opts: { title: string; organization: string | null; from: Date; to: Date }): Promise<ReportData> {
  const certs = await prisma.impactCertificate.findMany({
    where: {
      status: 'ISSUED', revokedAt: null, signature: { not: null },
      issuedAt: { gte: opts.from, lte: opts.to },
      ...(opts.organization ? { organization: opts.organization } : {}),
    },
    select: { id: true, userId: true, organization: true, projectName: true, hoursCompleted: true, peopleImpacted: true, issuedAt: true },
    orderBy: { issuedAt: 'asc' },
    take: 20_000,
  });
  // SDGs: from verified NGOs whose name matches the credential's organisation.
  const orgNames = [...new Set(certs.map((c) => c.organization))];
  const ngos = orgNames.length ? await prisma.nGO.findMany({ where: { name: { in: orgNames.slice(0, 90) } }, select: { name: true, sdgNumbers: true } }) : [];
  const sdgOf = new Map(ngos.map((n) => [n.name, (Array.isArray(n.sdgNumbers) ? n.sdgNumbers : []).filter((x): x is number => typeof x === 'number' && x >= 1 && x <= 17)]));

  const group = <K extends string>(key: (c: (typeof certs)[number]) => K) => {
    const m = new Map<K, typeof certs>();
    for (const c of certs) m.set(key(c), [...(m.get(key(c)) ?? []), c]);
    return m;
  };
  const sum = (cs: typeof certs, f: (c: (typeof certs)[number]) => number) => cs.reduce((n, c) => n + f(c), 0);

  const byOrganization = [...group((c) => c.organization)].map(([name, cs]) => ({ name, hours: sum(cs, (c) => c.hoursCompleted), people: sum(cs, (c) => c.peopleImpacted), credentials: cs.length, students: new Set(cs.map((c) => c.userId)).size })).sort((a, b) => b.hours - a.hours);
  const byMonth = [...group((c) => c.issuedAt.toISOString().slice(0, 7))].map(([month, cs]) => ({ month, hours: sum(cs, (c) => c.hoursCompleted), credentials: cs.length })).sort((a, b) => a.month.localeCompare(b.month));
  const byProject = [...group((c) => `${c.projectName}\u0000${c.organization}`)].map(([k, cs]) => ({ project: k.split('\u0000')[0], organization: k.split('\u0000')[1], hours: sum(cs, (c) => c.hoursCompleted), people: sum(cs, (c) => c.peopleImpacted), credentials: cs.length })).sort((a, b) => b.hours - a.hours).slice(0, 50);
  const sdgCount = new Map<number, number>();
  for (const c of certs) for (const g of sdgOf.get(c.organization) ?? []) sdgCount.set(g, (sdgCount.get(g) ?? 0) + 1);

  const fingerprints = certs.map((c) => sha(`credential:${c.id}`));
  return {
    version: 1,
    title: opts.title,
    issuer: COMPANY.legalName,
    organization: opts.organization,
    period: { from: opts.from.toISOString().slice(0, 10), to: opts.to.toISOString().slice(0, 10) },
    generatedAt: new Date().toISOString(),
    totals: {
      verifiedHours: sum(certs, (c) => c.hoursCompleted),
      peopleReached: sum(certs, (c) => c.peopleImpacted),
      credentials: certs.length,
      students: new Set(certs.map((c) => c.userId)).size,
      organizations: orgNames.length,
    },
    byOrganization,
    byMonth,
    byProject,
    sdgs: [...sdgCount].map(([goal, credentials]) => ({ goal, credentials })).sort((a, b) => a.goal - b.goal),
    evidence: { count: fingerprints.length, root: sha(fingerprints.join('')), fingerprints },
    method: 'Counts only impact credentials that UniVerse staff verified against evidence before issuing and that were digitally signed (Ed25519), issued in the period, and not revoked. Hours and people reached are as recorded on each credential. SDGs come from the verified NGO profile of the organisation, where one exists. Figures are frozen when the report is issued.',
  };
}

/** Issues (stores and signs) a report. */
export async function issueReport(opts: { title: string; organization: string | null; from: Date; to: Date }, by: { id: string; name: string }) {
  const data = await computeReport(opts);
  const slug = randomBytes(9).toString('base64url');
  const jwt = CredentialSigner.signJwt({ iss: `${publicAppUrl()}/api/passport/issuer`, sub: reportUrl(slug), iat: Math.floor(Date.now() / 1000), report: data }, `${publicAppUrl()}/api/passport/jwks#${CredentialSigner.jwks().keys[0].kid}`);
  return prisma.impactReport.create({
    data: { slug, title: opts.title, organization: opts.organization, periodStart: opts.from, periodEnd: opts.to, data: data as object, jwt, createdById: by.id, createdByName: by.name },
  });
}

/** A public report with its verification result: the signature, and that the stored figures match it. */
export async function publicReport(slug: string) {
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(slug)) return null;
  const r = await prisma.impactReport.findUnique({ where: { slug } });
  if (!r || !r.isPublic) return null;
  void prisma.impactReport.update({ where: { id: r.id }, data: { views: { increment: 1 } } }).catch(() => {});
  let signatureValid = false, matches = false;
  try {
    const payload = CredentialSigner.verifyJwt(r.jwt);
    signatureValid = !!payload;
    matches = !!payload && JSON.stringify(payload.report) === JSON.stringify(r.data) && payload.sub === reportUrl(r.slug);
  } catch { /* signing key unavailable */ }
  const data = r.data as unknown as ReportData;
  return { slug: r.slug, url: reportUrl(r.slug), issuedBy: r.createdByName, issuedAt: r.createdAt, data: { ...data, evidence: { count: data.evidence.count, root: data.evidence.root } }, verification: { signatureValid, matches, verified: signatureValid && matches }, jwt: r.jwt };
}

/** The report as CSV (one table per section). */
export function reportCsv(d: ReportData) {
  const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows: unknown[][] = [
    ['UniVerse verified impact report', d.title], ['Organisation', d.organization ?? 'All organisations'], ['Period', `${d.period.from} to ${d.period.to}`], ['Issued by', d.issuer], ['Generated', d.generatedAt], [],
    ['Totals'], ['Verified hours', d.totals.verifiedHours], ['People reached', d.totals.peopleReached], ['Verified credentials', d.totals.credentials], ['Students', d.totals.students], ['Organisations', d.totals.organizations], [],
    ['By organisation'], ['Organisation', 'Hours', 'People reached', 'Credentials', 'Students'], ...d.byOrganization.map((o) => [o.name, o.hours, o.people, o.credentials, o.students]), [],
    ['By month'], ['Month', 'Hours', 'Credentials'], ...d.byMonth.map((m) => [m.month, m.hours, m.credentials]), [],
    ['By project'], ['Project', 'Organisation', 'Hours', 'People reached', 'Credentials'], ...d.byProject.map((p) => [p.project, p.organization, p.hours, p.people, p.credentials]), [],
    ['UN Sustainable Development Goals'], ['Goal', 'Credentials'], ...d.sdgs.map((s) => [`SDG ${s.goal}`, s.credentials]), [],
    ['Evidence'], ['Credentials counted', d.evidence.count], ['Evidence root (SHA-256)', d.evidence.root], [],
    ['Method'], [d.method],
  ];
  return rows.map((r) => r.map(esc).join(',')).join('\r\n');
}
