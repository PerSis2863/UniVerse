'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Maximize2, Minimize2, Volume2, VolumeX, X } from 'lucide-react';
import { GAMES, type GameId } from '@/lib/play';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { GameIcon } from './GameIcon';
import { setSoundOn, sfx, soundOn, unlockAudio, type Sfx } from './sound';

// The arena (M35): a round of UniVerse Play takes the whole screen, like a console game: a dark
// stage lit in the game's colour, a slim bar (leave, sound, full screen), big announcements in the
// middle ("Combo ×5!"), a shake when something hits, and sounds. Games reach it with useArena().
// Escape asks before leaving. The page behind doesn't scroll while it's open.

export type Tone = 'pink' | 'good' | 'bad' | 'gold';
interface ArenaApi {
  announce: (text: string, tone?: Tone) => void;
  shake: (power?: number) => void;
  sfx: (name: Sfx, level?: number, loud?: number) => void;
}
const ArenaCtx = createContext<ArenaApi>({ announce: () => {}, shake: () => {}, sfx });
export const useArena = () => useContext(ArenaCtx);

const TONE: Record<Tone, string> = {
  pink: 'from-fuchsia-300 via-pink-400 to-pink-500',
  good: 'from-emerald-200 via-emerald-300 to-emerald-400',
  bad: 'from-red-300 via-red-400 to-rose-500',
  gold: 'from-amber-100 via-amber-300 to-amber-400',
};
const noop = () => () => {};

