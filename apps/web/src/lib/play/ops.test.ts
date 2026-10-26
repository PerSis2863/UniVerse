import { describe, expect, it } from 'vitest';
import { GAMES } from '../play';
import {
  GUNS, OPS_CELL, OPS_CELLS, OPS_EDGE, OPS_PACK, OPS_SIZE, VALUABLES, falloff, foeDrop, gunAt, groundAt, opsCeiling, opsMap, packAdd, packValue, rollRarity, takeHit, type Rarity, type Valuable,
} from './ops';
import { seeded } from '../seeded-shuffle';

describe('Ridgeline Ops', () => {
  it('builds the same island for a seed: four landing zones, the HQ, six outposts, three hostages', () => {
    const a = opsMap(5), b = opsMap(5);
    expect(a.places).toEqual(b.places);
    expect(a.crates).toEqual(b.crates);
    expect([...a.heights.slice(0, 50)]).toEqual([...b.heights.slice(0, 50)]);
    expect(a.places.filter((p) => p.kind === 'lz')).toHaveLength(4);
    expect(a.places.filter((p) => p.kind === 'hq')).toHaveLength(1);
    expect(a.places.filter((p) => p.kind !== 'lz' && p.kind !== 'hq')).toHaveLength(6);
    expect(a.places.filter((p) => p.hostage)).toHaveLength(3);
    expect(opsMap(6).places).not.toEqual(a.places);
  });

  it('keeps places apart, on land, inside the edge, and levels the ground under them', () => {
    for (const seed of [1, 2, 3, 40, 999]) {
      const m = opsMap(seed);
      for (const p of m.places) {
        expect(Math.hypot(p.x, p.z)).toBeLessThan(OPS_EDGE - p.r);
        expect(p.y).toBeGreaterThanOrEqual(3);
        expect(Math.abs(groundAt(m.heights, p.x, p.z) - p.y)).toBeLessThan(0.05);
        for (const q of m.places) if (q !== p) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(p.r + q.r + 30);
      }
      for (const c of m.crates) expect(groundAt(m.heights, c.x, c.z)).toBeGreaterThan(1);
    }
  });

  it('reads the ground between grid points along the same triangles the terrain is drawn with', () => {
    const m = opsMap(9), row = OPS_CELLS + 1, ix = 40, iz = 70;
    const x = ix * OPS_CELL - OPS_SIZE / 2, z = iz * OPS_CELL - OPS_SIZE / 2;
    expect(groundAt(m.heights, x, z)).toBeCloseTo(m.heights[iz * row + ix], 5);
    const mid = (m.heights[iz * row + ix + 1] + m.heights[(iz + 1) * row + ix]) / 2;
    expect(groundAt(m.heights, x + OPS_CELL / 2, z + OPS_CELL / 2)).toBeCloseTo(mid, 4);
  });

  it('stays under the score cap on any island, however well a round goes', () => {
    for (let seed = 1; seed <= 60; seed++) expect(opsCeiling(opsMap(seed), GAMES.ops.seconds)).toBeLessThanOrEqual(GAMES.ops.maxScore);
  });

  it('rolls rarer loot further in, never above the cap', () => {
    const r = seeded(3), count = (tier: number) => Array.from({ length: 4000 }, () => rollRarity(r, tier)).filter((x) => x >= 3).length;
    expect(count(2)).toBeGreaterThan(count(0) * 2);
    expect(Array.from({ length: 500 }, () => rollRarity(r, 2, 2)).every((x) => x <= 2)).toBe(true);
    expect(foeDrop(4, 7, 'commander')).toEqual(foeDrop(4, 7, 'commander'));
    expect(foeDrop(4, 7, 'commander')[0]).toMatchObject({ kind: 'valuable', rarity: 4 });
    for (let id = 0; id < 200; id++) for (const it of foeDrop(1, id, 'rifleman')) if (it.kind === 'valuable') expect(it.rarity).toBeLessThanOrEqual(2);
  });

  it('makes rarer guns stronger and damage fall off past their range', () => {
    expect(gunAt('carbine', 4).dmg).toBeGreaterThan(gunAt('carbine', 0).dmg);
    expect(gunAt('carbine', 4).mag).toBeGreaterThan(GUNS.carbine.mag);
    expect(gunAt('dmr', 4).name).toBe('Longshot');
    expect(falloff(GUNS.smg, 10)).toBe(1);
    expect(falloff(GUNS.smg, GUNS.smg.range * 3)).toBe(0.5);
  });

  it('swaps the cheapest valuable out of a full backpack only for a better one', () => {
    const v = (r: Rarity): Valuable => ({ kind: 'valuable', rarity: r, ...VALUABLES[r] });
    let pack = Array.from({ length: OPS_PACK }, (_, i) => v(i === 3 ? 0 : 1));
    const worse = packAdd(pack, v(0));
    expect(worse.pack).toBe(pack);
    expect(worse.dropped).toMatchObject({ rarity: 0 });
    const better = packAdd(pack, v(4));
    expect(better.dropped).toMatchObject({ rarity: 0 });
    pack = better.pack;
    expect(packValue(pack)).toBe(VALUABLES[1].value * 7 + VALUABLES[4].value);
  });

  it('lets armour soak most of a hit', () => {
    expect(takeHit(100, 50, 20)).toEqual({ hp: 96, armour: 34 });
    expect(takeHit(100, 0, 20)).toEqual({ hp: 80, armour: 0 });
    expect(takeHit(10, 0, 50).hp).toBe(0);
  });
});
