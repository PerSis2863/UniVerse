import { ATTACHMENTS, ATT_IDS, WEAPONS, WEAPON_IDS, gunValue, gunWeight, makeGun, type AmmoPool, type AttId, type Gun, type Rarity, type WeaponClass, type WeaponId } from './arsenal';

// Everything a player can carry in Ridgeline Ops (the owner: "tactical backpack… helmet (tier 1-3),
// plate carrier vest (tier 1-3), backpack size, weight… a 2x2 secure container… armor plates…
// bandages, first aid kits, adrenaline, splints… keys… cash"), what it weighs and is worth, how the
// backpack holds it (slots, stacks, weight), and what each kind of container and soldier has.
// Items picked up in this raid are `fresh`: only fresh value counts for the score when it's got
// out (so gear brought from the stash doesn't score twice).

export type Med = 'bandage' | 'firstaid' | 'adrenaline' | 'splint';
export type Nade = 'frag' | 'flash' | 'smoke';
export type PackSize = 'small' | 'medium' | 'large';
export type Tier = 1 | 2 | 3;

export const VALUABLES = {
  scrap: { name: 'Scrap electronics', rarity: 0, value: 60, weight: 0.5 },
  food: { name: 'Canned rations', rarity: 0, value: 35, weight: 0.4 },
  batteries: { name: 'Batteries', rarity: 0, value: 50, weight: 0.3 },
  radio: { name: 'Field radio', rarity: 1, value: 140, weight: 1.2 },
  carbattery: { name: 'Car battery', rarity: 1, value: 180, weight: 3 },
  medsupply: { name: 'Medical supplies', rarity: 1, value: 160, weight: 0.8 },
  intel: { name: 'Intel folder', rarity: 2, value: 320, weight: 0.3 },
  gpu: { name: 'Graphics card', rarity: 2, value: 450, weight: 0.9 },
  watch: { name: 'Gold watch', rarity: 2, value: 380, weight: 0.1 },
  goldbar: { name: 'Gold bar', rarity: 3, value: 900, weight: 1 },
  laptop: { name: 'Military laptop', rarity: 3, value: 1100, weight: 2 },
  drive: { name: 'Encrypted drive', rarity: 4, value: 2400, weight: 0.1 },
  dossier: { name: 'Classified dossier', rarity: 4, value: 3000, weight: 0.2 },
} satisfies Record<string, { name: string; rarity: Rarity; value: number; weight: number }>;
export type ValuableId = keyof typeof VALUABLES;
const VAL_BY_RARITY = ([0, 1, 2, 3, 4] as Rarity[]).map((r) => (Object.keys(VALUABLES) as ValuableId[]).filter((k) => VALUABLES[k].rarity === r));

