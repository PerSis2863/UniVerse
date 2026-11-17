import { describe, expect, it } from 'vitest';
import { size, tileAt, tripTiles } from './trip-offline';

describe('offline trip pack (M240)', () => {
  it('finds the tile of a place as web maps number them', () => {
    expect(tileAt({ lat: 0, lon: 0 }, 1)).toEqual({ z: 1, x: 1, y: 1 });
    expect(tileAt({ lat: 38.7139, lon: -9.1394 }, 14)).toEqual({ z: 14, x: 7776, y: 6278 });
  });
  it('covers a city and its places without repeats, coarse zooms first, under the cap', () => {
    const lisbon = { lat: 38.7139, lon: -9.1394 };
    const { tiles, capped } = tripTiles([lisbon], [{ lat: 38.6916, lon: -9.216 }]);
    expect(capped).toBe(false);
    expect(new Set(tiles.map((t) => `${t.z}/${t.x}/${t.y}`)).size).toBe(tiles.length);
    expect(tiles[0].z).toBe(5);
    expect(Math.max(...tiles.map((t) => t.z))).toBe(14);
    expect(tiles.length).toBeLessThan(150);
    const small = tripTiles([lisbon], [], 20);
    expect(small).toMatchObject({ capped: true });
    expect(small.tiles).toHaveLength(20);
  });
  it('says the size in words', () => {
    expect(size(512)).toBe('1 kB');
    expect(size(12_400_000)).toBe('12.4 MB');
  });
});
