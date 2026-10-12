import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/billing';
import { audit } from '@/server/audit';
import { generateApiKey, listApiKeys } from '@/server/public-api';

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const keys = await listApiKeys(auth.org.id);
  return NextResponse.json(keys, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name : '';
  const scopes = Array.isArray(body.scopes) ? (body.scopes as string[]) : [];
  const expiresInDays = typeof body.expiresInDays === 'number' ? body.expiresInDays : null;

  try {
    const key = await generateApiKey({
      orgId: auth.org.id,
      name,
      scopes,
      expiresInDays,
    });

    audit(
      auth.user,
      {
        action: 'api_key.created',
        summary: `Created API key "${name}" with scopes: ${scopes.join(', ')}`,
        targetType: 'api_key',
        targetId: key.id,
      },
      req,
    );

    return NextResponse.json(key, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
