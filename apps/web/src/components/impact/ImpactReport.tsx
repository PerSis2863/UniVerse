'use client';

import { BadgeCheck, CheckCircle2, Clock, HandHeart, ListChecks, ShieldAlert, Sparkles, Users } from 'lucide-react';
import { m as motion } from 'framer-motion';
import { fadeUp, list } from '@/lib/motion';

// The report of an impact room's monthly call (Stage 4 · 4.12, src/server/impact-rooms.ts): the
// month's verified figures and what the call decided, signed by UniVerse. Shown in the room and
// on its public page for sponsors.

export interface ImpactCallReport {
  project: string; ngo: string | null; title: string; callAt: string;
  period: { from: string; to: string };
  figures: { hours: number; volunteers: number; shifts: number; newFollowers: number; pledgers: number; pledgedHoursPerMonth: number };
  call: { summary: string | null; decisions: string[]; nextSteps: string[]; minutes: number; recorded: boolean } | null;
  highlights: string[];
  headline: string; narrative: string; ai: boolean;
  method: string; issuedAt: string; issuedBy: string;
}

const day = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function ImpactReportView({ report, verified }: { report: ImpactCallReport; verified: boolean }) {
  const f = report.figures;
  const stats = [
    { icon: Clock, label: 'Verified hours', value: f.hours },
    { icon: Users, label: 'Volunteers', value: f.volunteers },
    { icon: CheckCircle2, label: 'Shifts', value: f.shifts },
    { icon: HandHeart, label: 'Hours pledged a month', value: f.pledgedHoursPerMonth, sub: f.pledgers ? `by ${f.pledgers}` : undefined },
  ];
  return (
    <motion.div variants={list} initial="hidden" animate="show" className="space-y-4">
      <motion.div variants={fadeUp}>
        <p className="text-xs text-zinc-500">{report.title} · {day(report.period.from)} – {day(report.period.to)}</p>
        <h3 className="mt-1 text-lg font-bold text-zinc-900 dark:text-white leading-snug">{report.headline}</h3>
        <p className={verified ? 'mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400' : 'mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400'}>
          {verified ? <BadgeCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
          {verified ? 'Verified: signed by UniVerse, figures unchanged' : 'Not signed'}
        </p>
      </motion.div>
      <motion.div variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-200 dark:border-white/10 p-3">
            <s.icon className="w-4 h-4 text-indigo-500" />
            <p className="mt-1.5 text-xl font-bold text-zinc-900 dark:text-white tabular-nums">{s.value}</p>
            <p className="text-[11px] text-zinc-500 leading-tight">{s.label}{s.sub ? ` ${s.sub}` : ''}</p>
          </div>
        ))}
      </motion.div>
      <motion.p variants={fadeUp} className="text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-line leading-relaxed">
        {report.narrative}
        {report.ai && <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-zinc-400 align-middle"><Sparkles className="w-3 h-3" />written with AI from the figures</span>}
      </motion.p>
      {report.call && (report.call.decisions.length > 0 || report.call.nextSteps.length > 0) && (
        <motion.div variants={fadeUp} className="grid sm:grid-cols-2 gap-3">
          {report.call.decisions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Decided at the call</p>
              <ul className="mt-1.5 space-y-1 text-sm text-zinc-700 dark:text-zinc-200">{report.call.decisions.map((d, i) => <li key={i} className="flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />{d}</li>)}</ul>
            </div>
          )}
          {report.call.nextSteps.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Next steps</p>
              <ul className="mt-1.5 space-y-1 text-sm text-zinc-700 dark:text-zinc-200">{report.call.nextSteps.map((d, i) => <li key={i} className="flex gap-2"><ListChecks className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />{d}</li>)}</ul>
            </div>
          )}
        </motion.div>
      )}
      {report.highlights.length > 0 && (
        <motion.div variants={fadeUp}>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Highlights</p>
          <ul className="mt-1.5 space-y-1.5">{report.highlights.map((h, i) => <li key={i} className="text-sm text-zinc-700 dark:text-zinc-200 border-l-2 border-indigo-400/60 pl-3">{h}</li>)}</ul>
        </motion.div>
      )}
      <motion.p variants={fadeUp} className="text-[11px] text-zinc-500 leading-relaxed">
        {report.call ? `Impact call: ${report.call.minutes} min${report.call.recorded ? ', recorded' : ''}. ` : ''}{report.method} Issued by {report.issuedBy} on {day(report.issuedAt)}.
      </motion.p>
    </motion.div>
  );
}
