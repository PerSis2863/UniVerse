import { NextResponse } from 'next/server';
import { CredentialSigner } from '@/server/services/credential-signer';

// The public key that signs Open Badges (JWK set), for anyone verifying one.
export function GET() {
  let jwks;
  try { jwks = CredentialSigner.jwks(); } catch { return NextResponse.json({ error: 'No signing key is configured.' }, { status: 503 }); }
  return NextResponse.json(jwks, { headers: { 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' } });
}
