'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AnimatePresence, m as motion } from 'framer-motion';
import { BadgeCheck, CalendarClock, ChevronDown, Clock, Eye, FileText, Globe2, HandHeart, Link2Off, MapPin, Users } from 'lucide-react';
import Link from '@/components/ui/Link';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LogoMark } from '@/components/ui/LogoMark';
import { ImpactReportView, type ImpactCallReport } from '@/components/impact/ImpactReport';
import { fadeUp, list, spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// An impact room's public page (Stage 4 · 4.12), for sponsors and partners: no sign-in. Verified
// hours, pledged time, what staff chose to share, and the signed monthly reports. Never students.

interface PublicRoom {
  id: string; name: string; description: string; location: string | null; sdgNumber: number | null; active: boolean;
  ngo: { name: string; logoUrl: string | null; websiteUrl: string | null; isVerified: boolean };
  total: { hours: number; volunteers: number; shifts: number }; followers: number;
  pledged: { people: number; hoursPerMonth: number };
  updates: { id: string; body: string; createdAt: string; by: string }[];
  nextCall: { startsAt: string; title: string } | null;
  reports: { id: string; startsAt: string; title: string; report: ImpactCallReport; verified: boolean }[];
}

const panel = 'rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-5 sm:p-7';

export default function PublicImpactPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PublicRoom | null>(null);
  const [problem, setProblem] = useState<'missing' | 'offline' | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/impact-rooms/${encodeURIComponent(id)}/public`)
      .then(async (r) => {
        if (r.status === 404) throw new Error('missing');
        if (!r.ok) throw new Error('offline');
        return r.json() as Promise<PublicRoom>;
      })
      .then((d) => { if (!cancelled) { setData(d); setOpen(d.reports[0]?.id ?? null); } })
      .catch((e: Error) => { if (!cancelled) setProblem(e.message === 'missing' ? 'missing' : 'offline'); });
    return () => { cancelled = true; };
  }, [id]);

  const stats = data ? [
    { icon: Clock, label: 'Verified volunteer hours', value: data.total.hours },
    { icon: Users, label: 'Volunteers', value: data.total.volunteers },
    { icon: HandHeart, label: 'Hours pledged a month', value: data.pledged.hoursPerMonth, sub: data.pledged.people ? `by ${data.pledged.people} ${data.pledged.people === 1 ? 'person' : 'people'}` : undefined },
    { icon: Globe2, label: 'People following', value: data.followers },
  ] : [];

  return (
    <main className="min-h-screen px-4 py-6 sm:py-10" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 font-black text-zinc-900 dark:text-white min-h-11"><LogoMark className="w-7 h-7" /> UniVerse</Link>
          <span className="text-[11px] text-zinc-500 inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Public impact page</span>
        </div>

        {problem ? (
          <div className={`${panel} text-center`}>
            <span className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 border border-indigo-500/20 flex items-center justify-center"><Link2Off className="w-7 h-7 text-indigo-500" /></span>
            <h1 className="mt-4 text-xl font-black text-zinc-900 dark:text-white">{problem === 'missing' ? 'This page isn’t public' : 'Couldn’t load this page'}</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300 max-w-md mx-auto">{problem === 'missing' ? 'The school may have turned it off. Ask whoever shared the link.' : 'Please check your internet connection and try again in a moment.'}</p>
            {problem === 'offline' && <button onClick={() => location.reload()} className="btn-primary min-h-11 mt-5">Try again</button>}
          </div>
        ) : !data ? (
          <div className="p-16"><ContentSkeleton variant="list" /></div>
        ) : (
          <motion.div variants={list} initial="hidden" animate="show" className="space-y-5">
            <motion.section variants={fadeUp} className={panel}>
              <div className="flex items-start gap-4">
                <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-indigo-500 text-white flex items-center justify-center shrink-0 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element -- an NGO's logo link; next/image can't optimise on Workers */}
                  {data.ngo.logoUrl ? <img src={data.ngo.logoUrl} alt="" className="w-full h-full object-cover" /> : <HandHeart className="w-7 h-7" />}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-300 inline-flex items-center gap-1">{data.ngo.name}{data.ngo.isVerified && <BadgeCheck className="w-3.5 h-3.5" />}</p>
                  <h1 className="mt-0.5 text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white leading-tight">{data.name}</h1>
                  <p className="mt-1 text-xs text-zinc-500 flex flex-wrap gap-x-3">
                    {data.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{data.location}</span>}
                    {data.sdgNumber && <span>UN SDG {data.sdgNumber}</span>}
                    {!data.active && <span>Project completed</span>}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-line leading-relaxed">{data.description}</p>
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {stats.map((s) => (
                  <div key={s.label} className="rounded-2xl bg-white/70 dark:bg-white/[0.04] border border-zinc-200/70 dark:border-white/[0.07] p-3 min-w-0">
                    <s.icon className="w-4 h-4 text-indigo-500 dark:text-indigo-300" />
                    <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-white tabular-nums">{s.value}</p>
                    <p className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 leading-tight">{s.label}{s.sub ? ` ${s.sub}` : ''}</p>
                  </div>
                ))}
              </div>
              {data.nextCall && (
                <p className="mt-4 text-sm text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-2"><CalendarClock className="w-4 h-4" />Next impact call: {data.nextCall.title}, {new Date(data.nextCall.startsAt).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
              )}
            </motion.section>

            {data.reports.length > 0 && (
              <motion.section variants={fadeUp} className={panel}>
                <h2 className="text-lg font-black text-zinc-900 dark:text-white inline-flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-500" />Monthly reports</h2>
                <ul className="mt-3 divide-y divide-zinc-200/70 dark:divide-white/[0.07]">
                  {data.reports.map((r) => (
                    <li key={r.id} id={`report-${r.id}`} className="py-3">
                      <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} className="w-full flex items-center gap-3 text-left">
                        <span className="flex-1 min-w-0">
                          <span className="block font-semibold text-zinc-900 dark:text-white truncate">{r.title}</span>
                          <span className="block text-xs text-zinc-500">{new Date(r.startsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}{r.verified ? ' · verified' : ''}</span>
                        </span>
                        <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform', open === r.id && 'rotate-180')} />
                      </button>
                      <AnimatePresence initial={false}>
                        {open === r.id && (
                          <motion.div key="r" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth} className="overflow-hidden">
                            <div className="pt-4"><ImpactReportView report={r.report} verified={r.verified} /></div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </li>
                  ))}
                </ul>
              </motion.section>
            )}

            {data.updates.length > 0 && (
              <motion.section variants={fadeUp} className={panel}>
                <h2 className="text-lg font-black text-zinc-900 dark:text-white">News from the project</h2>
                <ul className="mt-3 space-y-4">
                  {data.updates.map((u) => (
                    <li key={u.id} className="border-l-2 border-emerald-400/60 pl-3">
                      <p className="text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-line break-words">{u.body}</p>
                      <p className="mt-1 text-[11px] text-zinc-500">{u.by} · {new Date(u.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </li>
                  ))}
                </ul>
              </motion.section>
            )}

            <motion.p variants={fadeUp} className="text-xs text-zinc-500 text-center px-4">
              Hours count only volunteer shifts checked in on site and verified. This page never shows students’ names or what they wrote.{' '}
              <Link href={`/impact-rooms/${data.id}`} className="text-indigo-600 dark:text-indigo-300 font-semibold">Volunteer or sponsor: sign in to join the room</Link>
            </motion.p>
          </motion.div>
        )}
      </div>
    </main>
  );
}
