'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Languages, Maximize2, Snail, Volume2, X } from 'lucide-react';
import { spring } from '@/lib/motion';
import { GROUPS, LANGUAGES, PHRASES, languageById, languageFor, type Language } from '@/lib/travel-phrases';
import { cn } from '@/lib/utils';

// M241: a trip's phrasebook (the trip page's Phrases part): the key phrases in the language of each country on the
// trip, read out by the browser's own voice (speechSynthesis: free, on the device), slower on request, and a big
// card to show someone. Loaded only when the part is opened (the phrases are data in src/lib/travel-phrases.ts).

type Shown = { text: string; say?: string; english: string };

export default function TripPhrases({ countries }: { countries: string[] }) {
  const found = useMemo(() => [...new Set(countries)].map((cc) => ({ cc, l: languageFor(cc) })), [countries]);
  const own = found.map((f) => f.l).filter((l): l is Language => !!l && l !== 'english').filter((l, i, a) => a.findIndex((x) => x.id === l.id) === i);
  const [pick, setPick] = useState<string | null>(null);
  const lang = (pick && languageById(pick)) || own[0] || LANGUAGES[0];
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [slow, setSlow] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  useEffect(() => {
    if (!canSpeak) return;
    const load = () => setVoices(speechSynthesis.getVoices());
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => { speechSynthesis.removeEventListener('voiceschanged', load); speechSynthesis.cancel(); };
  }, [canSpeak]);
  const voice = voices.find((v) => v.lang.replace('_', '-') === lang.tag) ?? voices.find((v) => v.lang.toLowerCase().startsWith(lang.tag.slice(0, 2)));
  const speak = (text: string) => {
    if (!canSpeak) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/ \/ .*$/, '')); // "Obrigado / Obrigada": the first
    u.lang = lang.tag; if (voice) u.voice = voice; u.rate = slow ? 0.65 : 0.95;
    speechSynthesis.speak(u);
  };
  const english = found.filter((f) => f.l === 'english').length;

  return (
    <div className="space-y-6">
      <section className="panel flex flex-wrap items-center gap-3 p-5" aria-label="Language">
        <Languages className="h-5 w-5 text-indigo-500" aria-hidden />
        <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Phrases in{' '}
          <select value={lang.id} onChange={(e) => setPick(e.target.value)} className="ms-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white">
            {own.length > 0 && <optgroup label="On this trip">{own.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>}
            <optgroup label="All">{LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
          </select>
        </label>
        <button type="button" aria-pressed={slow} onClick={() => setSlow((s) => !s)} className={cn('btn-sm inline-flex items-center gap-1.5', slow ? 'btn-primary' : 'btn-secondary')}><Snail className="h-4 w-4" aria-hidden />Slowly</button>
        <p className="basis-full text-xs text-zinc-500 dark:text-zinc-400">
          {!canSpeak ? 'This browser can’t read phrases aloud; show them instead.' : voice ? `Read aloud by this device’s ${lang.name} voice.` : `This device has no ${lang.name} voice, so it reads them as best it can. Add one in your phone’s settings (Accessibility → Spoken content, or Text-to-speech).`}
          {english > 0 && ` English is spoken where ${english === 1 ? 'one of the places is' : 'some places are'}.`}
          {!own.length && countries.length > 0 && !english && ' There’s no phrasebook for this trip’s language yet: pick another.'}
        </p>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {(Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map((g) => (
          <section key={g} className="panel p-5" aria-labelledby={`ph-${g}`}>
            <h3 id={`ph-${g}`} className="text-lg font-semibold text-zinc-900 dark:text-white">{GROUPS[g]}</h3>
            <ul className="mt-2 divide-y divide-zinc-200/70 dark:divide-white/10">
              {PHRASES.filter((p) => p[2] === g).map(([k, en]) => {
                const p = lang.phrases[k];
                return (
                  <li key={k} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{en}</p>
                      <p className="text-base font-semibold text-zinc-900 dark:text-white" lang={lang.tag} dir={lang.rtl ? 'rtl' : undefined} translate="no">{p.text}</p>
                      {p.say && <p className="text-sm text-zinc-600 dark:text-zinc-300" translate="no">{p.say}</p>}
                    </div>
                    {canSpeak && <button type="button" onClick={() => speak(p.text)} className="btn-ghost btn-sm p-2" aria-label={`Say “${en}” in ${lang.name}`}><Volume2 className="h-4 w-4" aria-hidden /></button>}
                    <button type="button" onClick={() => setShown({ ...p, english: en })} className="btn-ghost btn-sm p-2" aria-label={`Show “${en}” big`}><Maximize2 className="h-4 w-4" aria-hidden /></button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <section className="panel p-5" aria-labelledby="ph-numbers">
          <h3 id="ph-numbers" className="text-lg font-semibold text-zinc-900 dark:text-white">Numbers</h3>
          <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {lang.numbers.map((n, i) => (
              <li key={i}>
                <button type="button" onClick={() => speak(n.text)} disabled={!canSpeak} className="w-full rounded-xl bg-zinc-50 p-2 text-center dark:bg-white/[0.04]" aria-label={`${i + 1}: ${n.say ?? n.text}`}>
                  <span className="block text-xs tabular-nums text-zinc-500 dark:text-zinc-400" aria-hidden>{i + 1}</span>
                  <span className="block font-semibold text-zinc-900 dark:text-white" lang={lang.tag} translate="no" aria-hidden>{n.text}</span>
                  {n.say && <span className="block text-xs text-zinc-600 dark:text-zinc-300" aria-hidden>{n.say}</span>}
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <AnimatePresence>{shown && <ShowCard key={shown.text} shown={shown} lang={lang} onSpeak={() => speak(shown.text)} canSpeak={canSpeak} onClose={() => setShown(null)} />}</AnimatePresence>
    </div>
  );
}

/** The phrase across the whole screen, to show someone. */
function ShowCard({ shown, lang, canSpeak, onSpeak, onClose }: { shown: Shown; lang: Language; canSpeak: boolean; onSpeak: () => void; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <motion.div role="dialog" aria-modal="true" aria-label={`“${shown.english}” in ${lang.name}`} className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-white p-6 text-center dark:bg-zinc-950"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.18 }}>
      <motion.div initial={{ transform: 'scale(0.94)' }} animate={{ transform: 'scale(1)' }} transition={spring.snappy} className="max-w-3xl">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{shown.english}</p>
        <p className="mt-4 text-5xl font-semibold leading-tight text-zinc-900 sm:text-7xl dark:text-white" lang={lang.tag} dir={lang.rtl ? 'rtl' : undefined} translate="no">{shown.text}</p>
        {shown.say && <p className="mt-4 text-xl text-zinc-600 dark:text-zinc-300" translate="no">{shown.say}</p>}
      </motion.div>
      <div className="mt-10 flex gap-3">
        {canSpeak && <button type="button" onClick={onSpeak} className="btn-secondary inline-flex items-center gap-2"><Volume2 className="h-5 w-5" aria-hidden />Say it</button>}
        <button ref={close} type="button" onClick={onClose} className="btn-primary inline-flex items-center gap-2"><X className="h-5 w-5" aria-hidden />Close</button>
      </div>
    </motion.div>
  );
}
