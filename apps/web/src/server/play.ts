import { getCloudflareContext } from '@opennextjs/cloudflare';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { iceServers } from './calls';
import { GAMES, GAME_IDS, VOICE_MIN_AGE, ageOn, cleanRoomCode, cleanScore, isGame, newRoomCode, tooYoung, type GameId } from '@/lib/play';
import { BadRequestException, NotFoundException } from './http';
import type { Body } from './body';

// UniVerse Play (M31, src/lib/play.ts): rooms live in the GameRoom Durable Object
// (cloudflare/game-room.ts); this side creates them, hands out seats and keeps the scores. Solo
// rounds are saved here, room rounds by the room itself. Leaderboards show names and pictures only.

interface RoomNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(url: string, init?: RequestInit): Promise<Response> };
}
declare global {
  interface CloudflareEnv {
    GAMES?: RoomNamespace;
  }
}

async function roomCall(code: string, path: string, body: unknown): Promise<Response | null> {
  let ns: RoomNamespace | undefined;
  try { ns = getCloudflareContext().env.GAMES; } catch { return null; }
  if (!ns) return null;
  try {
    return await ns.get(ns.idFromName(code)).fetch(`https://game${path}`, { method: 'POST', body: JSON.stringify(body) });
  } catch (e) {
    console.error('game room call failed:', e);
    return null;
  }
}
const OFFLINE = 'Playing with others isn’t available right now. Solo games still work.';

/** POST /play/rooms { game }: a new room with a fresh code; the creator hosts it. */
export async function createRoom(u: SessionUser, b: Body) {
  if (!isGame(b.game)) throw new BadRequestException('Pick a game.');
  await checkAge(u, b.game);
  for (let i = 0; i < 5; i++) {
    const code = newRoomCode(() => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32);
    const res = await roomCall(code, '/create', { code, game: b.game, hostId: u.id });
    if (!res) throw new BadRequestException(OFFLINE);
    if (res.ok) return { code, game: b.game };
  }
  throw new BadRequestException('Couldn’t find a free room code. Try again.');
}

/** GET /play/rooms/:code: which game a room plays and how many are in it (to join by code). */
export async function roomInfo(rawCode: string) {
  const code = cleanRoomCode(rawCode);
  if (!code) throw new NotFoundException('Room codes have 6 letters and numbers.');
  const res = await roomCall(code, '/info', {});
  if (!res) throw new BadRequestException(OFFLINE);
  if (!res.ok) throw new NotFoundException('No room has that code. Check it, or ask for a new link.');
  return res.json();
}

/** A first name for the scoreboard ("Dr. Tom Hale" → "Tom"). */
export function shortName(name: string | null | undefined) {
  const words = (name || '').split(/\s+/).filter(Boolean);
  return words.find((w) => !/^(dr|mr|mrs|ms|miss|prof|sir)\.?$/i.test(w)) ?? words[0] ?? 'Player';
}

/** POST /play/rooms/:code/ticket: the address for this person's seat in the room (one use, 60 s). */
export async function roomTicket(u: SessionUser, rawCode: string) {
  const code = cleanRoomCode(rawCode);
  if (!code) throw new NotFoundException('Room codes have 6 letters and numbers.');
  const me = await prisma.user.findUnique({ where: { id: u.id }, select: { avatar: true, dateOfBirth: true } });
  // Voice in rooms (M39) is for 13 and over: an account whose birth date says younger gets text only.
  const age = ageOn(me?.dateOfBirth), voice = age === null || age >= VOICE_MIN_AGE;
  const res = await roomCall(code, '/ticket', { userId: u.id, name: shortName(u.name), avatar: me?.avatar ?? null, voice });
  if (!res) throw new BadRequestException(OFFLINE);
  if (res.status === 409) throw new BadRequestException('That room is full (8 players).');
  if (!res.ok) throw new NotFoundException('No room has that code. Check it, or ask for a new link.');
  const { ticket } = (await res.json()) as { ticket: string };
  return { path: `/play-live?room=${code}&ticket=${encodeURIComponent(ticket)}`, voice, ice: voice ? await iceServers() : [] };
}

const DAY = 86_400_000;