export function Arena({ game, onExit, side, children }: {
  game: GameId;
  /** Leaving (after the player confirms, while a round is on). */
  onExit: () => void;
  /** The room's live scoreboard (beside the game on computers). */
  side?: React.ReactNode;
  children: React.ReactNode;
}) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const calm = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState<{ id: number; text: string; tone: Tone }[]>([]);
  const [said, setSaid] = useState('');
  const [sound, setSound] = useState(soundOn);
  const [full, setFull] = useState(false);
  const [asking, setAsking] = useState(false);
  const seq = useRef(0);
  const info = GAMES[game];

  // Open: lock the page behind, take focus; close: give both back.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null, html = document.documentElement, overflow = html.style.overflow;
    html.style.overflow = 'hidden';
    root.current?.focus();
    unlockAudio();
    const change = () => setFull(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', change);
    return () => {
      html.style.overflow = overflow;
      document.removeEventListener('fullscreenchange', change);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      before?.focus?.();
    };
  }, []);
  useEffect(() => {
    // In a 3D world Escape first frees the mouse (the browser does that); only a second press asks.
    let freed = 0;
    const lock = () => { if (!document.pointerLockElement) freed = performance.now(); };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.pointerLockElement || performance.now() - freed < 300) return;
      e.preventDefault(); setAsking((a) => !a);
    };
    window.addEventListener('keydown', key);
    document.addEventListener('pointerlockchange', lock);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('pointerlockchange', lock); };
  }, []);

  const announce = useCallback((text: string, tone: Tone = 'pink') => {
    const id = ++seq.current;
    setNotes((n) => [...n.slice(-1), { id, text, tone }]);
    setSaid(text);
    setTimeout(() => setNotes((n) => n.filter((x) => x.id !== id)), 1250);
  }, []);
  const shake = useCallback((power = 1) => {
    if (calm || !body.current?.animate) return;
    const p = Math.min(2, power) * 7;
    body.current.animate([
      { transform: 'translate3d(0,0,0)' }, { transform: `translate3d(${-p}px,${p * 0.4}px,0)` }, { transform: `translate3d(${p * 0.8}px,${-p * 0.5}px,0)` },
      { transform: `translate3d(${-p * 0.5}px,${p * 0.3}px,0)` }, { transform: 'translate3d(0,0,0)' },
    ], { duration: 320, easing: 'cubic-bezier(0.22,1,0.36,1)' });
  }, [calm]);
  const api = useMemo<ArenaApi>(() => ({ announce, shake, sfx }), [announce, shake]);
  const toggleSound = () => { const on = !sound; setSound(on); setSoundOn(on); if (on) { unlockAudio(); sfx('pick'); } };
  const toggleFull = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await root.current?.requestFullscreen(); } catch { /* not allowed */ } };

  if (!mounted) return null;
  return createPortal(
    <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={info.name}
      className="arena dark fixed inset-0 z-[160] flex flex-col overflow-hidden bg-[#08080a] text-zinc-100 outline-none"
      style={{ '--arena': info.color } as React.CSSProperties}>
      <div className="arena-glow pointer-events-none absolute inset-0" aria-hidden />
      <header className="relative z-10 flex h-14 shrink-0 items-center gap-3 px-3 sm:px-5">
        <button type="button" onClick={() => setAsking(true)} className="grid h-10 w-10 place-items-center rounded-full text-zinc-300 ring-1 ring-white/10 transition-[background-color,color] hover:bg-white/10 hover:text-white" aria-label="Leave the game">
          <X className="w-5 h-5" aria-hidden />
        </button>
        <GameIcon game={game} size="sm" />
        <span className="truncate text-sm font-semibold text-white">{info.name}</span>
        <div className="ms-auto flex items-center gap-1.5">
          <button type="button" onClick={toggleSound} aria-pressed={sound} aria-label="Sound" title={sound ? 'Sound on' : 'Sound off'}
            className="grid h-10 w-10 place-items-center rounded-full text-zinc-300 ring-1 ring-white/10 transition-[background-color,color] hover:bg-white/10 hover:text-white">
            {sound ? <Volume2 className="w-5 h-5" aria-hidden /> : <VolumeX className="w-5 h-5" aria-hidden />}
          </button>
          {typeof document !== 'undefined' && document.fullscreenEnabled && (
            <button type="button" onClick={() => void toggleFull()} aria-label={full ? 'Leave full screen' : 'Full screen'} title={full ? 'Leave full screen' : 'Full screen'}
              className="hidden h-10 w-10 place-items-center rounded-full text-zinc-300 ring-1 ring-white/10 transition-[background-color,color] hover:bg-white/10 hover:text-white sm:grid">
              {full ? <Minimize2 className="w-5 h-5" aria-hidden /> : <Maximize2 className="w-5 h-5" aria-hidden />}
            </button>
          )}
        </div>
      </header>

      <div className="relative z-0 flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6 sm:px-6">
          <div ref={body} className="arena-in mx-auto w-full max-w-6xl">
            <ArenaCtx.Provider value={api}>{children}</ArenaCtx.Provider>
          </div>
        </div>
        {side && <aside className="hidden w-72 shrink-0 overflow-y-auto border-s border-white/[0.06] p-4 lg:block">{side}</aside>}
      </div>

      {/* Announcements: big words in the middle that rise and fade. */}
      <div className="pointer-events-none absolute inset-x-0 top-[30%] z-20 flex justify-center px-4">
        <AnimatePresence>
          {notes.map((n) => (
            <motion.p key={n.id} initial={{ opacity: 0, scale: calm ? 1 : 0.85, y: calm ? 0 : 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, y: calm ? 0 : -18, scale: calm ? 1 : 1.04, transition: { duration: 0.22 } }} transition={spring.bouncy}
              className={cn('absolute whitespace-nowrap bg-gradient-to-br bg-clip-text text-center text-4xl font-black tracking-tight text-transparent drop-shadow-[0_6px_30px_rgba(0,0,0,0.6)] sm:text-6xl', TONE[n.tone])}>
              {n.text}
            </motion.p>
          ))}
        </AnimatePresence>
      </div>
      <p className="sr-only" aria-live="polite">{said}</p>

      <AnimatePresence>
        {asking && (
          <motion.div className="absolute inset-0 z-30 grid place-items-center bg-black/60 px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
            <motion.div role="alertdialog" aria-label="Leave the game?" initial={{ scale: calm ? 1 : 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.snappy}
              className="w-full max-w-sm rounded-[1.75rem] border border-white/10 bg-[#151517] p-6 text-center shadow-2xl">
              <p className="text-lg font-semibold text-white">Leave the game?</p>
              <p className="mt-1 text-sm text-zinc-400">A round you leave doesn’t count.</p>
              <div className="mt-5 flex justify-center gap-2">
                <button type="button" autoFocus onClick={() => setAsking(false)} className="btn-primary">Keep playing</button>
                <button type="button" onClick={onExit} className="btn-secondary">Leave</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
