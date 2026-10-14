'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { CheckCircle2, HelpCircle, Loader2, School, Send, ThumbsUp } from 'lucide-react';
import { Field } from '@/components/ui/Field';
import Link from '@/components/ui/Link';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp } from '@/lib/motion';
import { useLiveInterval } from '@/lib/realtime-client';
import { cn } from '@/lib/utils';

// Student's Live page → in-person class (Stage 5 · D7, src/server/classroom.ts): join with the code on
// the screen (scanning the QR opens this page with ?checkin=<code> and joins straight away), which
// takes attendance; then tell the teacher you're lost or following, and send questions.

type Current = { session: { id: string; startedAt: string; course: { id: string; code: string; name: string }; mood: 'LOST' | 'OK' | null; questions: { id: string; text: string; answeredAt: string | null; createdAt: string }[] } | null };
const KEY = '/api/classroom/current';

export function StudentClassroom() {
  const refreshInterval = useLiveInterval(30_000, 0);
  const { data, mutate } = useSWR<Current>(KEY, authedJson, { refreshInterval });
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [marked, setMarked] = useState<string | null>(null);
  const tried = useRef(false);

  const join = async (raw: string) => {
    setJoining(true);
    try {
      const r = await authedJson<{ course: { code: string }; attendance: string }>('/api/classroom/join', { method: 'POST', body: JSON.stringify({ code: raw }) });
      setMarked(r.attendance);
      setCode('');
      toast.success(`You’re in ${r.course.code}`, { description: r.attendance === 'LATE' ? 'Marked late in attendance.' : 'Marked present in attendance.' });
      await mutate();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t join the class.')); }
    finally { setJoining(false); }
  };

  // Opened from the QR code: join with its code once, then tidy the address.
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    const url = new URL(window.location.href);
    const fromQr = url.searchParams.get('checkin');
    if (!fromQr) return;
    url.searchParams.delete('checkin');
    window.history.replaceState(null, '', url.pathname + url.search);
    setTimeout(() => void join(fromQr), 0);
  });

  if (!data) return null;
  const s = data.session;
  if (!s) {
    const shown = code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
    return (
      <motion.form variants={fadeUp} initial="hidden" animate="show" onSubmit={(e) => { e.preventDefault(); void join(code); }} className="panel p-5 space-y-3" aria-labelledby="join-class-title">
        <h2 id="join-class-title" className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><School className="w-4 h-4 text-indigo-500" /> In class? Join on your phone</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Scan the QR code on the screen, or type the code under it. Joining marks you present.</p>
        <div className="flex gap-2 items-end">
          <Field label="Class code" className="flex-1">
            {(p) => <input {...p} className="input font-mono text-lg tracking-[0.2em] uppercase" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="ABC-234" value={shown} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} />}
          </Field>
          <button type="submit" disabled={joining || code.length !== 6} className="btn-primary">{joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <School className="w-4 h-4" />} Join</button>
        </div>
        {/* Stage 5 · D17: moving codes carry a note or quiz to phones with no internet */}
        <p className="text-xs text-zinc-600 dark:text-zinc-400">Teacher showing moving codes? <Link href="/student/offline?scan=1" className="font-medium text-indigo-700 dark:text-indigo-300 hover:underline">Scan them here</Link>, no internet needed.</p>
      </motion.form>
    );
  }
  return <InClass session={s} marked={marked} onChange={() => void mutate()} />;
}

function InClass({ session: s, marked, onChange }: { session: NonNullable<Current['session']>; marked: string | null; onChange: () => void }) {
  const [mood, setMood] = useState(s.mood);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const post = (body: object) => authedJson(`/api/classroom/${s.id}`, { method: 'POST', body: JSON.stringify(body) });

  const say = async (m: 'LOST' | 'OK') => {
    const next = mood === m ? null : m;
    setMood(next); // optimistic
    try { await post({ action: 'mood', mood: next }); }
    catch (e) { setMood(mood); toast.error(errorMessage(e, 'Couldn’t send that.')); }
  };
  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try { await post({ action: 'ask', text }); setText(''); toast.success('Question sent'); onChange(); }
    catch (err) { toast.error(errorMessage(err, 'Couldn’t send the question.')); }
    finally { setSending(false); }
  };

  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" className="panel p-5 space-y-4" aria-labelledby="in-class-title">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">● In class</p>
        <h2 id="in-class-title" className="text-lg font-semibold text-zinc-900 dark:text-white">{s.course.code} · {s.course.name}</h2>
        <p className="text-xs text-zinc-500 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> You’re checked in{marked === 'LATE' ? ' (late)' : ''}.</p>
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-900 dark:text-white mb-2">How’s it going?</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void say('LOST')} aria-pressed={mood === 'LOST'} className={cn('rounded-2xl border p-4 text-left transition-colors min-h-16', mood === 'LOST' ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-200 dark:border-white/10 hover:border-amber-400')}>
            <HelpCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <span className="block mt-1 font-semibold text-zinc-900 dark:text-white">I’m lost</span>
          </button>
          <button type="button" onClick={() => void say('OK')} aria-pressed={mood === 'OK'} className={cn('rounded-2xl border p-4 text-left transition-colors min-h-16', mood === 'OK' ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-200 dark:border-white/10 hover:border-emerald-400')}>
            <ThumbsUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span className="block mt-1 font-semibold text-zinc-900 dark:text-white">I’m following</span>
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Your teacher sees how many are lost, not who. It resets after five minutes.</p>
      </div>
      <form onSubmit={ask} className="space-y-2">
        <Field label="Ask a question" hint="Your teacher sees it without your name." count={text.length} max={500}>
          {(p) => <textarea {...p} className="input min-h-[4.5rem]" maxLength={500} placeholder="Why does the loop stop at n - 1?" value={text} onChange={(e) => setText(e.target.value)} />}
        </Field>
        <button type="submit" disabled={sending || text.trim().length < 3} className="btn-secondary btn-sm">{sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send</button>
      </form>
      {s.questions.length > 0 && (
        <ul className="space-y-1.5" aria-label="Your questions">
          {s.questions.map((q) => (
            <li key={q.id} className="text-sm flex items-start gap-2">
              {q.answeredAt ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden /> : <span className="w-4 h-4 mt-0.5 rounded-full border border-zinc-300 dark:border-white/20 shrink-0" aria-hidden />}
              <span className="text-zinc-700 dark:text-zinc-300"><span className="sr-only">{q.answeredAt ? 'Answered: ' : 'Not answered yet: '}</span>{q.text}</span>
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}
