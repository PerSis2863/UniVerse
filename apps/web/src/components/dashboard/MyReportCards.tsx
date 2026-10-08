'use client';

import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { ClipboardList, Printer } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { fadeUp, list } from '@/lib/motion';
import { reportCardsPage, type ReportCardData } from '@/lib/report-card';
import { openPrintable } from '@/lib/open-printable';

// Student Grades → the report cards the school has published (Stage 5 · B15.3). Hidden when none.

type MyCard = { id: string; data: ReportCardData; comment: string | null; run: { title: string; fromDate: string; toDate: string } };

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const pct = (n: number | null) => (n == null ? '—' : `${n}%`);

export function MyReportCards() {
  const { data } = useSWR<{ cards: MyCard[] }>('/api/report-cards/mine', authedJson);
  if (!data?.cards.length) return null;

  const print = (c: MyCard) => {
    if (!openPrintable(reportCardsPage(`Report card · ${c.run.title}`, [{ data: c.data, comment: c.comment }]))) toast.error('Allow pop-ups to print your report card.');
    else toast.success('Report card opened', { description: 'Choose “Save as PDF” in the print dialog to keep a copy.' });
  };

  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" className="card" aria-labelledby="report-cards-title">
      <h2 id="report-cards-title" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><ClipboardList className="w-5 h-5 text-indigo-500" /> Report cards</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-4">From your school, one per term. Print one or save it as a PDF.</p>
      <motion.ul variants={list} initial="hidden" animate="show" className="grid gap-3 md:grid-cols-2">
        {data.cards.map((c) => (
          <motion.li key={c.id} variants={fadeUp} className="rounded-2xl border border-zinc-200/70 dark:border-white/[0.07] p-4 flex flex-col">
            <p className="font-semibold text-zinc-900 dark:text-white">{c.run.title}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{day(c.run.fromDate)} – {day(c.run.toDate)}</p>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              {[['Average', pct(c.data.overall.average)], ['GPA', c.data.overall.gpa == null ? '—' : c.data.overall.gpa.toFixed(2)], ['Attendance', pct(c.data.overall.attendanceRate)]].map(([k, v]) => (
                <div key={k}><dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{k}</dt><dd className="font-bold tabular-nums text-zinc-900 dark:text-white">{v}</dd></div>
              ))}
            </dl>
            {c.data.courses.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Courses">
                {c.data.courses.map((x) => (
                  <li key={x.code} className="rounded-full bg-zinc-100 dark:bg-white/[0.06] px-2.5 py-1 text-xs text-zinc-700 dark:text-zinc-300"><b className="font-semibold">{x.code}</b> {x.final == null ? '—' : `${x.final}% · ${x.letter}`}</li>
                ))}
              </ul>
            )}
            {c.comment && <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300 line-clamp-3">“{c.comment}”</p>}
            <button type="button" onClick={() => print(c)} className="btn-secondary btn-sm mt-4 self-start"><Printer className="w-4 h-4" /> Print</button>
          </motion.li>
        ))}
      </motion.ul>
    </motion.section>
  );
}
