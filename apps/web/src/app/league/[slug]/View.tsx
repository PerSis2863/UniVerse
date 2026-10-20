'use client';

import { usePathParams } from '@/hooks/usePathParams';
import { AddressLoading } from '@/components/layout/AddressLoading';
import { useEffect, useState } from 'react';
import { m as motion } from 'framer-motion';
import { CalendarClock, ExternalLink, Eye, GraduationCap, Link2Off, Trophy, Users } from 'lucide-react';
import Link from '@/components/ui/Link';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LogoMark } from '@/components/ui/LogoMark';
import { SdgBadge } from '@/components/league/LeagueBits';
import { STATUS_LABEL, type LeagueStatus } from '@/lib/impact-league';
import { fadeUp, list } from '@/lib/motion';

// An Impact League challenge's public showcase (Stage 5 · D14), for sponsors, partners and families:
// no sign-in. The challenge, its prizes (and winners once it's finished), and the teams that handed in
// and chose to appear: team names, universities and projects. Never students' names.

interface Showcase {
  slug: string; title: string; sdg: number | null; sdgName: string | null; summary: string; brief: string; status: LeagueStatus;
  demoDayAt: string | null; finishedAt: string | null;
  stats: { teams: number; universities: number; finishers: number };
  sponsors: string[];
  prizes: { title: string; sponsor: string; description: string; winner: string | null }[];
  teams: { name: string; universities: string[]; size: number; project: { title: string; pitch: string; link: string }; prizes: string[] }[];
}

const panel = 'rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-5 sm:p-7';

