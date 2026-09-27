import prisma from '@/lib/db';

type Ctx = { params: Promise<{ key: string }> };

// Serves a file stored in the database. The key is random and unguessable (like a private link).
// Handles /api/files/<key> and /api/files/<key>/<name> (see the [...rest] route).
export async function GET(req: Request, { params }: Ctx) {
  const { key } = await params;
  const file = await prisma.storedFile.findUnique({ where: { key }, select: { name: true, mime: true, size: true, data: true } });
  if (!file) return new Response('Not found', { status: 404 });

  const safeInline = /^(image|audio|video)\//.test(file.mime) || file.mime === 'application/pdf' || file.mime === 'text/plain';
  const headers: Record<string, string> = {
    'Content-Type': file.mime,
    'Content-Length': String(file.size),
    'Cache-Control': 'private, max-age=31536000, immutable',
    'Content-Disposition': `${safeInline ? 'inline' : 'attachment'}; filename="${file.name.replace(/"/g, '')}"`,
    'X-Content-Type-Options': 'nosniff',
  };

  // Support range requests so audio/video can be played and scrubbed.
  const range = req.headers.get('range');
  const bytes = Buffer.from(file.data);
  const m = range?.match(/bytes=(\d*)-(\d*)/);
  if (m) {
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), bytes.length - 1) : bytes.length - 1;
    if (start <= end && start < bytes.length) {
      return new Response(bytes.subarray(start, end + 1), {
        status: 206,
        headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' },
      });
    }
  }
  return new Response(bytes, { headers: { ...headers, 'Accept-Ranges': 'bytes' } });
}
