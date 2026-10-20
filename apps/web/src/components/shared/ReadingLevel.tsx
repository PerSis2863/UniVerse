'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { BadgeCheck, BookOpenCheck, Loader2, Pencil, RotateCcw, Square, Volume2 } from 'lucide-react';
import { Field } from '@/components/ui/Field';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { readingLevel, speechRate } from '@/lib/display-prefs';
import { LEVELS, glossSegments, linesToTerms, termsToLines, type Leveled, type Level, type Term } from '@/lib/reading-level';
import { speechSupported, useSpeech } from '@/lib/use-speech';
import { cn } from '@/lib/utils';

// Reading-level adapter (Stage 5 · D9; src/server/reading-level.ts): a text rewritten by AI for
// Grade 8 or Grade 5, with its key words explained, and read aloud by the device. The level a text
// opens at is the reader's choice in Settings → Appearance; the original is one tap away. The
// course's teacher (or an announcement's author) can correct a rewrite: students then see
// "Checked by your teacher".

export type LevelKind = 'material-part' | 'assignment' | 'feedback' | 'announcement' | 'quiz-question';
export const isLevelKind = (k: string): k is LevelKind => ['material-part', 'assignment', 'feedback', 'announcement', 'quiz-question'].includes(k);
export type LevelChoice = 'original' | Level;
export const LEVEL_CHOICES: LevelChoice[] = ['original', 'g8', 'g5'];
export const choiceLabel = (l: LevelChoice) => (l === 'original' ? 'As written' : LEVELS[l].label);
type Got = { levels: Record<string, Leveled>; editable: string[] };

/** Rewrites of these texts for a level, in their own language (to "") or another, by "kind:id"; and which ones this person may correct. */
export async function fetchLevels(items: { kind: LevelKind; id: string }[], level: Level, to = ''): Promise<Got> {
  const r = await authedJson<Partial<Got>>('/api/reading-level', { method: 'POST', body: JSON.stringify({ items, level, to }) });
  return { levels: r.levels ?? {}, editable: r.editable ?? [] };
}

/** The teacher's corrected version, or (null) back to the AI's. */
export async function saveLevel(kind: LevelKind, id: string, level: Level, to: string, value: { text: string; terms: Term[] } | null) {
  if (!value) {
    await authedJson(`/api/reading-level?${new URLSearchParams({ kind, id, level, to })}`, { method: 'DELETE' });
    return null;
  }
  return authedJson<Leveled>('/api/reading-level', { method: 'PUT', body: JSON.stringify({ kind, id, level, to, ...value }) });
}

const once = { revalidateOnFocus: false, revalidateIfStale: false, revalidateOnReconnect: false, shouldRetryOnError: false };
/** Fetched together with another text (e.g. the next quiz questions), until they're shown. */
const early = new Map<string, { leveled: Leveled | null; editable: boolean }>();

export interface LevelOptions {
  /** Open at the reader's default level (Settings → Appearance). Off for lists, so nothing is rewritten unasked. */
  auto?: boolean;
  /** Ask for these too (same kind), so the next ones are ready. */
  also?: string[];
  /** The level, when the page keeps it (e.g. the same for every question of a quiz). */
  level?: LevelChoice;
  onLevel?: (l: LevelChoice) => void;
}

/** One text at the reader's level; `lang` is the language it's shown in ("" its own). */
export function useReadingLevel(kind: LevelKind | null, id: string, lang: string, o: LevelOptions = {}) {
  const [own, setOwn] = useState<LevelChoice>(() => (kind && o.auto !== false ? readingLevel() : 'original'));
  const level = o.level ?? own;
  const setLevel = (l: LevelChoice) => { setOwn(l); o.onLevel?.(l); };
  const key = kind && level !== 'original' ? (['/api/reading-level', kind, id, level, lang] as const) : null;
  const { data, error, isLoading, mutate } = useSWR(key, async ([, k, i, l, to]) => {
    const mark = (x: string) => `${k}:${x}:${l}:${to}`;
    const ready = early.get(mark(i));
    if (ready) { early.delete(mark(i)); if (ready.leveled) return ready; }
    const ids = [i, ...(o.also ?? []).filter((x) => x !== i && !early.has(mark(x)))].slice(0, 6);
    const r = await fetchLevels(ids.map((x) => ({ kind: k, id: x })), l, to);
    for (const x of ids.slice(1)) early.set(mark(x), { leveled: r.levels[`${k}:${x}`] ?? null, editable: r.editable.includes(`${k}:${x}`) });
    const got = r.levels[`${k}:${i}`];
    if (!got) throw new Error('Couldn’t make a simpler version right now.');
    return { leveled: got, editable: r.editable.includes(`${k}:${i}`) };
  }, once);
  const on = level !== 'original';
  return {
    kind, id, lang, level, setLevel,
    leveled: on ? data?.leveled ?? null : null,
    editable: on && !!data?.editable,
    error: on ? (error as unknown) : null,
    loading: on && isLoading,
    /** After the teacher saves (or resets: refetch). */
    replace: (v: Leveled | null) => (v ? mutate({ leveled: v, editable: true }, { revalidate: false }) : mutate()),
  };
}
export type ReadingLevelState = ReturnType<typeof useReadingLevel>;

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

