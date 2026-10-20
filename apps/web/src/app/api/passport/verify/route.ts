import { NextResponse } from 'next/server';
import { verifyOpenBadge, verifyWalletCredential } from '@/server/passport';

// POST { badge: "<VC-JWT>" or the text of a wallet credential (.vc.json) } — checks a credential
// issued by UniVerse: an Open Badge (signature, issuer, not revoked) or a W3C VC 2.0 wallet file
// (its Data Integrity proof, Stage 5 · Q14). For anyone, with no account (the employer's check).
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const text = typeof b.badge === 'string' ? b.badge.trim() : '';
  if (!text || text.length > 60_000) return NextResponse.json({ error: 'Paste the badge or credential (the text of the .jwt or .vc.json file).' }, { status: 400 });
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (text.startsWith('{')) {
    let doc: unknown;
    try { doc = JSON.parse(text); } catch { return NextResponse.json({ valid: false, reason: 'That file isn’t readable JSON.' }, { headers: cors }); }
    return NextResponse.json(await verifyWalletCredential(doc), { headers: cors });
  }
  return NextResponse.json(await verifyOpenBadge(text), { headers: cors });
}
