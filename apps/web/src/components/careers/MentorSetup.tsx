'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { CalendarPlus, Loader2, PauseCircle, Video, X } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Field } from '@/components/ui/Field';
import { Switch } from '@/components/ui/Switch';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { SLOT_MINUTES } from '@/lib/careers';
import { fadeUp } from '@/lib/motion';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

// Stage 5 · Q15: be a mentor. A short profile (alumni say when they graduated), the times you offer
// for one-to-one video calls, and who booked them. Students book from Internships → Mentors; each
// booking puts a call in both people's Calls and calendars (src/server/careers.ts).

export interface Mentoring {
  profile: { id: string; company: string | null; jobTitle: string | null; skills: string[]; isAlumni: boolean; gradYear: number | null; bio: string | null; isAvailable: boolean } | null;
  slots: { id: string; startAt: string; minutes: number; bookingId: string | null }[];
  bookings: { id: string; at: string; topic: string | null; status: string; callId: string | null; with: { id: string; name: string }; as: 'student' | 'mentor' }[];
}
export const MENTORING = '/api/careers/mentoring';

export const sessionTime = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** A booked session with Join and Cancel (either side can cancel). */
export function SessionRow({ b, now, onCancel }: { b: Mentoring['bookings'][number]; now: number; onCancel: () => void }) {
  const live = b.status === 'CONFIRMED';
  const past = now > 0 && new Date(b.at).getTime() < now - 60 * 60_000;
  return (
    <li className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      <Video className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white break-words">{b.as === 'student' ? `With ${b.with.name}` : `${b.with.name} booked you`}</p>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 break-words">{sessionTime(b.at)}{b.topic ? ` · ${b.topic}` : ''}{!live ? ' · Cancelled' : past ? ' · Done' : ''}</p>
      </div>
      {live && !past && (
        <>
          <Link href="/calls" className="btn-secondary btn-sm">Join from Calls</Link>
          <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        </>
      )}
    </li>
  );
}

export function useMentoring() {
  const swr = useSWR<Mentoring>(MENTORING, authedJson);
  const now = useNow();
  const act = async (body: Record<string, unknown>, ok?: string) => {
    try {
      const out = await authedJson<Mentoring>(MENTORING, { method: 'POST', body: JSON.stringify(body) });
      if (out && 'slots' in out) await swr.mutate(out, { revalidate: false }); else await swr.mutate();
      if (ok) toast.success(ok);
      return true;
    } catch (e) { toast.error((e as Error).message); return false; }
  };
  const cancel = async (b: Mentoring['bookings'][number]) => {
    if (!(await confirmDialog({ title: 'Cancel this session?', message: `${b.with.name} is told, and the call is removed from both calendars.`, confirmLabel: 'Cancel session', cancelLabel: 'Keep it', destructive: true }))) return;
    await act({ action: 'cancel', bookingId: b.id }, 'Session cancelled');
  };
  return { ...swr, now, act, cancel };
}