export const MEDS: Record<Med, { name: string; stack: number; weight: number; value: number; use: number }> = {
  bandage: { name: 'Bandage', stack: 5, weight: 0.05, value: 40, use: 1.2 },
  firstaid: { name: 'First aid kit', stack: 3, weight: 0.4, value: 120, use: 2.4 },
  adrenaline: { name: 'Adrenaline', stack: 2, weight: 0.05, value: 200, use: 0.8 },
  splint: { name: 'Splint', stack: 2, weight: 0.2, value: 90, use: 1.6 },
};
export const NADES: Record<Nade, { name: string; stack: number; weight: number; value: number }> = {
  frag: { name: 'Frag grenade', stack: 3, weight: 0.45, value: 120 },
  flash: { name: 'Flashbang', stack: 3, weight: 0.3, value: 80 },
  smoke: { name: 'Smoke grenade', stack: 3, weight: 0.4, value: 60 },
};
/** Plates: ceramic stop 50, steel 75 but weigh more. */
export const PLATES = { ceramic: { name: 'Ceramic plate', hp: 50, weight: 0.9, value: 90, stack: 6 }, steel: { name: 'Steel plate', hp: 75, weight: 2.2, value: 160, stack: 4 } } as const;
export type PlateKind = keyof typeof PLATES;
/** Helmets take off part of a headshot; tier 2 and up carry night vision. */
export const HELMETS: Record<Tier, { name: string; block: number; weight: number; value: number; nvg: boolean }> = {
  1: { name: 'Patrol helmet', block: 0.2, weight: 1.1, value: 200, nvg: false },
  2: { name: 'Combat helmet', block: 0.35, weight: 1.4, value: 450, nvg: true },
  3: { name: 'Assault helmet', block: 0.5, weight: 1.8, value: 900, nvg: true },
};
/** Vests hold one to three plates. */
export const VESTS: Record<Tier, { name: string; plates: number; weight: number; value: number }> = {
  1: { name: 'Light carrier', plates: 1, weight: 1.5, value: 250 },
  2: { name: 'Plate carrier', plates: 2, weight: 2.4, value: 500 },
  3: { name: 'Heavy plate carrier', plates: 3, weight: 3.4, value: 1000 },
};
export const PACKS: Record<PackSize, { name: string; slots: number; carry: number; value: number }> = {
  small: { name: 'Small backpack', slots: 8, carry: 22, value: 150 },
  medium: { name: 'Medium backpack', slots: 12, carry: 32, value: 400 },
  large: { name: 'Large backpack', slots: 16, carry: 44, value: 900 },
};
export const AMMO: Record<AmmoPool, { name: string; stack: number; weightEach: number; value: number }> = {
  rifle: { name: 'Rifle ammo', stack: 180, weightEach: 0.012, value: 1 },
  pistol: { name: 'Pistol / SMG ammo', stack: 200, weightEach: 0.008, value: 0.6 },
  shell: { name: 'Shotgun shells', stack: 40, weightEach: 0.04, value: 3 },
  sniper: { name: 'Sniper rounds', stack: 40, weightEach: 0.03, value: 6 },
};
/** The secure container: four slots that stay with you when you go down. */
export const SECURE_SLOTS = 4;

export type Item =
  | { kind: 'gun'; gun: Gun; fresh?: boolean }
  | { kind: 'att'; att: AttId; fresh?: boolean }
  | { kind: 'valuable'; id: ValuableId; fresh?: boolean }
  | { kind: 'ammo'; pool: AmmoPool; n: number }
  | { kind: 'med'; med: Med; n: number }
  | { kind: 'nade'; nade: Nade; n: number }
  | { kind: 'plate'; plate: PlateKind; n: number }
  | { kind: 'helmet'; tier: Tier; fresh?: boolean }
  | { kind: 'vest'; tier: Tier; fresh?: boolean }
  | { kind: 'pack'; size: PackSize; fresh?: boolean }
  | { kind: 'key'; key: string; name: string }
  | { kind: 'cash'; n: number; fresh?: boolean };

export const itemRarity = (it: Item): Rarity =>
  it.kind === 'gun' ? it.gun.rarity : it.kind === 'valuable' ? VALUABLES[it.id].rarity : it.kind === 'att' ? (ATTACHMENTS[it.att].value >= 380 ? 3 : ATTACHMENTS[it.att].value >= 220 ? 2 : 1) as Rarity
    : it.kind === 'helmet' || it.kind === 'vest' ? (it.tier + 1) as Rarity : it.kind === 'pack' ? (it.size === 'large' ? 3 : it.size === 'medium' ? 2 : 1) : it.kind === 'key' ? 3 : it.kind === 'cash' ? 2 : 0;
