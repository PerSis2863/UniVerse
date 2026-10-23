'use client';

import { useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Ear, HandMetal, X } from 'lucide-react';
import { spokenOnes, type Interpreters } from '@/lib/call-interp';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Interpreters (Stage 5 · B8.7): the hosts make someone a sign language or spoken interpreter;
// everyone chooses whether to hear the original or a spoken interpreter.

export function InterpretersSheet({ open, onClose, people, interp, canManage, listening, onAssign, onListen }: {
  open: boolean; onClose: () => void;
  people: { userId: string; name: string }[];
  interp: Interpreters; canManage: boolean; listening: string | null;
  onAssign: (userId: string, kind: 'sign' | 'spoken' | null, label: string) => void;
  onListen: (userId: string | null) => void;
}) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const spoken = spokenOnes(interp);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 z-30 bg-black/40" aria-hidden />
          <motion.div key="interp" role="dialog" aria-label="Interpretation" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 28 }} transition={spring.smooth}
            className="absolute z-40 inset-x-0 bottom-0 max-h-[85vh] rounded-t-3xl sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:bottom-auto sm:top-[calc(env(safe-area-inset-top)+4.5rem)] sm:w-[26rem] sm:max-h-[calc(100%-11rem)] sm:rounded-3xl bg-[#11212d]/95 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] sm:pb-0">
            <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
              <p className="font-semibold flex items-center gap-1.5"><Ear className="w-4 h-4 text-sky-300" aria-hidden />Interpretation</p>
              <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
              <section className="space-y-1.5" role="radiogroup" aria-label="Listen to">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Listen to</p>
                {[{ userId: null as string | null, label: 'The original', name: '' }, ...spoken].map((o) => (
                  <button key={o.userId ?? 'original'} type="button" role="radio" aria-checked={listening === o.userId} onClick={() => onListen(o.userId)}
                    className={cn('w-full text-start px-3 py-2 rounded-xl text-sm', listening === o.userId ? 'bg-white text-zinc-900 font-semibold' : 'bg-white/[0.06] hover:bg-white/10')}>
                    {o.label}{o.name ? <span className={listening === o.userId ? 'text-zinc-600' : 'text-zinc-400'}> · {o.name}</span> : null}
                  </button>
                ))}
                {!spoken.length && <p className="text-xs text-zinc-400">No spoken interpreter in this call yet.</p>}
              </section>
              {canManage && (
                <section className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Interpreters</p>
                  <p className="text-[11px] text-zinc-400">A sign language interpreter stays on everyone’s screen. People can choose to hear a spoken interpreter over everyone else.</p>
                  {people.map((p) => {
                    const now = interp[p.userId];
                    return (
                      <div key={p.userId} className="rounded-2xl bg-white/[0.04] p-2.5 space-y-1.5">
                        <p className="text-sm font-semibold truncate flex items-center gap-1.5">{p.name}{now && <span className="text-[10px] font-semibold rounded-full bg-sky-500/20 text-sky-200 px-1.5 py-0.5">{now.label}</span>}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <input value={labels[p.userId] ?? now?.label ?? ''} onChange={(e) => setLabels((l) => ({ ...l, [p.userId]: e.target.value.slice(0, 40) }))} placeholder="Language (e.g. BSL, Spanish)" aria-label={`Language for ${p.name}`} className="flex-1 min-w-0 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs" />
                          <button type="button" onClick={() => onAssign(p.userId, 'sign', labels[p.userId] ?? now?.label ?? '')} aria-pressed={now?.kind === 'sign'} className={cn('h-8 px-2.5 rounded-full text-xs font-semibold inline-flex items-center gap-1', now?.kind === 'sign' ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20')}><HandMetal className="w-3.5 h-3.5" aria-hidden />Sign</button>
                          <button type="button" onClick={() => onAssign(p.userId, 'spoken', labels[p.userId] ?? now?.label ?? '')} aria-pressed={now?.kind === 'spoken'} className={cn('h-8 px-2.5 rounded-full text-xs font-semibold inline-flex items-center gap-1', now?.kind === 'spoken' ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20')}><Ear className="w-3.5 h-3.5" aria-hidden />Spoken</button>
                          {now && <button type="button" onClick={() => onAssign(p.userId, null, '')} className="h-8 px-2 rounded-full text-xs text-rose-300 hover:bg-rose-500/10">Stop</button>}
                        </div>
                      </div>
                    );
                  })}
                  {!people.length && <p className="text-xs text-zinc-400">When others join, you can make one of them an interpreter.</p>}
                </section>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
