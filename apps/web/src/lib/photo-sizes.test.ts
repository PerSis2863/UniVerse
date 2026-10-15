import { describe, expect, it } from 'vitest';
import { sidesFor } from './photo-sizes';

describe('which sizes to make', () => {
  it('makes all three for a phone photo, capped at 1920', () => {
    expect(sidesFor(4032)).toEqual([320, 960, 1920]);
    expect(sidesFor(1920)).toEqual([320, 960, 1920]);
  });
  it('uses the photo’s own size instead of a near copy', () => {
    expect(sidesFor(1200)).toEqual([320, 960, 1200]);
    expect(sidesFor(1000)).toEqual([320, 1000]); // 960 would be almost the same picture
    expect(sidesFor(600)).toEqual([320, 600]);
  });
  it('makes none for small pictures', () => {
    expect(sidesFor(360)).toEqual([]);
    expect(sidesFor(320)).toEqual([]);
    expect(sidesFor(64)).toEqual([]);
  });
});
