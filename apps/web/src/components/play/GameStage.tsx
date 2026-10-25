'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Loader2, Maximize2, Minimize2, Timer } from 'lucide-react';
import { GAMES, type GameId } from '@/lib/play';
import { Rolling } from '@/components/ui/Rolling';
import { cn } from '@/lib/utils';
import type { GameProps } from './game-props';

// The stage every UniVerse Play round runs on: 3-2-1 to the room's start moment, the game, a timer
// that drains on the GPU, the score rolling up, and an end at the room's end moment (or earlier,
// when the game ends itself). Each game loads only when it's played.

const loading = () => <div className="grid h-64 place-items-center"><Loader2 className="w-6 h-6 animate-spin text-pink-500" aria-label="Loading the game" /></div>;
const VIEWS: Record<GameId, React.ComponentType<GameProps>> = {
  quiz: dynamic(() => import('./QuizClash').then((m) => m.QuizClash), { ssr: false, loading }),
  fakes: dynamic(() => import('./SpotTheFake').then((m) => m.SpotTheFake), { ssr: false, loading }),
  supply: dynamic(() => import('./SupplyRun').then((m) => m.SupplyRun), { ssr: false, loading }),
  sort: dynamic(() => import('./RecycleRush').then((m) => m.RecycleRush), { ssr: false, loading }),
  type: dynamic(() => import('./TypeRace').then((m) => m.TypeRace), { ssr: false, loading }),
  pin: dynamic(() => import('./WorldPin').then((m) => m.WorldPin), { ssr: false, loading }),
  rescue: dynamic(() => import('./FloodRescue').then((m) => m.FloodRescue), { ssr: false, loading }),
  ocean: dynamic(() => import('./OceanCleanup').then((m) => m.OceanCleanup), { ssr: false, loading }),
};

/** Warm a game's code while the lobby or countdown shows. */
export function preloadGame(game: GameId) {
  const mod = {
    quiz: () => import('./QuizClash'), fakes: () => import('./SpotTheFake'), supply: () => import('./SupplyRun'), sort: () => import('./RecycleRush'),
    type: () => import('./TypeRace'), pin: () => import('./WorldPin'), rescue: () => import('./FloodRescue'), ocean: () => import('./OceanCleanup'),
  }[game];
  void mod();
}

export function GameStage({ game, seed, startsAt, endsAt, clock, onProgress, onFinish, aside, rivals }: {
  game: GameId; seed: number; startsAt: number; endsAt: number; clock: () => number;
  onProgress?: (score: number, step: number) => void;
  onFinish: (score: number, step: number) => void;
  /** The room's live scoreboard, beside the game. */
  aside?: React.ReactNode;
  rivals?: GameProps['rivals'];
}) {
  const info = GAMES[game];
  const [count, setCount] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [left, setLeft] = useState(info.seconds);
  const [score, setScore] = useState(0);
  const last = useRef({ score: 0, step: 0 });
  const ended = useRef(false);
  const calm = useReducedMotion();
  const stage = useRef<HTMLElement>(null);
  const [full, setFull] = useState(false);
  const [canFull, setCanFull] = useState(false);
  useEffect(() => {
    const el = stage.current;
    const id = setTimeout(() => setCanFull(!!document.fullscreenEnabled), 0);
    const change = () => setFull(!!el && document.fullscreenElement === el);
    document.addEventListener('fullscreenchange', change);
    return () => { clearTimeout(id); document.removeEventListener('fullscreenchange', change); if (el && document.fullscreenElement === el) void document.exitFullscreen().catch(() => {}); };
  }, []);
  const toggleFull = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await stage.current?.requestFullscreen(); } catch { /* not allowed here */ }
  };

  const onFinishNow = useRef(onFinish);
  useEffect(() => { onFinishNow.current = onFinish; }, [onFinish]);
  const finish = useCallback((sc: number, step: number) => {
    if (ended.current) return;
    ended.current = true;
    onFinishNow.current(sc, step);
  }, []);

  // 3, 2, 1, go: on the room's clock, so everyone starts together.
  useEffect(() => {
    preloadGame(game);
    const at = (t: number, fn: () => void) => setTimeout(fn, Math.max(0, t - clock()));
    const ids = [
      at(startsAt - 3000, () => setCount(3)), at(startsAt - 2000, () => setCount(2)), at(startsAt - 1000, () => setCount(1)),
      at(startsAt, () => { setCount(0); setElapsed(Math.max(0, clock() - startsAt)); setPlaying(true); }),
      at(startsAt + 700, () => setCount(null)),
      at(endsAt, () => finish(last.current.score, last.current.step)),
    ];
    return () => ids.forEach(clearTimeout);
  }, [game, startsAt, endsAt, clock, finish]);

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
  const View = VIEWS[game];
  const low = playing && left <= 10;

  return (
    <div className={cn('grid gap-5', aside && 'lg:grid-cols-[1fr_17rem]')}>
      <section ref={stage} className="play-stage panel relative min-h-[28rem] overflow-hidden p-4 sm:p-6" aria-label={info.name}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-zinc-900 dark:text-white">{info.name}</span>
          {canFull && (
            <button type="button" onClick={() => void toggleFull()} className="btn-ghost btn-sm !px-2" aria-label={full ? 'Leave full screen' : 'Full screen'} title={full ? 'Leave full screen' : 'Full screen'}>
              {full ? <Minimize2 className="w-4 h-4" aria-hidden /> : <Maximize2 className="w-4 h-4" aria-hidden />}
            </button>
          )}
          <span className={cn('ms-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums transition-colors', low ? 'bg-pink-600 text-white' : 'bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-200')}>
            <Timer className="w-4 h-4" aria-hidden /><span key={low ? left : 'n'} className={low ? 'play-tick' : ''}>{left}s</span>
          </span>
          <span className="rounded-full bg-[#11212D] px-3 py-1 text-sm font-bold text-white tabular-nums"><Rolling value={score} duration={0.5} /><span className="sr-only"> points</span></span>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10" aria-hidden>
          {playing && <div className="play-drain h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500" style={{ animationDuration: `${endsAt - startsAt}ms`, animationDelay: `${-elapsed}ms` }} />}
        </div>
        <div className="mt-5">
          {playing ? <View seed={seed} startsAt={startsAt} endsAt={endsAt} clock={clock} onProgress={progress} onDone={finish} rivals={rivals} /> : (
            <div className="grid h-72 place-items-center text-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-pink-600 dark:text-pink-300">Get ready</p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-600 dark:text-zinc-300">{info.how}</p>
              </div>
            </div>
          )}
        </div>
        <AnimatePresence>
          {count !== null && (
            <motion.div key="count" className="pointer-events-none absolute inset-0 grid place-items-center bg-white/60 dark:bg-[#11212D]/60"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} aria-live="assertive">
              <AnimatePresence mode="popLayout">
                <motion.span key={count} initial={{ scale: calm ? 1 : 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: calm ? 1 : 1.15, opacity: 0 }}
                  transition={{ type: 'spring', visualDuration: 0.32, bounce: calm ? 0 : 0.35 }}
                  className="bg-gradient-to-br from-fuchsia-400 to-pink-600 bg-clip-text text-8xl font-black text-transparent">
                  {count === 0 ? 'Go!' : count}
                </motion.span>
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
      {aside}
    </div>
  );
}
