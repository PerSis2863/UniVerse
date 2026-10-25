import { DurableObject } from 'cloudflare:workers';
import { COUNTDOWN_MS, GAMES, MAX_PLAYERS, cleanScore, isGame, ranked, type GameId, type RoomPhase, type RoomPlayer, type RoomState } from '../src/lib/play';

// UniVerse Play (M31): one room per code (src/lib/play.ts). The app creates it (POST /create), hands
// each player a one-time ticket (POST /ticket, only from the app: the Worker forwards nothing but
// /play-live upgrades here), and the players' sockets hibernate between messages, so an idle room
// costs nothing. A round is a seeded race: the host starts it, everyone plays the same seed until
// endsAt, each player's score comes in as they play (capped to what the game allows) and the room
// shares the live scoreboard; at the end the scores go into game_scores (mode "multi").

interface Env { DB?: D1Database }

/** One connected socket (kept on it, so it survives hibernation). */
interface Seat { sid: string; userId: string; name: string; avatar: string | null; score: number; step: number; done: boolean }

interface Room { code: string; game: GameId; phase: RoomPhase; seed: number; startsAt: number; endsAt: number; hostId: string | null; round: number; touched: number }

const TICKET_TTL_MS = 60_000;
const IDLE_MS = 2 * 3_600_000; // a room nobody uses for 2 hours is forgotten
const GRACE_MS = 1_500; // late scores from slow connections still count

const json = (body: unknown, status = 200) => Response.json(body, { status });

