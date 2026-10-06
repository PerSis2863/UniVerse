// Study Hall's map (Stage 4 · 4.2): the same for every hall, in map units (the call room keeps every
// place within HALL_W × HALL_H, cloudflare/worker.ts). Four rooms around a crossing in the middle,
// and tables to sit at (each with its own whiteboard).

export const HALL_W = 1200, HALL_H = 800;
export type Voice = 'normal' | 'whisper' | 'none';
export interface Zone { id: string; name: string; x: number; y: number; w: number; h: number; voice: Voice; tint: string; hint: string }

export const ZONES: Zone[] = [
  { id: 'cafe', name: 'Café', x: 30, y: 30, w: 540, h: 340, voice: 'normal', tint: '#f59e0b', hint: 'Talk freely: people nearby hear you, louder the closer they are.' },
  { id: 'lab', name: 'Lab', x: 630, y: 30, w: 540, h: 340, voice: 'normal', tint: '#6366f1', hint: 'Sit at a table to work together and share its whiteboard.' },
  { id: 'library', name: 'Library', x: 30, y: 430, w: 540, h: 340, voice: 'whisper', tint: '#10b981', hint: 'Whisper: only people right next to you hear you.' },
  { id: 'quiet', name: 'Quiet zone', x: 630, y: 430, w: 540, h: 340, voice: 'none', tint: '#d946ef', hint: 'No voices here. Just focus.' },
];

export interface Table { n: number; x: number; y: number }
export const TABLES: Table[] = [
  { n: 1, x: 170, y: 150 }, { n: 2, x: 430, y: 150 }, { n: 3, x: 170, y: 290 }, { n: 4, x: 430, y: 290 },
  { n: 5, x: 760, y: 150 }, { n: 6, x: 900, y: 150 }, { n: 7, x: 1040, y: 150 },
  { n: 8, x: 760, y: 290 }, { n: 9, x: 900, y: 290 }, { n: 10, x: 1040, y: 290 },
  { n: 11, x: 200, y: 600 }, { n: 12, x: 400, y: 600 },
];

/** Where people arrive: the crossing between the rooms. */
export const SPAWN = { x: 600, y: 400 };

export const zoneAt = (x: number, y: number) => ZONES.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) ?? null;
export const tableNear = (x: number, y: number) => TABLES.find((t) => Math.hypot(t.x - x, t.y - y) < 80) ?? null;

export interface Spot { x: number; y: number; table: number | null }
const NEAR = 70;

/**
 * How loud `b` sounds to `a` (0 to 1) and from which side (-1 left to 1 right): full volume close by
 * or at the same table, fading out with distance (sooner in the library), nothing in the quiet zone.
 */
export function hearing(a: Spot, b: Spot): { gain: number; pan: number } {
  const za = zoneAt(a.x, a.y), zb = zoneAt(b.x, b.y);
  const dx = b.x - a.x;
  const pan = Math.max(-1, Math.min(1, dx / 300));
  if (za?.voice === 'none' || zb?.voice === 'none') return { gain: 0, pan };
  if (a.table && a.table === b.table) return { gain: 1, pan: pan * 0.4 };
  const radius = za?.voice === 'whisper' || zb?.voice === 'whisper' ? 110 : 280;
  const d = Math.hypot(dx, b.y - a.y);
  if (d >= radius) return { gain: 0, pan };
  return { gain: d <= NEAR ? 1 : 1 - (d - NEAR) / (radius - NEAR), pan };
}
