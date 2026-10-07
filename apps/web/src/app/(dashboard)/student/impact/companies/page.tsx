'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { LoadError } from '@/components/ui/LoadError';
import Link from '@/components/ui/Link';
import { m as motion } from 'framer-motion';
import { Building2, ExternalLink, MapPin } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, OPPORTUNITY_TABS } from '@/components/layout/SectionTabs';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { fetcher } from '@/lib/fetcher';
import { safeHref } from '@/lib/safe-href';

type Partner = { id: string; name: string; type: string; description: string | null; websiteUrl: string | null; logoUrl: string | null; country: string | null };
type Internship = { id: string; title: string; location: string | null; company: { id: string; name: string; logoUrl: string | null; websiteUrl: string | null; sector: string | null; description: string | null } };

export default function CorporatePartnersPage() {
  const { data: partners, isLoading: l1, error: e1, mutate: m1 } = useSWR<Partner[]>('/partners', fetcher);
  const { data: internships, isLoading: l2, error: e2, mutate: m2 } = useSWR<Internship[]>('/internships', fetcher);

  const companies = useMemo(() => {
    const map = new Map<string, { name: string; logoUrl: string | null; websiteUrl: string | null; description: string | null; sector: string | null; country: string | null; roles: Internship[] }>();
    for (const p of Array.isArray(partners) ? partners : []) {
      if (p.type !== 'CORPORATE') continue;
      map.set(p.name.toLowerCase(), { name: p.name, logoUrl: p.logoUrl, websiteUrl: p.websiteUrl, description: p.description, sector: null, country: p.country, roles: [] });
    }
    for (const i of Array.isArray(internships) ? internships : []) {
      const key = i.company.name.toLowerCase();
      const entry = map.get(key) ?? { name: i.company.name, logoUrl: i.company.logoUrl, websiteUrl: i.company.websiteUrl, description: i.company.description, sector: i.company.sector, country: null, roles: [] };
      entry.roles.push(i);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.roles.length - a.roles.length);
  }, [partners, internships]);

  return (
    <>
      <Topbar title="🏢 Corporate Partners" subtitle="Companies working with your campus and their open roles" />
      <SectionTabs tabs={OPPORTUNITY_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {l1 || l2 ? (
            <div className="grid md:grid-cols-2 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-40 rounded-3xl skeleton" />)}</div>
          ) : (e1 && !partners) || (e2 && !internships) ? (
            <LoadError onRetry={() => Promise.all([m1(), m2()])} message="Couldn’t load the companies." />
          ) : companies.length === 0 ? (
            <FeatureGuide
              icon={Building2}
              title="Corporate partners will appear here"
              description="Companies that partner with your campus — for CSR projects, fellowships and internships — show up here with their open roles."
              steps={['Your admin adds company partners', 'Companies post internships and fellowships', 'Apply directly from their open roles']}
              example={<div><ExampleRow title="Acme Technologies" meta="Technology · 3 open internships" right="Partner" /><ExampleRow title="Greenline Energy" meta="Clean energy · CSR fellowship" right="Partner" accent="from-emerald-500 to-teal-500" /></div>}
              action={{ label: 'Browse internships', href: '/student/internships' }}
            />
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {companies.map((c, i) => (
                <motion.div key={c.name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}
                  className="rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    {c.logoUrl ? <img loading="lazy" decoding="async" src={c.logoUrl} alt="" className="w-12 h-12 rounded-xl object-cover bg-white" /> : <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-white font-black">{c.name.slice(0, 2).toUpperCase()}</div>}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-zinc-900 dark:text-white truncate">{c.name}</h3>
                      <p className="text-xs text-zinc-500 inline-flex items-center gap-1">{c.sector ?? 'Company'}{c.country && <><MapPin className="w-3 h-3 ml-1" />{c.country}</>}</p>
                    </div>
                    {c.websiteUrl && <a href={safeHref(c.websiteUrl)} target="_blank" rel="noopener noreferrer" className="text-indigo-500" aria-label="Website"><ExternalLink className="w-4 h-4" /></a>}
                  </div>
                  {c.description && <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">{c.description}</p>}
                  {c.roles.length > 0 ? (
                    <div className="space-y-1.5">
                      {c.roles.slice(0, 3).map((r) => (
                        <Link key={r.id} href="/student/internships" className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 dark:bg-white/[0.03] hover:bg-indigo-500/5 text-sm">
                          <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate">{r.title}</span>
                          <span className="text-xs text-zinc-500 shrink-0 ml-2">{r.location ?? ''}</span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">No open roles right now.</p>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
