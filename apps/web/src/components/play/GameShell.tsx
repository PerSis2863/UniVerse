'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft, Eye, Hourglass, Loader2, LogIn, Play, RotateCcw, Trophy, User, Users, WifiOff } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Rolling } from '@/components/ui/Rolling';
import { ScreenEffect } from '@/components/chat/ScreenEffect';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { appById } from '@/lib/apps';
import { COUNTDOWN_MS, GAMES, GAME_IDS, cleanRoomCode, isGame, xpFor, type GameId } from '@/lib/play';
import { useAuthStore } from '@/store/auth';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { AgeBadge, useAgeGate } from './AgeGate';
import { GameIcon } from './GameIcon';
import { GameStage, preloadGame } from './GameStage';
import { LiveBoard, LiveStrip, Lobby, Podium } from './RoomViews';
import { Arena, useArena } from './arena';
import type { GameStat } from './game-props';
import { useGameRoom } from './useGameRoom';

// /play/game (UniVerse Play, M31): ?g=<game> picks the game (solo, start a room, or join one by
// code); ?room=<code> is a room, so a room's link or QR brings friends straight in.

export interface PlayMe { games: Record<GameId, { best: number; solo: number; multi: number }>; played: number; recent: { game: GameId; mode: string; score: number; createdAt: string }[]; age?: number | null; xp?: number }

export function GameShell() {
  const params = useSearchParams();
  const router = useRouter();
  const room = cleanRoomCode(params.get('room'));
  const g = params.get('g');
  const game: GameId = isGame(g) ? g : 'quiz';
  const leave = useCallback((to?: GameId) => router.replace(`/play/game?g=${to ?? game}`), [router, game]);
  if (room) return <Room key={room} code={room} onLeave={(to) => leave(to)} />;
  return <GameMenu key={game} game={game} />;
}

/** Join a room by its code (checked first, so a wrong code says so here). */
export function JoinRoom({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = cleanRoomCode(code);
    if (!c) { setError('Room codes have 6 letters and numbers.'); return; }
    setBusy(true);
    try { await api.get(`/play/rooms/${c}`); router.push(`/play/game?room=${c}`); }
    catch (err) { setError(errorMessage(err, 'No room has that code.')); setBusy(false); }
  };
  return (
    <form onSubmit={(e) => void join(e)} className={cn('flex flex-col gap-3', compact && 'sm:flex-row sm:items-start')}>
      {!compact && <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#2b3568] text-white"><LogIn className="w-5 h-5 rtl:-scale-x-100" aria-hidden /></span>}
      <label htmlFor={compact ? 'room-code-top' : 'room-code'} className={compact ? 'sr-only' : 'text-lg font-semibold text-zinc-900 dark:text-white'}>Join a room</label>
      <div className="min-w-0 flex-1">
        <input id={compact ? 'room-code-top' : 'room-code'} value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setError(''); }}
          placeholder="Room code" autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-invalid={!!error} aria-describedby={error ? `${compact ? 'top' : 'menu'}-code-error` : undefined}
          className="input w-full font-mono text-lg tracking-[0.25em] uppercase placeholder:tracking-normal placeholder:font-sans placeholder:text-base" />
        {error && <p id={`${compact ? 'top' : 'menu'}-code-error`} className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
      <button type="submit" disabled={busy || code.length < 6} className={cn('btn-secondary', !compact && 'mt-auto')}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <LogIn className="w-4 h-4 rtl:-scale-x-100" aria-hidden />}Join</button>
    </form>
  );
}

