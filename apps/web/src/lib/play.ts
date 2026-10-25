// UniVerse Play (M31, the owner: "make… like the university, trace, relief, green… single [and]
// multiplayer games… very detailed and ultra smooth"): one game for each app, solo or with friends.
// Multiplayer is a seeded race: everyone in a room plays the same rounds (generated from one seed)
// at the same time, and the room (cloudflare/worker.ts GameRoom) keeps the live scoreboard.
// No imports: the Worker uses this file too.

export const GAME_IDS = ['quiz', 'fakes', 'supply', 'sort', 'type', 'pin', 'rescue', 'ocean'] as const;
export type GameId = (typeof GAME_IDS)[number];

export interface GameInfo {
  id: GameId;
  /** The app it belongs to (src/lib/apps.ts), for its colour and icon. */
  app: 'campus' | 'trace' | 'relief' | 'green';
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
}

export const GAMES: Record<GameId, GameInfo> = {
  quiz: { id: 'quiz', app: 'campus', name: 'Quiz Clash', tagline: 'Fast questions, faster fingers', how: 'Pick the right answer before the ring runs out. Quick answers and streaks score more.', seconds: 75, maxScore: 12_000, color: '#6366f1' },
  fakes: { id: 'fakes', app: 'trace', name: 'Spot the Fake', tagline: 'One passport is a copy. Which?', how: 'Read the four product passports and tap the copy: impossible journeys, too many scans or a broken seal.', seconds: 75, maxScore: 9_000, color: '#ec4899' },
  supply: { id: 'supply', app: 'relief', name: 'Supply Run', tagline: 'Get help where it’s needed', how: 'Pick a supply (keys 1–4), then tap a need that asks for it. Urgent ones first: people are waiting.', seconds: 90, maxScore: 15_000, color: '#f97316' },
  sort: { id: 'sort', app: 'green', name: 'Recycle Rush', tagline: 'Every item in the right bin', how: 'Sort each item into its bin before it reaches the end. Streaks multiply the CO₂ you save.', seconds: 75, maxScore: 20_000, color: '#10b981' },
  type: { id: 'type', app: 'campus', name: 'Type Race', tagline: 'Race your friends, one true fact at a time', how: 'Type each fact exactly as shown. Every right letter moves your car; a finished fact gives a bonus.', seconds: 75, maxScore: 20_000, color: '#8b5cf6', big: true },
  pin: { id: 'pin', app: 'trace', name: 'World Pin', tagline: 'Where in the world is that parcel going?', how: 'A city appears: tap where it is on the world map. The closer your pin, the more points. 15 cities.', seconds: 135, maxScore: 18_000, color: '#f472b6', big: true },
  rescue: { id: 'rescue', app: 'relief', name: 'Flood Rescue', tagline: 'Fly the helicopter, beat the rising water', how: 'Steer with the mouse, a finger or the arrow keys. Hover low over a roof to winch people up (4 at a time), then land them at the hospital (H).', seconds: 120, maxScore: 10_000, color: '#fb923c', big: true },
  ocean: { id: 'ocean', app: 'green', name: 'Ocean Cleanup', tagline: 'Clear the plastic, spare the sea life', how: 'Steer the boat with the mouse, a finger or the arrow keys. Scoop up plastic for combos; bumping into sea life costs points.', seconds: 90, maxScore: 16_000, color: '#22d3ee', big: true },
};

export const isGame = (v: unknown): v is GameId => typeof v === 'string' && (GAME_IDS as readonly string[]).includes(v);

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
