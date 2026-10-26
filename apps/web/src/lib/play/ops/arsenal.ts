// Ridgeline Ops' arsenal (the owner, 26 Oct 2026: "20+ base weapons across 6 classes… fire modes…
// 5-tier loot rarity… gunsmith… 5 mod slots"). Twenty-one guns with names of their own in the style
// of real ones (real makers' names are trademarks), what each does, the attachments for each slot,
// and the stats a gun ends up with once its rarity and attachments are counted. No imports: pure
// numbers, tested in arsenal.test.ts; the 3D models are built from each gun's `model` description.

export type WeaponClass = 'ar' | 'smg' | 'lmg' | 'shotgun' | 'marksman' | 'pistol';
export type FireMode = 'semi' | 'burst' | 'auto';
/** Ammunition comes in four kinds, shared by the guns that take it. */
export type AmmoPool = 'rifle' | 'pistol' | 'shell' | 'sniper';
export type Rarity = 0 | 1 | 2 | 3 | 4;

export const RARITY = [
  { name: 'Common', color: '#a1a1aa', hex: 0xa1a1aa },
  { name: 'Uncommon', color: '#4ade80', hex: 0x4ade80 },
  { name: 'Rare', color: '#60a5fa', hex: 0x60a5fa },
  { name: 'Epic', color: '#c084fc', hex: 0xc084fc },
  { name: 'Legendary', color: '#f59e0b', hex: 0xf59e0b },
] as const;

/** How a gun's 3D model is put together (receiver, barrel, stock, magazine, handguard). */
export interface GunModel {
  body: 'ar' | 'ak' | 'bullpup' | 'battle' | 'smg' | 'pdw' | 'vector' | 'lmg' | 'pump' | 'semi' | 'dmr' | 'bolt' | 'heavy' | 'pistol' | 'magnum';
  /** Receiver length, barrel length (m). */
  len: number; barrel: number;
  stock: 'fixed' | 'tube' | 'skeleton' | 'wood' | 'none' | 'folded';
  mag: 'straight' | 'curved' | 'box' | 'drum' | 'tube' | 'grip' | 'stick';
  guard: 'rail' | 'wood' | 'slim' | 'heavy';
  /** Finish: the main colour, and wood furniture. */
  color: number; wood?: boolean;
}

export interface WeaponBase {
  id: WeaponId; name: string; cls: WeaponClass; pool: AmmoPool;
  dmg: number; pellets: number; rpm: number; modes: FireMode[];
  mag: number; reload: number; reloadEmpty: number;
  /** Muzzle velocity (m/s): bullets fly and drop (ballistics). */
  velocity: number;
  /** Spread from the hip and aimed (radians). */
  hip: number; ads: number;
  /** Full damage up to `range` m, falling to `minDmg` of it at three times that. */
  range: number; minDmg: number;
  /** Recoil per shot (radians): up, sideways drift (−1 left … 1 right) and its strength, randomness. */
  kick: number; drift: number; side: number; jitter: number;
  /** Seconds to aim down sights; walking speed with it out (1 = full). */
  adsTime: number; move: number;
  /** A bolt to work after each shot (seconds). */
  bolt?: number;
  /** Built-in optic (sniper rifles come scoped). */
  optic?: AttId;
  weight: number; value: number;
  model: GunModel;
}

