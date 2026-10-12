import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { audit } from '@/server/audit';
import { generateWarehouseExport, listWarehouseExports } from '@/server/analytics-warehouse';

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only administrators can inspect data warehouse exports' }, { status: 403 });
  }

  const orgId = user.organizationId || 'default-org';
  const exportsList = await listWarehouseExports(orgId);
  return NextResponse.json(exportsList, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only administrators can trigger data warehouse exports' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = user.organizationId || 'default-org';

  const periodStart = body.periodStart ? String(body.periodStart) : new Date(Date.now() - 90 * 86400 * 1000).toISOString();
  const periodEnd = body.periodEnd ? String(body.periodEnd) : new Date().toISOString();
  const format = body.format === 'JSON' ? 'JSON' : 'CSV';
  const anonymized = body.anonymized !== false;

  try {
    const res = await generateWarehouseExport({
      organizationId: orgId,
      generatedById: user.id,
      periodStart,
      periodEnd,
      format,
      anonymized,
    });

    audit(
      user,
      {
        action: 'analytics.warehouse_export_generated',
        summary: `Generated ${format} warehouse export (${res.recordCount} records, anonymized=${anonymized})`,
        targetType: 'analytics_export',
        targetId: res.exportRecord.id,
      },
      req
    );

    return NextResponse.json(res, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to generate warehouse export';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
