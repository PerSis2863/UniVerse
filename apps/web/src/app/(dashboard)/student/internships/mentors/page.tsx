'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { ChevronDown, GraduationCap, Loader2, Users } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, INTERNSHIP_TABS } from '@/components/layout/SectionTabs';
import { Avatar } from '@/components/ui/Avatar';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchField } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { MentorSetup, SessionRow, sessionTime, useMentoring } from '@/components/careers/MentorSetup';
import { authedJson } from '@/lib/authed-fetch';
import { MAX_BOOKINGS } from '@/lib/careers';
import { fadeUp, list } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Stage 5 · Q15: alumni and mentors who offer one-to-one video calls. Pick a free time, say what
// you'd like to talk about, and the call goes into both people's Calls and calendars.

interface Mentor {
  id: string; company: string | null; jobTitle: string | null; skills: string[]; isAlumni: boolean; gradYear: number | null; bio: string | null;
  user: { id: string; name: string; avatar: string | null; role: string };
  slots: { id: string; startAt: string; minutes: number }[];
}
const DIRECTORY = '/api/careers/mentors';

function MentorCard({ m, onPick }: { m: Mentor; onPick: (slot: Mentor['slots'][number]) => void }) {
  return (
    <motion.li variants={fadeUp} className="panel p-4 sm:p-5 flex flex-col gap-3 min-w-0">
      <div className="flex items-start gap-3">
        <Avatar name={m.user.name} src={m.user.avatar} size={44} />
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-zinc-900 dark:text-white leading-snug break-words">{m.user.name}</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 break-words">{[m.jobTitle, m.company].filter(Boolean).join(' · ') || (m.user.role === 'TEACHER' ? 'Teacher' : 'Mentor')}</p>
        </div>
        {m.isAlumni && (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-fuchsia-500/10 text-fuchsia-800 dark:text-fuchsia-300">
            <GraduationCap className="w-3.5 h-3.5" aria-hidden /> Alumni{m.gradYear ? ` ’${String(m.gradYear).slice(2)}` : ''}
          </span>
        )}
      </div>
      {m.bio && <p className="text-sm text-zinc-700 dark:text-zinc-300 break-words line-clamp-4">{m.bio}</p>}
      {m.skills.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Can help with">
          {m.skills.map((s) => <li key={s} className="rounded-full px-2.5 py-1 text-xs font-medium bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-200">{s}</li>)}
        </ul>
      )}
      <div className="pt-3 border-t border-zinc-200 dark:border-white/10">
        <p className="text-xs font-semibold text-zinc-500 mb-1.5">Free times</p>
        {m.slots.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {m.slots.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => onPick(s)}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 transition-colors">
                  <span className="sr-only">Book {m.user.name}, </span>{sessionTime(s.startAt)} · {s.minutes}<span aria-hidden>m</span><span className="sr-only"> minutes</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-zinc-600 dark:text-zinc-400">No free times right now. Check back soon.</p>}
      </div>
    </motion.li>
  );
}

