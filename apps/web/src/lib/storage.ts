import { randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import { isStorageHostUrl } from '@/lib/file-urls';
import { hasR2Storage, r2Put } from '@/lib/r2';

/** Max size for files stored through the server; larger chat files upload straight to R2. */
export const SERVER_UPLOAD_MAX = 4 * 1024 * 1024;

/**
 * Saves an uploaded file and returns its URL.
 * Uses Cloudflare R2 when it's configured; otherwise stores the bytes in PostgreSQL and serves
 * them from /api/files/<key> — so uploads work with no extra setup.
 */
export async function saveFile(opts: { ownerId: string; name: string; mime: string; bytes: Buffer }): Promise<string> {
  const safeName = opts.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'file';
  const key = randomBytes(18).toString('base64url');
  if (hasR2Storage()) {
    return r2Put(`uploads/${opts.ownerId}/${key}/${safeName}`, opts.bytes, opts.mime || 'application/octet-stream');
  }
  await prisma.storedFile.create({
    data: { key, ownerId: opts.ownerId, name: safeName, mime: opts.mime || 'application/octet-stream', size: opts.bytes.length, data: opts.bytes },
  });
  return `/api/files/${key}/${encodeURIComponent(safeName)}`;
}

/** True for URLs of files uploaded through this app (R2, the old Vercel Blob store, or database storage). */
export function isAppFileUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  if (/^\/api\/files\/[A-Za-z0-9_-]{16,}(\/|$)/.test(url)) return true;
  try {
    const u = new URL(url);
    return isStorageHostUrl(u) || (u.protocol === 'https:' && /^\/api\/files\//.test(u.pathname));
  } catch {
    return false;
  }
}
