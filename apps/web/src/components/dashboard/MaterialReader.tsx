'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { BookOpen, Languages, Loader2, Pencil, Square, Volume2, Wand2, X } from 'lucide-react';
import { GlossedText, LEVEL_CHOICES, LevelEditor, LevelSource, choiceLabel, fetchLevels, type LevelChoice } from '@/components/shared/ReadingLevel';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { SPEECH_RATES, readingLevel, setSpeechRate, speechRate } from '@/lib/display-prefs';
import { LANGUAGES, isLanguage, languageName } from '@/lib/languages';
import { spring } from '@/lib/motion';
import type { Leveled, Level } from '@/lib/reading-level';
import { speechSupported, useSpeech } from '@/lib/use-speech';
import { useLanguageStore } from '@/store/language';
import { cn } from '@/lib/utils';

// A course material as text, in your language (Stage 5 · D8, language-free classroom) and at your
// reading level (D9). The text is what the AI tutor read from the file; sections are translated or
// rewritten (Grade 8 / Grade 5, key words explained) a few at a time and cached for everyone
// (src/server/text-translate.ts, src/server/reading-level.ts). Listen reads it aloud on the device.
// The teacher can prepare both levels for everyone in one go. The original is one tap away.

type Read = { title: string; status: string; error?: string | null; sourceId: string | null; sections: string[]; canPrepare: boolean; canManage?: boolean };
type Result = { text: string; from: string; same: boolean };
type Progress = { done: number; total: number };
const BATCH = 3;
const RATE_LABEL: Record<number, string> = { 0.8: 'Slow', 1: 'Normal', 1.25: 'Fast' };

