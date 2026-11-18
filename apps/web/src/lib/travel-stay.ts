import type { Guide, Listing } from './travel-guide';
import { km } from './travel-plan';

// M268 (the owner, 17 Nov: "if I had booked a hotel somewhere and I type it in… recommend the areas to visit, foods,
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

/** The district guides a stay is most likely in: a big city's sights link to their district's guide ("Paris/8th
 *  arrondissement"); those of the sights nearest the stay, at most `max`, nearest first. */
export function districtsNear(g: Guide, stay: { lat: number; lon: number }, max = 2): string[] {
  const out: string[] = [];
  const near = g.sections.flatMap((s) => s.listings)
    .filter((l) => l.guide?.startsWith(`${g.title}/`) && Number.isFinite(l.lat) && Number.isFinite(l.lon))
    .map((l) => ({ guide: l.guide!, km: km(stay, { lat: l.lat!, lon: l.lon! }) ?? 999 }))
    .sort((a, b) => a.km - b.km);
  for (const n of near) if (!out.includes(n.guide) && out.length < max) out.push(n.guide);
  return out;
}

/** A city's guide with its districts' listings added (a name listed twice is kept once). */
export function withDistricts(g: Guide, districts: (Guide | undefined)[]): Guide {
  const seen = new Set(g.sections.flatMap((s) => s.listings.map((l) => l.name.toLowerCase())));
  const extra = districts.flatMap((d) => d?.sections ?? []).map((s) => ({ ...s, listings: s.listings.filter((l) => { const k = l.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }) }));
  return { ...g, sections: [...g.sections, ...extra] };
}
