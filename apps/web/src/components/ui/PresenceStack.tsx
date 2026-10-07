'use client';

import { AnimatePresence, m as motion } from 'framer-motion';
import { spring } from '@/lib/motion';

// Who else is here (Stage 4 · 3.8): overlapping initials in each person's cursor colour, for
// documents and code rooms (boards show their own avatars). Comes from the room's Yjs awareness.

export interface Present { name: string; color: string }

export function PresenceStack({ people, max = 4 }: { people: Present[]; max?: number }) {
  // The same person in two tabs shows once.
  const unique = people.filter((p, i, all) => all.findIndex((x) => x.name === p.name) === i);
  const shown = unique.slice(0, max);
  const label = unique.length ? `Here now: ${unique.map((p) => p.name).join(', ')}` : 'Only you';
  return (
    <span className="inline-flex items-center" role="group" aria-label={label} title={label}>
      <AnimatePresence initial={false}>
        {shown.map((p, i) => (
          <motion.span key={p.name} layout initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring.snappy}
            className="w-7 h-7 rounded-full text-[11px] font-bold text-white flex items-center justify-center ring-2 ring-white dark:ring-zinc-900 select-none" style={{ backgroundColor: p.color, marginLeft: i ? -8 : 0, zIndex: max - i }}>
            {p.name.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
          </motion.span>
        ))}
      </AnimatePresence>
      {unique.length > max && <span className="ml-1 text-[11px] font-semibold text-zinc-500">+{unique.length - max}</span>}
    </span>
  );
}
