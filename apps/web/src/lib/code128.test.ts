import { describe, expect, it } from 'vitest';
import { canEncode128, code128, code128Svg, code128Values } from './code128';

describe('Code 128 barcodes (library labels, Q22)', () => {
  it('adds the start code, the checksum and the stop code', () => {
    // "PJJ123C": 104 + 48·1 + 42·2 + 42·3 + 17·4 + 18·5 + 19·6 + 35·7 = 879, and 879 mod 103 = 55.
    expect(code128Values('PJJ123C')).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55, 106]);
    expect(code128Values('A')).toEqual([104, 33, (104 + 33) % 103, 106]);
  });
  it('gives widths that add up: 11 modules a character, 13 for the stop', () => {
    const w = code128('LIB-00042');
    const chars = 'LIB-00042'.length + 2; // start + text + checksum
    expect(w.reduce((a, b) => a + b, 0)).toBe(chars * 11 + 13);
    expect(w.every((x) => x >= 1 && x <= 4)).toBe(true);
  });
  it('takes only printable ASCII, up to 60 characters', () => {
    expect(canEncode128('L:ckq3x9w2a0001')).toBe(true);
    expect(canEncode128('')).toBe(false);
    expect(canEncode128('हिंदी')).toBe(false);
    expect(canEncode128('x'.repeat(61))).toBe(false);
    expect(() => code128('é')).toThrow();
  });
  it('draws the bars as an SVG with a quiet zone', () => {
    const svg = code128Svg('A1', { module: 1, height: 20 });
    const bars = code128('A1').filter((_, i) => i % 2 === 0).length;
    expect((svg.match(/<rect x=/g) ?? []).length).toBe(bars);
    expect(svg).toContain('viewBox="0 0 ' + (code128('A1').reduce((a, b) => a + b, 0) + 20) + ' 20"');
  });
});
