'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Check, Copy, Crown, LogOut, Play, RotateCcw, Share2, Users } from 'lucide-react';
import { GAMES, GAME_IDS, MAX_PLAYERS, type GameId, type RoomPlayer, type RoomState } from '@/lib/play';
import { Avatar } from '@/components/ui/Avatar';
import { QrCode } from '@/components/ui/QrCode';
import { Rolling } from '@/components/ui/Rolling';
import { ScreenEffect } from '@/components/chat/ScreenEffect';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { GameIcon } from './GameIcon';

// The room's own screens (UniVerse Play, M31): the lobby with its code, link and QR; the live
// scoreboard that reorders as scores come in; and the podium at the end.

const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

export function Lobby({ state, me, onStart, onGame, onLeave }: { state: RoomState; me?: string; onStart: () => void; onGame: (g: GameId) => void; onLeave: () => void }) {
  const calm = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState('');
  useEffect(() => { setTimeout(() => setLink(`${window.location.origin}/play/game?room=${state.code}`), 0); }, [state.code]);
  const host = state.players.find((p) => p.host);
  const iHost = host?.id === me;
  const info = GAMES[state.game];
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* blocked */ } };
  const share = async () => { try { await navigator.share({ title: `${info.name} on UniVerse Play`, text: `Join my ${info.name} room: code ${state.code}`, url: link }); } catch { /* closed */ } };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <section className="panel p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-widest text-pink-600 dark:text-pink-300">Room code</p>
        <div className="mt-3 flex flex-wrap gap-2" role="img" aria-label={`Room code ${state.code.split('').join(' ')}`}>
          {state.code.split('').map((ch, i) => (
            <motion.span key={`${state.code}-${i}`} initial={{ opacity: 0, y: calm ? 0 : 10, scale: calm ? 1 : 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...spring.bouncy, delay: 0.04 * i }}
              className="grid h-14 w-11 place-items-center rounded-xl border border-zinc-200 bg-white font-mono text-3xl font-bold text-zinc-900 shadow-sm sm:h-16 sm:w-12 dark:border-white/10 dark:bg-[#222C5A] dark:text-white" aria-hidden>{ch}</motion.span>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void copy()} className="btn-secondary btn-sm">{copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}{copied ? 'Copied' : 'Copy link'}</button>
          {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && <button type="button" onClick={() => void share()} className="btn-secondary btn-sm"><Share2 className="w-4 h-4" aria-hidden />Share</button>}
          <button type="button" onClick={onLeave} className="btn-ghost btn-sm ms-auto"><LogOut className="w-4 h-4 rtl:-scale-x-100" aria-hidden />Leave</button>
        </div>

        <div className="mt-7 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white"><Users className="inline w-4 h-4 me-1.5 -mt-0.5" aria-hidden />Players</h2>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">{state.players.length} of {MAX_PLAYERS}</span>
        </div>
        <ul className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-8">
          <AnimatePresence initial={false}>
            {state.players.map((p) => (
              <motion.li key={p.id} layout initial={{ opacity: 0, scale: calm ? 1 : 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: calm ? 1 : 0.9 }} transition={spring.bouncy}
                className="flex flex-col items-center gap-1.5 text-center">
                <span className="relative">
                  <Avatar name={p.name} src={p.avatar} size={48} />
                  {p.host && <Crown className="absolute -top-2.5 left-1/2 w-4 h-4 -translate-x-1/2 fill-amber-400 text-amber-500" aria-label="Host" />}
                </span>
                <span className={cn('w-full truncate text-xs', p.id === me ? 'font-semibold text-pink-600 dark:text-pink-300' : 'text-zinc-700 dark:text-zinc-200')} translate="no">{p.id === me ? 'You' : p.name}</span>
              </motion.li>
            ))}
          </AnimatePresence>
          {Array.from({ length: Math.max(0, MAX_PLAYERS - state.players.length) }, (_, i) => (
            <li key={`free-${i}`} className={cn('flex flex-col items-center', i >= (4 - (state.players.length % 4)) % 4 && 'hidden sm:flex')} aria-hidden>
              <span className="h-12 w-12 rounded-full border-2 border-dashed border-zinc-300 dark:border-white/15" />
            </li>
          ))}
        </ul>

        <div className="mt-7 border-t border-zinc-200 pt-5 dark:border-white/10">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">{iHost ? 'Pick the game' : 'The game'}</h2>
          {iHost ? (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Game">
              {GAME_IDS.map((g) => (
                <button key={g} type="button" role="radio" aria-checked={state.game === g} onClick={() => onGame(g)}
                  className={cn('relative flex items-center gap-2 rounded-xl border p-2.5 text-start text-xs font-semibold transition-[border-color,transform] duration-150 active:scale-[0.98]',
                    state.game === g ? 'border-pink-500 text-zinc-900 dark:text-white' : 'border-zinc-200 text-zinc-600 dark:border-white/10 dark:text-zinc-300')}>
                  {state.game === g && <motion.span layoutId="room-game" className="absolute inset-0 rounded-xl bg-pink-500/10" transition={spring.snappy} aria-hidden />}
                  <GameIcon game={g} size="sm" />
                  <span className="relative">{GAMES[g].name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-3"><GameIcon game={state.game} /><div><p className="font-semibold text-zinc-900 dark:text-white">{info.name}</p><p className="text-xs text-zinc-500 dark:text-zinc-400">{info.how}</p></div></div>
          )}
          <div className="mt-5">
            {iHost ? (
              <button type="button" onClick={onStart} className="btn-primary w-full sm:w-auto"><Play className="w-4 h-4" aria-hidden />{state.players.length > 1 ? `Start ${info.name}` : 'Start (others can join next round)'}</button>
            ) : (
              <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300" aria-live="polite">
                <span className="relative flex h-2.5 w-2.5"><span className="play-ripple absolute inset-0 rounded-full bg-pink-500" /><span className="relative h-2.5 w-2.5 rounded-full bg-pink-500" /></span>
                Waiting for <span translate="no" className="font-semibold">{host?.name ?? 'the host'}</span> to start…
              </p>
            )}
          </div>
        </div>
      </section>

      <aside className="panel flex flex-col items-center p-5 text-center">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">Scan to join</p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Or open UniVerse Play and type the code.</p>
        <div className="mt-4 rounded-2xl bg-white p-2 shadow-sm">{link ? <QrCode value={link} size={168} title={`QR code to join room ${state.code}`} /> : <div className="h-[168px] w-[168px]" />}</div>
        <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">Up to {MAX_PLAYERS} players. Everyone gets the same questions at the same moment; fastest and most right wins.</p>
      </aside>
    </div>
  );
}

/** The live scoreboard during a round: rows glide into their new places as scores change. */
export function LiveBoard({ players, me, max }: { players: RoomPlayer[]; me?: string; max: number }) {
  const top = Math.max(1, ...players.map((p) => p.score));
  return (
    <aside className="panel h-fit p-4" aria-label="Live scores">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
        <span className="relative flex h-2 w-2"><span className="play-ripple absolute inset-0 rounded-full bg-pink-500" /><span className="relative h-2 w-2 rounded-full bg-pink-500" /></span>Live
      </p>
      <ol className="mt-3 space-y-1.5">
        {players.map((p, i) => (
          <motion.li key={p.id} layout transition={spring.smooth}
            className={cn('relative overflow-hidden rounded-xl px-2.5 py-2', p.id === me ? 'bg-pink-500/10 ring-1 ring-pink-500/40' : 'bg-zinc-50 dark:bg-white/[0.04]')}>
            <span className="absolute inset-y-0 start-0 w-full origin-left bg-pink-500/10 transition-transform duration-500 ease-out rtl:origin-right" style={{ transform: `scaleX(${p.score / top})` }} aria-hidden />
            <span className="relative flex items-center gap-2 text-sm">
              <span className="w-4 text-xs font-bold tabular-nums text-zinc-500 dark:text-zinc-400">{i + 1}</span>
              <Avatar name={p.name} src={p.avatar} size={24} />
              <span className="min-w-0 flex-1 truncate font-medium text-zinc-800 dark:text-zinc-100" translate="no">{p.id === me ? 'You' : p.name}</span>
              {p.done && <Check className="w-3.5 h-3.5 text-emerald-500" aria-label="Finished" />}
              <span className="font-semibold tabular-nums text-zinc-900 dark:text-white"><Rolling value={p.score} duration={0.6} /></span>
            </span>
          </motion.li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">Best possible: {max.toLocaleString()}</p>
    </aside>
  );
}

/** The room's players as a strip of chips (phones, above the game), leader first. */
export function LiveStrip({ players, me }: { players: RoomPlayer[]; me?: string }) {
  return (
    <ol className="flex max-w-[60vw] gap-1.5 overflow-x-auto" aria-label="Live scores">
      {players.map((p, i) => (
        <motion.li key={p.id} layout transition={spring.smooth} className={cn('flex shrink-0 items-center gap-1.5 rounded-full py-1 ps-1 pe-2.5 text-xs ring-1', p.id === me ? 'bg-pink-500/15 ring-pink-400/40' : 'bg-white/[0.05] ring-white/10')}>
          <Avatar name={p.name} src={p.avatar} size={20} />
          <span className="font-semibold text-white tabular-nums">{i + 1}. {p.score.toLocaleString()}</span>
        </motion.li>
      ))}
    </ol>
  );
}

const PODIUM = [1, 0, 2]; // second, first, third from the start side
const HEIGHT = ['h-40', 'h-28', 'h-20'];

export function Podium({ state, me, onAgain, onLeave, children }: { state: RoomState; me?: string; onAgain: () => void; onLeave: () => void; children?: React.ReactNode }) {
  const calm = useReducedMotion();
  const players = state.players;
  const myRank = players.findIndex((p) => p.id === me);
  const [party, setParty] = useState(myRank === 0 && players[0]?.score > 0);
  const iHost = players.find((p) => p.host)?.id === me;
  const host = players.find((p) => p.host);
  return (
    <section className="panel relative overflow-hidden p-5 sm:p-8">
      {party && <ScreenEffect effect="confetti" onDone={() => setParty(false)} />}
      <div className="flex items-center gap-3">
        <GameIcon game={state.game} />
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-pink-600 dark:text-pink-300">Round {state.round} results</p>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">{myRank >= 0 ? (myRank === 0 ? 'You won!' : `You came ${ordinal(myRank + 1)}`) : GAMES[state.game].name}</h2>
        </div>
      </div>

      <div className="mx-auto mt-8 grid max-w-lg grid-cols-3 items-end gap-3">
        {PODIUM.map((rank, col) => {
          const p = players[rank];
          if (!p) return <div key={rank} />;
          return (
            <div key={p.id} className="flex flex-col items-center text-center">
              <motion.div initial={{ opacity: 0, y: calm ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.bouncy, delay: calm ? 0 : 0.35 + 0.12 * (2 - rank) }} className="flex flex-col items-center">
                {rank === 0 && <Crown className="mb-1 w-6 h-6 fill-amber-400 text-amber-500" aria-hidden />}
                <Avatar name={p.name} src={p.avatar} size={rank === 0 ? 56 : 44} />
                <span className={cn('mt-1.5 w-full truncate text-sm font-semibold', p.id === me ? 'text-pink-600 dark:text-pink-300' : 'text-zinc-900 dark:text-white')} translate="no">{p.id === me ? 'You' : p.name}</span>
                <span className="text-sm font-bold tabular-nums text-zinc-700 dark:text-zinc-200"><Rolling value={p.score} /></span>
              </motion.div>
              <motion.div initial={{ scaleY: calm ? 1 : 0, opacity: calm ? 0 : 1 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ ...spring.gentle, delay: calm ? 0 : 0.1 * col }}
                className={cn('mt-2 w-full origin-bottom rounded-t-2xl', HEIGHT[rank], rank === 0 ? 'bg-gradient-to-b from-pink-500 to-fuchsia-700 shadow-[0_0_40px_rgba(254,129,209,0.35)]' : 'bg-[#2b3568]')}>
                <span className="block pt-2 text-2xl font-black text-white/90" aria-hidden>{rank + 1}</span>
              </motion.div>
            </div>
          );
        })}
      </div>

      {players.length > 3 && (
        <ol start={4} className="mx-auto mt-6 max-w-lg space-y-1.5">
          {players.slice(3).map((p, i) => (
            <li key={p.id} className={cn('flex items-center gap-3 rounded-xl px-3 py-2 text-sm', p.id === me ? 'bg-pink-500/10' : 'bg-zinc-50 dark:bg-white/[0.04]')}>
              <span className="w-5 text-xs font-bold tabular-nums text-zinc-500 dark:text-zinc-400">{i + 4}</span>
              <Avatar name={p.name} src={p.avatar} size={24} />
              <span className="flex-1 truncate text-zinc-800 dark:text-zinc-100" translate="no">{p.id === me ? 'You' : p.name}</span>
              <span className="font-semibold tabular-nums text-zinc-900 dark:text-white">{p.score.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}

      {children}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        {iHost ? <button type="button" onClick={onAgain} className="btn-primary"><RotateCcw className="w-4 h-4" aria-hidden />Play again</button>
          : <p className="text-sm text-zinc-600 dark:text-zinc-300">Waiting for <span translate="no" className="font-semibold">{host?.name ?? 'the host'}</span> to start the next round…</p>}
        <button type="button" onClick={onLeave} className="btn-secondary"><LogOut className="w-4 h-4 rtl:-scale-x-100" aria-hidden />Leave room</button>
      </div>
      <p className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-400">Scores count towards this week’s leaderboard.</p>
    </section>
  );
}
