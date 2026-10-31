'use client';

import { useState } from 'react';
import { m as motion, useReducedMotion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { LOOK_COLORS, LOOK_HATS, levelOf, type LookHat } from '@/lib/play';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// The player's level and looks (M37): XP from every round of every game raises the level, and new
// colours and hats unlock for the 3D worlds' character. The chosen look stays on this device.

export interface Look { color: string; hat: LookHat }
const KEY = 'uv-look';
const DEFAULT: Look = { color: 'pink', hat: 'none' };

export function readLook(): Look {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Look> | null;
    return { color: LOOK_COLORS.some((c) => c.id === v?.color) ? v!.color! : DEFAULT.color, hat: LOOK_HATS.some((h) => h.id === v?.hat) ? v!.hat! : DEFAULT.hat };
  } catch { return DEFAULT; }
}
/** The look's body colour as a number for three.js. */
export const lookHex = (look: Look) => parseInt((LOOK_COLORS.find((c) => c.id === look.color) ?? LOOK_COLORS[0]).hex.slice(1), 16);

export function PlayerCard({ xp }: { xp: number }) {
  const { level, into, need } = levelOf(xp);
  const calm = useReducedMotion();
  const [look, setLook] = useState<Look>(() => (typeof window === 'undefined' ? DEFAULT : readLook()));
  const pick = (next: Look) => { setLook(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ } };
  const hex = (LOOK_COLORS.find((c) => c.id === look.color) ?? LOOK_COLORS[0]).hex;
  return (
    <section className="panel relative overflow-hidden p-5 sm:p-6" aria-labelledby="player-title">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <motion.div key={`${look.color}-${look.hat}`} initial={{ scale: calm ? 1 : 0.92, rotate: calm ? 0 : -4 }} animate={{ scale: 1, rotate: 0 }} transition={spring.bouncy} className="mx-auto shrink-0 sm:mx-0">
          <Blocky color={hex} hat={look.hat} />
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <h2 id="player-title" className="text-lg font-semibold text-zinc-900 dark:text-white">Your player</h2>
            <span className="rounded-full bg-pink-600 px-2.5 py-0.5 text-sm font-black text-white tabular-nums">Level {level}</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10" role="progressbar" aria-label={`Level ${level}: ${into} of ${need} XP to the next level`} aria-valuemin={0} aria-valuemax={need} aria-valuenow={into}>
            <div className="h-full w-full origin-left rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500 transition-transform duration-700 rtl:origin-right" style={{ transform: `scaleX(${into / need})` }} />
          </div>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{into.toLocaleString('en')} / {need.toLocaleString('en')} XP to level {level + 1} · every round of every game counts</p>
          <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
            {LOOK_COLORS.map((c) => {
              const locked = c.level > level, on = look.color === c.id;
              return (
                <button key={c.id} type="button" role="radio" aria-checked={on} disabled={locked} onClick={() => pick({ ...look, color: c.id })} title={locked ? `Unlocks at level ${c.level}` : c.id}
                  className={cn('relative grid h-9 w-9 place-items-center rounded-full ring-2 transition-transform duration-150 active:scale-95', on ? 'ring-pink-500 ring-offset-2 ring-offset-white dark:ring-offset-[#1d2650]' : 'ring-black/10 dark:ring-white/15', locked && 'opacity-45')}
                  style={{ background: c.hex }}>
                  <span className="sr-only">{c.id}{locked ? `, unlocks at level ${c.level}` : ''}</span>
                  {locked && <Lock className="h-3.5 w-3.5 text-white drop-shadow" aria-hidden />}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Hat">
            {LOOK_HATS.map((h) => {
              const locked = h.level > level, on = look.hat === h.id;
              return (
                <button key={h.id} type="button" role="radio" aria-checked={on} disabled={locked} onClick={() => pick({ ...look, hat: h.id })}
                  className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors duration-150', on ? 'bg-zinc-900 text-white ring-zinc-900 dark:bg-white dark:text-zinc-900 dark:ring-white' : 'bg-transparent text-zinc-700 ring-zinc-300 dark:text-zinc-200 dark:ring-white/20', locked && 'opacity-55')}>
                  {locked && <Lock className="h-3 w-3" aria-hidden />}{h.name}{locked && <span className="font-normal">· lvl {h.level}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/** The character, flat (the 3D one wears the same colour and hat). */
function Blocky({ color, hat }: { color: string; hat: LookHat }) {
  return (
    <svg viewBox="0 0 80 110" className="h-28 w-20" aria-hidden>
      <rect x="22" y="70" width="16" height="32" rx="3" fill="#1f2937" /><rect x="42" y="70" width="16" height="32" rx="3" fill="#1f2937" />
      <rect x="18" y="38" width="44" height="34" rx="4" fill={color} />
      <rect x="6" y="38" width="12" height="32" rx="3" fill="#f5c9a0" /><rect x="62" y="38" width="12" height="32" rx="3" fill="#f5c9a0" />
      <rect x="27" y="12" width="26" height="26" rx="4" fill="#f5c9a0" />
      <rect x="33" y="20" width="4" height="6" fill="#111" /><rect x="43" y="20" width="4" height="6" fill="#111" />
      <path d="M34 30 Q40 34 46 30" stroke="#111" strokeWidth="2" fill="none" strokeLinecap="round" />
      {hat === 'cap' && <><rect x="25" y="6" width="30" height="9" rx="3" fill="#fe81d1" /><rect x="45" y="12" width="16" height="4" rx="2" fill="#a32c7b" /></>}
      {hat === 'antenna' && <><line x1="40" y1="12" x2="40" y2="1" stroke="#94a3b8" strokeWidth="2" /><circle cx="40" cy="2" r="3" fill="#22d3ee" /></>}
      {hat === 'tophat' && <><rect x="29" y="-6" width="22" height="16" fill="#111827" /><rect x="24" y="9" width="32" height="4" fill="#111827" /><rect x="29" y="5" width="22" height="3" fill="#fe81d1" /></>}
      {hat === 'crown' && <path d="M27 12 L27 2 L33 8 L40 0 L47 8 L53 2 L53 12 Z" fill="#facc15" />}
      {hat === 'halo' && <ellipse cx="40" cy="4" rx="14" ry="3.5" fill="none" stroke="#fde68a" strokeWidth="3" />}
      {hat === 'horns' && <><path d="M29 13 Q22 4 26 0 Q28 8 33 11 Z" fill="#dc2626" /><path d="M51 13 Q58 4 54 0 Q52 8 47 11 Z" fill="#dc2626" /></>}
    </svg>
  );
}
