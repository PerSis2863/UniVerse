'use client';

import { AnimatePresence, m as motion } from 'framer-motion';
import { Hand } from 'lucide-react';
import { spring, fadeIn, barPop } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Reactions in a call (cloudflare/worker.ts CallRoom: the same six, with a burst limit) and the
// raise-hand button. Emoji float up from the bottom of everyone's screen with the sender's name.

export const REACTIONS = ['👍', '👏', '❤️', '😂', '😮', '🎉'] as const;
export type Reaction = (typeof REACTIONS)[number];

export interface Floating { id: number; emoji: string; name: string; x: number }

/** The emoji rising up the screen. Each lives about three seconds. M342 (FaceTime's feel): bigger, on one smooth CSS
 *  curve the graphics chip runs (`react-rise` in globals.css, not framer-motion's x / y on the page's thread), each with
 *  its own little sway; 👏 and 🎉 throw a few small copies out as they appear (`react-spark`). */
const BURST = new Set(['👏', '🎉']);
export function FloatingReactions({ items }: { items: Floating[] }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6rem)] top-1/3 z-20 overflow-hidden" aria-hidden>
      {items.map((f) => {
        const sway = ((f.id * 37) % 21) - 10; // the same for this reaction on every render
        return (
          <div key={f.id} className="react-rise absolute bottom-0 flex flex-col items-center" style={{ left: `${f.x}%`, '--rx1': `${sway}px`, '--rx2': `${-sway * 0.7}px` } as React.CSSProperties}>
            <span className="relative text-5xl drop-shadow-[0_6px_12px_rgb(0_0_0/0.35)]">
              {f.emoji}
              {BURST.has(f.emoji) && [0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="react-spark absolute start-1/2 top-1/2 text-xl" style={{ '--dx': `${Math.round(Math.cos((i / 5) * 2 * Math.PI) * 46)}px`, '--dy': `${Math.round(Math.sin((i / 5) * 2 * Math.PI) * 46)}px`, animationDelay: `${i * 18}ms` } as React.CSSProperties}>{f.emoji}</span>
              ))}
            </span>
            <span className="mt-1 text-[11px] font-semibold bg-black/55 rounded-full px-2 py-0.5 text-white max-w-[8rem] truncate">{f.name}</span>
          </div>
        );
      })}
    </div>
  );
}

/** The reactions row above the controls, with "Raise hand" (on phones the hand lives here). */
export function ReactionBar({ open, onClose, onReact, hand, onHand }: {
  open: boolean; onClose: () => void; onReact: (emoji: Reaction) => void; hand: boolean; onHand: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="scrim" {...fadeIn} onClick={onClose} className="absolute inset-0 z-30" aria-hidden />
          <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] z-40 px-3 flex justify-center pointer-events-none">
            <motion.div key="bar" role="dialog" aria-label="Reactions" {...barPop}
              className="pointer-events-auto flex items-center gap-1 rounded-full bg-[#151517]/95 backdrop-blur-2xl border border-white/10 shadow-2xl p-1.5">
              {REACTIONS.map((e, i) => (
                <motion.button key={e} type="button" onClick={() => onReact(e)} aria-label={`React ${e}`}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.snappy, delay: i * 0.025 }}
                  whileHover={{ scale: 1.2, y: -2 }}
                  className="w-11 h-11 rounded-full text-2xl flex items-center justify-center hover:bg-white/10 active:scale-[0.85]">{e}</motion.button>
              ))}
              <span className="w-px h-7 bg-white/10 mx-1" />
              <button type="button" onClick={onHand} aria-pressed={hand}
                className={cn('h-11 px-4 rounded-full text-sm font-semibold inline-flex items-center gap-1.5 transition-colors', hand ? 'bg-amber-400 text-amber-950' : 'bg-white/10 hover:bg-white/20')}>
                <Hand className="w-4 h-4" />{hand ? 'Lower' : 'Raise'}<span className="hidden sm:inline">&nbsp;hand</span>
              </button>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
