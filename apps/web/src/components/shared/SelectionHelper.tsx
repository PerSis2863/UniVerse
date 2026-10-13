'use client';

import { useEffect, useRef, useState } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Loader2, Square, Volume2, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { speechRate } from '@/lib/display-prefs';
import { LEVELS, type Level, type Leveled } from '@/lib/reading-level';
import { spring } from '@/lib/motion';
import { speechSupported, useSpeech } from '@/lib/use-speech';
import { cn } from '@/lib/utils';
import { GlossedText } from './ReadingLevel';

// The bar for selected text (Stage 5 · D9; mounted by SelectionHelp when it's on in Settings →
// Appearance): Listen reads the selection aloud on the device; Grade 8 / Grade 5 shows it in simpler
// words with key words explained (POST /api/reading-level/text: one AI request, then kept for anyone
// who selects the same text). Not in text fields or editors, where selecting means editing.

const MAX = 2000;
const SKIP = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-no-select-help]';
const cache = new Map<string, Leveled>();

export default function SelectionHelper() {
  const [text, setText] = useState<string | null>(null);
  const [shown, setShown] = useState<{ level: Level; text: string; got: Leveled | null; error: string | null } | null>(null);
  const speech = useSpeech();
  const hide = useRef(0);

  useEffect(() => {
    let wait = 0;
    const read = () => {
      const sel = window.getSelection();
      const picked = sel && !sel.isCollapsed ? sel.toString().replace(/\s+\n/g, '\n').trim() : '';
      const node = sel?.anchorNode ?? null;
      const el = node ? (node.nodeType === 1 ? (node as Element) : node.parentElement) : null;
      if (picked.length >= 3 && el && !el.closest(SKIP)) { window.clearTimeout(hide.current); setText(picked); }
      // Kept a moment after the selection goes, so tapping the bar (which can clear it) still works.
      else if (!picked) hide.current = window.setTimeout(() => setText(null), 600);
    };
    const changed = () => { window.clearTimeout(wait); wait = window.setTimeout(read, 250); };
    document.addEventListener('selectionchange', changed);
    return () => { document.removeEventListener('selectionchange', changed); window.clearTimeout(wait); window.clearTimeout(hide.current); };
  }, []);

  const simpler = async (level: Level) => {
    if (!text) return;
    speech.stop();
    const key = `${level}|${text}`;
    const known = cache.get(key) ?? null;
    setShown({ level, text, got: known, error: null });
    if (known) return;
    try {
      const r = await authedJson<Partial<Leveled>>('/api/reading-level/text', { method: 'POST', body: JSON.stringify({ text, level }) });
      const got: Leveled = { text: r.text ?? text, terms: r.terms ?? [] };
      cache.set(key, got);
      setShown((s) => (s && s.text === text && s.level === level ? { ...s, got } : s));
    } catch (e) {
      setShown((s) => (s && s.text === text && s.level === level ? { ...s, error: errorMessage(e, 'Couldn’t make a simpler version right now.') } : s));
    }
  };
  const listen = (t: string) => (speech.speaking ? speech.stop() : speech.speak([t.slice(0, 20_000)], { rate: speechRate() }));
  const close = () => { speech.stop(); setShown(null); setText(null); };
  const long = (text?.length ?? 0) > MAX;
  const bar = 'fixed z-[70] left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] md:bottom-6';

  return (
    <AnimatePresence mode="wait" initial={false}>
      {shown ? (
        <motion.section key="result" data-no-select-help aria-labelledby="sel-help-title" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} transition={spring.smooth}
          className={cn(bar, 'sm:w-[28rem] max-h-[60vh] flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl')}>
          <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-zinc-200 dark:border-zinc-800">
            <h2 id="sel-help-title" className="flex-1 text-sm font-semibold text-zinc-900 dark:text-white">In simpler words · {LEVELS[shown.level].label}</h2>
            {speechSupported() && shown.got && (
              <button type="button" onClick={() => listen(shown.got!.text)} aria-pressed={speech.speaking} className="btn-ghost btn-sm">{speech.speaking ? <><Square className="w-4 h-4" /> Stop</> : <><Volume2 className="w-4 h-4" /> Listen</>}</button>
            )}
            <button type="button" onClick={close} aria-label="Close simpler version" className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="w-4 h-4" /></button>
          </div>
          <div className="overflow-y-auto px-4 py-3" role="region" aria-label="Simpler version" aria-live="polite" tabIndex={0}>
            {shown.error ? <p className="text-sm text-rose-600 dark:text-rose-400">{shown.error}</p>
              : !shown.got ? <p className="text-sm text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Making it simpler…</p>
              : <GlossedText text={shown.got.text} terms={shown.got.terms} className="text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-line" />}
          </div>
          <p className="px-4 pb-3 text-[11px] text-zinc-500 dark:text-zinc-400">Rewritten by AI; it can make mistakes. The text on the page is the original.</p>
        </motion.section>
      ) : text ? (
        <motion.div key="bar" data-no-select-help role="toolbar" aria-label="Selected text" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }} transition={spring.snappy}
          onPointerDown={(e) => e.preventDefault()}
          className={cn(bar, 'flex items-center justify-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl p-1.5')}>
          {speechSupported() && (
            <button type="button" onClick={() => listen(text)} aria-pressed={speech.speaking} className="btn-ghost btn-sm">{speech.speaking ? <><Square className="w-4 h-4" /> Stop</> : <><Volume2 className="w-4 h-4" /> Listen</>}</button>
          )}
          {(['g8', 'g5'] as const).map((l) => (
            <button key={l} type="button" onClick={() => void simpler(l)} disabled={long} title={long ? 'Select a shorter part (up to 2,000 characters) for simpler words' : `In simpler words (${LEVELS[l].label})`} className="btn-ghost btn-sm">{LEVELS[l].label}</button>
          ))}
          <button type="button" onClick={close} aria-label="Hide this bar" className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="w-4 h-4" /></button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
