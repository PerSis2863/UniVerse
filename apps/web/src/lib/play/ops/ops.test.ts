import { describe, expect, it } from 'vitest';
import { seeded } from '../../seeded-shuffle';
import {
  ATTACHMENTS, MAP_CELL, MAP_CELLS, MAP_EDGE, MAP_SIZE, PACKS, ROUND_S, SECURE_SLOTS, WEAPONS, WEAPON_IDS,
  applyHit, bagAdd, bagCount, bagTake, bankAll, damageAt, fits, freshValue, groundAt, gunStats, gunValue, makeGun, nextMode, opsCeiling, opsMap, recoilFor, roadAt, rollAttachments, starterLoadout,
  type Gun,
} from './index';

describe('Ridgeline Ops arsenal', () => {
  it('has 21 guns across the six classes, each with a fire mode and sane numbers', () => {
    expect(WEAPON_IDS.length).toBeGreaterThanOrEqual(20);
    const classes = new Set(WEAPON_IDS.map((w) => WEAPONS[w].cls));
    expect([...classes].sort()).toEqual(['ar', 'lmg', 'marksman', 'pistol', 'shotgun', 'smg']);
    for (const w of WEAPON_IDS) {
      const b = WEAPONS[w];
      expect(b.modes.length).toBeGreaterThan(0);
      expect(b.velocity).toBeGreaterThan(250);
      expect(b.ads).toBeLessThan(b.hip);
      expect(b.mag).toBeGreaterThan(0);
    }
  });

  it('counts rarity and attachments into a gun’s stats', () => {
    const plain: Gun = { base: 'mcr4', rarity: 0, att: {}, mag: 30, mode: 'auto' };
    const kitted: Gun = { base: 'mcr4', rarity: 4, att: { muzzle: 'comp', mag: 'extmag', under: 'vgrip', optic: 'acog' }, mag: 45, mode: 'auto' };
    const a = gunStats(plain), b = gunStats(kitted);
    expect(b.dmg).toBeCloseTo(a.dmg * 1.16, 5);
    expect(b.mag).toBe(45);
    expect(b.kick).toBeLessThan(a.kick * 0.65);
    expect(b.zoom).toBe(4);
    expect(b.name).toContain('Tempest');
    expect(gunStats({ ...plain, att: { muzzle: 'suppressor', ammo: 'subsonic' } }).mods.noise).toBeLessThan(0.1);
    expect(gunStats({ base: 'arctic338', rarity: 0, att: {}, mag: 5, mode: 'semi' }).zoom).toBe(8); // comes scoped
  });

  it('gives better rarities more attachments that fit, and cycles fire modes', () => {
    const r = seeded(4);
    for (const w of WEAPON_IDS) for (const rar of [0, 1, 2, 3, 4] as const) {
      const att = rollAttachments(w, rar, r);
      expect(Object.keys(att).length).toBeLessThanOrEqual([0, 1, 2, 3, 5][rar]);
      for (const id of Object.values(att)) expect(fits(id!, w)).toBe(true);
    }
    const g = makeGun('mcr4', 0, r);
    expect([g.mode, nextMode(g), nextMode({ ...g, mode: nextMode(g) })]).toEqual(['auto', 'burst', 'semi']);
    expect(gunValue({ base: 'mcr4', rarity: 4, att: {} })).toBe(WEAPONS.mcr4.value * 5);
  });

  it('drops damage past a gun’s range, and kicks mostly up', () => {
    const s = gunStats({ base: 'mpk5', rarity: 0, att: {}, mag: 30, mode: 'auto' });
    expect(damageAt(s, 5)).toBe(s.dmg);
    expect(damageAt(s, s.range * 3)).toBeCloseTo(s.dmg * s.minDmg, 5);
    const k = recoilFor(s, 3, 0.5);
    expect(k.up).toBeGreaterThan(Math.abs(k.side));
  });

  it('knows which attachments go on which guns', () => {
    expect(fits('scope8', 'arctic338')).toBe(true);
    expect(fits('scope8', 'striker19')).toBe(false);
    expect(ATTACHMENTS.suppressor.slot).toBe('muzzle');
  });
});

