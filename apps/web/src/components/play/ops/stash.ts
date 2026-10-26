import { CONTRACTS, starterLoadout, type Item, type Loadout } from '@/lib/play/ops';

// The safehouse between raids (the owner: "a persistent menu between raids with a Stash (to store
// extracted guns/loot), a Black Market Trader (to buy/sell gear and accept Faction Contracts), and a
// Weapon Firing Range"). Kept on this device (localStorage), like the 3D games' looks; nothing goes
// to the server. Gear in the stash isn't "fresh": only what a raid brings out scores.

export const STASH_SLOTS = 60;
export interface Safehouse {
  v: 1;
  cash: number;
  stash: Item[];
  /** What you'll deploy with (null: the starter kit). */
  loadout: Loadout | null;
  contracts: { id: string; progress: number; done: boolean }[];
  raids: number; extracts: number; best: number;
}
const KEY = 'uv-ops-safehouse-v1';
export function loadSafehouse(): Safehouse {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw) as Safehouse; if (s.v === 1 && Array.isArray(s.stash)) return s; }
  } catch { /* private mode or bad data */ }
  return { v: 1, cash: 2500, stash: [], loadout: null, contracts: CONTRACTS.slice(0, 3).map((c) => ({ id: c.id, progress: 0, done: false })), raids: 0, extracts: 0, best: 0 };
}
export function saveSafehouse(s: Safehouse) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* full or private */ } }
/** The kit for the next raid (a copy, so a raid doesn't change the saved one until it ends). */
export const kitFor = (s: Safehouse): Loadout => structuredClone(s.loadout ?? starterLoadout());
