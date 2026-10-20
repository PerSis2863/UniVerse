'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { HeartHandshake, Loader2, LifeBuoy, ShieldCheck, Trash2 } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, SUPPORT_TABS } from '@/components/layout/SectionTabs';
import { Field } from '@/components/ui/Field';
import { Switch } from '@/components/ui/Switch';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp } from '@/lib/motion';
import { MOODS, TAGS, type Nudge, type Tag } from '@/lib/wellbeing';
import { cn } from '@/lib/utils';

// Help & support → Wellbeing (Stage 5 · D13, src/server/wellbeing.ts). Off until the student turns
// it on, after reading what it looks at and who sees what. Then: a daily check-in, private nudges
// from plain rules, the last two weeks, and "Talk to someone" (a request to the school's
// counsellors). Teachers never see any of it.

type Checkin = { day: string; mood: number; tags: Tag[]; note: string };
type Request = { id: string; status: string; message: string; createdAt: string; handledAt: string | null };
type View = { optedIn: boolean; counsellorOk: boolean; today: string; checkins: Checkin[]; nudges: Nudge[]; requests: Request[]; requestsGoTo: 'counsellors' | 'admins' };
const KEY = '/api/wellbeing';
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } };
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function WellbeingPage() {
  const { data, error, mutate } = useSWR<View>(KEY, authedJson);
  const act = async (body: object, ok?: string) => {
    try { const r = await authedJson<{ counsellorTold?: boolean }>(KEY, { method: 'POST', body: JSON.stringify({ timeZone: tz(), ...body }) }); if (ok) toast.success(ok); await mutate(); return r; }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t save that.')); return null; }
  };
  return (
    <>
      <Topbar title="Wellbeing" subtitle="Gentle check-ins and private tips for hard weeks" />
      <SectionTabs tabs={SUPPORT_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-5">
          {error && !data ? <p className="text-sm text-rose-600 dark:text-rose-400">{errorMessage(error, 'Couldn’t load this.')}</p>
            : !data ? <div className="h-64 rounded-2xl skeleton" />
            : data.optedIn ? <Radar data={data} act={act} /> : <Intro act={act} goesTo={data.requestsGoTo} />}
          {data && <TalkToSomeone data={data} act={act} />}
          <p className="text-xs text-zinc-600 dark:text-zinc-400 rounded-2xl border border-zinc-200 dark:border-white/[0.08] p-4">
            <span className="font-semibold text-zinc-900 dark:text-white">If you’re in danger or thinking about hurting yourself, </span>
            please contact your local emergency number or a crisis line now, or tell someone you trust. This page isn’t watched around the clock. <Link href="/student/support" className="underline">Help & support</Link>
          </p>
        </div>
      </div>
    </>
  );
}

function Intro({ act, goesTo }: { act: (b: object, ok?: string) => Promise<unknown>; goesTo: View['requestsGoTo'] }) {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" className="panel p-5 space-y-4" aria-labelledby="wb-intro">
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0"><HeartHandshake className="w-5 h-5 text-emerald-700 dark:text-emerald-300" aria-hidden /></span>
        <div>
          <h2 id="wb-intro" className="font-semibold text-zinc-900 dark:text-white">Wellbeing radar</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">A quick daily check-in, and private tips when your week looks heavy. It’s off until you turn it on.</p>
        </div>
      </div>
      <div className="space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
        <div><h3 className="font-semibold text-zinc-900 dark:text-white">What it looks at</h3>
          <ul className="mt-1 list-disc ps-5 space-y-0.5">
            <li>Your check-ins: how today feels, a few words like “sleep” or “stress”, and a private note.</li>
            <li>Late nights: work you handed in, or AI help you used, after midnight.</li>
            <li>Classes where you tapped “I’m lost”, and deadlines that slipped or are coming up.</li>
          </ul>
        </div>
        <div><h3 className="font-semibold text-zinc-900 dark:text-white">What it never does</h3>
          <ul className="mt-1 list-disc ps-5 space-y-0.5">
            <li>No AI reads any of this: it’s a few simple rules.</li>
            <li>Your teachers never see it. Your check-ins and notes are only for you.</li>
          </ul>
        </div>
        <div><h3 className="font-semibold text-zinc-900 dark:text-white">When someone else hears about it</h3>
          <p className="mt-1">Only when you tap <b>Talk to someone</b>, or, if you tick the box below, when your check-ins show a really hard stretch (several very hard days). Then the school’s {goesTo === 'counsellors' ? 'counsellors' : 'admins (no counsellor is named in UniVerse yet)'} are told you may be having a hard time, and never what your notes say.</p>
        </div>
        <p>You can turn it off and delete your check-ins at any time.</p>
      </div>
      <label className="flex items-start gap-2 text-sm text-zinc-800 dark:text-zinc-200">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1" />
        If my check-ins show a really hard stretch, let the school’s {goesTo === 'counsellors' ? 'counsellor' : 'admins'} know so they can reach out. (Optional)
      </label>
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); await act({ action: 'join', counsellorOk: ok }, 'Wellbeing check-ins are on'); setBusy(false); }} className="btn-primary">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <HeartHandshake className="w-4 h-4" />} Turn on wellbeing check-ins
      </button>
    </motion.section>
  );
}