export const WEAPONS = {
  // Assault rifles
  mcr4: { name: 'MCR-4 Carbine', cls: 'ar', pool: 'rifle', dmg: 26, pellets: 1, rpm: 800, modes: ['auto', 'burst', 'semi'], mag: 30, reload: 2.1, reloadEmpty: 2.7, velocity: 880, hip: 0.045, ads: 0.004, range: 70, minDmg: 0.7, kick: 0.010, drift: 0.3, side: 0.004, jitter: 0.25, adsTime: 0.24, move: 0.95, weight: 3.4, value: 900, model: { body: 'ar', len: 0.42, barrel: 0.36, stock: 'tube', mag: 'curved', guard: 'rail', color: 0x8b7558 } }, // flat dark earth
  kv103: { name: 'KV-103', cls: 'ar', pool: 'rifle', dmg: 32, pellets: 1, rpm: 620, modes: ['auto', 'semi'], mag: 30, reload: 2.4, reloadEmpty: 3, velocity: 715, hip: 0.05, ads: 0.006, range: 60, minDmg: 0.72, kick: 0.014, drift: 0.55, side: 0.007, jitter: 0.35, adsTime: 0.27, move: 0.93, weight: 3.6, value: 950, model: { body: 'ak', len: 0.44, barrel: 0.38, stock: 'wood', mag: 'curved', guard: 'wood', color: 0x3a3632, wood: true } },
  sr17: { name: 'SR-17 Battle Rifle', cls: 'ar', pool: 'rifle', dmg: 40, pellets: 1, rpm: 560, modes: ['auto', 'semi'], mag: 20, reload: 2.4, reloadEmpty: 3.1, velocity: 790, hip: 0.052, ads: 0.004, range: 85, minDmg: 0.75, kick: 0.018, drift: 0.2, side: 0.006, jitter: 0.3, adsTime: 0.3, move: 0.9, weight: 3.9, value: 1200, model: { body: 'battle', len: 0.48, barrel: 0.4, stock: 'skeleton', mag: 'box', guard: 'rail', color: 0x6b5a43 } },
  tx416: { name: 'TX-416', cls: 'ar', pool: 'rifle', dmg: 27, pellets: 1, rpm: 850, modes: ['auto', 'burst', 'semi'], mag: 30, reload: 2, reloadEmpty: 2.6, velocity: 870, hip: 0.044, ads: 0.0035, range: 72, minDmg: 0.7, kick: 0.0095, drift: -0.2, side: 0.004, jitter: 0.22, adsTime: 0.25, move: 0.95, weight: 3.5, value: 1100, model: { body: 'ar', len: 0.43, barrel: 0.35, stock: 'tube', mag: 'curved', guard: 'heavy', color: 0x3b3630 } },
  kestrel: { name: 'Kestrel Bullpup', cls: 'ar', pool: 'rifle', dmg: 25, pellets: 1, rpm: 760, modes: ['auto', 'semi'], mag: 30, reload: 2.3, reloadEmpty: 2.9, velocity: 900, hip: 0.04, ads: 0.0035, range: 70, minDmg: 0.7, kick: 0.0085, drift: 0.1, side: 0.003, jitter: 0.2, adsTime: 0.22, move: 0.97, weight: 3.3, value: 1050, model: { body: 'bullpup', len: 0.6, barrel: 0.3, stock: 'none', mag: 'straight', guard: 'slim', color: 0x4b5536 } },
  // SMGs
  mpk5: { name: 'MPK-5', cls: 'smg', pool: 'pistol', dmg: 21, pellets: 1, rpm: 800, modes: ['auto', 'burst', 'semi'], mag: 30, reload: 1.9, reloadEmpty: 2.4, velocity: 400, hip: 0.034, ads: 0.007, range: 28, minDmg: 0.55, kick: 0.0075, drift: 0.15, side: 0.004, jitter: 0.3, adsTime: 0.18, move: 1.04, weight: 2.6, value: 700, model: { body: 'smg', len: 0.34, barrel: 0.14, stock: 'tube', mag: 'curved', guard: 'slim', color: 0x26282a } },
  vandal: { name: 'Vandal .45', cls: 'smg', pool: 'pistol', dmg: 23, pellets: 1, rpm: 1150, modes: ['auto', 'burst'], mag: 25, reload: 1.8, reloadEmpty: 2.3, velocity: 300, hip: 0.036, ads: 0.008, range: 22, minDmg: 0.5, kick: 0.0062, drift: 0, side: 0.003, jitter: 0.35, adsTime: 0.19, move: 1.05, weight: 2.7, value: 950, model: { body: 'vector', len: 0.36, barrel: 0.14, stock: 'folded', mag: 'grip', guard: 'slim', color: 0x1d1f21 } },
  p7: { name: 'P7 PDW', cls: 'smg', pool: 'pistol', dmg: 19, pellets: 1, rpm: 950, modes: ['auto', 'semi'], mag: 40, reload: 1.7, reloadEmpty: 2.2, velocity: 735, hip: 0.032, ads: 0.006, range: 32, minDmg: 0.55, kick: 0.0068, drift: 0.25, side: 0.004, jitter: 0.3, adsTime: 0.17, move: 1.06, weight: 2, value: 850, model: { body: 'pdw', len: 0.3, barrel: 0.12, stock: 'tube', mag: 'grip', guard: 'slim', color: 0x2a2c2e } },
  uz9: { name: 'UZ-9', cls: 'smg', pool: 'pistol', dmg: 18, pellets: 1, rpm: 1000, modes: ['auto'], mag: 32, reload: 1.7, reloadEmpty: 2.1, velocity: 380, hip: 0.04, ads: 0.011, range: 20, minDmg: 0.5, kick: 0.007, drift: 0.4, side: 0.006, jitter: 0.45, adsTime: 0.16, move: 1.07, weight: 2.2, value: 500, model: { body: 'smg', len: 0.26, barrel: 0.1, stock: 'folded', mag: 'grip', guard: 'slim', color: 0x303234 } },
  // LMGs
  saw249: { name: 'SAW-249', cls: 'lmg', pool: 'rifle', dmg: 27, pellets: 1, rpm: 750, modes: ['auto'], mag: 100, reload: 5.2, reloadEmpty: 5.8, velocity: 915, hip: 0.06, ads: 0.006, range: 75, minDmg: 0.72, kick: 0.011, drift: 0.35, side: 0.006, jitter: 0.35, adsTime: 0.42, move: 0.82, weight: 7.5, value: 1300, model: { body: 'lmg', len: 0.55, barrel: 0.46, stock: 'fixed', mag: 'box', guard: 'heavy', color: 0x34362e } },
  pk11: { name: 'PK-11', cls: 'lmg', pool: 'rifle', dmg: 36, pellets: 1, rpm: 650, modes: ['auto'], mag: 100, reload: 5.6, reloadEmpty: 6.2, velocity: 825, hip: 0.065, ads: 0.007, range: 80, minDmg: 0.75, kick: 0.015, drift: 0.5, side: 0.008, jitter: 0.4, adsTime: 0.45, move: 0.8, weight: 8, value: 1400, model: { body: 'lmg', len: 0.6, barrel: 0.5, stock: 'wood', mag: 'box', guard: 'slim', color: 0x2e2b27, wood: true } },
  // Shotguns
  ranger870: { name: 'Ranger 870 Pump', cls: 'shotgun', pool: 'shell', dmg: 18, pellets: 8, rpm: 70, modes: ['semi'], mag: 6, reload: 3.4, reloadEmpty: 4, velocity: 400, hip: 0.07, ads: 0.05, range: 9, minDmg: 0.25, kick: 0.05, drift: 0, side: 0.01, jitter: 0.2, adsTime: 0.26, move: 0.95, bolt: 0.55, weight: 3.6, value: 650, model: { body: 'pump', len: 0.42, barrel: 0.5, stock: 'wood', mag: 'tube', guard: 'wood', color: 0x232323, wood: true } },
  corsa: { name: 'Corsa Semi-Auto', cls: 'shotgun', pool: 'shell', dmg: 15, pellets: 8, rpm: 240, modes: ['semi'], mag: 7, reload: 3.6, reloadEmpty: 4.2, velocity: 400, hip: 0.075, ads: 0.055, range: 8, minDmg: 0.25, kick: 0.04, drift: 0.1, side: 0.01, jitter: 0.25, adsTime: 0.27, move: 0.94, weight: 3.8, value: 1000, model: { body: 'semi', len: 0.44, barrel: 0.48, stock: 'fixed', mag: 'tube', guard: 'rail', color: 0x1e1e1e } },
  // Marksman and sniper rifles
  ebr14: { name: 'EBR-14', cls: 'marksman', pool: 'sniper', dmg: 52, pellets: 1, rpm: 300, modes: ['semi'], mag: 20, reload: 2.6, reloadEmpty: 3.2, velocity: 850, hip: 0.06, ads: 0.0015, range: 140, minDmg: 0.8, kick: 0.024, drift: 0.2, side: 0.006, jitter: 0.25, adsTime: 0.34, move: 0.9, optic: 'acog', weight: 5.1, value: 1500, model: { body: 'dmr', len: 0.5, barrel: 0.5, stock: 'skeleton', mag: 'box', guard: 'rail', color: 0x3a3a34 } },
  svk: { name: 'SVK Marksman', cls: 'marksman', pool: 'sniper', dmg: 58, pellets: 1, rpm: 220, modes: ['semi'], mag: 10, reload: 2.8, reloadEmpty: 3.4, velocity: 830, hip: 0.065, ads: 0.0012, range: 160, minDmg: 0.82, kick: 0.028, drift: 0.3, side: 0.007, jitter: 0.25, adsTime: 0.36, move: 0.9, optic: 'acog', weight: 4.3, value: 1400, model: { body: 'dmr', len: 0.48, barrel: 0.58, stock: 'skeleton', mag: 'box', guard: 'wood', color: 0x332f2a, wood: true } },
  arctic338: { name: 'Arctic .338', cls: 'marksman', pool: 'sniper', dmg: 120, pellets: 1, rpm: 45, modes: ['semi'], mag: 5, reload: 3.4, reloadEmpty: 4, velocity: 940, hip: 0.09, ads: 0.0004, range: 300, minDmg: 0.85, kick: 0.06, drift: 0.1, side: 0.006, jitter: 0.15, adsTime: 0.45, move: 0.85, bolt: 1.1, optic: 'scope8', weight: 6.5, value: 2600, model: { body: 'bolt', len: 0.55, barrel: 0.66, stock: 'fixed', mag: 'box', guard: 'slim', color: 0x5b6345 } },
  titan50: { name: 'Titan .50', cls: 'marksman', pool: 'sniper', dmg: 180, pellets: 1, rpm: 75, modes: ['semi'], mag: 6, reload: 4, reloadEmpty: 4.6, velocity: 850, hip: 0.1, ads: 0.0006, range: 320, minDmg: 0.85, kick: 0.085, drift: 0.2, side: 0.01, jitter: 0.15, adsTime: 0.55, move: 0.78, optic: 'scope8', weight: 13, value: 3400, model: { body: 'heavy', len: 0.7, barrel: 0.74, stock: 'fixed', mag: 'box', guard: 'heavy', color: 0x2f3128 } },
  // Sidearms
  striker19: { name: 'Striker-19', cls: 'pistol', pool: 'pistol', dmg: 24, pellets: 1, rpm: 450, modes: ['semi'], mag: 15, reload: 1.4, reloadEmpty: 1.8, velocity: 375, hip: 0.03, ads: 0.008, range: 20, minDmg: 0.55, kick: 0.016, drift: 0.1, side: 0.005, jitter: 0.3, adsTime: 0.14, move: 1.08, weight: 0.7, value: 300, model: { body: 'pistol', len: 0.19, barrel: 0.1, stock: 'none', mag: 'grip', guard: 'slim', color: 0x202224 } },
  hc50: { name: 'Hand Cannon .50', cls: 'pistol', pool: 'pistol', dmg: 62, pellets: 1, rpm: 160, modes: ['semi'], mag: 7, reload: 1.9, reloadEmpty: 2.3, velocity: 470, hip: 0.04, ads: 0.006, range: 30, minDmg: 0.6, kick: 0.05, drift: 0.2, side: 0.01, jitter: 0.3, adsTime: 0.18, move: 1.05, weight: 1.9, value: 700, model: { body: 'magnum', len: 0.26, barrel: 0.15, stock: 'none', mag: 'grip', guard: 'slim', color: 0x9ca3af } },
  m9: { name: 'M9 Service', cls: 'pistol', pool: 'pistol', dmg: 26, pellets: 1, rpm: 400, modes: ['semi'], mag: 15, reload: 1.5, reloadEmpty: 1.9, velocity: 380, hip: 0.032, ads: 0.008, range: 22, minDmg: 0.55, kick: 0.017, drift: 0, side: 0.005, jitter: 0.3, adsTime: 0.15, move: 1.08, weight: 0.95, value: 350, model: { body: 'pistol', len: 0.21, barrel: 0.12, stock: 'none', mag: 'grip', guard: 'slim', color: 0x2a2620 } },
  mp9a: { name: 'Raptor Auto Pistol', cls: 'pistol', pool: 'pistol', dmg: 20, pellets: 1, rpm: 900, modes: ['auto', 'semi'], mag: 20, reload: 1.6, reloadEmpty: 2, velocity: 360, hip: 0.035, ads: 0.012, range: 15, minDmg: 0.5, kick: 0.009, drift: 0.3, side: 0.006, jitter: 0.4, adsTime: 0.15, move: 1.07, weight: 1.1, value: 600, model: { body: 'pistol', len: 0.22, barrel: 0.1, stock: 'none', mag: 'stick', guard: 'slim', color: 0x1b1c1e } },
} satisfies Record<string, Omit<WeaponBase, 'id'>>;
export type WeaponId = keyof typeof WEAPONS;
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
export const weaponBase = (id: WeaponId): WeaponBase => ({ id, ...(WEAPONS[id] as Omit<WeaponBase, 'id'>) });
export const CLASS_NAMES: Record<WeaponClass, string> = { ar: 'Assault rifle', smg: 'SMG', lmg: 'LMG', shotgun: 'Shotgun', marksman: 'Marksman', pistol: 'Sidearm' };