export function MentorSetup({ intro }: { intro?: string }) {
  const { data, error, isLoading, mutate, now, act, cancel } = useMentoring();
  const p = data?.profile ?? null;
  const [edit, setEdit] = useState<null | { jobTitle: string; company: string; skills: string; bio: string; isAlumni: boolean; gradYear: string; isAvailable: boolean }>(null);
  const [saving, setSaving] = useState(false);
  const [slot, setSlot] = useState({ at: '', minutes: 30, weeks: 1 });
  const [adding, setAdding] = useState(false);

  const form = edit ?? {
    jobTitle: p?.jobTitle ?? '', company: p?.company ?? '', skills: (p?.skills ?? []).join(', '), bio: p?.bio ?? '',
    isAlumni: p?.isAlumni ?? false, gradYear: p?.gradYear ? String(p.gradYear) : '', isAvailable: p?.isAvailable ?? true,
  };
  const change = (patch: Partial<typeof form>) => setEdit({ ...form, ...patch });

  const saveProfile = async () => {
    setSaving(true);
    const done = await act({ action: 'profile', ...form, skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean), gradYear: form.gradYear ? Number(form.gradYear) : null }, p ? 'Profile saved' : 'You’re a mentor now. Add times students can book.');
    if (done) setEdit(null);
    setSaving(false);
  };
  const addSlot = async () => {
    if (!slot.at) { toast.error('Pick a day and time.'); return; }
    setAdding(true);
    if (await act({ action: 'slots', startAt: new Date(slot.at).toISOString(), minutes: slot.minutes, weeks: slot.weeks }, slot.weeks > 1 ? 'Times added' : 'Time added')) setSlot({ ...slot, at: '' });
    setAdding(false);
  };
  const dropSlot = async (id: string) => {
    try {
      const out = await authedJson<Mentoring>(`${MENTORING}?slot=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (out && 'slots' in out) await mutate(out, { revalidate: false }); else await mutate();
    } catch (e) { toast.error((e as Error).message); }
  };

  if (error) return <p className="text-sm text-rose-600 dark:text-rose-400">{(error as Error).message || 'Couldn’t load your mentoring.'}</p>;
  if (isLoading || !data) return <div className="skeleton h-40 rounded-3xl" />;

  const upcoming = data.slots.filter((s) => !now || new Date(s.startAt).getTime() > now);
  const mine = data.bookings.filter((b) => b.as === 'mentor');
  const dirty = !!edit;

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-5">
      {intro && <p className="text-sm text-zinc-600 dark:text-zinc-400">{intro}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="What you do">{(f) => <input {...f} className="input" maxLength={120} value={form.jobTitle} onChange={(e) => change({ jobTitle: e.target.value })} placeholder="e.g. Data analyst" />}</Field>
        <Field label="Where">{(f) => <input {...f} className="input" maxLength={120} value={form.company} onChange={(e) => change({ company: e.target.value })} placeholder="Company or university" />}</Field>
        <Field label="Skills you can help with" className="sm:col-span-2" hint="Up to 10, separated by commas">{(f) => <input {...f} className="input" value={form.skills} onChange={(e) => change({ skills: e.target.value })} placeholder="SQL, CVs, interviews, product design" />}</Field>
        <Field label="About you" className="sm:col-span-2" count={form.bio.length} max={600}>{(f) => <textarea {...f} className="input min-h-[80px]" maxLength={600} value={form.bio} onChange={(e) => change({ bio: e.target.value })} placeholder="Your path so far and what students can ask you about" />}</Field>
        <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-100">
          <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={form.isAlumni} onChange={(e) => change({ isAlumni: e.target.checked })} /> I studied here (alumni)
        </label>
        {form.isAlumni && <Field label="Year you graduated">{(f) => <input {...f} className="input" type="number" inputMode="numeric" min={1950} max={2100} value={form.gradYear} onChange={(e) => change({ gradYear: e.target.value })} />}</Field>}
        <div className="sm:col-span-2 flex items-center gap-3">
          <Switch checked={form.isAvailable} onChange={(v) => change({ isAvailable: v })} label="Taking bookings" />
          <span className="text-sm text-zinc-800 dark:text-zinc-100">Taking bookings</span>
        </div>
      </div>
      {(dirty || !p) && (
        <div className="flex justify-end gap-2">
          {dirty && <button type="button" className="btn-secondary" onClick={() => setEdit(null)}>Undo changes</button>}
          <button type="button" className="btn-primary" disabled={saving} onClick={saveProfile}>{saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} {p ? 'Save profile' : 'Become a mentor'}</button>
        </div>
      )}

      {p && (
        <section aria-labelledby="times-h" className="space-y-3 border-t border-zinc-200 dark:border-white/10 pt-4">
          <h3 id="times-h" className="font-bold text-zinc-900 dark:text-white">Times you offer</h3>
          <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1fr_auto] gap-2 items-end">
            <Field label="Starts">{(f) => <input {...f} className="input" type="datetime-local" value={slot.at} onChange={(e) => setSlot({ ...slot, at: e.target.value })} />}</Field>
            <Field label="Length">{(f) => <select {...f} className="input" value={slot.minutes} onChange={(e) => setSlot({ ...slot, minutes: Number(e.target.value) })}>{SLOT_MINUTES.map((m) => <option key={m} value={m}>{m} min</option>)}</select>}</Field>
            <Field label="Repeat">{(f) => <select {...f} className="input" value={slot.weeks} onChange={(e) => setSlot({ ...slot, weeks: Number(e.target.value) })}>{[1, 2, 4, 6, 8].map((w) => <option key={w} value={w}>{w === 1 ? 'Just once' : `Weekly, ${w} weeks`}</option>)}</select>}</Field>
            <button type="button" className="btn-primary" disabled={adding} onClick={addSlot}>{adding ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CalendarPlus className="w-4 h-4" aria-hidden />} Add</button>
          </div>
          {upcoming.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {upcoming.map((s) => (
                <li key={s.id} className={cn('inline-flex items-center gap-1 rounded-full ps-3 pe-1 py-1 text-xs font-medium', s.bookingId ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-200')}>
                  {sessionTime(s.startAt)} · {s.minutes} min{s.bookingId ? ' · booked' : ''}
                  {s.bookingId ? <span className="w-6" aria-hidden /> : (
                    <button type="button" className="w-6 h-6 inline-flex items-center justify-center rounded-full hover:bg-zinc-200 dark:hover:bg-white/10" aria-label={`Remove ${sessionTime(s.startAt)}`} onClick={() => dropSlot(s.id)}><X className="w-3.5 h-3.5" aria-hidden /></button>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-zinc-600 dark:text-zinc-400">No times yet. Students can only book times you add.</p>}
        </section>
      )}

      {p && (
        <section aria-labelledby="booked-h" className="border-t border-zinc-200 dark:border-white/10 pt-4">
          <h3 id="booked-h" className="font-bold text-zinc-900 dark:text-white">Booked sessions</h3>
          {mine.length ? (
            <ul className="divide-y divide-zinc-200 dark:divide-white/10">{mine.map((b) => <SessionRow key={b.id} b={b} now={now} onCancel={() => cancel(b)} />)}</ul>
          ) : <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">None yet. When a student books, you get a notification and the call appears in Calls and your calendar.</p>}
          {!form.isAvailable && <p className="mt-2 text-xs text-zinc-500 inline-flex items-center gap-1"><PauseCircle className="w-3.5 h-3.5" aria-hidden /> Bookings are paused: students don’t see you.</p>}
        </section>
      )}
    </motion.div>
  );
}
