import type { ImgHTMLAttributes } from 'react';
import { photoSrcSet } from '@/lib/image-sizes';

/**
 * An uploaded photo, in the sizes it was saved in (src/lib/image-sizes.ts), shown `shown` CSS px wide
 * (or a `sizes` list). A plain <img>: next/image needs an image service the Worker doesn't have.
 */
export function Photo({ src, shown, alt = '', ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'sizes'> & { src: string; shown: number | string }) {
  // eslint-disable-next-line @next/next/no-img-element -- uploaded photos from R2 / the database, any size
  return <img src={src} {...photoSrcSet(src, shown)} alt={alt} decoding="async" {...rest} />;
}
