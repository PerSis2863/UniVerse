import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/billing';
import { listWebhookDeliveries } from '@/server/webhooks';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const deliveries = await listWebhookDeliveries(id, auth.org.id);
    return NextResponse.json(deliveries, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not fetch deliveries';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
