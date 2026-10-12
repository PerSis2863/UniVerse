import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/billing';
import { audit } from '@/server/audit';
import { cleanRetentionDays } from '@/server/compliance';

// Admin → Settings: School Data Retention Policy.
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const org = await prisma.organization.findUnique({
    where: { id: auth.org.id },
    select: { dataRetentionDays: true },
  });

  return NextResponse.json(
    { dataRetentionDays: org?.dataRetentionDays ?? 730 },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const dataRetentionDays = cleanRetentionDays(body.dataRetentionDays);

    const updated = await prisma.organization.update({
      where: { id: auth.org.id },
      data: { dataRetentionDays },
      select: { dataRetentionDays: true },
    });

    audit(
      auth.user,
      {
        action: 'organization.retention_updated',
        summary: `Updated data retention policy to ${dataRetentionDays === 0 ? 'Indefinite' : `${dataRetentionDays} days`}`,
        targetType: 'organization',
        targetId: auth.org.id,
        metadata: { dataRetentionDays },
      },
      req,
    );

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid retention setting';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
