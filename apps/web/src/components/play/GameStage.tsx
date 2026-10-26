'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Keyboard, Loader2, MousePointer2, Pointer } from 'lucide-react';
import { GAMES, type GameId } from '@/lib/play';
import { Rolling } from '@/components/ui/Rolling';
import { cn } from '@/lib/utils';
import { useArena } from './arena';
import { GameIcon } from './GameIcon';
import type { GameProps, GameStat } from './game-props';

// The stage every UniVerse Play round runs on, inside the arena (arena.tsx): the game's intro and a
// 3-2-1 to the room's start moment (with sounds), a timer ring and the score rolling up, "10 seconds
// left!" near the end and "Time!" at the end (the room's end moment, or earlier when the game ends
// itself), then the score and the game's own stats go to the results. Each game loads only when
// it's played.

const loading = () => <div className="grid h-72 place-items-center"><Loader2 className="w-6 h-6 animate-spin text-pink-400" aria-label="Loading the game" /></div>;
const VIEWS: Record<GameId, React.ComponentType<GameProps>> = {
  quiz: dynamic(() => import('./QuizClash').then((m) => m.QuizClash), { ssr: false, loading }),
  fakes: dynamic(() => import('./SpotTheFake').then((m) => m.SpotTheFake), { ssr: false, loading }),
  supply: dynamic(() => import('./SupplyRun').then((m) => m.SupplyRun), { ssr: false, loading }),
  sort: dynamic(() => import('./RecycleRush').then((m) => m.RecycleRush), { ssr: false, loading }),
  type: dynamic(() => import('./TypeRace').then((m) => m.TypeRace), { ssr: false, loading }),
  pin: dynamic(() => import('./WorldPin').then((m) => m.WorldPin), { ssr: false, loading }),
  rescue: dynamic(() => import('./FloodRescue').then((m) => m.FloodRescue), { ssr: false, loading }),
  ocean: dynamic(() => import('./OceanCleanup').then((m) => m.OceanCleanup), { ssr: false, loading }),
  obby: dynamic(() => import('./SkylineObby').then((m) => m.SkylineObby), { ssr: false, loading }),
  ops: dynamic(() => import('./ops/RidgelineOps').then((m) => m.RidgelineOps), { ssr: false, loading }),
  night: dynamic(() => import('./NightShift').then((m) => m.NightShift), { ssr: false, loading }),
  orbit: dynamic(() => import('./OrbitBreach').then((m) => m.OrbitBreach), { ssr: false, loading }),
};

/** Warm a game's code while the lobby or countdown shows. */
export function preloadGame(game: GameId) {
  const mod = {
    quiz: () => import('./QuizClash'), fakes: () => import('./SpotTheFake'), supply: () => import('./SupplyRun'), sort: () => import('./RecycleRush'),
    type: () => import('./TypeRace'), pin: () => import('./WorldPin'), rescue: () => import('./FloodRescue'), ocean: () => import('./OceanCleanup'),
    obby: () => import('./SkylineObby'), ops: () => import('./ops/RidgelineOps'), night: () => import('./NightShift'), orbit: () => import('./OrbitBreach'),
  }[game];
  void mod();
}

