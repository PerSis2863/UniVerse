'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Bell, BellOff, Languages, Loader2, MessageCircleQuestion, RefreshCw, Send, Sparkles, Square, Volume2 } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { LANGUAGES } from '@/lib/languages';
import { fadeUp, spring } from '@/lib/motion';
import { DAYS, MAX_QUESTION, type WeekFacts } from '@/lib/parent-copilot';
import { useNow } from '@/lib/use-now';
import { speechSupported, useSpeech } from '@/lib/use-speech';
import { cn } from '@/lib/utils';

// The parent co-pilot (Stage 5 · D16), at the top of the parent app's Schoolwork tab: the child's
// week in the parent's language (written from the school's records, never messages; Listen reads it
// aloud with the device's own voice), questions answered from the same records, and when the weekly
// summary comes as a notification.

interface Asked { id: string; question: string; answer: string; used: string[]; at: string }
interface Week {
  child: string; week: string;
  prefs: { lang: string; weekly: boolean; weekday: number; hour: number };
  facts: WeekFacts; line: string; quiet: boolean;
  summary: { text: string; ai: boolean; at: string } | null;
  questions: Asked[]; asksLeft: number;
}

/** The device's date (YYYY-MM-DD), time zone and language (when it's one we translate into). */
function device() {
  const d = new Date();
  const lang = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    lang: Object.hasOwn(LANGUAGES, lang) ? lang : 'en',
  };
}