function GameMenu({ game }: { game: GameId }) {
  const router = useRouter();
  const { data: me, mutate } = useSWR<PlayMe>('/play/me', fetcher);
  const [mode, setMode] = useState<'menu' | 'solo'>('menu');
  const [busy, setBusy] = useState(false);
  const info = GAMES[game];
  const calm = useReducedMotion();
  const gate = useAgeGate(game, me?.age);
  useEffect(() => { preloadGame(game); }, [game]);

  const createRoom = async () => {
    setBusy(true);
    try { const { data } = await api.post<{ code: string }>('/play/rooms', { game }); router.replace(`/play/game?room=${data.code}`); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t open a room.')); setBusy(false); }
  };

  if (mode === 'solo' && !gate.blocked) return <Solo game={game} best={me?.games[game]?.best ?? 0} onExit={() => { setMode('menu'); void mutate(); }} onChallenge={() => void createRoom()} />;

  return (
    <div className="space-y-5">
      {gate.dialog}
      <section className="panel relative overflow-hidden p-5 sm:p-8">
        <div className="pointer-events-none absolute -end-24 -top-24 h-72 w-72 rounded-full opacity-30 blur-3xl" style={{ background: info.color }} aria-hidden />
        <Link href="/play" className="relative inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"><ArrowLeft className="w-4 h-4 rtl:-scale-x-100" aria-hidden />All games</Link>
        <div className="relative mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
          <motion.div initial={{ opacity: 0, scale: calm ? 1 : 0.9, rotate: calm ? 0 : -6 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={spring.bouncy}><GameIcon game={game} size="lg" /></motion.div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-300"><span className="h-2 w-2 rounded-full" style={{ background: info.color }} aria-hidden />For {appById(info.app).name}</p>
            <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold text-zinc-900 dark:text-white">{info.name}<AgeBadge game={game} /></h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-300">{info.tagline}</p>
          </div>
          <div className="sm:ms-auto flex gap-6 text-sm">
            <div><p className="text-zinc-500 dark:text-zinc-400">Your best</p><p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white"><Rolling value={me?.games[game]?.best ?? 0} /></p></div>
            <div><p className="text-zinc-500 dark:text-zinc-400">Rounds</p><p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white"><Rolling value={(me?.games[game]?.solo ?? 0) + (me?.games[game]?.multi ?? 0)} /></p></div>
          </div>
        </div>
        <p className="relative mt-5 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300"><span className="font-semibold text-zinc-900 dark:text-white">How to play: </span>{info.how}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <motion.button type="button" onClick={() => gate.guard(() => setMode('solo'))} initial={{ opacity: 0, y: calm ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}
          className="sheen panel group flex flex-col items-start gap-3 p-5 text-start transition-transform duration-150 active:scale-[0.99]">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-pink-500 text-white shadow-[0_6px_20px_rgba(254,129,209,0.4)]"><User className="w-5 h-5" aria-hidden /></span>
          <span className="text-lg font-semibold text-zinc-900 dark:text-white">Play solo</span>
          <span className="text-sm text-zinc-600 dark:text-zinc-300">{info.seconds} seconds against your best score.</span>
          <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-pink-600 dark:text-pink-300"><Play className="w-4 h-4" aria-hidden />Start</span>
        </motion.button>
        <motion.button type="button" disabled={busy} onClick={() => gate.guard(() => void createRoom())} initial={{ opacity: 0, y: calm ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.smooth, delay: 0.05 }}
          className="sheen panel group flex flex-col items-start gap-3 p-5 text-start transition-transform duration-150 active:scale-[0.99] disabled:opacity-60">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#2b3568] text-white">{busy ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : <Users className="w-5 h-5" aria-hidden />}</span>
          <span className="text-lg font-semibold text-zinc-900 dark:text-white">Play with friends</span>
          <span className="text-sm text-zinc-600 dark:text-zinc-300">Open a room, share its code or QR, and race up to 7 others live.</span>
          <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-100">Open a room</span>
        </motion.button>
        <motion.div initial={{ opacity: 0, y: calm ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.smooth, delay: 0.1 }} className="panel p-5">
          <JoinRoom />
        </motion.div>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">More games</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {GAME_IDS.filter((x) => x !== game).map((x) => (
            <Link key={x} href={`/play/game?g=${x}`} className="sheen panel flex items-center gap-3 p-3.5 transition-transform duration-150 active:scale-[0.99]">
              <GameIcon game={x} />
              <span className="min-w-0"><span className="block font-semibold text-zinc-900 dark:text-white">{GAMES[x].name}</span><span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{GAMES[x].tagline}</span></span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

interface Round { seed: number; startsAt: number; endsAt: number; n: number }
interface Result { score: number; best: number; newBest: boolean; saving: boolean; stats: GameStat[] }

function Solo({ game, best, onExit, onChallenge }: { game: GameId; best: number; onExit: () => void; onChallenge: () => void }) {
  const [round, setRound] = useState<Round | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const clock = useCallback(() => Date.now(), []);
  const start = useCallback(() => {
    const startsAt = Date.now() + COUNTDOWN_MS;
    setResult(null);
    setRound((r) => ({ seed: crypto.getRandomValues(new Uint32Array(1))[0], startsAt, endsAt: startsAt + GAMES[game].seconds * 1000, n: (r?.n ?? 0) + 1 }));
  }, [game]);
  useEffect(() => { const id = setTimeout(start, 0); return () => clearTimeout(id); }, [start]);

  const finish = useCallback((score: number, _step: number, stats: GameStat[]) => {
    setResult({ score, best: Math.max(best, score), newBest: score > best, saving: true, stats });
    api.post<{ score: number; best: number; newBest: boolean }>('/play/scores', { game, score })
      .then(({ data }) => setResult((r) => ({ ...data, saving: false, stats: r?.stats ?? stats })))
      .catch((e) => { setResult((r) => r && { ...r, saving: false }); toast.error(errorMessage(e, 'Your score couldn’t be saved.')); });
  }, [game, best]);

  return (
    <Arena game={game} onExit={onExit}>
      {result ? <SoloResult game={game} result={result} onAgain={start} onExit={onExit} onChallenge={onChallenge} />
        : round && <GameStage key={round.n} game={game} seed={round.seed} startsAt={round.startsAt} endsAt={round.endsAt} clock={clock} onFinish={finish} />}
    </Arena>
  );
}

/** The game's own numbers after a round, rising in one after another. */
function StatTiles({ stats }: { stats: GameStat[] }) {
  const calm = useReducedMotion();
  if (!stats.length) return null;
  return (
    <ul className="mx-auto mt-8 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.slice(0, 4).map((s, i) => (
        <motion.li key={s.label} initial={{ opacity: 0, y: calm ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.smooth, delay: calm ? 0 : 0.5 + i * 0.07 }}
          className="rounded-2xl bg-white/[0.05] px-3 py-3 text-center ring-1 ring-white/10">
          <p className="text-2xl font-semibold tracking-tight text-white tabular-nums">{s.value}</p>
          <p className="mt-0.5 text-xs text-zinc-400">{s.label}</p>
        </motion.li>
      ))}
    </ul>
  );
}

function SoloResult({ game, result, onAgain, onExit, onChallenge }: { game: GameId; result: Result; onAgain: () => void; onExit: () => void; onChallenge: () => void }) {
  const calm = useReducedMotion();
  const { sfx } = useArena();
  const [party, setParty] = useState(result.newBest && result.score > 0);
  useEffect(() => { if (result.newBest && result.score > 0) sfx('win'); }, [result.newBest, result.score, sfx]);
  const info = GAMES[game];
  return (
    <section className="relative grid min-h-[70vh] place-items-center py-8 text-center">
      {party && <ScreenEffect effect="confetti" onDone={() => setParty(false)} />}
      <div className="w-full">
        <motion.div initial={{ opacity: 0, scale: calm ? 1 : 0.9, rotate: calm ? 0 : -6 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={spring.bouncy} className="mx-auto w-fit"><GameIcon game={game} size="lg" /></motion.div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">{info.name} · your score</p>
        <p className="mt-2 text-7xl font-semibold tracking-tight text-white tabular-nums sm:text-8xl"><Rolling value={result.score} duration={1.4} /></p>
        <AnimatePresence>
          {result.newBest && result.score > 0 && (
            <motion.p initial={{ opacity: 0, scale: calm ? 1 : 0.9, y: calm ? 0 : 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ ...spring.bouncy, delay: calm ? 0 : 0.9 }}
              className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-pink-600 px-3 py-1 text-sm font-bold text-white shadow-[0_0_30px_rgba(254,129,209,0.5)]">
              <Trophy className="w-4 h-4" aria-hidden />New best!
            </motion.p>
          )}
        </AnimatePresence>
        <p className="mt-3 text-sm text-zinc-300" aria-live="polite">
          {result.saving ? 'Saving…' : result.newBest ? 'That’s your best yet.' : <>Your best: <span className="font-semibold tabular-nums">{result.best.toLocaleString()}</span> · {(result.best - result.score).toLocaleString()} to beat it</>}
        </p>
        <motion.p initial={{ opacity: 0, y: calm ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.smooth, delay: calm ? 0 : 1.2 }}
          className="mx-auto mt-3 w-fit rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-fuchsia-200 ring-1 ring-fuchsia-400/30">+{xpFor(game, result.score).toLocaleString('en')} XP</motion.p>
        <StatTiles stats={result.stats} />
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <button type="button" autoFocus onClick={onAgain} className="btn-primary btn-lg"><RotateCcw className="w-5 h-5" aria-hidden />Play again</button>
          <button type="button" onClick={onChallenge} className="btn-secondary btn-lg"><Users className="w-5 h-5" aria-hidden />Challenge friends</button>
          <Link href={`/play/leaderboard?g=${game}`} className="btn-secondary btn-lg"><Trophy className="w-5 h-5" aria-hidden />Leaderboard</Link>
          <button type="button" onClick={onExit} className="btn-ghost btn-lg">Back</button>
        </div>
      </div>
    </section>
  );
}

function Room({ code, onLeave }: { code: string; onLeave: (to?: GameId) => void }) {
  const me = useAuthStore((s) => s.user?.id);
  const { state, status, error, send, clock, report, finish, peers, sendPos, chat, sendChat, chatNotice, said, voice } = useGameRoom(code);
  const net = useMemo(() => ({ peers, sendPos, chat, sendChat, chatNotice, said, voice }), [peers, sendPos, chat, sendChat, chatNotice, said, voice]);
  const [finishedRound, setFinishedRound] = useState<number | null>(null);
  const [myStats, setMyStats] = useState<GameStat[]>([]);
  const [ageOk, setAgeOk] = useState(false);
  const okAge = useCallback(() => setAgeOk(true), []);
  const roomGame = state?.game;
  useEffect(() => { if (roomGame) preloadGame(roomGame); }, [roomGame]);
  const onFinish = useCallback((score: number, step: number, stats: GameStat[]) => {
    finish(score, step);
    setMyStats(stats);
    setFinishedRound(state?.round ?? null);
  }, [finish, state?.round]);

  if (status === 'gone') {
    return (
      <section className="panel mx-auto max-w-md p-8 text-center">
        <WifiOff className="mx-auto w-8 h-8 text-zinc-400" aria-hidden />
        <p className="mt-3 font-semibold text-zinc-900 dark:text-white">Can’t join this room</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{error}</p>
        <button type="button" onClick={() => onLeave()} className="btn-primary mt-5">Back to the game</button>
      </section>
    );
  }
  if (!state) {
    return <div className="panel grid h-72 place-items-center"><p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300"><Loader2 className="w-5 h-5 animate-spin text-pink-500" aria-hidden />Joining room {code}…</p></div>;
  }

  const mine = state.players.find((p) => p.id === me);
  const leave = () => onLeave(state.game);
  const reconnecting = status === 'reconnecting' && <p className="mb-3 rounded-xl bg-amber-500/15 px-3 py-2 text-sm text-amber-800 dark:text-amber-200" role="status">Connection lost. Reconnecting…</p>;
  if (GAMES[state.game].age && !ageOk) return <RoomAgeCheck game={state.game} onOk={okAge} onLeave={leave} />;
  if (state.phase === 'lobby') {
    return <div>{reconnecting}<Lobby state={state} me={me} onStart={() => send({ t: 'start' })} onGame={(g) => send({ t: 'game', game: g })} onLeave={leave} /></div>;
  }
  const board = <LiveBoard players={state.players} me={me} max={GAMES[state.game].maxScore} />;
  return (
    <Arena game={state.game} onExit={leave} side={board}>
      {reconnecting}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={`${state.phase}-${state.round}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
          {state.phase === 'results' && <Podium state={state} me={me} onAgain={() => send({ t: 'again' })} onLeave={leave}>{myStats.length > 0 && <StatTiles stats={myStats} />}</Podium>}
          {state.phase === 'playing' && (finishedRound === state.round || mine?.done ? (
            <section className="grid min-h-[60vh] place-items-center p-8 text-center">
              <div>
                {finishedRound === state.round ? <Hourglass className="mx-auto w-9 h-9 text-pink-400" aria-hidden /> : <Eye className="mx-auto w-9 h-9 text-pink-400" aria-hidden />}
                <p className="mt-3 text-xl font-semibold text-white">{finishedRound === state.round ? 'Done! Waiting for the others…' : 'A round is on'}</p>
                <p className="mt-1 text-sm text-zinc-300">{finishedRound === state.round ? 'The results show the moment everyone finishes or time runs out.' : 'You’ll play in the next one. Watch the scores until then.'}</p>
                <div className="mx-auto mt-6 max-w-sm lg:hidden">{board}</div>
              </div>
            </section>
          ) : (
            <GameStage game={state.game} seed={state.seed} startsAt={state.startsAt} endsAt={state.endsAt} clock={clock} onProgress={report} onFinish={onFinish}
              strip={<LiveStrip players={state.players} me={me} />} rivals={state.players.filter((p) => p.id !== me)} net={net} />
          ))}
        </motion.div>
      </AnimatePresence>
    </Arena>
  );
}

/** Joining a room that plays a rated game: the age check first (or straight in when it's fine). */
function RoomAgeCheck({ game, onOk, onLeave }: { game: GameId; onOk: () => void; onLeave: () => void }) {
  const { data: me } = useSWR<PlayMe>('/play/me', fetcher);
  const gate = useAgeGate(game, me?.age);
  const info = GAMES[game];
  // Already fine (an adult birth date, or confirmed on this device): straight in.
  const clear = !!me && gate.clear;
  useEffect(() => { if (clear) onOk(); }, [clear, onOk]);
  return (
    <section className="panel mx-auto max-w-md p-8 text-center">
      {gate.dialog}
      <span className="mx-auto grid w-fit"><GameIcon game={game} size="lg" /></span>
      <h1 className="mt-4 flex items-center justify-center gap-2 text-xl font-semibold text-zinc-900 dark:text-white">{info.name}<AgeBadge game={game} /></h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">This room plays a game rated {info.age}+ ({info.rated}).</p>
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={() => gate.guard(onOk)} disabled={!me} className="btn-primary">Join the room</button>
        <button type="button" onClick={onLeave} className="btn-secondary">Leave</button>
      </div>
    </section>
  );
}
