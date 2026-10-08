import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { later } from '@/server/email';
import { oneOf, str, type Body } from '@/server/body';
import { VITALS } from '@/lib/web-vitals';

// POST: a browser's page-speed measures for one page load (src/lib/web-vitals.ts, 10% of loads).
// Anonymous (no account, no cookies). Only from this site's pages; at most one row per measure.
const MAX: Record<string, number> = { LCP: 60_000, INP: 60_000, FCP: 60_000, TTFB: 60_000, CLS: 10 };

export async function POST(req: Request) {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return new NextResponse(null, { status: 403 });
  const raw = await req.text().catch(() => '');
  if (!raw || raw.length > 2000) return new NextResponse(null, { status: 400 });
  let b: Body;
  try { b = JSON.parse(raw) as Body; } catch { return new NextResponse(null, { status: 400 }); }
  const page = str(b.page);
  const device = oneOf(['phone', 'desktop'] as const, b.device) ? b.device : null;
  if (!page || !page.startsWith('/') || page.length > 120 || !device || !Array.isArray(b.metrics)) return new NextResponse(null, { status: 400 });
  const seen = new Set<string>();
  const data = b.metrics.slice(0, VITALS.length).flatMap((m) => {
    const x = m as Body;
    if (!oneOf(VITALS, x.name) || seen.has(x.name) || typeof x.value !== 'number' || !Number.isFinite(x.value) || x.value < 0 || x.value > MAX[x.name]) return [];
    seen.add(x.name);
    return [{ page, device, metric: x.name, value: Math.round(x.value * 1000) / 1000 }];
  });
  if (data.length) later(() => prisma.webVital.createMany({ data }));
  return new NextResponse(null, { status: 204 });
}
