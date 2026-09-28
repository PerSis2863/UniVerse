// Client-safe checks for URLs of files uploaded through this app.

/** Host of the R2 bucket's public domain (NEXT_PUBLIC_FILES_URL), inlined at build time. */
const FILES_HOST = (() => {
  try {
    return process.env.NEXT_PUBLIC_FILES_URL ? new URL(process.env.NEXT_PUBLIC_FILES_URL).hostname : null;
  } catch {
    return null;
  }
})();

/** True for https URLs on our R2 files domain, or on the Vercel Blob store used before the move. */
export function isStorageHostUrl(u: URL): boolean {
  if (u.protocol !== 'https:') return false;
  if (FILES_HOST && u.hostname === FILES_HOST) return true;
  return u.hostname.endsWith('.public.blob.vercel-storage.com');
}

export function isUploadedFileUrl(url: string): boolean {
  if (url.startsWith('/api/files/')) return true;
  try {
    return isStorageHostUrl(new URL(url));
  } catch {
    return false;
  }
}
