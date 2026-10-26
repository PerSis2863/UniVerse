import { WEAPONS, WEAPON_IDS, type WeaponId } from './arsenal';
import { HELMETS, itemValue, lootValue, type Item, type Tier } from './items';
import type { OpsMap } from './map';

// Ridgeline Ops' rules: how hits land on plates, helmets and bodies, bleeding and broken legs,
// stamina, what the buy stations sell, the contracts, and the score: only what's got out of the
// raid scores (fresh loot and cash, kills, objectives), and `opsCeiling` proves the cap holds.

/* ── Damage ── */
export type Part = 'head' | 'body' | 'arm' | 'leg';
export const PART_X: Record<Part, number> = { head: 2.1, body: 1, arm: 0.8, leg: 0.85 };
export interface Armour { hp: number; plates: number[]; helmet: Tier | 0 }
export interface HitResult { hp: number; plates: number[]; plateHit: boolean; broke: boolean; dealt: number; down: boolean }
/** A hit on someone wearing armour: plates take body hits first (AP rounds wear them faster), a
 *  helmet takes part of a headshot; what's left comes off health. */
export function applyHit(a: Armour, base: number, part: Part, armourX = 1): HitResult {
  let dmg = base * PART_X[part];
  const plates = [...a.plates];
  let plateHit = false, broke = false;
  if (part === 'head' && a.helmet) dmg *= 1 - HELMETS[a.helmet].block;
  if (part === 'body') {
    for (let i = plates.length - 1; i >= 0 && dmg > 0; i--) {
      if (plates[i] <= 0) continue;
      plateHit = true;
      const wear = dmg * armourX, take = Math.min(plates[i], wear);
      plates[i] -= take;
      dmg -= take / armourX;
      if (plates[i] <= 0.01) { plates[i] = 0; broke = true; }
    }
  }
  const hp = Math.max(0, a.hp - dmg);
  return { hp, plates, plateHit, broke, dealt: a.hp - hp, down: hp <= 0 };
}
/** A leg hit over 12 can break it (limp, no sprinting) and an unarmoured hit can start bleeding (`roll` 0–1). */
export const fractures = (part: Part, dealt: number, roll: number) => part === 'leg' && dealt > 12 && roll < 0.35;
export const bleeds = (part: Part, plateHit: boolean, dealt: number, roll: number) => !plateHit && dealt > 8 && roll < 0.25;
export const BLEED_HP_S = 1.4, FIRST_AID_HP = 50, ADRENALINE_S = 15, ADRENALINE_HP = 15;

/* ── Movement and stamina ── */
export const SPEED = { walk: 4.4, sprint: 6.8, tac: 8.6, crouch: 2.6, prone: 1.1, ads: 2.6, slide: 11, swim: 2.2 };
export const STAMINA = { max: 100, sprint: 14, tac: 32, regen: 22, slide: 18, vault: 8, hold: 20, low: 25 };
/** Tactical sprint lasts this long before it drops back to a normal sprint. */
export const TAC_SPRINT_S = 3.2;
export const PLATE_S = 1.25, NVG_GAIN = 6;

/* ── Buy stations ── */
export type BuyId = 'uav' | 'ammo' | 'plates' | 'revive' | 'mortar' | 'exfil' | 'firstaid' | 'frag';
export const BUY: Record<BuyId, { name: string; price: number; about: string }> = {
  uav: { name: 'UAV recon', price: 1500, about: 'Shows every enemy near you on the map for 40 s.' },
  ammo: { name: 'Ammo box', price: 400, about: 'Fills your ammo for every gun you carry.' },
  plates: { name: 'Armour plates ×3', price: 600, about: 'Three ceramic plates for your vest.' },
  revive: { name: 'Self-revive kit', price: 2500, about: 'Get back up once when you go down.' },
  mortar: { name: 'Mortar strike', price: 3000, about: 'Six shells on a spot you pick on the map.' },
  exfil: { name: 'Personal exfil', price: 6000, about: 'A helicopter to wherever you stand (60 s).' },
  firstaid: { name: 'First aid kit', price: 300, about: 'Heals 50 over a couple of seconds.' },
  frag: { name: 'Frag grenade', price: 250, about: 'For people behind cover.' },
};

/* ── Contracts (between raids, from the trader) ── */
export interface Contract { id: string; name: string; about: string; goal: number; pay: number; track: 'kills' | 'poi' | 'extract-value' | 'hostage' | 'headshots' | 'containers' }
export const CONTRACTS: Contract[] = [
  { id: 'clear', name: 'Clean sweep', about: 'Clear any outpost of soldiers.', goal: 1, pay: 3000, track: 'poi' },
  { id: 'hunter', name: 'Hunter', about: 'Take down 12 soldiers in one raid.', goal: 12, pay: 2500, track: 'kills' },
  { id: 'marks', name: 'Marksman', about: 'Land 5 headshot kills.', goal: 5, pay: 2500, track: 'headshots' },
  { id: 'rescue', name: 'Rescue', about: 'Get a hostage out alive.', goal: 1, pay: 4000, track: 'hostage' },
  { id: 'haul', name: 'Big haul', about: 'Extract with $8,000 of loot at once.', goal: 8000, pay: 3500, track: 'extract-value' },
  { id: 'scav', name: 'Scavenger', about: 'Search 10 containers.', goal: 10, pay: 1500, track: 'containers' },
];

/* ── Score ── */
export const SCORE = { kill: 100, headshot: 50, poi: [600, 1200, 2000, 3000], hostage: 2500, sam: 900, extract: 500 };
/** The extraction bonus counts for a run of at least this long with something to bank. */
export const EXTRACT_MIN_S = 60;
/** The helicopter needs this long after it's called (hold the landing zone). */
export const EXTRACT_WAIT_S = 60;
export const ROUND_S = 900;

/** The highest score a round on this island could reach: all fresh loot in every container, body
 *  and supply drop, every soldier down with a headshot, every objective, every extraction bonus. */
export function opsCeiling(m: OpsMap, seconds = ROUND_S) {
  const containers = m.containers.reduce((n, c) => n + lootValue(c.items), 0);
  const bodies = [...m.foes, ...m.convoy.foes, ...m.reserves].reduce((n, f) => n + lootValue(f.loot), 0);
  const drops = m.drops.reduce((n, d) => n + lootValue(d.items), 0);
  const kills = (m.foes.length + m.convoy.foes.length + m.reserves.length) * (SCORE.kill + SCORE.headshot);
  const pois = m.places.reduce((n, p) => n + (['pine', 'radar', 'harbor', 'airfield', 'dam', 'bunker', 'village'].includes(p.kind) ? SCORE.poi[p.tier] : p.kind === 'sam' ? SCORE.sam : 0), 0);
  const hostages = m.places.filter((p) => p.hostage).length * SCORE.hostage;
  // Buy-station gear is bought, not found: never fresh. The trader pays into the stash, not the score.
  return containers + bodies + drops + kills + pois + hostages + Math.floor(seconds / EXTRACT_MIN_S) * SCORE.extract;
}
/** Every gun id (for the trader's shelf). */
export const SHELF: WeaponId[] = WEAPON_IDS.filter((w) => WEAPONS[w].value <= 1500);
export const sellPrice = (it: Item) => Math.round(itemValue(it) * 0.5);