export function itemName(it: Item): string {
  switch (it.kind) {
    case 'gun': return it.gun.rarity === 4 ? `Legendary ${WEAPONS[it.gun.base].name}` : WEAPONS[it.gun.base].name;
    case 'att': return ATTACHMENTS[it.att].name;
    case 'valuable': return VALUABLES[it.id].name;
    case 'ammo': return `${AMMO[it.pool].name} ×${it.n}`;
    case 'med': return `${MEDS[it.med].name}${it.n > 1 ? ` ×${it.n}` : ''}`;
    case 'nade': return `${NADES[it.nade].name}${it.n > 1 ? ` ×${it.n}` : ''}`;
    case 'plate': return `${PLATES[it.plate].name}${it.n > 1 ? ` ×${it.n}` : ''}`;
    case 'helmet': return `${HELMETS[it.tier].name} (T${it.tier})`;
    case 'vest': return `${VESTS[it.tier].name} (T${it.tier})`;
    case 'pack': return PACKS[it.size].name;
    case 'key': return it.name;
    case 'cash': return `$${it.n.toLocaleString()}`;
  }
}
export function itemValue(it: Item): number {
  switch (it.kind) {
    case 'gun': return gunValue(it.gun);
    case 'att': return ATTACHMENTS[it.att].value;
    case 'valuable': return VALUABLES[it.id].value;
    case 'ammo': return Math.round(AMMO[it.pool].value * it.n);
    case 'med': return MEDS[it.med].value * it.n;
    case 'nade': return NADES[it.nade].value * it.n;
    case 'plate': return PLATES[it.plate].value * it.n;
    case 'helmet': return HELMETS[it.tier].value;
    case 'vest': return VESTS[it.tier].value;
    case 'pack': return PACKS[it.size].value;
    case 'key': return 150;
    case 'cash': return it.n;
  }
}
export function itemWeight(it: Item): number {
  switch (it.kind) {
    case 'gun': return gunWeight(it.gun);
    case 'att': return ATTACHMENTS[it.att].weight;
    case 'valuable': return VALUABLES[it.id].weight;
    case 'ammo': return AMMO[it.pool].weightEach * it.n;
    case 'med': return MEDS[it.med].weight * it.n;
    case 'nade': return NADES[it.nade].weight * it.n;
    case 'plate': return PLATES[it.plate].weight * it.n;
    case 'helmet': return HELMETS[it.tier].weight;
    case 'vest': return VESTS[it.tier].weight;
    case 'pack': return 1;
    case 'key': return 0.02;
    case 'cash': return 0;
  }
}
/** Items of the same kind that share a slot, and how many fit in one. */
export const stackOf = (it: Item): number => it.kind === 'ammo' ? AMMO[it.pool].stack : it.kind === 'med' ? MEDS[it.med].stack : it.kind === 'nade' ? NADES[it.nade].stack : it.kind === 'plate' ? PLATES[it.plate].stack : 1;
const sameStack = (a: Item, b: Item) => (a.kind === 'ammo' && b.kind === 'ammo' && a.pool === b.pool) || (a.kind === 'med' && b.kind === 'med' && a.med === b.med) || (a.kind === 'nade' && b.kind === 'nade' && a.nade === b.nade) || (a.kind === 'plate' && b.kind === 'plate' && a.plate === b.plate);
const countOf = (it: Item) => ('n' in it && it.kind !== 'cash' ? it.n : 1);
const withCount = (it: Item, n: number): Item => ({ ...it, n } as Item);

/** Everything on a player. */
export interface Loadout {
  primary: (Gun | null)[]; sidearm: Gun | null;
  helmet: Tier | 0; vest: Tier | 0; pack: PackSize;
  /** Each plate slot's armour left (0 = empty), as many as the vest holds. */
  plates: number[];
  bag: Item[]; secure: Item[]; cash: number; freshCash: number;
  /** Fresh flags for what's worn (picked up this raid). */
  fresh: { primary: boolean[]; sidearm: boolean; helmet: boolean; vest: boolean; pack: boolean };
}

export const loadoutWeight = (l: Loadout) =>
  [...l.primary, l.sidearm].reduce((n, g) => n + (g ? gunWeight(g) : 0), 0) + (l.helmet ? HELMETS[l.helmet].weight : 0) + (l.vest ? VESTS[l.vest].weight : 0) + l.bag.reduce((n, it) => n + itemWeight(it), 0);
/** Over this, you're slowed (and can't sprint over 1.25×). */
export const carryLimit = (l: Loadout) => PACKS[l.pack].carry;

