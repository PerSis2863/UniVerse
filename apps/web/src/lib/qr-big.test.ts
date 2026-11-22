import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { encodeQr } from './qr';

// M398: QR codes up to version 40, read back by a real decoder (jsQR) at every size the shared links need.
const read = (text: string) => {
  const m = encodeQr(text), quiet = 4, scale = 4, n = m.length + quiet * 2, w = n * scale;
  const px = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) {
    if (!m[y][x]) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = (((y + quiet) * scale + dy) * w + (x + quiet) * scale + dx) * 4;
      px[i] = px[i + 1] = px[i + 2] = 0;
    }
  }
  return { size: m.length, text: jsQR(px, w, w)?.data ?? null };
};

describe('QR codes, big ones (M398)', () => {
  it('reads back links of every length up to version 40', () => {
    const link = (k: number) => `https://universe.example/hyperion#s=h1.${'aB3_-x9Zq'.repeat(Math.ceil(k / 9)).slice(0, k)}`;
    for (const k of [10, 300, 420, 700, 1200, 1800, 2250]) {
      const t = link(k), r = read(t);
      expect(r.text, `length ${t.length}`).toBe(t);
    }
    expect(read(link(2250)).size).toBeGreaterThan(150);
  });
  it('still reads alphanumeric codes past version 26', () => {
    const t = 'ABC123 $%*+-./:'.repeat(200).slice(0, 2800);
    expect(read(t).text).toBe(t);
  });
  it('refuses text past version 40', () => {
    expect(() => encodeQr('x'.repeat(3000))).toThrow(/too long/);
  });
});
