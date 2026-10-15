import { recordCspReports } from '@/server/csp-reports';

// Where browsers report what the Content-Security-Policy blocked (security-headers.ts: report-uri
// and report-to). Public, like the browser's own report; kept small (src/server/csp-reports.ts).
export async function POST(req: Request) {
  const text = await req.text().catch(() => '');
  if (text.length <= 64 * 1024) await recordCspReports(req.headers.get('content-type') ?? '', text).catch(() => {});
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
