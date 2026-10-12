import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/billing';
import { audit } from '@/server/audit';
import { revokeApiKey } from '@/server/public-api';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const revoked = await revokeApiKey(id, auth.org.id);

    audit(
      auth.user,
      {
        action: 'api_key.revoked',
        summary: `Revoked API key ID: ${id}`,
        targetType: 'api_key',
        targetId: id,
      },
      req,
    );

    return NextResponse.json({ success: true, revokedAt: revoked.revokedAt });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not revoke API key';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