function PublicLeaguePage({ slug }: { slug: string }) {
  const [data, setData] = useState<Showcase | null>(null);
  const [problem, setProblem] = useState<'missing' | 'offline' | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/league/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        if (r.status === 404) throw new Error('missing');
        if (!r.ok) throw new Error('offline');
        return r.json() as Promise<Showcase>;
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: Error) => { if (!cancelled) setProblem(e.message === 'missing' ? 'missing' : 'offline'); });
    return () => { cancelled = true; };
  }, [slug]);

  const stats = data ? [
    { icon: Users, label: data.stats.teams === 1 ? 'Team' : 'Teams', value: data.stats.teams },
    { icon: GraduationCap, label: data.stats.universities === 1 ? 'University' : 'Universities', value: data.stats.universities },
    { icon: Trophy, label: data.stats.finishers === 1 ? 'Finisher' : 'Finishers', value: data.stats.finishers },
  ] : [];

  return (
    <main className="min-h-screen px-4 py-6 sm:py-10" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 font-black text-zinc-900 dark:text-white min-h-11"><LogoMark className="w-7 h-7" /> UniVerse</Link>
          <span className="text-xs text-zinc-600 dark:text-zinc-400 inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" aria-hidden /> Impact League</span>
        </div>

        {problem ? (
          <div className={`${panel} text-center`}>
            <span className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 border border-indigo-500/20 flex items-center justify-center"><Link2Off className="w-7 h-7 text-indigo-500" aria-hidden /></span>
            <h1 className="mt-4 text-xl font-black text-zinc-900 dark:text-white">{problem === 'missing' ? 'This page isn’t public' : 'Couldn’t load this page'}</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300 max-w-md mx-auto">{problem === 'missing' ? 'The organizers may have turned it off. Ask whoever shared the link.' : 'Please check your internet connection and try again in a moment.'}</p>
            {problem === 'offline' && <button type="button" onClick={() => location.reload()} className="btn-primary min-h-11 mt-5">Try again</button>}
          </div>
        ) : !data ? (
          <div className="p-16"><ContentSkeleton variant="list" /></div>
        ) : (
          <motion.div variants={list} initial="hidden" animate="show" className="space-y-5">
            <motion.section variants={fadeUp} className={panel}>
              <div className="flex items-start gap-4">
                <SdgBadge sdg={data.sdg} name={data.sdgName} size="lg" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Impact League{data.sdgName ? ` · ${data.sdgName}` : ''}</p>
                  <h1 className="mt-0.5 text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white leading-tight">{data.title}</h1>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{data.status === 'DONE' && data.finishedAt ? `Finished ${new Date(data.finishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}` : STATUS_LABEL[data.status]}</p>
                </div>
              </div>
              {data.summary && <p className="mt-4 text-base font-medium text-zinc-800 dark:text-zinc-100">{data.summary}</p>}
              {data.brief && <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-line leading-relaxed">{data.brief}</p>}
              <div className="mt-5 grid grid-cols-3 gap-2">
                {stats.map((s) => (
                  <div key={s.label} className="rounded-2xl bg-white/70 dark:bg-white/[0.04] border border-zinc-200/70 dark:border-white/[0.07] p-3 min-w-0">
                    <s.icon className="w-4 h-4 text-indigo-600 dark:text-indigo-300" aria-hidden />
                    <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-white tabular-nums">{s.value}</p>
                    <p className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 leading-tight">{s.label}</p>
                  </div>
                ))}
              </div>
              {data.demoDayAt && data.status !== 'DONE' && (
                <p className="mt-4 text-sm text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-2"><CalendarClock className="w-4 h-4" aria-hidden />Demo day: {new Date(data.demoDayAt).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
              )}
            </motion.section>

            {data.prizes.length > 0 && (
              <motion.section variants={fadeUp} className={panel}>
                <h2 className="text-lg font-black text-zinc-900 dark:text-white inline-flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400" aria-hidden />Prizes</h2>
                <ul className="mt-3 space-y-3">
                  {data.prizes.map((p, i) => (
                    <li key={i}>
                      <p className="font-semibold text-zinc-900 dark:text-white">{p.title}{p.sponsor && <span className="font-normal text-zinc-600 dark:text-zinc-400"> · from {p.sponsor}</span>}</p>
                      {p.description && <p className="text-sm text-zinc-700 dark:text-zinc-300">{p.description}</p>}
                      {p.winner && <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Won by {p.winner}</p>}
                    </li>
                  ))}
                </ul>
              </motion.section>
            )}

            <motion.section variants={fadeUp} className={panel}>
              <h2 className="text-lg font-black text-zinc-900 dark:text-white">The projects</h2>
              {data.teams.length === 0 ? <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{data.status === 'OPEN' ? 'Teams are still working. Projects appear here once they’re handed in.' : 'No project is shown here.'}</p> : (
                <ul className="mt-3 space-y-4">
                  {data.teams.map((t) => (
                    <li key={t.name} className="border-s-2 border-indigo-400/60 ps-3">
                      <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{t.name} · {t.size} {t.size === 1 ? 'student' : 'students'}{t.universities.length ? ` · ${t.universities.join(', ')}` : ''}</p>
                      <p className="mt-0.5 font-bold text-zinc-900 dark:text-white">{t.project.title}</p>
                      {t.prizes.map((p) => <p key={p} className="text-xs font-semibold text-amber-800 dark:text-amber-200 inline-flex items-center gap-1 me-2"><Trophy className="w-3.5 h-3.5" aria-hidden />{p}</p>)}
                      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-line break-words">{t.project.pitch}</p>
                      {t.project.link && <a href={t.project.link} target="_blank" rel="noopener noreferrer nofollow ugc" className="mt-1 text-sm text-indigo-700 dark:text-indigo-300 underline inline-flex items-center gap-1 break-all">See the project <ExternalLink className="w-3.5 h-3.5" aria-hidden /></a>}
                    </li>
                  ))}
                </ul>
              )}
            </motion.section>

            <motion.p variants={fadeUp} className="text-xs text-zinc-600 dark:text-zinc-400 text-center px-4">
              Only teams that handed in a project and agreed to be shown appear here. This page never shows students’ names.{' '}
              <Link href="/impact-league" className="text-indigo-700 dark:text-indigo-300 font-semibold">Students: sign in to take part</Link>
            </motion.p>
          </motion.div>
        )}
      </div>
    </main>
  );
}

// Served for every address from the page built once with "open" (page.tsx, cloudflare/page-routes.gen.ts):
// the values come from the address, read in the browser.
export default function PublicLeaguePageRoute() {
  const p = usePathParams('/league/[slug]');
  return p ? <PublicLeaguePage key={p.slug} slug={p.slug} /> : <AddressLoading />;
}
