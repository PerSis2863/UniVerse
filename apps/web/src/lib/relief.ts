import { distanceM } from './attendance-rules';

// UniVerse Relief (src/lib/apps.ts): needs and offers of help on one live map. Shared by the server
// and the pages: the kinds of help, how urgent, where a post may be shown, and which needs come first.

export const RELIEF_KINDS = ['FOOD', 'WATER', 'SHELTER', 'MEDICAL', 'TRANSPORT', 'CLOTHES', 'OTHER'] as const;
export type ReliefKind = (typeof RELIEF_KINDS)[number];
export const RELIEF_KIND_LABEL: Record<ReliefKind, string> = { FOOD: 'Food', WATER: 'Water', SHELTER: 'Shelter', MEDICAL: 'Medical', TRANSPORT: 'Transport', CLOTHES: 'Clothes', OTHER: 'Other' };

export const URGENCIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Urgency = (typeof URGENCIES)[number];
export const URGENCY_LABEL: Record<Urgency, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' };
export const URGENCY_COLOR: Record<Urgency, string> = { LOW: '#38bdf8', MEDIUM: '#eab308', HIGH: '#f97316', CRITICAL: '#ef4444' };

/** A post is shown about 500 m from where it was made (positions rounded to 0.005°), never at a door. */
export const snap = (v: number) => Math.round(v / 0.005) * 0.005;

/**
 * Which open needs come first: the most urgent, then the nearest (when we know where you are), then
 * the ones waiting longest. An hour of waiting counts like being 2 km nearer.
 */
export function needScore(p: { urgency: string; lat: number; lng: number; createdAt: string | Date }, here: { lat: number; lng: number } | null, now: number) {
  const u = Math.max(0, URGENCIES.indexOf(p.urgency as Urgency));
  const km = here ? distanceM(here, p) / 1000 : 0;
  const hours = (now - new Date(p.createdAt).getTime()) / 3_600_000;
  return u * 100 - km + hours * 2;
}
