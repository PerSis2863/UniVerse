import { describe, expect, it } from 'vitest';
import { parseSizedKey, photoSizes, photoSrcSet, sizedKey, smallerSizeKeys } from './image-sizes';

const R = 'AbCdEfGhIjKlMnOpQrStUv_-';

describe('photo sizes', () => {
  it('writes and reads the sized key', () => {
    const key = sizedKey(R, [320, 960, 1920]);
    expect(key).toBe(`${R}-s320-960-1920`);
    expect(parseSizedKey(key)).toEqual({ random: R, widths: [320, 960, 1920] });
    expect(smallerSizeKeys(key)).toEqual([`${R}-320`, `${R}-960`]);
  });

  it('leaves plain keys and odd ones alone', () => {
    expect(parseSizedKey(R)).toBeNull(); // a photo from before, or any other file
    expect(parseSizedKey(`${R}-320`)).toBeNull(); // a smaller size itself
    expect(parseSizedKey(`${R}-s960-320`)).toBeNull(); // not smallest first
    expect(parseSizedKey(`${R}-s320`)).toBeNull(); // one size is no choice
    expect(parseSizedKey(`short-s320-960`)).toBeNull();
    expect(smallerSizeKeys(R)).toEqual([]);
    expect(() => sizedKey('short', [1, 2])).toThrow();
  });

  it('finds the sizes of database and R2 addresses', () => {
    expect(photoSizes(`/api/files/${R}-s320-960-1440/photo.webp`)).toEqual([
      { url: `/api/files/${R}-320/photo.webp`, width: 320 },
      { url: `/api/files/${R}-960/photo.webp`, width: 960 },
      { url: `/api/files/${R}-s320-960-1440/photo.webp`, width: 1440 },
    ]);
    expect(photoSizes(`https://files.example.com/uploads/user_1/${R}-s240-720/a.webp`).map((s) => s.url)).toEqual([
      `https://files.example.com/uploads/user_1/${R}-240/a.webp`,
      `https://files.example.com/uploads/user_1/${R}-s240-720/a.webp`,
    ]);
    expect(photoSizes(`https://universeimpact.com/api/files/${R}-s320-960`).map((s) => s.url)[0]).toBe(`https://universeimpact.com/api/files/${R}-320`);
  });

  it('gives no srcset for other pictures', () => {
    for (const url of [`/api/files/${R}/photo.webp`, 'https://lh3.googleusercontent.com/a/x', `https://evil.example/x/${R}-s320-960/a.webp`, `/api/files/${R}-s320-960/a.webp?x=1`, ''])
      expect(photoSrcSet(url, 40)).toEqual({});
    expect(photoSrcSet(null, 40)).toEqual({});
  });

  it('makes srcset and sizes', () => {
    expect(photoSrcSet(`/api/files/${R}-s320-960-1920/p.webp`, 40)).toEqual({
      srcSet: `/api/files/${R}-320/p.webp 320w, /api/files/${R}-960/p.webp 960w, /api/files/${R}-s320-960-1920/p.webp 1920w`,
      sizes: '40px',
    });
    expect(photoSrcSet(`/api/files/${R}-s320-960/p.webp`, '(max-width: 640px) 80vw, 320px').sizes).toBe('(max-width: 640px) 80vw, 320px');
  });
});