export class GameRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alive pings are answered without waking the room.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private seats(): { ws: WebSocket; s: Seat }[] {
    const out: { ws: WebSocket; s: Seat }[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const s = ws.deserializeAttachment() as Seat | null;
      if (s && ws.readyState === WebSocket.OPEN) out.push({ ws, s });
    }
    return out;
  }

  private room = () => this.ctx.storage.get<Room>('room').then((r) => r ?? null);
  private async save(r: Room) {
    r.touched = Date.now();
    await this.ctx.storage.put('room', r);
  }

  /** One entry per person (several tabs: their best), ranked. */
  private players(r: Room): RoomPlayer[] {
    const by = new Map<string, RoomPlayer>();
    for (const { s } of this.seats()) {
      const cur = by.get(s.userId);
      if (!cur || s.score > cur.score) by.set(s.userId, { id: s.userId, name: s.name, avatar: s.avatar, score: s.score, step: s.step, done: s.done, host: s.userId === r.hostId });
    }
    return ranked([...by.values()]);
  }

  private broadcast(r: Room) {
    const state: RoomState = { t: 'state', code: r.code, game: r.game, phase: r.phase, seed: r.seed, startsAt: r.startsAt, endsAt: r.endsAt, now: Date.now(), round: r.round, players: this.players(r) };
    const msg = JSON.stringify(state);
    for (const { ws } of this.seats()) {
      try { ws.send(msg); } catch { /* closing */ }
    }
  }

  /** The host left: the longest-connected person still here takes over. */
  private rehost(r: Room, leaving?: string) {
    const here = this.seats().map(({ s }) => s.userId).filter((id) => id !== leaving);
    if (!r.hostId || !here.includes(r.hostId)) r.hostId = here[0] ?? null;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = Date.now();

    if (url.pathname === '/create' && request.method === 'POST') {
      const b = (await request.json().catch(() => null)) as { code?: string; game?: unknown; hostId?: string } | null;
      if (!b?.code || !isGame(b.game) || !b.hostId) return json({ error: 'bad request' }, 400);
      const existing = await this.room();
      if (existing && now - existing.touched < IDLE_MS && this.seats().length) return json({ error: 'taken' }, 409);
      const r: Room = { code: b.code, game: b.game, phase: 'lobby', seed: 0, startsAt: 0, endsAt: 0, hostId: b.hostId, round: 0, touched: now };
      await this.save(r);
      await this.ctx.storage.setAlarm(now + IDLE_MS);
      return json({ ok: true });
    }

    if (url.pathname === '/info' && request.method === 'POST') {
      const r = await this.room();
      if (!r || now - r.touched > IDLE_MS) return json({ error: 'not found' }, 404);
      const players = this.players(r);
      return json({ code: r.code, game: r.game, phase: r.phase, players: players.length, full: players.length >= MAX_PLAYERS, host: players.find((p) => p.host)?.name ?? null });
    }

    // From the app: a one-time ticket for a signed-in person.
    if (url.pathname === '/ticket' && request.method === 'POST') {
      const who = (await request.json().catch(() => null)) as { userId?: string; name?: string; avatar?: string | null } | null;
      if (!who?.userId) return json({ error: 'bad request' }, 400);
      const r = await this.room();
      if (!r || now - r.touched > IDLE_MS) return json({ error: 'not found' }, 404);
      const players = this.players(r);
      if (players.length >= MAX_PLAYERS && !players.some((p) => p.id === who.userId)) return json({ error: 'full' }, 409);
      const stale = [...(await this.ctx.storage.list<{ exp: number }>({ prefix: 'ticket:' }))].filter(([, t]) => t.exp < now).map(([k]) => k);
      if (stale.length) await this.ctx.storage.delete(stale.slice(0, 128));
      const ticket = crypto.randomUUID();
      await this.ctx.storage.put(`ticket:${ticket}`, { userId: who.userId, name: (who.name || 'Player').slice(0, 40), avatar: who.avatar ?? null, exp: now + TICKET_TTL_MS });
      return json({ ticket });
    }

    if (url.pathname === '/play-live') {
      const key = `ticket:${url.searchParams.get('ticket')}`;
      const t = await this.ctx.storage.get<{ userId: string; name: string; avatar: string | null; exp: number }>(key);
      if (!t) return new Response('Forbidden', { status: 403 });
      await this.ctx.storage.delete(key); // single use
      const r = await this.room();
      if (t.exp < now || !r) return new Response('Forbidden', { status: 403 });
      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server);
      // Someone arriving mid-round watches it and plays the next one.
      const seat: Seat = { sid: crypto.randomUUID(), userId: t.userId, name: t.name, avatar: t.avatar, score: 0, step: 0, done: r.phase === 'playing' };
      server.serializeAttachment(seat);
      this.rehost(r);
      await this.save(r);
      this.broadcast(r);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 2_000) return;
    let m: { t?: string; score?: unknown; step?: unknown; game?: unknown };
    try { m = JSON.parse(raw); } catch { return; }
    const seat = ws.deserializeAttachment() as Seat | null;
    const r = await this.room();
    if (!seat || !r) return;
    const now = Date.now();
    const host = seat.userId === r.hostId;

    if (m.t === 'start' && host && r.phase !== 'playing') {
      r.phase = 'playing';
      r.seed = crypto.getRandomValues(new Uint32Array(1))[0];
      r.startsAt = now + COUNTDOWN_MS;
      r.endsAt = r.startsAt + GAMES[r.game].seconds * 1000;
      r.round += 1;
      for (const { ws: other, s } of this.seats()) other.serializeAttachment({ ...s, score: 0, step: 0, done: false });
      await this.save(r);
      await this.ctx.storage.setAlarm(r.endsAt + GRACE_MS);
      this.broadcast(r);
      return;
    }
    if (m.t === 'game' && host && r.phase !== 'playing' && isGame(m.game)) {
      r.game = m.game;
      r.phase = 'lobby';
      await this.save(r);
      this.broadcast(r);
      return;
    }
    if (m.t === 'again' && host && r.phase === 'results') {
      r.phase = 'lobby';
      await this.save(r);
      this.broadcast(r);
      return;
    }
    if ((m.t === 'progress' || m.t === 'done') && r.phase === 'playing' && !seat.done && now >= r.startsAt - 500 && now <= r.endsAt + GRACE_MS) {
      const step = typeof m.step === 'number' && Number.isFinite(m.step) ? Math.max(0, Math.min(10_000, Math.round(m.step))) : seat.step;
      ws.serializeAttachment({ ...seat, score: cleanScore(r.game, m.score), step, done: m.t === 'done' });
      // Everyone finished early: the round ends now.
      if (m.t === 'done' && this.seats().every(({ s }) => s.done)) return this.finish(r);
      this.broadcast(r);
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code); } catch { /* already closed */ }
    const seat = ws.deserializeAttachment() as Seat | null;
    const r = await this.room();
    if (!r || !seat) return;
    if (!this.seats().some(({ s }) => s.userId === seat.userId)) this.rehost(r, seat.userId);
    await this.save(r);
    this.broadcast(r);
  }

  /** The round is over: results for everyone, and the scores saved. */
  private async finish(r: Room) {
    if (r.phase !== 'playing') return;
    r.phase = 'results';
    await this.save(r);
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
    this.broadcast(r);
    const scored = this.players(r).filter((p) => p.score > 0);
    if (this.env.DB && scored.length) {
      const at = new Date().toISOString().replace('Z', '+00:00');
      await this.env.DB.batch(scored.map((p) => this.env.DB!.prepare('INSERT INTO game_scores (id, userId, game, mode, score, roomCode, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), p.id, r.game, 'multi', p.score, r.code, at))).catch((e) => console.error('game scores not saved:', e));
    }
  }

  async alarm() {
    const r = await this.room();
    if (!r) return;
    if (r.phase === 'playing' && Date.now() >= r.endsAt) return this.finish(r);
    if (Date.now() - r.touched >= IDLE_MS && !this.seats().length) await this.ctx.storage.deleteAll();
    else await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
  }
}