/** How each game is controlled, for the intro. */
const CONTROLS: Record<GameId, { icon: typeof Keyboard; text: string }[]> = {
  quiz: [{ icon: Pointer, text: 'Tap an answer' }, { icon: Keyboard, text: '1–4 answer · Q W E power-ups' }],
  fakes: [{ icon: Pointer, text: 'Tap the copy' }, { icon: Keyboard, text: '1–6 pick · Enter next' }],
  supply: [{ icon: Pointer, text: 'Pick a supply, tap a need' }, { icon: Keyboard, text: '1–4 choose the supply' }],
  sort: [{ icon: Pointer, text: 'Tap the right bin' }, { icon: Keyboard, text: '1–4 sort' }],
  type: [{ icon: Keyboard, text: 'Just type' }],
  pin: [{ icon: MousePointer2, text: 'Click or tap the map · drag and pinch to look' }, { icon: Keyboard, text: 'Arrows move · Enter pins the cross' }],
  rescue: [{ icon: MousePointer2, text: 'Steer with the mouse or a finger' }, { icon: Keyboard, text: 'Arrow keys or WASD' }],
  ocean: [{ icon: MousePointer2, text: 'Steer with the mouse or a finger' }, { icon: Keyboard, text: 'Arrow keys or WASD' }],
  obby: [{ icon: Keyboard, text: 'WASD move · Space jump · Shift run' }, { icon: MousePointer2, text: 'Click, then the mouse turns' }, { icon: Pointer, text: 'Phone: joystick and Jump' }],
  ops: [{ icon: Keyboard, text: 'WASD move · Shift sprint · C crouch · E use · Q/R reload · G grenade · H medkit · M map' }, { icon: MousePointer2, text: 'Click, then aim with the mouse · hold to fire · right button aims' }, { icon: Pointer, text: 'Phone: joystick, drag to look, Aim and Fire' }],
  night: [{ icon: Keyboard, text: 'WASD walk · Shift run' }, { icon: MousePointer2, text: 'Click, then look with the mouse' }, { icon: Pointer, text: 'Phone: joystick, drag to look' }],
  orbit: [{ icon: Keyboard, text: 'WASD move · Space jump (again to boost)' }, { icon: MousePointer2, text: 'Click, then the mouse turns' }, { icon: Pointer, text: 'Phone: joystick, Jump' }],
};

