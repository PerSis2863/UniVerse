'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { format, formatDistanceToNowStrict, isToday, isTomorrow } from 'date-fns';
import { CalendarClock, Check, ClipboardCheck, GraduationCap, ListChecks, Loader2, MessageCircle, Phone, Plus, Sparkles, Sun } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Avatar } from '@/components/chat/MessageBubble';
import { Switch } from '@/components/ui/Switch';
import { authedJson } from '@/lib/authed-fetch';
import { fadeUp, spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

// Daily brief on the home Overview (Stage 4 · 4.9; src/server/daily-brief.ts): today's classes,
// what's due soon, calls, chats waiting for a reply and (teachers) work to grade, from the records;
// above them, once a day, an AI summary with decisions from group chats and channels and suggested
// tasks that one tap adds to the planner. The morning push is switched on or off here.

interface AiBrief { summary: string; decisions: { text: string; where: string }[]; tasks: { title: string; when: 'today' | 'tomorrow'; why: string }[] }
interface Brief {
  day: string;
  classes: { courseId: string; code: string; name: string; start: string; end: string; type: string; room: string | null }[];
  due: { kind: 'work' | 'quiz' | 'task'; id: string; title: string; at: string; course: string | null; link: string }[];
  calls: { id: string; title: string; startAt: string; roomName: string; path: string | null; conversationId: string | null }[];
  waiting: { conversationId: string; name: string; avatar: string | null; isGroup: boolean; from: string; body: string; at: string; unread: boolean; question: boolean }[];
  toGrade: number;
  ai: AiBrief | null;
  aiOn: boolean;
  push: boolean;
  hour: number;
}

const card = 'rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';
const when = (iso: string) => { const d = new Date(iso); return `${isToday(d) ? 'today' : isTomorrow(d) ? 'tomorrow' : format(d, 'EEE')} ${format(d, 'HH:mm')}`; };
const KIND = { work: 'Assignment', quiz: 'Quiz', task: 'Task' } as const;

function Section({ icon: Icon, title, children }: { icon: typeof Sun; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 flex items-center gap-1.5 mb-1.5"><Icon className="w-3.5 h-3.5" />{title}</p>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

export function DailyBrief() {
  const role = useAuthStore((s) => s.user?.role);
  const router = useRouter();
  const [tz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const { data, error, mutate } = useSWR<Brief>(`/api/brief?tz=${encodeURIComponent(tz)}`, authedJson, { revalidateOnFocus: false });
  const [making, setMaking] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const autoTried = useRef(false);
  const inbox = role === 'ADMIN' ? '/admin/inbox' : role === 'TEACHER' ? '/teacher/inbox' : '/student/inbox';

  const makeAi = async () => {
    setMaking(true);
    setAiError(null);
    try {
      const r = await authedJson<{ ai: AiBrief | null }>('/api/brief', { method: 'POST', body: JSON.stringify({ action: 'ai', tz }) });
      await mutate((d) => (d ? { ...d, ai: r.ai } : d), { revalidate: false });
    } catch (e) { setAiError((e as Error).message); } finally { setMaking(false); }
  };
  // First open of the day: the AI brief straight away (later opens get the saved one, free).
  useEffect(() => {
    if (!data || data.ai || !data.aiOn || autoTried.current) return;
    if (!data.waiting.length && !data.due.length && !data.classes.length && !data.calls.length && !data.toGrade) return;
    const t = setTimeout(() => { autoTried.current = true; void makeAi(); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the brief first arrives
  }, [data]);

  const setPush = async (push: boolean, hour?: number) => {
    const before = data;
    void mutate((d) => (d ? { ...d, push, hour: hour ?? d.hour } : d), { revalidate: false });
    try {
      await authedJson('/api/brief', { method: 'POST', body: JSON.stringify({ action: 'prefs', push, hour: hour ?? data?.hour, tz }) });
      toast.success(push ? `Your day will come as a notification at ${hour ?? data?.hour ?? 7}:00` : 'No more morning notifications');
    } catch (e) { void mutate(before, { revalidate: false }); toast.error((e as Error).message); }
  };
  const addTask = async (t: AiBrief['tasks'][number]) => {
    setAdding(t.title);
    try {
      const r = await authedJson<{ boardId: string; already: boolean }>('/api/brief', { method: 'POST', body: JSON.stringify({ action: 'task', title: t.title, when: t.when, tz }) });
      setAdded((a) => ({ ...a, [t.title]: r.boardId }));
      toast.success(r.already ? 'Already in your planner' : 'Added to your planner', { action: { label: 'Open', onClick: () => router.push(`/tasks/${r.boardId}`) } });
    } catch (e) { toast.error((e as Error).message); } finally { setAdding(null); }
  };
  const addAll = async () => { for (const t of data?.ai?.tasks ?? []) if (!added[t.title]) await addTask(t); };

  if (error) return null;
  if (!data) return <div className={`${card} h-40 skeleton`} aria-hidden />;
  const empty = !data.classes.length && !data.due.length && !data.calls.length && !data.waiting.length && !data.toGrade;
  const pending = (data.ai?.tasks ?? []).filter((t) => !added[t.title]);

  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" className={`${card} p-4 sm:p-5 space-y-4`} aria-label="Your day">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-fuchsia-500 flex items-center justify-center text-white shadow-lg shadow-fuchsia-500/20 shrink-0"><Sun className="w-5 h-5" /></span>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-zinc-900 dark:text-white">Your day</h2>
          <p className="text-xs text-zinc-500">{format(new Date(`${data.day}T12:00:00`), 'EEEE d MMMM')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {data.push && (
            <select value={data.hour} onChange={(e) => void setPush(true, Number(e.target.value))} aria-label="Morning notification time"
              className="hidden sm:block h-8 rounded-lg bg-zinc-100 dark:bg-white/[0.07] px-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 outline-none">
              {[5, 6, 7, 8, 9, 10, 11].map((h) => <option key={h} value={h}>{h}:00</option>)}
            </select>
          )}
          <span className="text-xs text-zinc-500 hidden sm:inline">Each morning</span>
          <Switch checked={data.push} onChange={(v) => void setPush(v)} label="Get your day as a notification each morning" />
        </div>
      </div>

      {(data.ai || making || aiError) && (
        <div className="rounded-2xl bg-gradient-to-br from-indigo-500/[0.07] to-fuchsia-500/[0.07] border border-indigo-200/60 dark:border-indigo-400/15 p-3.5 space-y-3">
          {making && !data.ai ? (
            <p className="text-sm text-zinc-500 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Reading your day…</p>
          ) : aiError && !data.ai ? (
            <p className="text-sm text-zinc-500">{aiError} <button type="button" onClick={() => void makeAi()} className="font-semibold text-indigo-600 dark:text-indigo-300">Try again</button></p>
          ) : data.ai && (
            <>
              <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-100"><Sparkles className="inline w-3.5 h-3.5 -mt-0.5 mr-1 text-fuchsia-500" />{data.ai.summary}</p>
              {data.ai.decisions.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">Decided in your groups</p>
                  <ul className="space-y-1">
                    {data.ai.decisions.map((d, i) => (
                      <li key={i} className="text-sm text-zinc-700 dark:text-zinc-200 flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span>{d.text} <span className="text-xs text-zinc-500">· {d.where}</span></span></li>
                    ))}
                  </ul>
                </div>
              )}
              {data.ai.tasks.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Suggested for your planner</p>
                    {pending.length > 1 && <button type="button" onClick={() => void addAll()} disabled={!!adding} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 disabled:opacity-50">Add all</button>}
                  </div>
                  <ul className="space-y-1.5">
                    {data.ai.tasks.map((t) => {
                      const done = !!added[t.title];
                      return (
                        <li key={t.title} className="flex items-center gap-2.5">
                          <motion.button whileTap={{ scale: 0.88 }} type="button" onClick={() => void addTask(t)} disabled={done || adding === t.title} aria-label={done ? `${t.title}: added` : `Add “${t.title}” to your planner`}
                            className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors', done ? 'bg-emerald-500 text-white' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20')}>
                            <AnimatePresence mode="wait" initial={false}>
                              <motion.span key={done ? 'y' : adding === t.title ? 'l' : 'n'} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={spring.bouncy}>
                                {done ? <Check className="w-4 h-4" /> : adding === t.title ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                              </motion.span>
                            </AnimatePresence>
                          </motion.button>
                          <span className="min-w-0">
                            <span className={cn('block text-sm font-medium', done ? 'text-zinc-400 line-through' : 'text-zinc-900 dark:text-white')}>{t.title}</span>
                            <span className="block text-xs text-zinc-500">{t.when === 'today' ? 'Today' : 'Tomorrow'} · {t.why}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {empty ? (
        <p className="text-sm text-zinc-500">Nothing on today: no classes, nothing due and nobody waiting for you. Enjoy it.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {data.classes.length > 0 && (
            <Section icon={GraduationCap} title={`Classes today · ${data.classes.length}`}>
              {data.classes.map((c, i) => (
                <li key={`${c.courseId}-${i}`} className="text-sm flex gap-2">
                  <span className="font-mono text-xs text-zinc-500 pt-0.5 w-20 shrink-0">{c.start}–{c.end}</span>
                  <span className="min-w-0 truncate text-zinc-800 dark:text-zinc-100"><span className="font-semibold">{c.code}</span> {c.name}<span className="text-xs text-zinc-500"> · {c.type.toLowerCase()}{c.room ? ` · ${c.room}` : ''}</span></span>
                </li>
              ))}
            </Section>
          )}
          {data.due.length > 0 && (
            <Section icon={ListChecks} title={`Due soon · ${data.due.length}`}>
              {data.due.map((d) => (
                <li key={`${d.kind}-${d.id}`}>
                  <Link href={d.link} className="text-sm flex gap-2 rounded-lg -mx-1 px-1 py-0.5 hover:bg-zinc-100 dark:hover:bg-white/[0.05]">
                    <span className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-100">{d.title}<span className="text-xs text-zinc-500"> · {KIND[d.kind]}{d.course ? ` · ${d.course}` : ''}</span></span>
                    <span className={cn('text-xs shrink-0 pt-0.5', new Date(d.at) < new Date(`${data.day}T23:59:59`) ? 'text-rose-500 font-semibold' : 'text-zinc-500')}>{when(d.at)}</span>
                  </Link>
                </li>
              ))}
            </Section>
          )}
          {data.calls.length > 0 && (
            <Section icon={CalendarClock} title="Calls today">
              {data.calls.map((c) => (
                <li key={c.id}>
                  <Link href={c.path ?? (c.conversationId ? `${inbox}?c=${c.conversationId}` : '/calls')} className="text-sm flex gap-2 rounded-lg -mx-1 px-1 py-0.5 hover:bg-zinc-100 dark:hover:bg-white/[0.05]">
                    <Phone className="w-3.5 h-3.5 text-indigo-500 mt-0.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-100">{c.title}<span className="text-xs text-zinc-500"> · {c.roomName}</span></span>
                    <span className="text-xs text-zinc-500 shrink-0 pt-0.5">{format(new Date(c.startAt), 'HH:mm')}</span>
                  </Link>
                </li>
              ))}
            </Section>
          )}
          {data.toGrade > 0 && (
            <Section icon={ClipboardCheck} title="To grade">
              <li><Link href="/teacher/assignments" className="text-sm font-medium text-indigo-600 dark:text-indigo-300 hover:underline">{data.toGrade} submission{data.toGrade === 1 ? '' : 's'} waiting for your grade</Link></li>
            </Section>
          )}
          {data.waiting.length > 0 && (
            <div className="sm:col-span-2">
              <Section icon={MessageCircle} title={`Waiting for you · ${data.waiting.length}`}>
                {data.waiting.map((w) => (
                  <li key={w.conversationId}>
                    <Link href={`${inbox}?c=${w.conversationId}`} className="flex items-center gap-2.5 rounded-xl -mx-1 px-1 py-1 hover:bg-zinc-100 dark:hover:bg-white/[0.05]">
                      <Avatar name={w.name} src={w.avatar} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm"><span className="font-semibold text-zinc-900 dark:text-white truncate">{w.name}</span>{w.question && <span className="text-[10px] font-bold uppercase text-fuchsia-600 dark:text-fuchsia-300 bg-fuchsia-500/10 rounded px-1">Question</span>}</span>
                        <span className="block text-xs text-zinc-500 truncate">{w.isGroup ? `${w.from}: ` : ''}{w.body}</span>
                      </span>
                      <span className="text-[11px] text-zinc-400 shrink-0">{formatDistanceToNowStrict(new Date(w.at))}</span>
                      {w.unread && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" aria-label="Unread" />}
                    </Link>
                  </li>
                ))}
              </Section>
            </div>
          )}
        </div>
      )}
    </motion.section>
  );
}
