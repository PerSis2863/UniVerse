import { describe, expect, it } from 'vitest';
import { SPAWN, TABLES, ZONES, hearing, tableNear, zoneAt } from './hall-map';

describe('zoneAt', () => {
  it('finds each room from its middle', () => {
    for (const z of ZONES) expect(zoneAt(z.x + z.w / 2, z.y + z.h / 2)?.id).toBe(z.id);
  });
  it('is no room at the crossing where people arrive', () => expect(zoneAt(SPAWN.x, SPAWN.y)).toBeNull());
  it('includes the edges', () => expect(zoneAt(30, 30)?.id).toBe('cafe'));
});

describe('tableNear', () => {
  it('finds a table when close', () => expect(tableNear(TABLES[0].x + 20, TABLES[0].y)?.n).toBe(1));
  it('finds nothing far away', () => expect(tableNear(SPAWN.x, SPAWN.y)).toBeNull());
});

describe('hearing', () => {
  const at = (x: number, y: number, table: number | null = null) => ({ x, y, table });
  it('full volume close by', () => expect(hearing(at(200, 100), at(230, 100)).gain).toBe(1));
  it('fades with distance', () => {
    const g = hearing(at(100, 100), at(300, 100)).gain;
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThan(1);
  });
  it('silent beyond the radius', () => expect(hearing(at(50, 50), at(500, 300)).gain).toBe(0));
  it('the library is a whisper', () => {
    // 150 apart: heard in the café, not in the library.
    expect(hearing(at(100, 100), at(250, 100)).gain).toBeGreaterThan(0);
    expect(hearing(at(100, 500), at(250, 500)).gain).toBe(0);
  });
  it('nothing in the quiet zone', () => expect(hearing(at(700, 500), at(710, 500)).gain).toBe(0));
  it('full volume at the same table, even apart', () => expect(hearing(at(100, 100, 1), at(400, 300, 1)).gain).toBe(1));
  it('pans by side', () => {
    expect(hearing(at(300, 100), at(200, 100)).pan).toBeLessThan(0);
    expect(hearing(at(200, 100), at(300, 100)).pan).toBeGreaterThan(0);
    expect(hearing(at(0, 100), at(1000, 100)).pan).toBe(1);
  });
});
