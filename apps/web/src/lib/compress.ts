// File compression (Collaborate → Tools → Compress): the plain rules, shared by the page and the
// engine (src/components/docs/compress-engine.ts). Everything is compressed in the browser.

export type Level = 'light' | 'medium' | 'strong';

export interface LevelSpec {
  label: string;
  hint: string;
  /** Pictures (and pictures inside PDFs and Office files): longest side in pixels, JPEG/WebP quality. */
  maxSide: number;
  quality: number;
  /** PDF pages drawn as pictures (Strong only, when that's smaller): dots per inch. */
  pdfDpi: number;
  /** Video: the shorter side in pixels, and bits per second; sound: bits per second. */
  videoSide: number;
  videoBitrate: number;
  audioBitrate: number;
}

export const LEVELS: Record<Level, LevelSpec> = {
  light: { label: 'Light', hint: 'Looks the same, a bit smaller', maxSide: 3000, quality: 0.85, pdfDpi: 150, videoSide: 1080, videoBitrate: 3_000_000, audioBitrate: 160_000 },
  medium: { label: 'Medium', hint: 'Good for sharing and uploading', maxSide: 2000, quality: 0.72, pdfDpi: 120, videoSide: 720, videoBitrate: 1_400_000, audioBitrate: 96_000 },
  strong: { label: 'Strong', hint: 'Smallest file, softer pictures', maxSide: 1280, quality: 0.55, pdfDpi: 96, videoSide: 480, videoBitrate: 600_000, audioBitrate: 48_000 },
};
export const LEVEL_ORDER: Level[] = ['light', 'medium', 'strong'];

/** How a file gets smaller. */
export type Method = 'image' | 'pdf' | 'office' | 'video' | 'audio' | 'zip' | 'none';

const ext = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
const IMAGE = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp', 'avif', 'heic', 'heif', 'tif', 'tiff']);
const OFFICE = new Set(['docx', 'docm', 'xlsx', 'xlsm', 'pptx', 'pptm']);
const VIDEO = new Set(['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', '3gp']);
const AUDIO = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'weba', 'aiff', 'aif']);
/** Already packed tightly: a ZIP of them saves next to nothing. */
const PACKED = new Set(['zip', 'rar', '7z', 'gz', 'tgz', 'bz2', 'xz', 'gif', 'odt', 'ods', 'odp', 'epub', 'apk', 'jar']);

export function methodFor(name: string, mime = ''): Method {
  const e = ext(name);
  if (IMAGE.has(e) || (/^image\//.test(mime) && !/gif|svg/.test(mime) && !e)) return 'image';
  if (e === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (OFFICE.has(e)) return 'office';
  if (VIDEO.has(e) || (/^video\//.test(mime) && !e)) return 'video';
  if (AUDIO.has(e) || (/^audio\//.test(mime) && !e)) return 'audio';
  if (PACKED.has(e)) return 'none';
  return 'zip';
}

export const METHOD_NOTE: Record<Method, string> = {
  image: 'Smaller picture, same look',
  pdf: 'Pictures inside get smaller; text stays sharp',
  office: 'Pictures inside get smaller',
  video: 'Smaller video',
  audio: 'Smaller sound file',
  zip: 'Packed into a ZIP',
  none: 'Already compressed',
};

/** A picture's new size: the longest side at most `maxSide`, never bigger than it was. */
export function fitWithin(w: number, h: number, maxSide: number) {
  const s = Math.min(1, maxSide / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** A video's new size: the shorter side at most `side` (even numbers, as video needs); null to keep it. */
export function videoSize(w: number, h: number, side: number): { width: number } | { height: number } | null {
  if (Math.min(w, h) <= side) return null;
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return w >= h ? { height: even(side) } : { width: even(side) };
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** How much smaller, in whole percent (0 when it isn't). */
export const savedPercent = (before: number, after: number) => (before > 0 && after < before ? Math.round((1 - after / before) * 100) : 0);

/** The compressed file's name: the original's, with "-small" and the new extension. */
export function smallName(name: string, newExt?: string) {
  const m = name.match(/^(.*?)(\.[^.]+)?$/)!;
  const base = (m[1] || 'file').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'file';
  return `${base}-small${newExt ? `.${newExt}` : m[2] ?? ''}`;
}

/** A .rels file's links to a picture in `media/`, pointed at its new name (image1.png → image1.jpg). */
export function relinkMedia(rels: string, from: string, to: string) {
  const name = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return rels.replace(new RegExp(`(Target="(?:[^"]*/)?media/)${name}"`, 'g'), `$1${to}"`);
}

/** An Office file's [Content_Types].xml with .jpg listed, so a picture inside can become a JPEG. */
export const withJpegType = (xml: string) => (/Extension="jpg"/i.test(xml) ? xml : xml.replace('</Types>', '<Default Extension="jpg" ContentType="image/jpeg"/></Types>'));
