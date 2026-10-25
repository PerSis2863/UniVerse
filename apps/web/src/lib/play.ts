// UniVerse Play (M31, the owner: "make… like the university, trace, relief, green… single [and]
// multiplayer games… very detailed and ultra smooth"): one game for each app, solo or with friends.
// Multiplayer is a seeded race: everyone in a room plays the same rounds (generated from one seed)
// at the same time, and the room (cloudflare/worker.ts GameRoom) keeps the live scoreboard.
// No imports: the Worker uses this file too.

export const GAME_IDS = ['quiz', 'fakes', 'supply', 'sort', 'type', 'pin', 'rescue', 'ocean', 'obby', 'strike', 'night', 'orbit'] as const;
export type GameId = (typeof GAME_IDS)[number];

export interface GameInfo {
  id: GameId;
  /** The app it belongs to (src/lib/apps.ts), for its colour and icon. */
  app: 'campus' | 'trace' | 'relief' | 'green' | 'play';
  name: string;
  tagline: string;
  /** How to play, in two short lines. */
  how: string;
  seconds: number;
  /** The highest score a round can reach (scores above it are refused as impossible). */
  maxScore: number;
  color: string;
  /** The bigger games (M32): a full-size stage, longer rounds. */
  big?: boolean;
  /** The 3D worlds (M36): walk, run and jump in a 3D world. */
  world?: boolean;
  /** The age rating (M36): asked before playing; refused when the account's birth date is younger. */
  age?: 12 | 16 | 18;
  /** What earns the rating, in a few words. */
  rated?: string;
}

export const GAMES: Record<GameId, GameInfo> = {
  quiz: { id: 'quiz', app: 'campus', name: 'Quiz Clash', tagline: 'Fast questions, faster fingers', how: 'Pick the right answer before the bar runs out. Quick answers and streaks score more; use each power-up once; the last 15 seconds count double.', seconds: 75, maxScore: 18_000, color: '#6366f1' },
  fakes: { id: 'fakes', app: 'trace', name: 'Spot the Fake', tagline: 'One passport is a copy. Which?', how: 'Read the product passports and tap the copy: impossible journeys, too many scans, a broken seal, odd dates or prices. Three lives; six passports from round 5.', seconds: 75, maxScore: 14_000, color: '#ec4899' },
  supply: { id: 'supply', app: 'relief', name: 'Supply Run', tagline: 'Get help where it’s needed', how: 'Pick a supply (keys 1–4), then tap a need that asks for it. Three trucks, limited stock that refills; red needs are critical and count double.', seconds: 90, maxScore: 20_000, color: '#f97316' },
  sort: { id: 'sort', app: 'green', name: 'Recycle Rush', tagline: 'Every item in the right bin', how: 'Sort each item into its bin before it falls off the belt. Streaks multiply your points; golden items count triple.', seconds: 75, maxScore: 26_000, color: '#10b981' },
  type: { id: 'type', app: 'campus', name: 'Type Race', tagline: 'Race your friends, one true fact at a time', how: 'Type each fact exactly as shown. Every right letter moves your car; twenty in a row lights the nitro (double points).', seconds: 120, maxScore: 58_000, color: '#8b5cf6', big: true },
  pin: { id: 'pin', app: 'trace', name: 'World Pin', tagline: 'Where in the world is that parcel going?', how: 'A city appears: tap where it is on the world map. The closer your pin, the more points; pins in a row within 500 km build a streak. 15 cities.', seconds: 135, maxScore: 24_000, color: '#f472b6', big: true },
  rescue: { id: 'rescue', app: 'relief', name: 'Flood Rescue', tagline: 'Fly the helicopter, beat the rising water', how: 'Hover low over a roof to winch people up (4 at a time), then land on the hospital’s H to drop them off and refuel. Watch for lightning and gusts.', seconds: 180, maxScore: 17_000, color: '#fb923c', big: true },
  obby: { id: 'obby', app: 'play', name: 'Skyline Obby', tagline: 'Jump the sky course to the golden finish', how: 'Thirty stages in three worlds (Sky Islands, Lava Peaks, Neon Void): moving, crumbling, blinking and bounce pads, spinning lasers. Checkpoints save you; gems and finishing early score more.', seconds: 480, maxScore: 36_000, color: '#38bdf8', big: true, world: true },
  strike: { id: 'strike', app: 'play', name: 'Neon Strike', tagline: 'Laser tag against sentinel drones', how: 'Clear wave after wave of drones in a neon arena; every fifth wave a boss drone fires spreads. Tags in a row multiply your points; take cover, grab health, shields and rapid fire.', seconds: 360, maxScore: 900_000, color: '#a855f7', big: true, world: true, age: 16, rated: 'shooting' },
  night: { id: 'night', app: 'play', name: 'Night Shift', tagline: 'Three floors of a dark school. Something else is looking too.', how: 'Three floors of dark halls: find the keys on each (3, then 4, then 5) to open the stairs, then the exit. Shine your torch on it to drive it back; don’t let it reach you.', seconds: 480, maxScore: 36_000, color: '#64748b', big: true, world: true, age: 18, rated: 'horror, jump scares' },
  orbit: { id: 'orbit', app: 'play', name: 'Orbit Breach', tagline: 'Fix the station before the meteors win', how: 'Three stations: jump between decks in low gravity (jump again in the air to boost), repair the reactors (3, then 4, then 5), grab oxygen, dodge meteors, and take the pod to the next.', seconds: 420, maxScore: 34_000, color: '#22d3ee', big: true, world: true, age: 12, rated: 'sci-fi peril' },
  ocean: { id: 'ocean', app: 'green', name: 'Ocean Cleanup', tagline: 'Clear the plastic, spare the sea life', how: 'Scoop up plastic for combos and grab the power-ups (magnet, boost, shield). Bumping into sea life costs points; oil slows you down.', seconds: 150, maxScore: 48_000, color: '#22d3ee', big: true },
};

