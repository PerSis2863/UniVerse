'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { BookOpenCheck, Loader2, Square, Volume2 } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { readingLevel, speechRate } from '@/lib/display-prefs';
import { LEVELS, glossSegments, type Leveled, type Level, type Term } from '@/lib/reading-level';
import { speechSupported, useSpeech } from '@/lib/use-speech';
import { cn } from '@/lib/utils';

// Reading-level adapter (Stage 5 · D9; src/server/reading-level.ts): a text rewritten by AI for
// Grade 8 or Grade 5, with its key words explained, and read aloud by the device. The level a text
// opens at is the reader's choice in Settings → Appearance; the original is one tap away.

export type LevelKind = 'material-part' | 'assignment';
export type LevelChoice = 'original' | Level;
export const LEVEL_CHOICES: LevelChoice[] = ['original', 'g8', 'g5'];
export const choiceLabel = (l: LevelChoice) => (l === 'original' ? 'As written' : LEVELS[l].label);

/** Rewrites of these texts for a level, in their own language (to "") or another, by "kind:id". */
export async function fetchLevels(items: { kind: LevelKind; id: string }[], level: Level, to = '') {
  const r = await authedJson<{ levels?: Record<string, Leveled> }>('/api/reading-level', { method: 'POST', body: JSON.stringify({ items, level, to }) });
  return r.levels ?? {};
}

const once = { revalidateOnFocus: false, revalidateIfStale: false, revalidateOnReconnect: false, shouldRetryOnError: false };

/** One text at the reader's level (starting at their default); `lang` is the language it's shown in ("" its own). */
export function useReadingLevel(kind: LevelKind | null, id: string, lang: string) {
  const [level, setLevel] = useState<LevelChoice>(() => (kind ? readingLevel() : 'original'));
  const key = kind && level !== 'original' ? (['/api/reading-level', kind, id, level, lang] as const) : null;
  const { data, error, isLoading } = useSWR(key, async ([, k, i, l, to]) => {
    const got = (await fetchLevels([{ kind: k, id: i }], l, to))[`${k}:${i}`];
    if (!got) throw new Error('Couldn’t make a simpler version right now.');
    return got;
  }, once);
  const on = level !== 'original';
  return { level, setLevel, leveled: on ? data ?? null : null, error: on ? (error as unknown) : null, loading: on && isLoading };
}

/** A rewritten text with its key words marked, and what they mean under it. */
export function GlossedText({ text, terms, lang, className }: { text: string; terms: Term[]; lang?: string; className?: string }) {
  return (
    <>
      <p lang={lang} className={className}>
        {glossSegments(text, terms).map((p, i) => (p.term
          ? <dfn key={i} className="not-italic font-semibold underline decoration-dotted decoration-indigo-500 decoration-2 underline-offset-[3px]">{p.text}</dfn>
          : p.text))}
      </p>
      {terms.length > 0 && (
        <div lang={lang} className="mt-2 rounded-xl bg-indigo-500/[0.06] dark:bg-indigo-400/[0.08] px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Key words</p>
          <dl className="mt-1 space-y-1 text-[13px] leading-snug">
            {terms.map((t) => (
              <div key={t.term}><dt className="inline font-semibold text-zinc-900 dark:text-white">{t.term}</dt><span aria-hidden>: </span><dd className="inline text-zinc-700 dark:text-zinc-300">{t.meaning}</dd></div>
            ))}
          </dl>
        </div>
      )}
    </>
  );
}

/** Small "Reading level · As written · Grade 8 · Grade 5 · Listen" line under a text. */
export function ReadingLevelControl({ r, speakText, lang, className }: { r: ReturnType<typeof useReadingLevel>; speakText: string; lang?: string; className?: string }) {
  const speech = useSpeech();
  const pick = (l: LevelChoice) => { speech.stop(); r.setLevel(l); };
  const chip = (on: boolean) => cn('min-h-6 rounded-full px-2.5 font-semibold transition-colors', on ? 'bg-indigo-600 text-white' : 'text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10');
  return (
    <div className={cn('mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-zinc-500', className)}>
      <BookOpenCheck className="w-3 h-3 shrink-0" aria-hidden />
      <div role="group" aria-label="Reading level" className="inline-flex flex-wrap gap-1">
        {LEVEL_CHOICES.map((l) => <button key={l} type="button" aria-pressed={r.level === l} onClick={() => pick(l)} className={chip(r.level === l)}>{choiceLabel(l)}</button>)}
      </div>
      {speechSupported() && (
        <button type="button" onClick={() => (speech.speaking ? speech.stop() : speech.speak([speakText], { lang, rate: speechRate() }))} aria-pressed={speech.speaking} className={cn(chip(false), 'inline-flex items-center gap-1')}>
          {speech.speaking ? <><Square className="w-3 h-3" aria-hidden /> Stop</> : <><Volume2 className="w-3 h-3" aria-hidden /> Listen</>}
        </button>
      )}
      <span aria-live="polite" className="inline-flex items-center gap-1">
        {r.loading ? <><Loader2 className="w-3 h-3 animate-spin" aria-hidden /> Making it simpler…</>
          : r.error ? <span className="text-rose-600 dark:text-rose-400">{errorMessage(r.error, 'Couldn’t make a simpler version right now.')}</span>
          : r.leveled ? `Rewritten by AI for ${choiceLabel(r.level)}` : ''}
      </span>
    </div>
  );
}
