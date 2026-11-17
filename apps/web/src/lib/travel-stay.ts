import type { Guide, Listing } from './travel-guide';
import { km } from './travel-plan';

// M232 (the owner, 17 Nov: "if I had booked a hotel somewhere and I type it in… recommend the areas to visit, foods,
// shopping and many more"): what a city's guide lists, grouped by kind and nearest the stay first, with the walk.

export const STAY_KINDS = [
  { kind: 'see', label: 'Must-see' },
  { kind: 'do', label: 'Things to do' },
  { kind: 'eat', label: 'Food' },
  { kind: 'drink', label: 'Cafés and drinks' },
  { kind: 'buy', label: 'Shopping' },
] as const;
export type StayKind = (typeof STAY_KINDS)[number]['kind'];
export type Near = Listing & { lat: number; lon: number; km: number };

/** Minutes on foot (about 5 km an hour, a minute at least). */
export const walkMinutes = (distance: number) => Math.max(1, Math.round(distance * 12));

/** The guide's places of each kind with a position, nearest the stay first: those within `within` km, or the
 *  nearest few when none are (a stay out of town still gets the city's best). */
export function aroundStay(g: Guide, stay: { lat: number; lon: number }, per = 6, within = 5): Record<StayKind, Near[]> {
  const out = Object.fromEntries(STAY_KINDS.map((k) => [k.kind, [] as Near[]])) as Record<StayKind, Near[]>;
  for (const s of g.sections) for (const l of s.listings) {
    const kind = (l.kind === 'other' || l.kind === 'go' || l.kind === 'sleep' ? null : l.kind) as StayKind | null;
    if (!kind || !l.name || !Number.isFinite(l.lat) || !Number.isFinite(l.lon)) continue;
    out[kind].push({ ...l, lat: l.lat!, lon: l.lon!, km: km(stay, { lat: l.lat!, lon: l.lon! }) ?? 999 });
  }
  for (const k of STAY_KINDS) {
    const all = out[k.kind].sort((a, b) => a.km - b.km);
    const close = all.filter((x) => x.km <= within);
    out[k.kind] = (close.length ? close : all).slice(0, per);
  }
  return out;
}