export function ParentCopilot({ studentId }: { studentId: string }) {
  const [dev] = useState(device);
  const key = `/api/parent/week?studentId=${encodeURIComponent(studentId)}&date=${dev.date}&tz=${encodeURIComponent(dev.tz)}&lang=${dev.lang}`;
  const { data, error, mutate } = useSWR<Week>(key, authedJson, { revalidateOnFocus: false });
  const [making, setMaking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const speech = useSpeech();
  const now = useNow();
  const tried = useRef<string | null>(null);
  const lang = data?.prefs.lang ?? dev.lang;

  const post = (body: Record<string, unknown>) => authedJson<Record<string, unknown>>('/api/parent/week', { method: 'POST', body: JSON.stringify({ ...body, studentId, date: dev.date, tz: dev.tz }) });
  const make = async (refresh = false) => {
    setMaking(true);
    setNote(null);
    try {
      const r = await post({ action: 'summary', refresh }) as { summary: Week['summary']; note?: string };
      if (r.note) setNote(r.note);
      await mutate((d) => (d ? { ...d, summary: r.summary } : d), { revalidate: false });
    } catch (e) { setNote(errorMessage(e, 'Couldn’t write the summary right now.')); }
    finally { setMaking(false); }
  };
  // The first time this week (and language) the summary is opened, it's written straight away.
  useEffect(() => {
    if (!data || data.summary || tried.current === `${studentId}-${data.prefs.lang}`) return;
    const t = setTimeout(() => { tried.current = `${studentId}-${data.prefs.lang}`; void make(); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per child and language
  }, [data, studentId]);

  const setPrefs = async (patch: Partial<Week['prefs']>, done?: string) => {
    const before = data;
    void mutate((d) => (d ? { ...d, prefs: { ...d.prefs, ...patch } } : d), { revalidate: false });
    try {
      await post({ action: 'prefs', ...patch });
      if (done) toast.success(done);
      if (patch.lang) { speech.stop(); await mutate(); }
    } catch (e) { void mutate(before, { revalidate: false }); toast.error(errorMessage(e, 'Couldn’t save that.')); }
  };
  const ask = async () => {
    const q = question.trim();
    if (q.length < 3) return;
    setAsking(true);
    try {
      const r = await post({ action: 'ask', question: q }) as { question: Asked; asksLeft: number };
      setQuestion('');
      await mutate((d) => (d ? { ...d, asksLeft: r.asksLeft, questions: [r.question, ...d.questions.filter((x) => x.id !== r.question.id)].slice(0, 5) } : d), { revalidate: false });
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t answer right now.')); }
    finally { setAsking(false); }
  };
  const listen = (text: string) => (speech.speaking ? speech.stop() : speech.speak([text], { lang }));

  if (error && !data) return null; // the schoolwork below still shows
  if (!data) return <div className="h-44 rounded-3xl skeleton mb-4" />;
  const s = data.summary;
  const child = data.child;
  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" aria-labelledby="week-title" className="mb-4 rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="week-title" className="text-lg font-black text-zinc-900 dark:text-white flex items-center gap-2"><Sparkles className="w-5 h-5 text-teal-600 dark:text-teal-300" aria-hidden />{child}’s week</h2>
          {data.line && <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">{data.line}</p>}
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
          <Languages className="w-4 h-4" aria-hidden />
          <select value={lang} onChange={(e) => void setPrefs({ lang: e.target.value })} aria-label="Your language" className="bg-transparent text-sm font-semibold text-zinc-800 dark:text-zinc-100 outline-none min-h-9">
            {Object.entries(LANGUAGES).map(([code, l]) => <option key={code} value={code}>{l.native}</option>)}
          </select>
        </label>
      </div>

      <div aria-live="polite">
        {s ? (
          <>
            <p className="text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-100 whitespace-pre-line" lang={s.ai ? lang : 'en'}>{s.text}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {speechSupported() && (
                <button type="button" onClick={() => listen(s.text)} aria-pressed={speech.speaking} className="btn-secondary btn-sm">{speech.speaking ? <><Square className="w-4 h-4" />Stop</> : <><Volume2 className="w-4 h-4" />Listen</>}</button>
              )}
              {now - new Date(s.at).getTime() > 86_400_000 && <button type="button" onClick={() => void make(true)} disabled={making} className="btn-ghost btn-sm">{making ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}Update</button>}
            </div>
          </>
        ) : making ? (
          <p className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Writing {child}’s week in {LANGUAGES[lang]?.native ?? 'your language'}…</p>
        ) : (
          <button type="button" onClick={() => void make()} className="btn-primary btn-sm"><Sparkles className="w-4 h-4" />Write {child}’s week</button>
        )}
        {note && <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">{note}</p>}
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">Written from the school’s records: grades, attendance and work due. Never from messages.</p>
      </div>

      <div className="pt-3 border-t border-zinc-200/70 dark:border-white/10 space-y-3">
        <form onSubmit={(e) => { e.preventDefault(); void ask(); }} className="space-y-2">
          <label htmlFor="ask-child" className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5"><MessageCircleQuestion className="w-4 h-4 text-indigo-600 dark:text-indigo-300" aria-hidden />Ask about {child}</label>
          <div className="flex gap-2">
            <input id="ask-child" value={question} onChange={(e) => setQuestion(e.target.value.slice(0, MAX_QUESTION))} placeholder={`e.g. How is ${child} doing in maths?`} className="input flex-1 min-h-11" disabled={asking || data.asksLeft === 0} />
            <motion.button whileTap={{ scale: 0.92 }} transition={spring.snappy} type="submit" disabled={asking || question.trim().length < 3 || data.asksLeft === 0} aria-label="Ask" className="w-11 h-11 shrink-0 rounded-full bg-gradient-to-br from-indigo-600 to-teal-600 text-white grid place-items-center disabled:opacity-40">
              {asking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </motion.button>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">{data.asksLeft === 0 ? 'That’s today’s questions. Ask again tomorrow, or write to a teacher in Messages.' : `Answered from the records, in your language. ${data.asksLeft} question${data.asksLeft === 1 ? '' : 's'} left today.`}</p>
        </form>
        <AnimatePresence initial={false}>
          {data.questions.length > 0 && (
            <ul className="space-y-3" aria-label="Your questions">
              {data.questions.map((q) => (
                <motion.li key={q.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-1.5">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">{q.question}</p>
                  <div className="rounded-2xl rounded-tl-md bg-teal-500/10 px-3.5 py-2.5">
                    <p className="text-sm text-zinc-800 dark:text-zinc-100 whitespace-pre-line" lang={lang}>{q.answer}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {q.used.length > 0 && <span className="text-[11px] text-zinc-600 dark:text-zinc-400">From: {q.used.join(', ')}</span>}
                      {speechSupported() && <button type="button" onClick={() => listen(q.answer)} className="text-[11px] font-semibold text-teal-800 dark:text-teal-300 inline-flex items-center gap-1"><Volume2 className="w-3.5 h-3.5" aria-hidden />Listen</button>}
                    </div>
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </AnimatePresence>
      </div>

      <div className="pt-3 border-t border-zinc-200/70 dark:border-white/10 flex flex-wrap items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <button type="button" onClick={() => void setPrefs({ weekly: !data.prefs.weekly }, data.prefs.weekly ? 'No more weekly notifications' : 'You’ll get a notification each week')} aria-pressed={data.prefs.weekly}
          className={cn('btn-sm', data.prefs.weekly ? 'btn-secondary' : 'btn-ghost')}>{data.prefs.weekly ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}{data.prefs.weekly ? 'Weekly notification on' : 'Weekly notification off'}</button>
        {data.prefs.weekly && (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <select value={data.prefs.weekday} onChange={(e) => void setPrefs({ weekday: Number(e.target.value) })} aria-label="Day" className="input text-sm !w-auto !py-1.5">
              {DAYS.map((d, i) => <option key={d} value={i}>{d}s</option>)}
            </select>
            <span>at</span>
            <select value={data.prefs.hour} onChange={(e) => void setPrefs({ hour: Number(e.target.value) })} aria-label="Time" className="input text-sm !w-auto !py-1.5">
              {Array.from({ length: 16 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </span>
        )}
      </div>
    </motion.section>
  );
}