describe('Ridgeline Ops armour and items', () => {
  it('lets plates take body hits, helmets part of headshots, and AP rounds wear plates faster', () => {
    const a = { hp: 100, plates: [50, 50], helmet: 0 as const };
    const body = applyHit(a, 30, 'body');
    expect(body.hp).toBe(100);
    expect(body.plates).toEqual([50, 20]);
    const ap = applyHit(a, 30, 'body', 1.6);
    expect(ap.plates[1]).toBeCloseTo(2, 5);
    const big = applyHit({ ...a, plates: [10] }, 30, 'body');
    expect(big.broke).toBe(true);
    expect(big.hp).toBe(80);
    expect(applyHit({ hp: 100, plates: [], helmet: 3 }, 40, 'head').hp).toBeCloseTo(100 - 40 * 2.1 * 0.5, 5);
    expect(applyHit({ hp: 10, plates: [], helmet: 0 }, 40, 'leg').down).toBe(true);
  });

  it('stacks the bag, refuses past its slots, and only counts fresh loot', () => {
    const l = starterLoadout();
    expect(bagAdd(l, { kind: 'ammo', pool: 'rifle', n: 20 })).toBeNull();
    expect(bagCount(l, (it) => it.kind === 'ammo' && it.pool === 'rifle')).toBe(170);
    expect(bagTake(l, (it) => it.kind === 'ammo' && it.pool === 'rifle', 200)).toBe(170);
    expect(freshValue(l)).toBe(0);
    let spilled = null;
    for (let i = 0; i < PACKS.small.slots + 2; i++) spilled = bagAdd(l, { kind: 'valuable', id: 'gpu', fresh: true });
    expect(spilled).not.toBeNull();
    expect(l.bag.length).toBe(PACKS.small.slots);
    expect(freshValue(l)).toBeGreaterThan(0);
    bankAll(l);
    expect(freshValue(l)).toBe(0);
    expect(SECURE_SLOTS).toBe(4);
  });
});

describe('Ridgeline Ops island', () => {
  const m = opsMap(7);

  it('builds the same island for a seed with the six named places, a village, landing zones and SAM sites', () => {
    const again = opsMap(7);
    expect(again.places.map((p) => [p.kind, Math.round(p.x), Math.round(p.z)])).toEqual(m.places.map((p) => [p.kind, Math.round(p.x), Math.round(p.z)]));
    expect(again.containers).toEqual(m.containers);
    const kinds = m.places.map((p) => p.kind);
    for (const k of ['pine', 'radar', 'harbor', 'airfield', 'dam', 'bunker', 'village']) expect(kinds).toContain(k);
    expect(kinds.filter((k) => k === 'lz')).toHaveLength(4);
    expect(kinds.filter((k) => k === 'sam')).toHaveLength(2);
    expect(m.places.filter((p) => p.hostage && p.held)).toHaveLength(3);
    expect(m.places.find((p) => p.kind === 'radar')!.name).toBe('Radar Dome Summit');
  });

  it('keeps the places on land and apart, with roads to all of them', () => {
    for (const seed of [1, 2, 3, 99]) {
      const mm = opsMap(seed);
      const big = mm.places.filter((p) => !['ruin', 'wreck'].includes(p.kind));
      for (const p of big) {
        expect(Math.hypot(p.x, p.z)).toBeLessThan(MAP_EDGE);
        expect(groundAt(mm.heights, p.x, p.z)).toBeGreaterThan(1.5);
        if (p.kind !== 'lz' && p.kind !== 'sam') expect(roadAt(mm, p.x, p.z)).toBeLessThan(40);
      }
    }
  });

  it('reads the ground on the same triangles it is drawn with', () => {
    const row = MAP_CELLS + 1, ix = 70, iz = 90, x = ix * MAP_CELL - MAP_SIZE / 2, z = iz * MAP_CELL - MAP_SIZE / 2;
    expect(groundAt(m.heights, x, z)).toBeCloseTo(m.heights[iz * row + ix], 5);
  });

  it('fills the lake below its rim and puts safes behind keys that officers carry', () => {
    expect(groundAt(m.heights, m.lake.x, m.lake.z)).toBeLessThan(m.lake.y - 1);
    const safes = m.containers.filter((c) => c.kind === 'safe');
    expect(safes.length).toBe(3);
    const keys = m.foes.flatMap((f) => f.loot).filter((it) => it.kind === 'key').map((it) => (it as { key: string }).key);
    for (const s of safes) expect(keys).toContain(s.key);
    expect(m.foes.filter((f) => f.role === 'boss')).toHaveLength(1);
    expect(m.drops.length).toBe(2);
  });

  it('stays under the score cap on any island', async () => {
    const { GAMES } = await import('../../play');
    for (let seed = 1; seed <= 12; seed++) expect(opsCeiling(opsMap(seed), ROUND_S)).toBeLessThanOrEqual(GAMES.ops.maxScore);
  });
});
