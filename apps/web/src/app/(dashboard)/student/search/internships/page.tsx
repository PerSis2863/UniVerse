'use client';

import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { Briefcase, MapPin } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { authedJson } from '@/lib/authed-fetch';

type Placement = {
  id: string;
  updatedAt: string;
  internship: { title: string; location: string | null; type: string; duration: string | null; startDate: string | null; company: { name: string; logoUrl: string | null; sector: string | null } };
};

export default function InternshipHistoryPage() {
  const { data, error, isLoading } = useSWR<Placement[]>('/api/internships/placements', authedJson);

  return (
    <>
      <Topbar title="Internship History" subtitle="Where students from your campus have been placed" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {error && <p className="text-sm text-rose-500">{(error as Error).message}</p>}
          {isLoading ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl skeleton" />)}</div>
          ) : !data || data.length === 0 ? (
            <FeatureGuide
              icon={Briefcase}
              title="See where your campus gets placed"
              description="Every time a student from your campus is accepted for an internship on UniVerse, the company and role show up here — a great way to discover where to apply."
              steps={['Browse open internships under Schooling → Internships', 'Apply with your CV and a short cover letter', 'Accepted placements appear here (without names)']}
              example={<div><ExampleRow title="Software Engineering Intern" meta="Acme Technologies · Bengaluru · Summer" right="Tech" /><ExampleRow title="Policy Research Intern" meta="Civic Futures Lab · Remote · 3 months" right="Policy" accent="from-emerald-500 to-teal-500" /></div>}
              action={{ label: 'Browse internships', href: '/student/internships' }}
            />
          ) : (
            <div className="space-y-3">
              {data.map((p, i) => (
                <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}
                  className="flex items-center gap-4 p-4 rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03]">
                  {p.internship.company.logoUrl ? (
                    <img src={p.internship.company.logoUrl} alt="" className="w-11 h-11 rounded-xl object-cover bg-white" />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-white font-black">{p.internship.company.name.slice(0, 1)}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-zinc-900 dark:text-white truncate">{p.internship.title}</p>
                    <p className="text-xs text-zinc-500 truncate">{p.internship.company.name}{p.internship.company.sector ? ` · ${p.internship.company.sector}` : ''}</p>
                  </div>
                  <div className="text-right text-xs text-zinc-500 shrink-0">
                    {p.internship.location && <p className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{p.internship.location}</p>}
                    <p>{new Date(p.internship.startDate ?? p.updatedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
