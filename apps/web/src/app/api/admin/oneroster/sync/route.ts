import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/billing';
import { audit } from '@/server/audit';
import { executeOneRosterSync, parseOneRosterBundle, type OneRosterPayload } from '@/server/oneroster';

// Admin → Integrations: Execute OneRoster 1.2 SIS sync.
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  let payload: OneRosterPayload = {};

  if (body.files && typeof body.files === 'object') {
    payload = parseOneRosterBundle(body.files as Record<string, string>);
  } else if (body.payload && typeof body.payload === 'object') {
    payload = body.payload as OneRosterPayload;
  }

  try {
    const result = await executeOneRosterSync(auth.org.id, auth.user, payload);

    audit(
      auth.user,
      {
        action: 'oneroster.sync_completed',
        summary: result.summary,
        targetType: 'organization',
        targetId: auth.org.id,
        metadata: result.counts,
      },
      req,
    );

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to execute OneRoster sync';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
