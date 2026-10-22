import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/billing';
import { parseOneRosterBundle, previewOneRosterSync, type OneRosterPayload } from '@/server/oneroster';

// Admin → Integrations: OneRoster 1.2 SIS dry-run preview.
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
    const preview = await previewOneRosterSync(auth.org.id, auth.user, payload);
    return NextResponse.json(preview);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid OneRoster data';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