/** An item into the bag: topping up stacks first, then a free slot. Returns what didn't fit. */
export function bagAdd(l: Loadout, it: Item): Item | null {
  const slots = PACKS[l.pack].slots;
  let left = countOf(it);
  const max = stackOf(it);
  if (max > 1) for (let i = 0; i < l.bag.length && left > 0; i++) {
    const s = l.bag[i];
    if (!sameStack(s, it)) continue;
    const room = max - countOf(s);
    if (room <= 0) continue;
    const put = Math.min(room, left);
    l.bag[i] = withCount(s, countOf(s) + put); left -= put;
  }
  while (left > 0 && l.bag.length < slots) { const put = Math.min(max, left); l.bag.push(max > 1 ? withCount(it, put) : it); left -= put; }
  return left > 0 ? (max > 1 ? withCount(it, left) : it) : null;
}
/** How many of a stackable kind the bag holds. */
export function bagCount(l: Loadout, match: (it: Item) => boolean) { return l.bag.filter(match).reduce((n, it) => n + countOf(it), 0); }
/** Takes `n` of a stackable kind out of the bag; returns how many it took. */
export function bagTake(l: Loadout, match: (it: Item) => boolean, n: number) {
  let took = 0;
  for (let i = l.bag.length - 1; i >= 0 && took < n; i--) {
    const it = l.bag[i];
    if (!match(it)) continue;
    const have = countOf(it), use = Math.min(have, n - took);
    took += use;
    if (use >= have) l.bag.splice(i, 1); else l.bag[i] = withCount(it, have - use);
  }
  return took;
}
export const ammoIn = (l: Loadout, pool: AmmoPool) => bagCount(l, (it) => it.kind === 'ammo' && it.pool === pool);

/** The fresh value on a player: what would score if they got out now. */
export function freshValue(l: Loadout) {
  let v = l.freshCash;
  for (const it of [...l.bag, ...l.secure]) if ('fresh' in it && it.fresh) v += itemValue(it);
  l.primary.forEach((g, i) => { if (g && l.fresh.primary[i]) v += gunValue(g); });
  if (l.sidearm && l.fresh.sidearm) v += gunValue(l.sidearm);
  if (l.helmet && l.fresh.helmet) v += HELMETS[l.helmet].value;
  if (l.vest && l.fresh.vest) v += VESTS[l.vest].value;
  if (l.fresh.pack) v += PACKS[l.pack].value;
  return v;
}
/** After getting out: nothing is fresh any more (it's banked). */
export function bankAll(l: Loadout) {
  l.bag = l.bag.map((it) => ('fresh' in it ? { ...it, fresh: false } : it) as Item);
  l.secure = l.secure.map((it) => ('fresh' in it ? { ...it, fresh: false } : it) as Item);
  l.freshCash = 0;
  l.fresh = { primary: l.primary.map(() => false), sidearm: false, helmet: false, vest: false, pack: false };
}

/** The starting kit for a first raid. */
export function starterLoadout(): Loadout {
  const r = () => 0.5;
  return {
    // The carbine starts kitted out: a holographic sight, a flash hider and a vertical foregrip.
    primary: [{ ...makeGun('mcr4', 0, r), att: { optic: 'holo', muzzle: 'flashhider', under: 'vgrip' } }, null], sidearm: makeGun('striker19', 0, r),
    helmet: 1, vest: 1, pack: 'small', plates: [PLATES.ceramic.hp],
    bag: [{ kind: 'ammo', pool: 'rifle', n: 150 }, { kind: 'ammo', pool: 'pistol', n: 60 }, { kind: 'med', med: 'bandage', n: 2 }, { kind: 'med', med: 'firstaid', n: 1 }, { kind: 'plate', plate: 'ceramic', n: 2 }, { kind: 'nade', nade: 'frag', n: 1 }],
    secure: [], cash: 500, freshCash: 0,
    fresh: { primary: [false, false], sidearm: false, helmet: false, vest: false, pack: false },
  };
}

