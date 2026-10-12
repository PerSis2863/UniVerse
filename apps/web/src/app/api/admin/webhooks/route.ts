import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/billing';
import { audit } from '@/server/audit';
import { createWebhookEndpoint, listWebhookEndpoints } from '@/server/webhooks';

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const endpoints = await listWebhookEndpoints(auth.org.id);
  return NextResponse.json(endpoints, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const url = typeof body.url === 'string' ? body.url : '';
  const events = Array.isArray(body.events) ? (body.events as string[]) : [];
  const description = typeof body.description === 'string' ? body.description : null;

  try {
    const ep = await createWebhookEndpoint({
      orgId: auth.org.id,
      url,
      events,
      description,
    });

    audit(
      auth.user,
      {
        action: 'webhook.created',
        summary: `Created webhook subscription to ${url}`,
        targetType: 'webhook_endpoint',
        targetId: ep.id,
      },
      req,
    );

    return NextResponse.json(ep, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
