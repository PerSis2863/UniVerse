'use client';

import { PHOTO_SIDES } from './image-sizes';

// Makes the sizes of a photo in the browser before it uploads (Stage 5 · A4, src/lib/image-sizes.ts):
// its longest side at 320, 960 and 1920 px, or fewer when the photo is smaller than that. Redrawing
// also drops location and other camera data, like src/lib/shrink-image.ts.

const QUALITY = 0.82;

export interface PhotoSizes { type: string; ext: string; sizes: { width: number; blob: Blob }[] }

/** The longest sides to make for a photo whose longest side is `longest` px (smallest first). */
export function sidesFor(longest: number): number[] {
  const out: number[] = [];
  for (const side of PHOTO_SIDES) {
    // Close to the photo's own size: use the photo's size instead of a near copy.
    if (side >= longest * 0.85) {
      out.push(Math.min(longest, PHOTO_SIDES[PHOTO_SIDES.length - 1]));
      break;
    }
    out.push(side);
  }
  return out.length > 1 ? out : [];
}

/**
 * The photo at each size, or null when there's no point (GIF animations, SVGs, small pictures) or
 * this browser can't draw it (e.g. HEIC on a computer): it then uploads as it is.
 */
export async function makePhotoSizes(file: File): Promise<PhotoSizes | null> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || typeof createImageBitmap !== 'function') return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const sides = sidesFor(longest);
    if (!sides.length) return null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));
    let type: string | null = null;
    const sizes: PhotoSizes['sizes'] = [];
    for (const side of sides) {
      const scale = side / longest;
      const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(bitmap, 0, 0, w, h);
      if (!type) {
        // WebP where the browser can make it (older Safari quietly gives PNG instead), else JPEG;
        // PNGs may be transparent (screenshots, logos), so without WebP they stay PNG.
        const webp = await encode('image/webp');
        type = webp?.type === 'image/webp' ? 'image/webp' : file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        if (type === 'image/webp') {
          sizes.push({ width: w, blob: webp! });
          continue;
        }
      }
      const blob = await encode(type);
      if (!blob || blob.type !== type) return null;
      sizes.push({ width: w, blob });
    }
    // Widths must grow (a long, thin picture can round two sizes to the same width).
    if (sizes.some((s, i) => i > 0 && s.width <= sizes[i - 1].width)) return null;
    // The largest at the photo's own size: keep the original when redrawing only made it bigger.
    const last = sizes[sizes.length - 1];
    if (sides[sides.length - 1] === longest && file.type === type && file.size <= last.blob.size) last.blob = file;
    return { type: type!, ext: type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg', sizes };
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}
