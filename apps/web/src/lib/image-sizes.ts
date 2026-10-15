// Three sizes of every uploaded photo (Stage 5 · A4): a phone showing a chat with 30 photos, a
// 40 px avatar or a post's thumbnail downloads the small version, not the full picture.
//
// The browser makes the sizes before uploading (src/lib/photo-sizes.ts) and the server stores each
// one as its own file (POST /api/upload/sized). Nothing new is kept in the database: the photo's
// address says which sizes exist. Its key (the random part of the address) is
// "<24 random characters>-s320-960-1920": the widths there are, largest last. The address itself is
// the largest; each smaller one is the same address with the key "<random>-<width>". Photos
// uploaded before, and every other file, have plain keys and are shown as they are.

/** The longest side of each size, in pixels. */
export const PHOTO_SIDES = [320, 960, 1920] as const;

const RANDOM = /^[A-Za-z0-9_-]{24}$/;
const SIZED = /^([A-Za-z0-9_-]{24})-s(\d{1,4}(?:-\d{1,4}){1,3})$/;

/** The main file's key for a photo with these widths (smallest first). */
export function sizedKey(random: string, widths: number[]): string {
  if (!RANDOM.test(random) || widths.length < 2 || widths.length > 4) throw new Error('bad sized key');
  return `${random}-s${widths.join('-')}`;
}

/** The key of one smaller size. */
export const sizeKey = (random: string, width: number) => `${random}-${width}`;

/** The random part and widths of a sized key, or null for any other key. */
export function parseSizedKey(key: string): { random: string; widths: number[] } | null {
  const m = SIZED.exec(key);
  if (!m) return null;
  const widths = m[2].split('-').map(Number);
  for (let i = 1; i < widths.length; i++) if (!(widths[i] > widths[i - 1])) return null;
  return widths[0] > 0 ? { random: m[1], widths } : null;
}

/** Where the key sits in an uploaded file's address: /api/files/<key>/… or …/uploads/<owner>/<key>/<name>. */
function keySpot(url: string): { before: string; key: string; after: string } | null {
  const m = /^((?:https:\/\/[^/?#]+)?\/api\/files\/)([A-Za-z0-9_-]+)((?:\/[^?#]*)?)$/.exec(url)
    ?? /^(https:\/\/[^/?#]+\/uploads\/[A-Za-z0-9_-]+\/)([A-Za-z0-9_-]+)(\/[^?#]*)$/.exec(url);
  return m ? { before: m[1], key: m[2], after: m[3] } : null;
}

/** Every size of a photo, smallest first (just the address itself when it has no sizes). */
export function photoSizes(url: string): { url: string; width: number | null }[] {
  const spot = keySpot(url);
  const sized = spot && parseSizedKey(spot.key);
  if (!spot || !sized) return [{ url, width: null }];
  const largest = sized.widths.length - 1;
  return sized.widths.map((w, i) => ({ url: i === largest ? url : `${spot.before}${sizeKey(sized.random, w)}${spot.after}`, width: w }));
}

/** The keys of a photo's smaller sizes (to delete them with it). Empty for anything else. */
export function smallerSizeKeys(key: string): string[] {
  const sized = parseSizedKey(key);
  return sized ? sized.widths.slice(0, -1).map((w) => sizeKey(sized.random, w)) : [];
}

/**
 * `srcSet` and `sizes` for an <img> showing an uploaded photo `shown` px wide on screen (CSS px; a
 * CSS length like "100vw" works too). Nothing for files without sizes, so they load as before.
 */
export function photoSrcSet(url: string | null | undefined, shown: number | string): { srcSet?: string; sizes?: string } {
  if (!url) return {};
  const all = photoSizes(url);
  if (all.length < 2) return {};
  return { srcSet: all.map((s) => `${s.url} ${s.width}w`).join(', '), sizes: typeof shown === 'number' ? `${Math.round(shown)}px` : shown };
}
