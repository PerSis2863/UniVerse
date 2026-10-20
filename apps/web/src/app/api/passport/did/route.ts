import { NextResponse } from 'next/server';
import { didDocument } from '@/server/vc-data-integrity';

// The site's DID document (Stage 5 · Q14): the key its wallet credentials are signed with. Also
// answered at /.well-known/did.json (cloudflare/worker.ts), where did:web looks for it.
export async function GET() {
  try {
    return NextResponse.json(didDocument(), { headers: { 'Content-Type': 'application/did+json', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' } });
  } catch {
    return NextResponse.json({ error: 'Credential signing isn’t set up on this site.' }, { status: 503 });
  }
}