/* ── Attachments: five slots ── */
export type Slot = 'optic' | 'muzzle' | 'under' | 'mag' | 'ammo';
export const SLOTS: Slot[] = ['optic', 'muzzle', 'under', 'mag', 'ammo'];
export const SLOT_NAMES: Record<Slot, string> = { optic: 'Optic', muzzle: 'Muzzle', under: 'Underbarrel', mag: 'Magazine', ammo: 'Ammo' };
/** What an attachment changes: multipliers (1 = no change) and flags. */
export interface Mods {
  dmg: number; velocity: number; range: number; kick: number; side: number; hip: number; adsTime: number; reload: number; mag: number; move: number;
  /** How far the shot is heard (1 = normal); a suppressor makes it a whisper. */
  noise: number;
  /** Damage to armour plates (armour-piercing rounds). */
  armour: number;
  /** Aiming magnification (1 = iron sights). */
  zoom: number;
  flash: boolean; laser: boolean;
}
const NONE: Mods = { dmg: 1, velocity: 1, range: 1, kick: 1, side: 1, hip: 1, adsTime: 1, reload: 1, mag: 1, move: 1, noise: 1, armour: 1, zoom: 1, flash: true, laser: false };
export const ATTACHMENTS = {
  reddot: { slot: 'optic', name: 'Red dot sight', mods: { zoom: 1.3 }, value: 150, weight: 0.15, for: ['ar', 'smg', 'lmg', 'shotgun', 'marksman', 'pistol'] },
  holo: { slot: 'optic', name: 'Holographic sight', mods: { zoom: 1.5, adsTime: 1.04 }, value: 220, weight: 0.3, for: ['ar', 'smg', 'lmg', 'shotgun', 'marksman'] },
  acog: { slot: 'optic', name: '4× ACOG', mods: { zoom: 4, adsTime: 1.15 }, value: 380, weight: 0.45, for: ['ar', 'lmg', 'marksman'] },
  scope8: { slot: 'optic', name: '8× sniper scope', mods: { zoom: 8, adsTime: 1.25, move: 0.97 }, value: 600, weight: 0.7, for: ['marksman', 'ar'] },
  suppressor: { slot: 'muzzle', name: 'Suppressor', mods: { noise: 0.18, range: 0.88, velocity: 0.95, flash: false, adsTime: 1.05 }, value: 400, weight: 0.4, for: ['ar', 'smg', 'lmg', 'marksman', 'pistol'] },
  comp: { slot: 'muzzle', name: 'Compensator', mods: { kick: 0.75, side: 1.1, noise: 1.1 }, value: 200, weight: 0.2, for: ['ar', 'smg', 'lmg', 'marksman', 'pistol', 'shotgun'] },
  flashhider: { slot: 'muzzle', name: 'Flash hider', mods: { kick: 0.92, flash: false }, value: 120, weight: 0.15, for: ['ar', 'smg', 'lmg', 'marksman'] },
  vgrip: { slot: 'under', name: 'Vertical foregrip', mods: { kick: 0.8, adsTime: 1.04 }, value: 180, weight: 0.2, for: ['ar', 'smg', 'lmg', 'shotgun', 'marksman'] },
  agrip: { slot: 'under', name: 'Angled grip', mods: { adsTime: 0.82, side: 0.85 }, value: 180, weight: 0.15, for: ['ar', 'smg', 'lmg', 'shotgun', 'marksman'] },
  laser: { slot: 'under', name: 'Laser sight', mods: { hip: 0.62, laser: true }, value: 220, weight: 0.12, for: ['ar', 'smg', 'lmg', 'shotgun', 'marksman', 'pistol'] },
  extmag: { slot: 'mag', name: 'Extended magazine', mods: { mag: 1.5, reload: 1.15, adsTime: 1.06, move: 0.98 }, value: 250, weight: 0.4, for: ['ar', 'smg', 'shotgun', 'marksman', 'pistol'] },
  fastmag: { slot: 'mag', name: 'Fast magazine', mods: { reload: 0.7 }, value: 230, weight: 0.2, for: ['ar', 'smg', 'lmg', 'shotgun', 'marksman', 'pistol'] },
  fmj: { slot: 'ammo', name: 'FMJ rounds', mods: {}, value: 40, weight: 0, for: ['ar', 'smg', 'lmg', 'shotgun', 'marksman', 'pistol'] },
  ap: { slot: 'ammo', name: 'Armour-piercing rounds', mods: { armour: 1.6, dmg: 0.92 }, value: 320, weight: 0, for: ['ar', 'smg', 'lmg', 'marksman', 'pistol'] },
  subsonic: { slot: 'ammo', name: 'Subsonic rounds', mods: { noise: 0.6, velocity: 0.7, dmg: 0.92 }, value: 200, weight: 0, for: ['ar', 'smg', 'marksman', 'pistol'] },
} satisfies Record<string, { slot: Slot; name: string; mods: Partial<Mods>; value: number; weight: number; for: WeaponClass[] }>;
export type AttId = keyof typeof ATTACHMENTS;
export const ATT_IDS = Object.keys(ATTACHMENTS) as AttId[];
export const fits = (att: AttId, w: WeaponId) => (ATTACHMENTS[att].for as readonly WeaponClass[]).includes(WEAPONS[w].cls);