export function MaterialReader({ courseId, materialId, title, onClose }: { courseId: string; materialId: string; title: string; onClose: () => void }) {
  const key = `/api/courses/${courseId}/materials/${materialId}/read`;
  const app = useLanguageStore((s) => s.language);
  const to = isLanguage(app) ? app : 'en';
  const [translated, setTranslated] = useState<Record<number, Result>>({});
  const [mode, setMode] = useState<'original' | 'translated'>('original');
  const [level, setLevel] = useState<LevelChoice>(readingLevel);
  /** Rewrites by "level|lang" ("" its own language), then by section. */
  const [leveled, setLeveled] = useState<Record<string, Record<number, Leveled>>>({});
  const [working, setWorking] = useState<null | ({ what: 'translate' | 'level' } & Progress)>(null);
  const [prep, setPrep] = useState<Progress | null>(null);
  const [preparing, setPreparing] = useState(false);
  /** The section whose simpler version the teacher is correcting. */
  const [editing, setEditing] = useState<number | null>(null);
  const [rate, setRate] = useState(speechRate);
  const speech = useSpeech();
  /** Each new choice starts a new run; older loops stop (and all of them when the reader closes). */
  const run = useRef(0);
  const have = useRef<Record<string, Set<number>>>({});
  const open = useRef(true);
  const started = useRef(false);
  useEffect(() => { open.current = true; return () => { open.current = false; }; }, []);

  /** Rewrites the sections not yet rewritten for this level and language, a few per request. */
  const levelSections = async (d: Read, l: Level, lang: string, still: () => boolean, onProgress: (p: Progress) => void) => {
    const k = `${l}|${lang}`;
    const mine = (have.current[k] ??= new Set());
    const todo = d.sections.map((_, i) => i).filter((i) => !mine.has(i));
    onProgress({ done: d.sections.length - todo.length, total: d.sections.length });
    for (let i = 0; i < todo.length && still(); i += BATCH) {
      // Taken while asked for, so another run (e.g. the teacher preparing both levels) doesn't ask twice.
      const part = todo.slice(i, i + BATCH).filter((n) => !mine.has(n));
      for (const n of part) mine.add(n);
      let r: Record<string, Leveled>;
      try { r = part.length ? (await fetchLevels(part.map((n) => ({ kind: 'material-part' as const, id: `${d.sourceId}.${n}` })), l, lang)).levels : {}; }
      catch (e) { for (const n of part) mine.delete(n); throw e; }
      const got: Record<number, Leveled> = {};
      for (const n of part) { const x = r[`material-part:${d.sourceId}.${n}`]; if (x) got[n] = x; else mine.delete(n); }
      setLeveled((s) => ({ ...s, [k]: { ...s[k], ...got } }));
      onProgress({ done: d.sections.length - todo.length + Math.min(i + BATCH, todo.length), total: d.sections.length });
    }
  };

  const showLevel = async (d: Read, l: Level, lang: string) => {
    if (!d.sourceId) return;
    const id = ++run.current;
    try {
      await levelSections(d, l, lang, () => open.current && run.current === id, (p) => { if (run.current === id) setWorking({ what: 'level', ...p }); });
      if (run.current === id && (have.current[`${l}|${lang}`]?.size ?? 0) < d.sections.length) toast('Some parts couldn’t be made simpler right now', { description: 'They’re shown as written. Try again later.' });
    } catch (e) { if (run.current === id) toast.error(errorMessage(e, 'Couldn’t make a simpler version right now.')); }
    finally { if (run.current === id) setWorking(null); }
  };

  const translateAll = async (d: Read) => {
    if (!d.sourceId) return;
    const id = ++run.current;
    try {
      const todo = d.sections.map((_, i) => i).filter((i) => !translated[i]);
      setWorking({ what: 'translate', done: d.sections.length - todo.length, total: d.sections.length });
      for (let i = 0; i < todo.length && open.current && run.current === id; i += BATCH) {
        const part = todo.slice(i, i + BATCH);
        const r = await authedJson<{ translations: Record<string, Result> }>('/api/translate', { method: 'POST', body: JSON.stringify({ to, items: part.map((n) => ({ kind: 'material-part', id: `${d.sourceId}.${n}` })) }) });
        const got: Record<number, Result> = {};
        for (const n of part) { const t = r.translations[`material-part:${d.sourceId}.${n}`]; if (t) got[n] = t; }
        setTranslated((s) => ({ ...s, ...got }));
        if (run.current === id) setWorking({ what: 'translate', done: d.sections.length - todo.length + Math.min(i + BATCH, todo.length), total: d.sections.length });
      }
    } catch (e) { if (run.current === id) toast.error(errorMessage(e, 'Couldn’t translate this right now.')); }
    finally { if (run.current === id) setWorking(null); }
  };

  const { data, error, mutate } = useSWR<Read>(key, authedJson, {
    // Opening at the reader's default level (Settings → Appearance).
    onSuccess: (d) => {
      if (started.current || d.status !== 'READY' || level === 'original') return;
      started.current = true;
      void showLevel(d, level, '');
    },
  });

  /** What the reader shows: the language (original or the app's) and the level. */
  const choose = (m: 'original' | 'translated', l: LevelChoice) => {
    if (!data) return;
    speech.stop();
    run.current++;
    setWorking(null);
    setMode(m);
    setLevel(l);
    if (l !== 'original') void showLevel(data, l, m === 'translated' ? to : '');
    else if (m === 'translated') void translateAll(data);
  };

  // The teacher makes both levels (in the material's own language) for everyone, so students open them instantly.
  const prepareLevels = async () => {
    if (!data?.sourceId) return;
    setPrep({ done: 0, total: data.sections.length * 2 });
    try {
      let before = 0;
      for (const l of ['g8', 'g5'] as const) {
        if (!open.current) return;
        await levelSections(data, l, '', () => open.current, (p) => setPrep({ done: before + p.done, total: data.sections.length * 2 }));
        before += data.sections.length;
      }
      toast.success('Simpler versions are ready', { description: 'Grade 8 and Grade 5 versions now open instantly for everyone in the course.' });
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t prepare the simpler versions.')); }
    finally { setPrep(null); }
  };

  // The teacher saved their version of a section (or went back to the AI's: it's made again).
  const afterEdit = (i: number, v: Leveled | null) => {
    setEditing(null);
    if (!data || level === 'original') return;
    const k = `${level}|${lang}`;
    if (v) { setLeveled((x) => ({ ...x, [k]: { ...x[k], [i]: v } })); return; }
    have.current[k]?.delete(i);
    setLeveled((x) => { const rest = { ...x[k] }; delete rest[i]; return { ...x, [k]: rest }; });
    void showLevel(data, level, lang);
  };

  const prepare = async () => {
    setPreparing(true);
    try { await mutate(await authedJson<Read>(key, { method: 'POST' }), { revalidate: false }); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t read this file.')); }
    finally { setPreparing(false); }
  };

  const lang = mode === 'translated' ? to : '';
  const lv = level === 'original' ? null : leveled[`${level}|${lang}`] ?? {};
  const allSame = data?.sections.length ? data.sections.every((_, i) => translated[i]?.same) : false;
  const from = Object.values(translated).find((t) => !t.same)?.from;
  /** The text shown for section i, and its language when known. */
  const shown = (i: number, text: string) => {
    const L = lv?.[i];
    if (L) return { text: L.text, terms: L.terms, lang: lang || undefined, leveled: L };
    const t = translated[i];
    if (mode === 'translated' && level === 'original' && t && !t.same) return { text: t.text, terms: null, lang: to, leveled: null };
    return { text, terms: null, lang: undefined, leveled: null };
  };

  // Keeps the part being read aloud in view.
  useEffect(() => {
    if (speech.at === null) return;
    document.getElementById(`reader-part-${speech.at}`)?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [speech.at]);

  // Read aloud in the language shown: the app's when translated, else the original's if known (else the device's).
  const listen = (start = 0, r = rate) => {
    if (!data) return;
    speech.speak(data.sections.map((t, i) => shown(i, t).text), { from: start, lang: lang || (from && isLanguage(from) ? from : undefined), rate: r });
  };
  const pickRate = (r: number) => { setRate(r); setSpeechRate(r); if (speech.at !== null) listen(speech.at, r); };

  const status = working
    ? `${working.what === 'translate' ? 'Translating' : 'Making it simpler'}… ${working.done} of ${working.total} sections`
    : level !== 'original' && data?.sections.length && Object.keys(lv ?? {}).length === data.sections.length
      ? `Rewritten by AI for ${choiceLabel(level)}${mode === 'translated' ? `, in ${languageName(to)}` : ''}. Key words are explained under each part.`
      : mode === 'translated' && level === 'original' ? (allSame ? `It’s already in ${languageName(to)}.` : from && isLanguage(from) ? `Translated by AI from ${languageName(from)}` : '') : '';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-0 sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div role="dialog" aria-modal="true" aria-labelledby="reader-title" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={spring.smooth} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 sm:rounded-2xl w-full max-w-3xl h-full sm:h-[88vh] flex flex-col shadow-2xl">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 sheet-safe-top">
          <div className="min-w-0">
            <h3 id="reader-title" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 truncate"><BookOpen className="w-4 h-4 text-indigo-500 shrink-0" /> {title}</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Read it in your language and at your level, or listen. The original file is still the one that counts.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close reader" className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 shrink-0"><X className="w-5 h-5" /></button>
        </div>

        {data?.status === 'READY' && (
          <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Language" className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={mode === 'original'} onClick={() => choose('original', level)} className={cn('btn-sm', mode === 'original' ? 'btn-primary' : 'btn-secondary')}>Original</button>
                <button type="button" aria-pressed={mode === 'translated'} onClick={() => choose('translated', level)} className={cn('btn-sm', mode === 'translated' ? 'btn-primary' : 'btn-secondary')}>
                  {working?.what === 'translate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />} <span lang={to}>{LANGUAGES[to]?.native ?? languageName(to)}</span>
                </button>
              </div>
              {speechSupported() && (
                <div className="flex items-center gap-2 ms-auto">
                  <button type="button" onClick={() => (speech.speaking ? speech.stop() : listen())} aria-pressed={speech.speaking} className="btn-sm btn-secondary">
                    {speech.speaking ? <><Square className="w-4 h-4" /> Stop</> : <><Volume2 className="w-4 h-4" /> Listen</>}
                  </button>
                  <select aria-label="Reading speed" value={rate} onChange={(e) => pickRate(Number(e.target.value))} className="input py-1 h-8 w-auto text-xs">
                    {SPEECH_RATES.map((r) => <option key={r} value={r}>{RATE_LABEL[r]}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Reading level" className="flex flex-wrap gap-2">
                {LEVEL_CHOICES.map((l) => (
                  <button key={l} type="button" aria-pressed={level === l} onClick={() => choose(mode, l)} className={cn('btn-sm', level === l ? 'btn-primary' : 'btn-secondary')}>
                    {working?.what === 'level' && level === l ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{choiceLabel(l)}
                  </button>
                ))}
              </div>
              {data.canManage && (
                <button type="button" onClick={() => void prepareLevels()} disabled={!!prep} className="btn-sm btn-ghost ms-auto">
                  {prep ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} {prep ? `Preparing ${prep.done} of ${prep.total}` : 'Prepare simpler versions'}
                </button>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 min-h-4" aria-live="polite">{status}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 sm:p-6" role="region" aria-label="Text" tabIndex={0}>
          {error && !data ? <p className="text-sm text-rose-600 dark:text-rose-400">{errorMessage(error, 'Couldn’t open this.')}</p>
            : !data ? <div className="space-y-3">{[90, 80, 95, 70].map((w, i) => <div key={i} className="h-3 rounded-full skeleton" style={{ width: `${w}%` }} />)}</div>
            : data.status !== 'READY' ? (
              <div className="max-w-md mx-auto text-center py-10 space-y-3">
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {data.status === 'FAILED' ? (data.error ?? 'This file couldn’t be read.') : data.canPrepare ? 'This file hasn’t been read yet. Reading it takes a few seconds and lets everyone in the course read it in their language and at their level (and ask the AI tutor about it).' : 'This file can’t be shown as text yet. Ask your teacher, or download the original.'}
                </p>
                {data.canPrepare && data.status !== 'FAILED' && (
                  <button type="button" onClick={() => void prepare()} disabled={preparing} className="btn-primary">{preparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />} Read the file now</button>
                )}
              </div>
            ) : (
              <article className="max-w-prose mx-auto space-y-5">
                {data.sections.map((text, i) => {
                  const s = shown(i, text);
                  const waiting = level !== 'original' && !lv?.[i] && working?.what === 'level';
                  const cls = cn('text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-line transition-opacity', waiting && 'opacity-50');
                  return (
                    <div key={i} id={`reader-part-${i}`} className={cn('rounded-xl -mx-2 px-2 py-1 transition-colors', speech.at === i && 'bg-amber-500/10 ring-1 ring-amber-500/40')}>
                      {editing === i && s.leveled && level !== 'original' && data.sourceId ? (
                        <LevelEditor kind="material-part" id={`${data.sourceId}.${i}`} level={level} lang={lang} value={s.leveled} onCancel={() => setEditing(null)} onDone={(v) => afterEdit(i, v)} />
                      ) : s.terms ? <GlossedText text={s.text} terms={s.terms} lang={s.lang} className={cls} /> : <p lang={s.lang} className={cls}>{s.text}</p>}
                      {s.leveled && editing !== i && (s.leveled.edited || data.canManage) && (
                        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                          <LevelSource leveled={s.leveled} level={level} />
                          {data.canManage && <button type="button" onClick={() => setEditing(i)} className="btn-ghost btn-sm min-h-6 py-0.5"><Pencil className="w-3 h-3" /> Edit<span className="sr-only"> part {i + 1}</span></button>}
                        </p>
                      )}
                    </div>
                  );
                })}
              </article>
            )}
        </div>
      </motion.div>
    </motion.div>
  );
}