function Radar({ data, act }: { data: View; act: (b: object, ok?: string) => Promise<{ counsellorTold?: boolean } | null> }) {
  const today = data.checkins.find((c) => c.day === data.today);
  const [mood, setMood] = useState<number | null>(today?.mood ?? null);
  const [tags, setTags] = useState<Tag[]>(today?.tags ?? []);
  const [note, setNote] = useState(today?.note ?? '');
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mood) return;
    setBusy(true);
    const r = await act({ action: 'check-in', mood, tags, note }, today ? 'Check-in updated' : 'Checked in. Thanks for taking a moment.');
    if (r?.counsellorTold) toast('The school’s counsellors have been told you may be having a hard time', { description: 'As you agreed. They don’t see your notes.' });
    setBusy(false);
  };
  const leave = async () => {
    if (!(await confirmDialog({ title: 'Turn off and delete?', message: 'Your check-ins and notes are deleted, and requests nobody has seen yet are withdrawn.', confirmLabel: 'Turn off and delete', destructive: true }))) return;
    await act({ action: 'leave' }, 'Turned off. Your check-ins are deleted.');
  };
  return (
    <>
      <motion.form variants={fadeUp} initial="hidden" animate="show" onSubmit={save} className="panel p-5 space-y-4" aria-labelledby="wb-today">
        <h2 id="wb-today" className="font-semibold text-zinc-900 dark:text-white">How are you today?</h2>
        <div role="radiogroup" aria-labelledby="wb-today" className="grid grid-cols-5 gap-2">
          {MOODS.map((m) => (
            <button key={m.v} type="button" role="radio" aria-checked={mood === m.v} onClick={() => setMood(m.v)} className={cn('rounded-2xl border p-2 flex flex-col items-center gap-1 transition-colors', mood === m.v ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-200 dark:border-white/10 hover:border-emerald-400')}>
              <span className="text-2xl" aria-hidden>{m.emoji}</span>
              <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">{m.label}</span>
            </button>
          ))}
        </div>
        <div>
          <p id="wb-tags" className="text-sm text-zinc-700 dark:text-zinc-300 mb-1.5">Anything on your mind? (optional)</p>
          <div role="group" aria-labelledby="wb-tags" className="flex flex-wrap gap-1.5">
            {(Object.keys(TAGS) as Tag[]).map((t) => (
              <button key={t} type="button" aria-pressed={tags.includes(t)} onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))} className={cn('btn-sm rounded-full', tags.includes(t) ? 'btn-primary' : 'btn-secondary')}>{TAGS[t]}</button>
            ))}
          </div>
        </div>
        <Field label="Private note (optional)" hint="Only you see it. Never shared, not even with a counsellor." count={note.length} max={1000}>
          {(p) => <textarea {...p} className="input min-h-[4rem]" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <button type="submit" disabled={busy || !mood} className="btn-primary">{busy && <Loader2 className="w-4 h-4 animate-spin" />} {today ? 'Update today' : 'Check in'}</button>
      </motion.form>

      {data.nudges.length > 0 && (
        <section className="space-y-2" aria-label="For you">
          {data.nudges.map((n) => (
            <div key={n.id} className={cn('rounded-2xl border p-4', n.care ? 'border-emerald-500/40 bg-emerald-500/[0.07]' : 'border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900/50')}>
              <p className="font-semibold text-zinc-900 dark:text-white">{n.title}</p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-0.5">{n.body}</p>
              {n.href && n.action && <Link href={n.href} className="btn-secondary btn-sm mt-2 inline-flex">{n.action}</Link>}
              {n.id === 'mood' && <a href="#talk" className="btn-secondary btn-sm mt-2 inline-flex">{n.action}</a>}
            </div>
          ))}
        </section>
      )}

      {data.checkins.length > 0 && (
        <section className="panel p-5" aria-labelledby="wb-days">
          <h2 id="wb-days" className="font-semibold text-zinc-900 dark:text-white mb-2">Your last two weeks</h2>
          <ol className="flex flex-wrap gap-2" aria-labelledby="wb-days">
            {data.checkins.map((c) => {
              const m = MOODS.find((x) => x.v === c.mood);
              return <li key={c.day} className="rounded-xl bg-zinc-100 dark:bg-white/[0.05] px-2.5 py-1.5 text-center"><span className="block text-xl" aria-hidden>{m?.emoji}</span><span className="block text-[11px] text-zinc-600 dark:text-zinc-400">{dayLabel(c.day)}<span className="sr-only">: {m?.label}</span></span></li>;
            })}
          </ol>
        </section>
      )}

      <section className="panel p-5 space-y-3" aria-labelledby="wb-settings">
        <h2 id="wb-settings" className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden /> Your choices</h2>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">Let the school’s {data.requestsGoTo === 'counsellors' ? 'counsellors' : 'admins'} know if my check-ins show a really hard stretch (never my notes).</p>
          <Switch checked={data.counsellorOk} label="Let a counsellor know about a really hard stretch" onChange={(v) => void act({ action: 'settings', counsellorOk: v }, v ? 'A counsellor may be told about a hard stretch' : 'Nobody is told unless you ask')} />
        </div>
        <button type="button" onClick={() => void leave()} className="btn-ghost btn-sm text-rose-700 dark:text-rose-300"><Trash2 className="w-4 h-4" /> Turn off and delete my check-ins</button>
      </section>
    </>
  );
}