/** Experience (M37): every round earns up to 1,000 XP, its score's share of the game's best possible,
 *  so all games count the same. Levels need a little more XP each time. */
export const xpFor = (game: GameId, score: number) => Math.round((Math.max(0, Math.min(score, GAMES[game].maxScore)) / GAMES[game].maxScore) * 1000);
export function levelOf(xp: number): { level: number; into: number; need: number } {
  let level = 1, left = Math.max(0, Math.floor(xp)), need = 400;
  while (left >= need && level < 99) { left -= need; level++; need = 400 + (level - 1) * 150; }
  return { level, into: left, need };
}
/** The 3D character's looks, unlocked by level (kept on the device; just for fun). */
export const LOOK_COLORS = [
  { id: 'pink', hex: '#ec4899', level: 1 }, { id: 'sky', hex: '#38bdf8', level: 1 }, { id: 'lime', hex: '#84cc16', level: 2 }, { id: 'gold', hex: '#f59e0b', level: 3 },
  { id: 'violet', hex: '#8b5cf6', level: 4 }, { id: 'red', hex: '#ef4444', level: 5 }, { id: 'snow', hex: '#f1f5f9', level: 7 }, { id: 'ink', hex: '#1f2937', level: 9 },
] as const;
export const LOOK_HATS = [
  { id: 'none', name: 'No hat', level: 1 }, { id: 'cap', name: 'Cap', level: 2 }, { id: 'antenna', name: 'Antenna', level: 4 }, { id: 'tophat', name: 'Top hat', level: 6 },
  { id: 'crown', name: 'Crown', level: 8 }, { id: 'halo', name: 'Halo', level: 10 }, { id: 'horns', name: 'Horns', level: 12 },
] as const;
export type LookHat = (typeof LOOK_HATS)[number]['id'];

/** Whole years since a birth date (null when unknown). */
export function ageOn(birth: Date | string | null | undefined, now = new Date()): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (Number.isNaN(b.getTime())) return null;
  return now.getUTCFullYear() - b.getUTCFullYear() - (now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate()) ? 1 : 0);
}
/** A rated game refused for a known younger age (an unknown age is asked on the device). */
export const tooYoung = (game: GameId, age: number | null) => !!GAMES[game].age && age !== null && age < GAMES[game].age!;

export const isGame = (v: unknown): v is GameId => typeof v === 'string' && (GAME_IDS as readonly string[]).includes(v);

/** Where a player is in a 3D world (M38), sent about ten times a second while playing and passed
 *  on to the others in the room so they see each other. Nothing about it is kept. */
export interface PeerPos { x: number; y: number; z: number; ry: number; a: number; w: number; c: number; h: string }
/** A position message tidied: finite, inside the worlds, a known hat; or null. */
export function cleanPos(m: unknown): PeerPos | null {
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  const n = (v: unknown, lim: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, Math.round(v * 100) / 100)) : null);
  const x = n(o.x, 3000), y = n(o.y, 3000), z = n(o.z, 3000), ry = n(o.ry, 10), a = n(o.a, 3), w = n(o.w, 9), c = n(o.c, 0xffffff);
  if (x === null || y === null || z === null || ry === null) return null;
  const h = typeof o.h === 'string' && LOOK_HATS.some((k) => k.id === o.h) ? o.h : 'none';
  return { x, y, z, ry, a: Math.max(0, a ?? 0), w: Math.max(0, Math.round(w ?? 0)), c: Math.max(0, Math.round(c ?? 0xec4899)), h };
}

/** Room codes: 6 letters and digits without look-alikes (no O/0, I/1/L). */
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LEN = 6;
export const MAX_PLAYERS = 8;
/** Seconds of "3, 2, 1" before a round starts. */
export const COUNTDOWN_MS = 3_500;

/** A code someone typed, tidied (upper case, no spaces or dashes), or null if it can't be one. */
export function cleanRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const c = raw.toUpperCase().replace(/[\s-]/g, '');
  return c.length === ROOM_CODE_LEN && [...c].every((ch) => ROOM_ALPHABET.includes(ch)) ? c : null;
}

/** A new random room code. */
export function newRoomCode(random: () => number = Math.random): string {
  return Array.from({ length: ROOM_CODE_LEN }, () => ROOM_ALPHABET[Math.floor(random() * ROOM_ALPHABET.length)]).join('');
}

/** A score as a whole number within what the game allows (anything else counts as 0). */
export function cleanScore(game: GameId, score: unknown): number {
  const n = typeof score === 'number' && Number.isFinite(score) ? Math.round(score) : 0;
  return Math.max(0, Math.min(GAMES[game].maxScore, n));
}

/** lobby → playing (a countdown until startsAt, then the round until endsAt) → results → lobby. */
export type RoomPhase = 'lobby' | 'playing' | 'results';

/** One player as the room shares them. */
export interface RoomPlayer { id: string; name: string; avatar: string | null; score: number; step: number; done: boolean; host: boolean }

/** The room's state, sent to everyone in it whenever it changes. `now` is the room's clock. */
export interface RoomState {
  t: 'state';
  code: string;
  game: GameId;
  phase: RoomPhase;
  seed: number;
  startsAt: number;
  endsAt: number;
  now: number;
  round: number;
  players: RoomPlayer[];
}

/** Players ranked: score, then who reached it with fewer steps, then name. */
export const ranked = (players: RoomPlayer[]) => [...players].sort((a, b) => b.score - a.score || a.step - b.step || a.name.localeCompare(b.name));
