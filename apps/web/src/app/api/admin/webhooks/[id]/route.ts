import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/billing';
import { audit } from '@/server/audit';
import { deleteWebhookEndpoint, updateWebhookEndpoint } from '@/server/webhooks';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const updated = await updateWebhookEndpoint({
      endpointId: id,
      orgId: auth.org.id,
      isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
      events: Array.isArray(body.events) ? (body.events as string[]) : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
    });

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not update webhook';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    await deleteWebhookEndpoint(id, auth.org.id);

    audit(
      auth.user,
      {
        action: 'webhook.deleted',
        summary: `Deleted webhook endpoint ${id}`,
        targetType: 'webhook_endpoint',
        targetId: id,
      },
      req,
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not delete webhook';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