/* ── Loot ── */
export type ContainerKind = 'weapons' | 'medical' | 'register' | 'duffel' | 'safe' | 'supply' | 'body';
export const CONTAINERS: Record<ContainerKind, { name: string; search: number }> = {
  weapons: { name: 'Weapon crate', search: 1.2 }, medical: { name: 'Medical cabinet', search: 0.9 }, register: { name: 'Cash register', search: 0.6 },
  duffel: { name: 'Duffel bag', search: 1 }, safe: { name: 'Locked safe', search: 1.5 }, supply: { name: 'Supply drop', search: 1.4 }, body: { name: 'Body', search: 1 },
};
/** A rarity roll: `tier` 0 (out in the wild) to 3 (a supply drop) makes the good ones likelier. */
export function rollRarity(r: () => number, tier: number, cap: Rarity = 4): Rarity {
  const w = [50, 28, 14, 6, 2].map((x, i) => x * Math.pow(1 + tier * 0.55, i)).slice(0, cap + 1);
  let roll = r() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { roll -= w[i]; if (roll < 0) return i as Rarity; }
  return cap;
}
const pick = <T>(xs: readonly T[], r: () => number) => xs[Math.floor(r() * xs.length)];
const LOOT_GUNS = WEAPON_IDS;
const valuable = (r: () => number, tier: number, cap: Rarity = 4): Item => ({ kind: 'valuable', id: pick(VAL_BY_RARITY[rollRarity(r, tier, cap)], r), fresh: true });
const gun = (r: () => number, tier: number, cap: Rarity = 4, cls?: WeaponClass[]): Item => {
  const list = cls ? LOOT_GUNS.filter((w) => cls.includes(WEAPONS[w].cls)) : LOOT_GUNS;
  return { kind: 'gun', gun: makeGun(pick(list, r) as WeaponId, rollRarity(r, tier, cap), r), fresh: true };
};
const ammo = (r: () => number): Item => { const pool = pick(['rifle', 'rifle', 'pistol', 'shell', 'sniper'] as AmmoPool[], r); return { kind: 'ammo', pool, n: Math.round(AMMO[pool].stack * (0.25 + r() * 0.35)) }; };

/** What a container holds, from its kind and how deep in it sits (`tier` 0–3). */
export function rollContainer(kind: ContainerKind, tier: number, r: () => number): Item[] {
  const out: Item[] = [];
  const n = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  switch (kind) {
    case 'weapons':
      out.push(gun(r, tier));
      for (let i = n(1, 2); i > 0; i--) out.push(r() < 0.5 ? { kind: 'att', att: pick(ATT_IDS.filter((a) => a !== 'fmj'), r), fresh: true } : ammo(r));
      if (r() < 0.4) out.push({ kind: 'nade', nade: pick(['frag', 'frag', 'flash', 'smoke'] as Nade[], r), n: 1 });
      if (r() < 0.3) out.push({ kind: 'plate', plate: r() < 0.25 ? 'steel' : 'ceramic', n: n(1, 2) });
      break;
    case 'medical':
      for (let i = n(2, 3); i > 0; i--) out.push({ kind: 'med', med: pick(['bandage', 'bandage', 'firstaid', 'adrenaline', 'splint'] as Med[], r), n: 1 });
      if (r() < 0.35) out.push(valuable(r, tier, 2));
      break;
    case 'register':
      out.push({ kind: 'cash', n: 50 * n(2, 8 + tier * 4), fresh: true });
      if (r() < 0.25) out.push(valuable(r, tier, 2));
      break;
    case 'duffel':
      for (let i = n(1, 3); i > 0; i--) out.push(r() < 0.55 ? valuable(r, tier) : r() < 0.5 ? ammo(r) : { kind: 'med', med: 'bandage', n: 1 });
      if (r() < 0.2) out.push({ kind: r() < 0.5 ? 'helmet' : 'vest', tier: (1 + Math.min(2, Math.floor(r() * (1 + tier)))) as Tier, fresh: true } as Item);
      if (r() < 0.15) out.push({ kind: 'pack', size: r() < 0.3 ? 'large' : 'medium', fresh: true });
      break;
    case 'safe':
      out.push({ kind: 'cash', n: 500 * n(2, 5), fresh: true }, valuable(r, 3), valuable(r, 3));
      if (r() < 0.5) out.push(gun(r, 3));
      break;
    case 'supply':
      out.push(gun(r, 3), gun(r, 3), valuable(r, 3), { kind: 'plate', plate: 'steel', n: 2 }, { kind: 'med', med: 'firstaid', n: 2 }, { kind: r() < 0.5 ? 'helmet' : 'vest', tier: 3, fresh: true } as Item);
      break;
    case 'body':
      break;
  }
  return out;
}

