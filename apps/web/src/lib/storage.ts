import { randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import { isStorageHostUrl } from '@/lib/file-urls';
import { hasR2Storage, r2DeleteByUrl, r2Put } from '@/lib/r2';

// File types people may upload. Anything that a browser could run as a page (HTML, SVG, JS)
// is refused, so uploads can't be used to host phishing pages or scripts on our domains.
const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain', '.csv': 'text/csv', '.zip': 'application/zip',
  '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime',
};

/** The content type to store an upload with, or null when that kind of file isn't allowed. */
export function uploadMime(filename: string, sentType?: string | null): string | null {
  const dot = filename.lastIndexOf('.');
  const extMime = dot >= 0 ? MIME_BY_EXT[filename.toLowerCase().slice(dot)] : undefined;
  if (!extMime) return null;
  // Voice notes recorded as .webm/.mp4 may be video containers holding audio; keep the browser's
  // type when it's the same family and not something a browser would render as a page.
  const sent = (sentType ?? '').split(';')[0].trim().toLowerCase();
  return sent && sent.split('/')[0] === extMime.split('/')[0] && !/(html|svg|xml|javascript)/.test(sent) ? sent : extMime;
}

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
    data: { key, ownerId: opts.ownerId, name: safeName, mime: opts.mime || 'application/octet-stream', size: opts.bytes.length, data: new Uint8Array(opts.bytes) },
  });
  return `/api/files/${key}/${encodeURIComponent(safeName)}`;
}

/** True for URLs of files uploaded through this app (R2 or database storage). */
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

/** Permanently deletes an uploaded file (database or R2 storage). Unknown URLs are ignored. */
export async function deleteFile(url: string): Promise<void> {
  const key = url.match(/^\/api\/files\/([A-Za-z0-9_-]{16,})(\/|$)/)?.[1];
  if (key) {
    await prisma.storedFile.deleteMany({ where: { key } });
    return;
  }
  await r2DeleteByUrl(url);
}

const READ_MAX = 15 * 1024 * 1024;

/**
 * Reads a file uploaded through this app (database storage or our R2 files domain), e.g. for the
 * AI tutor. Other URLs are never fetched. Null if it doesn't exist or is too large.
 */
export async function readAppFile(url: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const key = url.match(/^\/api\/files\/([A-Za-z0-9_-]{16,})(\/|$)/)?.[1];
  if (key) {
    const f = await prisma.storedFile.findUnique({ where: { key }, select: { data: true, mime: true, size: true } });
    return f && f.size <= READ_MAX ? { bytes: new Uint8Array(f.data), mime: f.mime } : null;
  }
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (!isStorageHostUrl(u)) return null;
  const res = await fetch(u, { redirect: 'error' });
  if (!res.ok || Number(res.headers.get('content-length') ?? 0) > READ_MAX) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  return bytes.length <= READ_MAX ? { bytes, mime: res.headers.get('content-type') ?? 'application/octet-stream' } : null;
}
