import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/billing';
import { dispatchWebhookEvent, type WebhookEvent } from '@/server/webhooks';

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const event = (typeof body.event === 'string' ? body.event : 'assignment.submitted') as WebhookEvent;

  try {
    const res = await dispatchWebhookEvent(auth.org.id, event, {
      test: true,
      timestamp: new Date().toISOString(),
      message: 'Test webhook event dispatched from UniVerse Developer Hub',
    });

    return NextResponse.json(res);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to dispatch test webhook';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
