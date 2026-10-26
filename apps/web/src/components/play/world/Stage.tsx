'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { MousePointer2, Users } from 'lucide-react';
import type { Button, Controls } from './core';
import type { Net } from '../useGameRoom';
import { RoomChat } from './RoomChat';
import { TouchPad } from './TouchPad';

// The frame every 3D world plays in: the canvas, the game's own overlays (its HUD), the phone
// controls, and on a computer a hint to click (the mouse then turns the camera; Esc frees it).

export function WorldFrame({ canvas, controls, buttons, keys, children, label, curtain, others = 0, net }: {
  canvas: React.RefObject<HTMLCanvasElement | null>; controls: React.RefObject<Controls | null>;
  buttons: { id: Button; label: string }[]; keys: string; label: string; children?: React.ReactNode;
  /** A title card between floors, worlds or stations (a new key shows it again). */
  curtain?: { key: number; title: string; sub?: string } | null;
  /** Other players in sight (rooms). */
  others?: number;
  /** In a room: chat and voice (M39). */
  net?: Net;
}) {
  const calm = useReducedMotion();
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const on = () => setLocked(!!document.pointerLockElement && document.pointerLockElement === canvas.current);
    document.addEventListener('pointerlockchange', on);
    return () => document.removeEventListener('pointerlockchange', on);
  }, [canvas]);
  return (
    <div className="relative h-[min(76vh,760px)] min-h-[420px] w-full select-none overflow-hidden rounded-[1.75rem] bg-black ring-1 ring-white/10">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full cursor-crosshair outline-none" tabIndex={0} aria-label={label} />
      {children}
      {others > 0 && <span className="pointer-events-none absolute bottom-16 end-4 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white ring-1 ring-white/15 [@media(pointer:coarse)]:bottom-auto [@media(pointer:coarse)]:top-[7.5rem]"><Users className="h-3.5 w-3.5" aria-hidden />{others} here with you</span>}
      <AnimatePresence>
        {curtain && (
          <motion.div key={curtain.key} className="pointer-events-none absolute inset-0 grid place-items-center bg-black" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: 2.2, times: [0, 0.18, 0.7, 1], ease: 'easeInOut' }}>
            <motion.div className="text-center" initial={{ opacity: 0, y: calm ? 0 : 18, letterSpacing: calm ? '0.04em' : '0.4em' }} animate={{ opacity: [0, 1, 1, 0], y: 0, letterSpacing: '0.04em' }} transition={{ duration: 2.2, times: [0, 0.3, 0.75, 1], ease: [0.16, 1, 0.3, 1] }}>
              <p className="text-4xl font-black uppercase text-white sm:text-6xl">{curtain.title}</p>
              {curtain.sub && <p className="mt-2 text-sm font-semibold uppercase tracking-[0.3em] text-zinc-300">{curtain.sub}</p>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <TouchPad controls={controls} buttons={buttons} />
      {net && <RoomChat net={net} frame={canvas} />}
      {!locked && (
        <p className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto hidden w-fit items-center gap-2 rounded-full bg-black/65 px-4 py-2 text-xs font-medium text-white ring-1 ring-white/15 [@media(pointer:fine)]:flex">
          <MousePointer2 className="h-3.5 w-3.5" aria-hidden />Click to look around · {keys}{net ? ' · Enter chat' : ''} · Esc frees the mouse
        </p>
      )}
    </div>
  );
}

/** A big number with a label, for the worlds' HUDs. */
export function HudChip({ label, value, tone = 'white' }: { label: string; value: React.ReactNode; tone?: 'white' | 'good' | 'bad' | 'gold' }) {
  const c = { white: 'text-white', good: 'text-emerald-300', bad: 'text-red-300', gold: 'text-amber-300' }[tone];
  return (
    <div className="rounded-2xl bg-black/55 px-3.5 py-2 ring-1 ring-white/15">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300">{label}</p>
      <p className={`text-xl font-black tabular-nums leading-tight ${c}`}>{value}</p>
    </div>
  );
}

/** A skill's charge as a ring with its key, glowing when ready. */
export function SkillRing({ label, keyName, charge, active }: { label: string; keyName: string; charge: number; active?: boolean }) {
  const C = 2 * Math.PI * 20, ready = charge >= 1;
  return (
    <div className={`flex items-center gap-2 rounded-2xl bg-black/55 px-3 py-2 ring-1 transition-shadow duration-300 ${ready || active ? 'ring-pink-400/70 shadow-[0_0_24px_rgba(236,72,153,0.5)]' : 'ring-white/15'}`}>
      <svg viewBox="0 0 48 48" className="h-10 w-10 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
        <circle cx="24" cy="24" r="20" fill="none" stroke={active ? '#fbbf24' : '#ec4899'} strokeWidth="5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, charge))} />
      </svg>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300">{label}</p>
        <p className="text-sm font-black text-white">{active ? 'Active!' : ready ? <>Ready · <kbd className="rounded bg-white/15 px-1 font-mono text-xs">{keyName}</kbd></> : `${Math.round(charge * 100)}%`}</p>
      </div>
    </div>
  );
}

