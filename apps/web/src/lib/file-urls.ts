// Client-safe checks for URLs of files uploaded through this app.

/** Host of the R2 bucket's public domain (NEXT_PUBLIC_FILES_URL), inlined at build time. */
const FILES_HOST = (() => {
  try {
    return process.env.NEXT_PUBLIC_FILES_URL ? new URL(process.env.NEXT_PUBLIC_FILES_URL).hostname : null;
  } catch {
    return null;
  }
})();

/** True for https URLs on our R2 files domain. */
export function isStorageHostUrl(u: URL): boolean {
  if (u.protocol !== 'https:') return false;
  return !!FILES_HOST && u.hostname === FILES_HOST;
}

export function isUploadedFileUrl(url: string): boolean {
  if (url.startsWith('/api/files/')) return true;
  try {
    return isStorageHostUrl(new URL(url));
  } catch {
    return false;
  }
}

/** A course material's type from its file name and address (the course board's Materials). */
export function materialTypeOf(name: string, url: string): 'PDF' | 'DOCX' | 'VIDEO' | 'IMAGE' | 'OTHER' {
  const s = `${name} ${url}`.toLowerCase();
  if (/\.pdf\b/.test(s)) return 'PDF';
  if (/\.(docx?|pptx?|xlsx?|txt|csv)\b/.test(s)) return 'DOCX';
  if (/\.(mp4|mov|webm)\b|youtube\.com|youtu\.be|vimeo\.com/.test(s)) return 'VIDEO';
  if (/\.(png|jpe?g|gif|webp)\b/.test(s)) return 'IMAGE';
  return 'OTHER';
}
