'use client';

import { AnimatePresence, m as motion } from 'framer-motion';
import { Hand } from 'lucide-react';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Reactions in a call (cloudflare/worker.ts CallRoom: the same six, with a burst limit) and the
// raise-hand button. Emoji float up from the bottom of everyone's screen with the sender's name.

export const REACTIONS = ['👍', '👏', '❤️', '😂', '😮', '🎉'] as const;
export type Reaction = (typeof REACTIONS)[number];

export interface Floating { id: number; emoji: string; name: string; x: number }

/** The emoji rising up the screen. Each lives about three seconds. */
export function FloatingReactions({ items }: { items: Floating[] }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6rem)] top-1/3 z-20 overflow-hidden" aria-hidden>
      <AnimatePresence>
        {items.map((f) => (
          <motion.div key={f.id} className="absolute bottom-0 flex flex-col items-center" style={{ left: `${f.x}%` }}
            initial={{ y: 0, opacity: 0, scale: 0.6 }}
            animate={{ y: -320, opacity: [0, 1, 1, 0], scale: [0.6, 1.15, 1, 0.95], x: [0, 12, -10, 6] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 3, ease: 'easeOut', times: [0, 0.15, 0.75, 1] }}>
            <span className="text-4xl drop-shadow-lg">{f.emoji}</span>
            <span className="mt-0.5 text-[10px] font-semibold bg-black/50 backdrop-blur rounded-full px-1.5 py-0.5 text-white max-w-[7rem] truncate">{f.name}</span>
          </motion.div>
        ))}
      </AnimatePresence>
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
          <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 z-30" aria-hidden />
          <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] z-40 px-3 flex justify-center pointer-events-none">
            <motion.div key="bar" role="dialog" aria-label="Reactions" initial={{ opacity: 0, y: 16, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.94 }} transition={spring.snappy}
              className="pointer-events-auto flex items-center gap-1 rounded-full bg-[#121830]/95 backdrop-blur-2xl border border-white/10 shadow-2xl p-1.5">
              {REACTIONS.map((e, i) => (
                <motion.button key={e} type="button" onClick={() => onReact(e)} aria-label={`React ${e}`}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.snappy, delay: i * 0.025 }}
                  whileHover={{ scale: 1.2, y: -2 }} whileTap={{ scale: 0.85 }}
                  className="w-11 h-11 rounded-full text-2xl flex items-center justify-center hover:bg-white/10">{e}</motion.button>
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
