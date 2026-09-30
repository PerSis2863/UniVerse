import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { audit } from '@/server/audit';
import { computeReport, issueReport, reportUrl } from '@/server/impact-report';

// Verified impact reports (admins). GET: issued reports + organisations to choose from.
// POST { title, organization?, from, to, preview? } → a preview of the figures, or issues the report.
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Only admins can see impact reports.' }, { status: 403 });
  const [reports, orgs] = await Promise.all([
    prisma.impactReport.findMany({ orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, slug: true, title: true, organization: true, periodStart: true, periodEnd: true, isPublic: true, views: true, createdAt: true, createdByName: true } }),
    prisma.impactCertificate.groupBy({ by: ['organization'], where: { status: 'ISSUED', revokedAt: null }, _count: { _all: true }, orderBy: { _count: { organization: 'desc' } }, take: 100 }),
  ]);
  return NextResponse.json({
    reports: reports.map((r) => ({ ...r, url: reportUrl(r.slug) })),
    organizations: orgs.map((o) => ({ name: o.organization, credentials: o._count._all })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Only admins can issue impact reports.' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const from = new Date(b.from), to = new Date(b.to);
  if (isNaN(+from) || isNaN(+to) || from > to) return NextResponse.json({ error: 'Choose a valid period.' }, { status: 400 });
  to.setUTCHours(23, 59, 59, 999);
  const title = typeof b.title === 'string' && b.title.trim() ? b.title.trim().slice(0, 140) : 'Verified impact report';
  const organization = typeof b.organization === 'string' && b.organization.trim() ? b.organization.trim().slice(0, 200) : null;
  if (b.preview === true) return NextResponse.json(await computeReport({ title, organization, from, to }));
  try {
    const r = await issueReport({ title, organization, from, to }, { id: user.id, name: user.name });
    audit(user, { action: 'impact_report.issued', summary: `Issued impact report “${title}”${organization ? ` for ${organization}` : ''}`, targetType: 'impact_report', targetId: r.id }, req);
    return NextResponse.json({ id: r.id, url: reportUrl(r.slug) });
  } catch {
    return NextResponse.json({ error: 'Reports can’t be signed yet (the credential signing key is missing).' }, { status: 503 });
  }
}