/** POST /play/scores { game, score }: a finished solo round (at most 200 a day per person). */
// shortcut: scores come from the player's browser, capped at what a perfect round can reach
// (cleanScore), not replayed here; fine for friendly leaderboards, not for prizes.
export async function saveSoloScore(u: SessionUser, b: Body) {
  if (!isGame(b.game)) throw new BadRequestException('Pick a game.');
  await checkAge(u, b.game);
  const score = cleanScore(b.game, b.score);
  const today = await prisma.gameScore.count({ where: { userId: u.id, createdAt: { gt: new Date(Date.now() - DAY) } } });
  if (today >= 200) throw new BadRequestException('That’s 200 rounds today. Your scores are saved; play again tomorrow.');
  const best = await prisma.gameScore.aggregate({ where: { userId: u.id, game: b.game }, _max: { score: true } });
  await prisma.gameScore.create({ data: { userId: u.id, game: b.game, mode: 'solo', score } });
  return { score, best: Math.max(score, best._max.score ?? 0), newBest: score > (best._max.score ?? 0) };
}

/** Rated games (M36) are refused when the account's birth date says younger. */
async function myAge(u: SessionUser) {
  const row = await prisma.user.findUnique({ where: { id: u.id }, select: { dateOfBirth: true } });
  return ageOn(row?.dateOfBirth);
}
async function checkAge(u: SessionUser, game: GameId) {
  if (GAMES[game].age && tooYoung(game, await myAge(u))) throw new BadRequestException(`${GAMES[game].name} is for ${GAMES[game].age}+.`);
}

/** GET /play/me: my best, rounds played and last scores, per game, and my age (for rated games). */
export async function playMe(u: SessionUser) {
  const [best, counts, recent, age] = await Promise.all([
    prisma.gameScore.groupBy({ by: ['game'], where: { userId: u.id }, _max: { score: true }, _sum: { score: true } }),
    prisma.gameScore.groupBy({ by: ['game', 'mode'], where: { userId: u.id }, _count: { _all: true } }),
    prisma.gameScore.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 12, select: { game: true, mode: true, score: true, createdAt: true } }),
    myAge(u),
  ]);
  const games = Object.fromEntries(GAME_IDS.map((g) => [g, {
    best: best.find((b) => b.game === g)?._max.score ?? 0,
    solo: counts.find((c) => c.game === g && c.mode === 'solo')?._count._all ?? 0,
    multi: counts.find((c) => c.game === g && c.mode === 'multi')?._count._all ?? 0,
  }])) as Record<GameId, { best: number; solo: number; multi: number }>;
  // Experience: each game's total score as a share of its best possible round, ×1000.
  const xp = best.reduce((n, b) => n + (isGame(b.game) ? Math.round(((b._sum.score ?? 0) / GAMES[b.game].maxScore) * 1000) : 0), 0);
  return { games, played: counts.reduce((n, c) => n + c._count._all, 0), recent, age, xp };
}

/** GET /play/leaderboard?game=&range=week|all: the best score of each person, top 20, and mine. */
export async function playLeaderboard(u: SessionUser, game: unknown, range: unknown) {
  const g: GameId = isGame(game) ? game : 'quiz';
  const since = range === 'all' ? null : new Date(Date.now() - 7 * DAY);
  const where = { game: g, ...(since ? { createdAt: { gt: since } } : {}) };
  const rows = await prisma.gameScore.groupBy({ by: ['userId'], where, _max: { score: true }, _count: { _all: true }, orderBy: { _max: { score: 'desc' } }, take: 20 });
  const people = rows.length ? await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, name: true, avatar: true } }) : [];
  const mine = await prisma.gameScore.aggregate({ where: { ...where, userId: u.id }, _max: { score: true } });
  return {
    game: g, range: since ? 'week' : 'all', maxScore: GAMES[g].maxScore,
    rows: rows.map((r, i) => {
      const p = people.find((x) => x.id === r.userId);
      return { rank: i + 1, name: p?.name ?? 'Player', avatar: p?.avatar ?? null, score: r._max.score ?? 0, rounds: r._count._all, me: r.userId === u.id };
    }),
    mine: mine._max.score ?? null,
  };
}