function TalkToSomeone({ data, act }: { data: View; act: (b: object, ok?: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = data.requests.find((r) => r.status === 'OPEN' || r.status === 'SEEN');
  return (
    <section id="talk" className="panel p-5 space-y-3 scroll-mt-4" aria-labelledby="wb-talk">
      <h2 id="wb-talk" className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><LifeBuoy className="w-4 h-4 text-indigo-600 dark:text-indigo-300" aria-hidden /> Talk to someone</h2>
      {pending ? (
        <p className="text-sm text-zinc-700 dark:text-zinc-300" role="status">{pending.status === 'SEEN' ? 'A counsellor has seen your request and will reach out to you.' : `Your request was sent ${new Date(pending.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Someone will reach out to you.`}</p>
      ) : open ? (
        <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); if (await act({ action: 'ask', message }, 'Sent. Someone will reach out to you.')) { setOpen(false); setMessage(''); } setBusy(false); }} className="space-y-2">
          <Field label="Anything you’d like them to know? (optional)" hint={`Goes to the school’s ${data.requestsGoTo === 'counsellors' ? 'counsellors' : 'admins'}, with your name.`} count={message.length} max={1000}>
            {(p) => <textarea {...p} className="input min-h-[4rem]" maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />}
          </Field>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary btn-sm">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Ask them to reach out</button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary btn-sm">Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">Ask the school’s {data.requestsGoTo === 'counsellors' ? 'counsellors' : 'staff'} to reach out to you. You don’t need to explain why.</p>
          <button type="button" onClick={() => setOpen(true)} className="btn-secondary btn-sm"><LifeBuoy className="w-4 h-4" /> Talk to someone</button>
        </>
      )}
    </section>
  );
}
