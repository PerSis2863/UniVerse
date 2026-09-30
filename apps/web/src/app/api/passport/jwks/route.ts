import { NextResponse } from 'next/server';
import { CredentialSigner } from '@/server/services/credential-signer';

// The public key that signs Open Badges (JWK set), for anyone verifying one.
export function GET() {
  return NextResponse.json(CredentialSigner.jwks(), { headers: { 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' } });
}