/** A gun as carried: its base, rarity, attachments, rounds in it and fire mode. */
export interface Gun { base: WeaponId; rarity: Rarity; att: Partial<Record<Slot, AttId>>; mag: number; mode: FireMode }
/** What a gun shoots like, everything counted. */
export interface GunStats extends Omit<WeaponBase, 'model' | 'optic'> { mods: Mods; zoom: number; optic: AttId | null; rarityDmg: number }

/** A gun's stats with its rarity (each step +4% damage) and every attachment. */
export function gunStats(g: Gun): GunStats {
  const b = weaponBase(g.base);
  const m: Mods = { ...NONE };
  const optic = g.att.optic ?? b.optic ?? null;
  for (const id of Object.values(g.att)) {
    if (!id) continue;
    const mods = ATTACHMENTS[id].mods as Partial<Mods>;
    for (const k of Object.keys(mods) as (keyof Mods)[]) {
      const v = mods[k];
      if (typeof v === 'boolean') (m[k] as boolean) = v;
      else if (typeof v === 'number') (m[k] as number) *= v;
    }
  }
  if (!g.att.optic && b.optic) { const om = ATTACHMENTS[b.optic].mods as Partial<Mods>; m.zoom *= om.zoom ?? 1; m.adsTime *= om.adsTime ?? 1; }
  // Subsonic rounds through a suppressor are near silent.
  if (g.att.ammo === 'subsonic' && g.att.muzzle === 'suppressor') m.noise = 0.08;
  const rarityDmg = 1 + 0.04 * g.rarity;
  return {
    ...b, mods: m, optic, rarityDmg, zoom: m.zoom,
    name: gunName(g),
    dmg: b.dmg * m.dmg * rarityDmg, velocity: b.velocity * m.velocity, range: b.range * m.range, kick: b.kick * m.kick, side: b.side * m.side,
    hip: b.hip * m.hip, adsTime: b.adsTime * m.adsTime, reload: b.reload * m.reload, reloadEmpty: b.reloadEmpty * m.reload, mag: Math.round(b.mag * m.mag), move: b.move * m.move,
  };
}
/** Legendary guns have names of their own. */
const LEGENDS: Partial<Record<WeaponId, string>> = { mcr4: 'Tempest', kv103: 'Red Wolf', sr17: 'Juggernaut', tx416: 'Black Widow', kestrel: 'Talon', mpk5: 'Hornet', vandal: 'Buzzsaw', p7: 'Wasp', uz9: 'Rattler', saw249: 'Avalanche', pk11: 'Iron Bear', ranger870: 'Thunderclap', corsa: 'Breaker', ebr14: 'Overwatch', svk: 'Siberia', arctic338: 'Longshot', titan50: 'Godhammer', striker19: 'Viper', hc50: 'Judge', m9: 'Old Faithful', mp9a: 'Hellcat' };
export const gunName = (g: Pick<Gun, 'base' | 'rarity'>) => (g.rarity === 4 && LEGENDS[g.base] ? `“${LEGENDS[g.base]}” ${WEAPONS[g.base].name}` : WEAPONS[g.base].name);