/* ── Soldiers ── */
export type Role = 'rifleman' | 'sniper' | 'breacher' | 'medic' | 'juggernaut' | 'officer' | 'boss';
export interface RoleSpec { name: string; hp: number; plates: number; helmet: Tier | 0; speed: number; sight: number; gun: WeaponId[]; accuracy: number; burst: [number, number]; nades: number; cap: Rarity }
export const ROLES: Record<Role, RoleSpec> = {
  rifleman: { name: 'Rifleman', hp: 100, plates: 50, helmet: 1, speed: 3.6, sight: 85, gun: ['mcr4', 'kv103', 'tx416'], accuracy: 0.5, burst: [3, 6], nades: 1, cap: 2 },
  sniper: { name: 'Sniper', hp: 90, plates: 0, helmet: 0, speed: 3, sight: 220, gun: ['svk', 'arctic338'], accuracy: 0.85, burst: [1, 1], nades: 0, cap: 3 },
  breacher: { name: 'Breacher', hp: 110, plates: 100, helmet: 2, speed: 5, sight: 60, gun: ['ranger870', 'corsa', 'vandal'], accuracy: 0.6, burst: [1, 3], nades: 1, cap: 2 },
  medic: { name: 'Medic', hp: 100, plates: 50, helmet: 1, speed: 3.8, sight: 75, gun: ['mpk5', 'p7'], accuracy: 0.45, burst: [3, 6], nades: 0, cap: 2 },
  juggernaut: { name: 'Juggernaut', hp: 600, plates: 400, helmet: 3, speed: 1.8, sight: 70, gun: ['pk11'], accuracy: 0.4, burst: [12, 24], nades: 0, cap: 4 },
  officer: { name: 'Officer', hp: 120, plates: 100, helmet: 2, speed: 3.4, sight: 80, gun: ['sr17', 'hc50'], accuracy: 0.55, burst: [2, 4], nades: 2, cap: 3 },
  boss: { name: 'Commander Vasko', hp: 400, plates: 225, helmet: 3, speed: 3.2, sight: 90, gun: ['sr17'], accuracy: 0.6, burst: [3, 6], nades: 2, cap: 4 },
};
/** What a soldier carries (searching the body finds it). The same for everyone in a room. */
export function soldierLoot(role: Role, r: () => number): Item[] {
  const spec = ROLES[role], tier = role === 'boss' || role === 'juggernaut' ? 3 : role === 'rifleman' ? 0 : 1;
  const out: Item[] = [{ kind: 'gun', gun: makeGun(pick(spec.gun, r), rollRarity(r, tier, spec.cap), r), fresh: true }];
  out.push(ammo(r));
  if (r() < 0.45) out.push(valuable(r, tier, spec.cap));
  if (r() < 0.3) out.push({ kind: 'plate', plate: 'ceramic', n: 1 });
  if (r() < 0.25 || role === 'medic') out.push({ kind: 'med', med: role === 'medic' ? 'firstaid' : 'bandage', n: 1 });
  if (r() < 0.35) out.push({ kind: 'cash', n: 50 * (1 + Math.floor(r() * 6)), fresh: true });
  if (role === 'boss') out.push({ kind: 'valuable', id: 'dossier', fresh: true }, { kind: 'cash', n: 3000, fresh: true });
  return out;
}

/** The most an item list could score when extracted. */
export const lootValue = (items: Item[]) => items.reduce((n, it) => n + ('fresh' in it && it.fresh ? itemValue(it) : 0), 0);
