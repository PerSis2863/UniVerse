import { NextResponse } from 'next/server';
import { publicReport, reportCsv, type ReportData } from '@/server/impact-report';
import prisma from '@/lib/db';

// A published impact report, with its verification result. ?format=csv downloads the figures;
// ?format=jwt the signed snapshot (for auditors).
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await publicReport(slug);
  if (!r) return NextResponse.json({ error: 'This report doesn’t exist or was withdrawn.' }, { status: 404 });
  const format = new URL(req.url).searchParams.get('format');
  if (format === 'csv') {
    const full = await prisma.impactReport.findUnique({ where: { slug }, select: { data: true } });
    return new NextResponse(reportCsv(full!.data as unknown as ReportData), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="universe-impact-report-${slug}.csv"` } });
  }
  if (format === 'jwt') return new NextResponse(r.jwt, { headers: { 'Content-Type': 'application/jwt', 'Content-Disposition': `attachment; filename="universe-impact-report-${slug}.jwt"` } });
  const { jwt: _jwt, ...rest } = r;
  void _jwt;
  return NextResponse.json(rest, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}
