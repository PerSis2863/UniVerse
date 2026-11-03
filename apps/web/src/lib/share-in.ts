// "Share to UniVerse" (M42, photos M43): a link, text or photos shared from another app on Android
// are posted to /api/share-in (manifest share_target); the service worker (src/worker/index.ts) keeps
// the photos in a cache and opens /app with the text in the address. They wait until a chat is picked
// in Messages: the text becomes that chat's draft, the photos wait above its box until "Send".
// Kept for this visit only (sessionStorage); never sent anywhere by itself.

const KEY = 'uv-share';
const PHOTOS = 'uv-share-photos';
const CACHE = 'universe-share'; // the service worker's name for it

/** One line from what the other app sent: its title, its text and its link, without repeats. */
export function sharedText(p: { title?: string | null; text?: string | null; url?: string | null }): string {
  const parts: string[] = [];
  for (const raw of [p.title, p.text, p.url]) {
    const v = (raw ?? '').trim();
    if (v && !parts.some((x) => x.includes(v))) parts.push(v);
  }
  return parts.join(' ').slice(0, 2000);
}

/** Keeps what arrived in the address (title, text, url, how many photos); true when there was something. */
export function stashShare(search: string): boolean {
  const q = new URLSearchParams(search);
  const text = sharedText({ title: q.get('title'), text: q.get('text'), url: q.get('url') });
  const photos = Math.min(10, Math.max(0, Number(q.get('photos')) || 0));
  if (!text && !photos) return false;
  try {
    if (text) sessionStorage.setItem(KEY, text); else sessionStorage.removeItem(KEY);
    if (photos) sessionStorage.setItem(PHOTOS, JSON.stringify({ n: photos })); else sessionStorage.removeItem(PHOTOS);
  } catch { return false; }
  return true;
}

export function peekShare(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

/** What's waiting for a chat to be picked: the text and how many photos (photos already given to a chat don't count). */
export function pendingShare(): { text: string | null; photos: number } {
  try {
    const p = JSON.parse(sessionStorage.getItem(PHOTOS) ?? 'null') as { n: number; chat?: string } | null;
    return { text: peekShare(), photos: p && !p.chat ? p.n : 0 };
  } catch { return { text: null, photos: 0 }; }
}

/** The chat picked gets the waiting photos. */
export function givePhotos(chat: string) {
  try {
    const p = JSON.parse(sessionStorage.getItem(PHOTOS) ?? 'null') as { n: number } | null;
    if (p) sessionStorage.setItem(PHOTOS, JSON.stringify({ n: p.n, chat }));
  } catch { /* storage blocked */ }
}

/** The photos shared into this chat, read back from the service worker's cache (none: []). */
export async function photosFor(chat: string): Promise<File[]> {
  try {
    const p = JSON.parse(sessionStorage.getItem(PHOTOS) ?? 'null') as { n: number; chat?: string } | null;
    if (p?.chat !== chat || !('caches' in window)) return [];
    const cache = await caches.open(CACHE);
    const files: File[] = [];
    for (let i = 0; i < p.n; i++) {
      const res = await cache.match(`/__share/${i}`);
      if (!res) continue;
      const blob = await res.blob();
      files.push(new File([blob], decodeURIComponent(res.headers.get('x-name') ?? `photo-${i + 1}.jpg`), { type: blob.type || 'image/jpeg' }));
    }
    return files;
  } catch { return []; }
}

export function clearShare() {
  try { sessionStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

/** The shared photos are sent or set aside: forget them here and on the device. */
export function clearPhotos() {
  try { sessionStorage.removeItem(PHOTOS); } catch { /* storage blocked */ }
  if ('caches' in window) void caches.delete(CACHE).catch(() => {});
}