/** Who wrote the version shown: the AI, or the AI checked by the teacher. */
export function LevelSource({ leveled, level }: { leveled: Leveled; level: LevelChoice }) {
  return leveled.edited
    ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300"><BadgeCheck className="w-3 h-3" aria-hidden /> {choiceLabel(level)}, checked by your teacher</span>
    : <>Rewritten by AI for {choiceLabel(level)}</>;
}

/** The teacher corrects a rewrite: the text, and its key words as "word: meaning" lines. */
export function LevelEditor({ kind, id, level, lang, value, onDone, onCancel }: {
  kind: LevelKind; id: string; level: Level; lang: string; value: Leveled; onDone: (v: Leveled | null) => void; onCancel: () => void;
}) {
  const [text, setText] = useState(value.text);
  const [lines, setLines] = useState(() => termsToLines(value.terms));
  const [busy, setBusy] = useState<'save' | 'reset' | null>(null);
  const quiz = kind === 'quiz-question';
  const run = async (what: 'save' | 'reset') => {
    setBusy(what);
    try {
      const v = await saveLevel(kind, id, level, lang, what === 'save' ? { text, terms: linesToTerms(lines) } : null);
      toast.success(what === 'save' ? 'Saved. Students see your version.' : 'Back to the AI’s version');
      onDone(v);
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t save it.')); }
    finally { setBusy(null); }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); void run('save'); }} className="mt-2 space-y-2 rounded-xl border border-indigo-500/30 p-3 bg-white dark:bg-zinc-900">
      <Field label={`${choiceLabel(level)} version`} hint="Students see this instead of the AI’s.">
        {(p) => <textarea {...p} className="input min-h-[7rem] text-sm" maxLength={12000} value={text} onChange={(e) => setText(e.target.value)} />}
      </Field>
      {!quiz && (
        <Field label="Key words" hint="One per line: word: what it means. Only words in the text are kept.">
          {(p) => <textarea {...p} className="input min-h-[4.5rem] text-sm" value={lines} onChange={(e) => setLines(e.target.value)} />}
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={!!busy || !text.trim()} className="btn-primary btn-sm">{busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>
        <button type="button" onClick={onCancel} disabled={!!busy} className="btn-secondary btn-sm">Cancel</button>
        {value.edited && <button type="button" onClick={() => void run('reset')} disabled={!!busy} className="btn-ghost btn-sm ms-auto">{busy === 'reset' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Use the AI’s version</button>}
      </div>
    </form>
  );
}

/** Small "As written · Grade 8 · Grade 5 · Listen" line under a text (and Edit for its teacher). */
export function ReadingLevelControl({ r, speakText, lang, className }: { r: ReadingLevelState; speakText: string; lang?: string; className?: string }) {
  const speech = useSpeech();
  const [editing, setEditing] = useState(false);
  const pick = (l: LevelChoice) => { speech.stop(); setEditing(false); r.setLevel(l); };
  const chip = (on: boolean) => cn('min-h-6 rounded-full px-2.5 font-semibold transition-colors', on ? 'bg-indigo-600 text-white' : 'text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10');
  return (
    <>
      <div className={cn('mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400', className)}>
        <BookOpenCheck className="w-3 h-3 shrink-0" aria-hidden />
        <div role="group" aria-label="Reading level" className="inline-flex flex-wrap gap-1">
          {LEVEL_CHOICES.map((l) => <button key={l} type="button" aria-pressed={r.level === l} onClick={() => pick(l)} className={chip(r.level === l)}>{choiceLabel(l)}</button>)}
        </div>
        {speechSupported() && (
          <button type="button" onClick={() => (speech.speaking ? speech.stop() : speech.speak([speakText], { lang, rate: speechRate() }))} aria-pressed={speech.speaking} className={cn(chip(false), 'inline-flex items-center gap-1')}>
            {speech.speaking ? <><Square className="w-3 h-3" aria-hidden /> Stop</> : <><Volume2 className="w-3 h-3" aria-hidden /> Listen</>}
          </button>
        )}
        {r.editable && r.leveled && !editing && (
          <button type="button" onClick={() => setEditing(true)} className={cn(chip(false), 'inline-flex items-center gap-1')}><Pencil className="w-3 h-3" aria-hidden /> Edit</button>
        )}
        <span aria-live="polite" className="inline-flex items-center gap-1">
          {r.loading ? <><Loader2 className="w-3 h-3 animate-spin" aria-hidden /> Making it simpler…</>
            : r.error ? <span className="text-rose-600 dark:text-rose-400">{errorMessage(r.error, 'Couldn’t make a simpler version right now.')}</span>
            : r.leveled ? <LevelSource leveled={r.leveled} level={r.level} /> : ''}
        </span>
      </div>
      {editing && r.leveled && r.kind && r.level !== 'original' && (
        <LevelEditor kind={r.kind} id={r.id} level={r.level} lang={r.lang} value={r.leveled} onCancel={() => setEditing(false)} onDone={(v) => { setEditing(false); void r.replace(v); }} />
      )}
    </>
  );
}
