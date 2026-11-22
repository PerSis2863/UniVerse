// Hyperion's shared links (M398, the owner's 20 big features: "combine 2 features into one"): a script and how to show
// it, packed into the link itself, after the # (browsers never send that part to a server, so a shared script never
// touches ours). The text is compressed (deflate) and written in URL-safe base64; opening the link offers a copy, and
// the same link shows as a QR code for a class to scan off the board.

export interface Shared { name: string; code: string; view: 'code' | 'note' }
const PREFIX = 'h1.';
/** The longest script a link carries (characters), and the most an incoming link may unpack to (bytes). */
export const MAX_CODE = 100_000;
const MAX_UNPACKED = 400_000;

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error('too big'); }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
const toB64url = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const fromB64url = (s: string) => { const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); };
/** A name that is safe to show and save: letters, digits, _ . - and ending in .m. */
export const cleanName = (n: string) => { const base = n.replace(/[^\w.-]/g, '').replace(/\.m$/i, '').slice(0, 60) || 'shared'; return `${base}.m`; };

/** The part of a link after the #: s=… */
export async function shareFragment(s: Shared): Promise<string> {
  if (s.code.length > MAX_CODE) throw new Error(`That script is too long to share as a link (over ${MAX_CODE.toLocaleString()} characters).`);
  const json = JSON.stringify({ n: cleanName(s.name), c: s.code, v: s.view === 'note' ? 'note' : 'code' });
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'), MAX_UNPACKED);
  return `s=${PREFIX}${toB64url(packed)}`;
}

/** The script in a link's #s=…, or null when there is none or it isn't one of ours. */
export async function readShare(hash: string): Promise<Shared | null> {
  const m = /(?:^#?|&)s=([\w.-]+)/.exec(hash);
  if (!m || !m[1].startsWith(PREFIX)) return null;
  try {
    const bytes = await pipe(fromB64url(m[1].slice(PREFIX.length)), new DecompressionStream('deflate-raw'), MAX_UNPACKED);
    const v = JSON.parse(new TextDecoder().decode(bytes)) as { n?: unknown; c?: unknown; v?: unknown };
    if (typeof v.c !== 'string' || v.c.length > MAX_CODE) return null;
    return { name: cleanName(typeof v.n === 'string' ? v.n : 'shared.m'), code: v.c, view: v.v === 'note' ? 'note' : 'code' };
  } catch {
    return null;
  }
}
