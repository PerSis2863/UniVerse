'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { ArrowDown, ArrowUp, EyeOff, LayoutGrid, Plus, RotateCcw } from 'lucide-react';
import { arrange, EMPTY_LAYOUT, hideCard, moveCard, showCard, type CardDef, type HomeLayout, type HomeRole } from '@/lib/home-layout';
import { fadeUp, spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// A home page's cards in the person's order (Stage 5 · Q8): across the top, then a wide and a
// narrow column (one column on phones). "Edit home" moves cards up and down, hides them and brings
// them back; it's saved for this person on every device.

export function HomeBoard({ role, layout, onSave, cards, afterTop }: {
  role: HomeRole;
  layout: HomeLayout;
  onSave: (l: HomeLayout) => void;
  /** Each card's content; null when it has nothing to show (it's left out). */
  cards: Record<string, ReactNode | null>;
  /** Shown under the top cards, never moved (the account setup reminder). */
  afterTop?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  // The cards further down draw a moment after the first ones: drawing every card in the tap that
  // opened Home took about half a second on a slow phone, before anything showed.
  const [rest, setRest] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRest(true), 250);
    return () => clearTimeout(t);
  }, []);
  const a = arrange(role, layout);
  const zoneSize = (c: CardDef) => a[c.zone].length;

  const frame = (c: CardDef, i: number) => {
    const content = cards[c.id] ?? null;
    if (!editing) return content == null ? null : <div key={c.id} className="min-w-0">{content}</div>;
    return (
      <motion.div key={c.id} layout transition={spring.snappy} className="min-w-0 rounded-3xl border-2 border-dashed border-indigo-400/60 dark:border-indigo-400/40 p-1.5">
        <div className="flex items-center gap-1 px-2 pb-1.5">
          <span className="text-sm font-semibold text-zinc-900 dark:text-white flex-1 truncate">{c.title}</span>
          <button type="button" aria-label={`Move ${c.title} up`} disabled={i === 0} onClick={() => onSave(moveCard(role, layout, c.id, -1))} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
          <button type="button" aria-label={`Move ${c.title} down`} disabled={i === zoneSize(c) - 1} onClick={() => onSave(moveCard(role, layout, c.id, 1))} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
          <button type="button" onClick={() => onSave(hideCard(role, layout, c.id))} className="btn-secondary btn-sm"><EyeOff className="w-3.5 h-3.5" />Hide</button>
        </div>
        {/* Visible but not clickable while arranging. */}
        <div inert className="opacity-60 pointer-events-none select-none max-h-72 overflow-hidden rounded-[20px]">
          {content ?? <p className="p-4 text-sm text-zinc-600 dark:text-zinc-400">Nothing to show here right now.</p>}
        </div>
      </motion.div>
    );
  };

  const top = a.top.map(frame).filter(Boolean);
  const main = a.main.map(frame).filter(Boolean).slice(0, rest || editing ? undefined : 2);
  const side = rest || editing ? a.side.map(frame).filter(Boolean) : [];
  const both = main.length > 0 && a.side.some((c) => cards[c.id] != null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2 -mb-2">
        {editing && (
          <button type="button" onClick={() => onSave({ ...EMPTY_LAYOUT, goal: layout.goal })} className="btn-secondary btn-sm"><RotateCcw className="w-3.5 h-3.5" />Reset</button>
        )}
        <button type="button" aria-pressed={editing} onClick={() => setEditing((v) => !v)} className={editing ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>
          <LayoutGrid className="w-3.5 h-3.5" />{editing ? 'Done' : 'Edit home'}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {editing && (
          <motion.div variants={fadeUp} initial="hidden" animate="show" exit="hidden" className="rounded-2xl border border-indigo-500/25 bg-indigo-500/[0.06] p-3 sm:p-4 space-y-2">
            <p className="text-sm text-zinc-800 dark:text-zinc-200">Move cards with the arrows and hide the ones you don’t need. Changes are saved straight away, on all your devices.</p>
            {a.hidden.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Hidden:</span>
                {a.hidden.map((c) => (
                  <button key={c.id} type="button" onClick={() => onSave(showCard(role, layout, c.id))} className="btn-secondary btn-sm"><Plus className="w-3.5 h-3.5" />{c.title}</button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {top}
      {afterTop}
      {(main.length > 0 || side.length > 0) && (
        <div className={cn('grid grid-cols-1 gap-6', both && 'xl:grid-cols-12')}>
          {main.length > 0 && <div className={cn('space-y-6 min-w-0', both && 'xl:col-span-8')}>{main}</div>}
          {side.length > 0 && <div className={cn('space-y-6 min-w-0', both && 'xl:col-span-4')}>{side}</div>}
        </div>
      )}
    </div>
  );
}
