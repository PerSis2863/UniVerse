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

// ─── Organisations (M106) ─────────────────────────────────────────────────────────────────────
// An NGO, a food bank, a shelter or a community group: members with a role, a stock of supplies and
// volunteer shifts (src/server/relief-orgs.ts).

export const RELIEF_ORG_KINDS = ['NGO', 'FOOD_BANK', 'SHELTER', 'CLINIC', 'FAITH', 'COMMUNITY', 'SCHOOL', 'OTHER'] as const;
export type ReliefOrgKind = (typeof RELIEF_ORG_KINDS)[number];
export const RELIEF_ORG_KIND_LABEL: Record<ReliefOrgKind, string> = { NGO: 'NGO or charity', FOOD_BANK: 'Food bank', SHELTER: 'Shelter', CLINIC: 'Clinic', FAITH: 'Faith group', COMMUNITY: 'Community group', SCHOOL: 'School or university', OTHER: 'Other' };

/** OWNER: everything, including other coordinators. COORDINATOR: runs the organisation day to day.
 *  VOLUNTEER: sees it, changes stock counts, signs up for members-only shifts. */
export const RELIEF_ORG_ROLES = ['OWNER', 'COORDINATOR', 'VOLUNTEER'] as const;
export type ReliefOrgRole = (typeof RELIEF_ORG_ROLES)[number];
export const RELIEF_ORG_ROLE_LABEL: Record<ReliefOrgRole, string> = { OWNER: 'Owner', COORDINATOR: 'Coordinator', VOLUNTEER: 'Volunteer' };

/** Coordinators and owners run the organisation: its profile, items, shifts, members and needs. */
export const runsOrg = (role: string | null | undefined) => role === 'OWNER' || role === 'COORDINATOR';

/**
 * Whether `by` may give `target` the role `to` (or remove them, `to` null). Owners may do anything
 * but leave the organisation without an owner; coordinators may only move volunteers.
 */
export function mayChangeRole(by: string, target: string, to: ReliefOrgRole | null, owners: number) {
  if (by === 'OWNER') return !(target === 'OWNER' && to !== 'OWNER' && owners <= 1);
  if (by === 'COORDINATOR') return target === 'VOLUNTEER' && to !== 'OWNER';
  return false;
}

/** A supply is running low at or below its level (a level of 0 means "only when it's gone"). */
export const supplyLow = (s: { quantity: number; lowAt: number }) => s.quantity <= Math.max(0, s.lowAt);

/** The stock after a change, never below zero or above a million. */
export const nextQuantity = (now: number, change: number) => Math.min(1_000_000, Math.max(0, Math.round(now + change)));

/** A shift's state for a viewer: how many places are left and whether it has started. */
export function shiftState(s: { slots: number; filled: number; startsAt: string | Date; endsAt: string | Date }, now: number) {
  const left = Math.max(0, s.slots - s.filled);
  const start = new Date(s.startsAt).getTime(), end = new Date(s.endsAt).getTime();
  return { left, full: left === 0, started: now >= start, over: now >= end };
}

// ─── Text requests (M107, src/server/relief-texts.ts) ────────────────────────────────────────

/** A phone number as stored: E.164 (+ and 7–15 digits), from "whatsapp:+44 7700-900123" and the like. */
export function textNumber(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const n = v.replace(/^whatsapp:/i, '').replace(/[\s().-]/g, '');
  return /^\+[1-9]\d{6,14}$/.test(n) ? n : null;
}

const KIND_WORDS: [ReliefKind, RegExp][] = [
  ['MEDICAL', /\b(medic|doctor|nurse|insulin|injur|hurt|sick|ill\b|hospital|clinic|pills?\b|first aid|bleed|pregnan|ambulance|wheelchair)/i],
  ['WATER', /\b(water|thirst|drink)/i],
  ['FOOD', /\b(food|hungry|hunger|eat|meals?\b|bread|rice|milk|formula|groceries)/i],
  ['SHELTER', /\b(shelter|roof|homeless|tent|sleep|beds?\b|blanket|evacuat|flooded)/i],
  ['CLOTHES', /\b(cloth|coats?\b|jacket|shoes|nappies|diapers)/i],
  ['TRANSPORT', /\b(transport|ride|lift\b|car\b|drive|van\b|truck|stranded)/i],
];

/**
 * A first guess at a need from a text message, for the coordinator to check before it goes on the
 * map: the kind (by its words), how many people ("family of 5", "3 children"), how urgent ("urgent",
 * "emergency") and a short title.
 */
export function guessNeed(text: string): { kind: ReliefKind; people: number; urgency: Urgency; title: string } {
  const t = text.replace(/\s+/g, ' ').trim();
  const kind = KIND_WORDS.find(([, re]) => re.test(t))?.[0] ?? 'OTHER';
  const n = /\bfamily of (\d{1,3})\b/i.exec(t) ?? /\b(\d{1,4})\s*(?:people|persons|of us|adults|kids|children|ppl|families)\b/i.exec(t);
  const people = n ? Math.min(10_000, Math.max(1, Number(n[1]))) : 1;
  const urgency: Urgency = /\b(dying|critical|sos|emergency|unconscious)\b/i.test(t) ? 'CRITICAL' : /\b(urgent|urgently|asap|immediately|right now|tonight)\b/i.test(t) ? 'HIGH' : 'MEDIUM';
  const title = t.length <= 80 ? t : `${t.slice(0, 78).replace(/\s+\S*$/, '')}…`;
  return { kind, people, urgency, title };
}
