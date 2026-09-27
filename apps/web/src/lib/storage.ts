import { randomBytes } from 'node:crypto';
import { put } from '@vercel/blob';
import prisma from '@/lib/db';

/** Max size for files stored through the server (Vercel limits request bodies to ~4.5 MB). */
export const SERVER_UPLOAD_MAX = 4 * 1024 * 1024;

export const hasBlobStorage = () => !!process.env.BLOB_READ_WRITE_TOKEN;

/**
 * Saves an uploaded file and returns its URL.
 * Uses Vercel Blob when it's connected; otherwise stores the bytes in PostgreSQL and serves
 * them from /api/files/<key> — so uploads work with no extra setup.
 */
export async function saveFile(opts: { ownerId: string; name: string; mime: string; bytes: Buffer }): Promise<string> {
  const safeName = opts.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'file';
  if (hasBlobStorage()) {
    const blob = await put(`uploads/${opts.ownerId}/${safeName}`, opts.bytes, {
      access: 'public',
      addRandomSuffix: true,
      contentType: opts.mime || undefined,
    });
    return blob.url;
  }
  const key = randomBytes(18).toString('base64url');
  await prisma.storedFile.create({
    data: { key, ownerId: opts.ownerId, name: safeName, mime: opts.mime || 'application/octet-stream', size: opts.bytes.length, data: opts.bytes },
  });
  return `/api/files/${key}/${encodeURIComponent(safeName)}`;
}

/** True for URLs of files uploaded through this app (Blob or database storage). */
export function isAppFileUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  if (/^\/api\/files\/[A-Za-z0-9_-]{16,}(\/|$)/.test(url)) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname.endsWith('.public.blob.vercel-storage.com') || /^\/api\/files\//.test(u.pathname));
  } catch {
    return false;
  }
}
