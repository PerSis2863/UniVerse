import type { ImgHTMLAttributes } from 'react';
import { photoSrcSet } from '@/lib/image-sizes';

/**
 * An uploaded photo, in the sizes it was saved in (src/lib/image-sizes.ts), shown `shown` CSS px wide
 * (or a `sizes` list). A plain <img>: next/image needs an image service the Worker doesn't have.
 * `srcSet` gives the widths for a picture kept elsewhere (Wikimedia Commons' thumbnails, M228).
 */
export function Photo({ src, shown, srcSet, alt = '', ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'sizes'> & { src: string; shown: number | string }) {
  const set = srcSet ? { srcSet, sizes: typeof shown === 'number' ? `${Math.round(shown)}px` : shown } : photoSrcSet(src, shown);
  // eslint-disable-next-line @next/next/no-img-element -- uploaded photos from R2 / the database, any size
  return <img src={src} {...set} alt={alt} decoding="async" {...rest} />;
}
