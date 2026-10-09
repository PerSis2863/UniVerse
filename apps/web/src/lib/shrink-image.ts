'use client';

// Photos are made smaller in the browser before they upload (Stage 5 · A4): a phone photo of
// 3–8 MB becomes a few hundred KB at up to 2048 px, so it sends quickly on 3G and opens quickly
// for everyone who sees it. Location and other camera data are dropped too (the picture is
// redrawn). GIFs (animation), SVGs and small images are left as they are, and so is anything that
// wouldn't come out smaller.

const MAX_SIDE = 2048;
const MIN_BYTES = 600 * 1024;
const QUALITY = 0.82;

export async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || file.size < MIN_BYTES || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));
    // WebP where the browser can make it (older Safari quietly gives PNG instead), else JPEG.
    // PNGs may be transparent (screenshots, logos): WebP keeps that; without WebP they stay PNG.
    let blob = await encode('image/webp');
    if (!blob || blob.type !== 'image/webp') blob = file.type === 'image/png' ? null : await encode('image/jpeg');
    if (!blob || blob.size >= file.size) return file;
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.${ext}`, { type: blob.type, lastModified: file.lastModified });
  } catch {
    return file; // a format this browser can't draw (e.g. HEIC on desktop): send the original
  }
}