export function GameStage({ game, seed, startsAt, endsAt, clock, onProgress, onFinish, strip, rivals, net }: {
  game: GameId; seed: number; startsAt: number; endsAt: number; clock: () => number;
  onProgress?: (score: number, step: number) => void;
  onFinish: (score: number, step: number, stats: GameStat[]) => void;
  /** The room's players, as a strip under the bar (phones; computers have the side board). */
  strip?: React.ReactNode;
  rivals?: GameProps['rivals'];
  net?: GameProps['net'];
}) {
  const info = GAMES[game];
  const { announce, sfx } = useArena();
  const [count, setCount] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [over, setOver] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [left, setLeft] = useState(info.seconds);
  const [score, setScore] = useState(0);
  const last = useRef({ score: 0, step: 0 });
  const stats = useRef<GameStat[]>([]);
  const ended = useRef(false);
  const calm = useReducedMotion();

  const onFinishNow = useRef(onFinish);
  useEffect(() => { onFinishNow.current = onFinish; }, [onFinish]);
  // "Time!" (or the game's own end), a beat to see it, then the results.
  const finish = useCallback((sc: number, step: number) => {
    if (ended.current) return;
    ended.current = true;
    last.current = { score: sc, step };
    setOver(true);
    announce('Time!', 'gold');
    sfx('end');
    setTimeout(() => onFinishNow.current(sc, step, stats.current), 1100);
  }, [announce, sfx]);

  // 3, 2, 1, go: on the room's clock, so everyone starts together.
  useEffect(() => {
    preloadGame(game);
    const at = (t: number, fn: () => void) => setTimeout(fn, Math.max(0, t - clock()));
    const ids = [
      at(startsAt - 3000, () => { setCount(3); sfx('tick'); }), at(startsAt - 2000, () => { setCount(2); sfx('tick'); }), at(startsAt - 1000, () => { setCount(1); sfx('tick'); }),
      at(startsAt, () => { setCount(0); sfx('go'); setElapsed(Math.max(0, clock() - startsAt)); setPlaying(true); }),
      at(startsAt + 700, () => setCount(null)),
      at(endsAt - 10_000, () => { if (!ended.current) { announce('10 seconds left!', 'gold'); sfx('alarm'); } }),
      at(endsAt, () => finish(last.current.score, last.current.step)),
    ];
    for (let s = 5; s >= 1; s--) ids.push(at(endsAt - s * 1000, () => { if (!ended.current) sfx('tick'); }));
    return () => ids.forEach(clearTimeout);
  }, [game, startsAt, endsAt, clock, finish, announce, sfx]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setLeft(Math.max(0, Math.ceil((endsAt - clock()) / 1000))), 250);
    return () => clearInterval(id);
  }, [playing, endsAt, clock]);

  const progress = useCallback((sc: number, step: number) => {
    last.current = { score: sc, step };
    setScore(sc);
    onProgress?.(sc, step);
  }, [onProgress]);
  const keepStats = useCallback((s: GameStat[]) => { stats.current = s; }, []);
  const View = VIEWS[game];
  const low = playing && left <= 10;
  const total = endsAt - startsAt;

  return (
    <div className="pt-1">
      {/* The bar: the time left as a ring, the score rolling up. */}
      <div className="flex items-center gap-4">
        <div className="relative grid h-14 w-14 shrink-0 place-items-center" role="timer" aria-label={`${left} seconds left`}>
          <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
            {playing && <circle cx="24" cy="24" r="20" fill="none" stroke={low ? '#f472b6' : 'url(#ring)'} strokeWidth="4" strokeLinecap="round" strokeDasharray="126" className="play-ring"
              style={{ animationDuration: `${total}ms`, animationDelay: `${-elapsed}ms` }} />}
            <defs><linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#e879f9" /><stop offset="100%" stopColor="#ec4899" /></linearGradient></defs>
          </svg>
          <span key={low ? left : 'n'} className={cn('relative text-base font-bold tabular-nums', low ? 'play-tick text-pink-300' : 'text-white')}>{left}</span>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Score</p>
          <p className="text-3xl font-semibold leading-none tracking-tight text-white tabular-nums"><Rolling value={score} duration={0.45} /><span className="sr-only"> points</span></p>
        </div>
        {strip && <div className="ms-auto min-w-0 lg:hidden">{strip}</div>}
      </div>

      <div className="mt-4">
        {playing && !over ? <View seed={seed} startsAt={startsAt} endsAt={endsAt} clock={clock} onProgress={progress} onDone={finish} onStats={keepStats} rivals={rivals} net={net} /> : playing ? (
          <div className="grid h-72 place-items-center"><p className="text-sm text-zinc-400">Adding it up…</p></div>
        ) : (
          // The intro, while the countdown runs.
          <div className="grid min-h-[60vh] place-items-center text-center">
            <motion.div initial={{ opacity: 0, y: calm ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} className="max-w-lg">
              <GameIcon game={game} size="lg" className="mx-auto" />
              <h2 className="mt-5 text-4xl font-semibold tracking-tight text-white">{info.name}</h2>
              <p className="mt-2 text-zinc-300">{info.how}</p>
              <ul className="mt-5 flex flex-wrap justify-center gap-2">
                {CONTROLS[game].map(({ icon: Icon, text }) => (
                  <li key={text} className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-zinc-200 ring-1 ring-white/15"><Icon className="w-4 h-4 text-pink-300" aria-hidden />{text}</li>
                ))}
              </ul>
            </motion.div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {count !== null && (
          <motion.div key="count" className="pointer-events-none fixed inset-0 z-[25] grid place-items-center bg-black/30"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} aria-live="assertive">
            <AnimatePresence mode="popLayout">
              <motion.span key={count} initial={{ scale: calm ? 1 : 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: calm ? 1 : 1.25, opacity: 0 }}
                transition={{ type: 'spring', visualDuration: 0.32, bounce: calm ? 0 : 0.35 }}
                className="bg-gradient-to-br from-fuchsia-300 via-pink-400 to-pink-600 bg-clip-text text-[9rem] font-black leading-none text-transparent drop-shadow-[0_10px_50px_rgba(236,72,153,0.5)]">
                {count === 0 ? 'Go!' : count}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