export default function MentorsPage() {
  const dir = useSWR<{ mentors: Mentor[] }>(DIRECTORY, authedJson);
  const mine = useMentoring();
  const [q, setQ] = useState('');
  const [alumni, setAlumni] = useState(false);
  const [pick, setPick] = useState<{ m: Mentor; slot: Mentor['slots'][number] } | null>(null);
  const [topic, setTopic] = useState('');
  const [booking, setBooking] = useState(false);
  const [mentorOpen, setMentorOpen] = useState(false);

  const mentors = dir.data?.mentors ?? [];
  const needle = q.trim().toLowerCase();
  const shown = mentors.filter((m) => (!alumni || m.isAlumni) && (!needle || [m.user.name, m.company, m.jobTitle, m.bio, ...m.skills].some((v) => v?.toLowerCase().includes(needle))));
  const sessions = (mine.data?.bookings ?? []).filter((b) => b.as === 'student');
  const booked = sessions.filter((b) => b.status === 'CONFIRMED' && (!mine.now || new Date(b.at).getTime() > mine.now)).length;

  const book = async () => {
    if (!pick) return;
    setBooking(true);
    const ok = await mine.act({ action: 'book', slotId: pick.slot.id, topic }, `Booked with ${pick.m.user.name}. It’s in your Calls and calendar.`);
    setBooking(false);
    if (ok) { setPick(null); setTopic(''); }
    void dir.mutate();
  };

  return (
    <>
      <Topbar title="Internships" subtitle="Talk to alumni and mentors one to one" />
      <SectionTabs tabs={INTERNSHIP_TABS} />
      <div className="flex-1 overflow-y-auto">
        <motion.div variants={list} initial="hidden" animate="show" className="p-4 md:p-8 max-w-5xl mx-auto w-full min-w-0 space-y-5">
          {sessions.length > 0 && (
            <motion.section variants={fadeUp} className="panel p-4 sm:p-5" aria-labelledby="sessions-h">
              <h2 id="sessions-h" className="font-bold text-zinc-900 dark:text-white">Your sessions</h2>
              <ul className="divide-y divide-zinc-200 dark:divide-white/10">{sessions.map((b) => <SessionRow key={b.id} b={b} now={mine.now} onCancel={() => mine.cancel(b)} />)}</ul>
            </motion.section>
          )}

          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row sm:items-center gap-2">
            <SearchField value={q} onChange={setQ} placeholder="Search by name, company or skill" className="flex-1" />
            <button type="button" aria-pressed={alumni} onClick={() => setAlumni((v) => !v)}
              className={cn('rounded-full px-3 py-2 text-sm font-medium transition-colors inline-flex items-center gap-1.5 self-start sm:self-auto', alumni ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-zinc-100 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/10')}>
              <GraduationCap className="w-4 h-4" aria-hidden /> Alumni only
            </button>
          </motion.div>

          {dir.error ? (
            <div className="panel p-5"><p className="text-sm text-rose-600 dark:text-rose-400">{(dir.error as Error).message || 'Couldn’t load mentors.'}</p><button type="button" className="btn-secondary btn-sm mt-3" onClick={() => dir.mutate()}>Try again</button></div>
          ) : dir.isLoading || !dir.data ? (
            <ContentSkeleton variant="grid" />
          ) : shown.length ? (
            <motion.ul variants={list} initial="hidden" animate="show" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {shown.map((m) => <MentorCard key={m.id} m={m} onPick={(slot) => setPick({ m, slot })} />)}
            </motion.ul>
          ) : (
            <div className="panel"><EmptyState icon={Users} title={mentors.length ? 'No one matches' : 'No mentors yet'} hint={mentors.length ? 'Try another word, or show everyone.' : 'Teachers and alumni who offer times appear here.'} action={mentors.length ? { label: 'Show everyone', onClick: () => { setQ(''); setAlumni(false); } } : undefined} /></div>
          )}

          <motion.section variants={fadeUp} className="panel" aria-labelledby="be-mentor-h">
            <button type="button" className="w-full flex items-center gap-3 p-4 sm:p-5 text-start" aria-expanded={mentorOpen} aria-controls="be-mentor" onClick={() => setMentorOpen((v) => !v)}>
              <span className="flex-1 min-w-0">
                <span id="be-mentor-h" className="block font-bold text-zinc-900 dark:text-white">Be a mentor</span>
                <span className="block text-sm text-zinc-600 dark:text-zinc-400">Graduated, or a few years ahead? Offer times to students who are where you were.</span>
              </span>
              <ChevronDown className={cn('w-5 h-5 text-zinc-500 transition-transform', mentorOpen && 'rotate-180')} aria-hidden />
            </button>
            {mentorOpen && <div id="be-mentor" className="px-4 pb-5 sm:px-5"><MentorSetup /></div>}
          </motion.section>
        </motion.div>
      </div>

      {pick && (
        <Sheet title={`Book ${pick.m.user.name}`} onClose={() => setPick(null)}
          footer={<div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setPick(null)}>Cancel</button><button type="button" className="btn-primary" disabled={booking || !topic.trim() || booked >= MAX_BOOKINGS} onClick={book}>{booking && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Book</button></div>}>
          <div className="space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-200"><strong>{sessionTime(pick.slot.startAt)}</strong> · {pick.slot.minutes} minutes, a video call in UniVerse.</p>
            <div>
              <label htmlFor="topic" className="label">What would you like to talk about?</label>
              <textarea id="topic" className="input min-h-[90px]" maxLength={200} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. How you got your first internship, and feedback on my CV" />
            </div>
            {booked >= MAX_BOOKINGS
              ? <p className="text-sm text-amber-800 dark:text-amber-300">You have {MAX_BOOKINGS} sessions booked. Wait for one to happen, or cancel one, to book another.</p>
              : <p className="text-xs text-zinc-500">{pick.m.user.name.split(' ')[0]} sees your name and topic. You can cancel any time before.</p>}
          </div>
        </Sheet>
      )}
    </>
  );
}
