import prisma from '@/lib/db';
import { fileCsp } from '@/lib/file-csp';
import { isStorageHostUrl } from '@/lib/file-urls';
import { sharedFile } from '@/server/space-files';

type Ctx = { params: Promise<{ token: string }> };

// A share link from the files hub (Stage 5 · B9.13): anyone with it gets the file's current
// version until the link expires. The file is passed through here, so its storage address stays
// private and the link really stops working when it expires or is stopped.
export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  const file = await sharedFile(token);
  if (!file) return new Response('This link has expired or was stopped. Ask whoever shared it for a new one.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  const safeInline = (/^(image|audio|video)\//.test(file.mime) && !/svg|xml/.test(file.mime)) || file.mime === 'application/pdf' || file.mime === 'text/plain';
  const headers: Record<string, string> = {
    'Content-Type': file.mime,
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `${safeInline ? 'inline' : 'attachment'}; filename="${file.name.replace(/[^\w .()-]/g, '_')}"`,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  const csp = fileCsp(file.mime);
  if (csp) headers['Content-Security-Policy'] = csp;

  const key = file.url.match(/^\/api\/files\/([A-Za-z0-9_-]{16,})(\/|$)/)?.[1];
  if (key) {
    const f = await prisma.storedFile.findUnique({ where: { key }, select: { data: true, size: true } });
    if (!f) return new Response('Not found', { status: 404 });
    return new Response(new Uint8Array(f.data), { headers: { ...headers, 'Content-Length': String(f.size) } });
  }
  let u: URL;
  try { u = new URL(file.url); } catch { return new Response('Not found', { status: 404 }); }
  if (!isStorageHostUrl(u)) return new Response('Not found', { status: 404 });
  const res = await fetch(u, { redirect: 'error' });
  if (!res.ok || !res.body) return new Response('Not found', { status: 404 });
  const length = res.headers.get('content-length');
  return new Response(res.body, { headers: { ...headers, ...(length ? { 'Content-Length': length } : {}) } });
}