/** Damage at a distance: full to the range, down to `minDmg` of it at three times the range. */
export function damageAt(s: Pick<GunStats, 'dmg' | 'range' | 'minDmg'>, dist: number) {
  if (dist <= s.range) return s.dmg;
  const k = Math.min(1, (dist - s.range) / (s.range * 2));
  return s.dmg * (1 - (1 - s.minDmg) * k);
}

/** Recoil for the n-th shot of a string: mostly up, drifting to one side, with some randomness (`rand` 0–1). */
export function recoilFor(s: Pick<GunStats, 'kick' | 'drift' | 'side' | 'jitter'>, n: number, rand: number) {
  const climb = s.kick * (1 + Math.min(n, 10) * 0.04);
  const sway = s.side * (s.drift + Math.sin(n * 0.9) * 0.6 + (rand - 0.5) * 2 * s.jitter);
  return { up: climb * (1 + (rand - 0.5) * s.jitter * 0.5), side: sway };
}

/** The six bars the gunsmith shows (0–100): damage, range, accuracy, control, mobility, handling. */
export function gunBars(s: GunStats) {
  const c = (v: number, lo: number, hi: number) => Math.round(Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)));
  return {
    Damage: c(s.dmg * s.pellets * 0.7, 10, 130), Range: c(s.range, 5, 300), Accuracy: c(1 / s.hip, 8, 40),
    Control: c(1 / s.kick, 10, 150), Mobility: c(s.move, 0.75, 1.08), Handling: c(1 / s.adsTime, 1.6, 7),
  };
}

/** Attachments a gun comes with by rarity: none, then 1, 2, 3, all five (seeded `r`). */
export function rollAttachments(base: WeaponId, rarity: Rarity, r: () => number): Partial<Record<Slot, AttId>> {
  const n = [0, 1, 2, 3, 5][rarity], out: Partial<Record<Slot, AttId>> = {};
  const slots = [...SLOTS];
  for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  for (const slot of slots.slice(0, n)) {
    const options = ATT_IDS.filter((a) => ATTACHMENTS[a].slot === slot && fits(a, base) && a !== 'fmj');
    if (options.length) out[slot] = options[Math.floor(r() * options.length)];
  }
  return out;
}
/** A new gun at a rarity, full magazine, its first fire mode. */
export function makeGun(base: WeaponId, rarity: Rarity, r: () => number): Gun {
  const att = rollAttachments(base, rarity, r);
  const g: Gun = { base, rarity, att, mag: 0, mode: WEAPONS[base].modes[0] as FireMode };
  g.mag = gunStats(g).mag;
  return g;
}
/** What a gun is worth (selling, and the score when it's extracted): base × rarity, plus its attachments. */
export const gunValue = (g: Pick<Gun, 'base' | 'rarity' | 'att'>) => Math.round(WEAPONS[g.base].value * [1, 1.4, 2, 3, 5][g.rarity]) + Object.values(g.att).reduce((n, a) => n + (a ? ATTACHMENTS[a].value : 0), 0);
export const gunWeight = (g: Pick<Gun, 'base' | 'att'>) => WEAPONS[g.base].weight + Object.values(g.att).reduce((n, a) => n + (a ? ATTACHMENTS[a].weight : 0), 0);
/** The next fire mode the gun has (B). */
export const nextMode = (g: Gun): FireMode => { const ms = WEAPONS[g.base].modes as readonly FireMode[]; return ms[(ms.indexOf(g.mode) + 1) % ms.length]; };
