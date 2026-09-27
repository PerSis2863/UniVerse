'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Building2, HandHeart, Globe2, Handshake, MapPin, ExternalLink, Search } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';

interface Partner {
  id: string;
  name: string;
  type: string; // CORPORATE | NGO | ACADEMIC | GOVERNMENT
  description?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  country?: string | null;
  partnerships?: { id: string }[];
}

const TYPE_LABEL: Record<string, string> = {
  ACADEMIC: 'University',
  NGO: 'NGO',
  CORPORATE: 'Company',
  GOVERNMENT: 'Government',
};
const FILTERS = ['ALL', 'ACADEMIC', 'NGO', 'CORPORATE'] as const;
const GRADIENTS = ['from-indigo-500 to-violet-500', 'from-fuchsia-500 to-pink-500', 'from-cyan-500 to-blue-500', 'from-emerald-500 to-teal-500'];

export default function GlobalPartnersPage() {
  const { data, error, isLoading } = useSWR<Partner[]>('/partners', fetcher);
  const [filterType, setFilterType] = useState<(typeof FILTERS)[number]>('ALL');
  const [search, setSearch] = useState('');
  const partners = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const filtered = partners.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || (p.country ?? '').toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q);
    return matchesSearch && (filterType === 'ALL' || p.type === filterType);
  });

  const stats = [
    { label: 'Partner universities', value: partners.filter((p) => p.type === 'ACADEMIC').length, icon: Building2 },
    { label: 'Partner NGOs', value: partners.filter((p) => p.type === 'NGO').length, icon: HandHeart },
    { label: 'Countries', value: new Set(partners.map((p) => p.country).filter(Boolean)).size, icon: Globe2 },
    { label: 'Active partnerships', value: partners.reduce((n, p) => n + (p.partnerships?.length ?? 0), 0), icon: Handshake },
  ];

  return (
    <>
      <Topbar title="Partner Network" subtitle="Universities, NGOs and organizations working with your campus" />

      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl flex items-center gap-4"
              >
                <div className="w-11 h-11 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
                  <s.icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-black text-zinc-900 dark:text-white tabular-nums">{isLoading ? '–' : s.value}</div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">{s.label}</div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, country or focus…"
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {FILTERS.map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                    filterType === type
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  {type === 'ALL' ? 'All' : `${TYPE_LABEL[type]}s`}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-rose-500">Couldn&apos;t load partners right now. Please try again shortly.</p>}

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-48 rounded-2xl bg-zinc-100 dark:bg-white/[0.04] animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 p-12 text-center">
              <Handshake className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
              <h3 className="font-bold text-zinc-900 dark:text-white">{partners.length === 0 ? 'No partners yet' : 'No partners match your search'}</h3>
              <p className="text-sm text-zinc-500 mt-1">
                {partners.length === 0 ? 'Partner organizations will appear here once your administrators add them.' : 'Try a different name or filter.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filtered.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.04 }}
                  className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-6 hover:border-indigo-500/30 transition-all flex flex-col gap-4 group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      {p.logoUrl ? (
                        <img src={p.logoUrl} alt="" loading="lazy" className="w-12 h-12 rounded-xl object-cover bg-white shrink-0" />
                      ) : (
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${GRADIENTS[i % GRADIENTS.length]} flex items-center justify-center text-white font-black shrink-0`}>
                          {p.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-bold text-zinc-900 dark:text-white truncate group-hover:text-indigo-400 transition-colors">{p.name}</h3>
                        {p.country && (
                          <div className="flex items-center gap-1.5 text-xs text-zinc-500 mt-0.5">
                            <MapPin className="w-3.5 h-3.5" /> {p.country}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 whitespace-nowrap">
                      {TYPE_LABEL[p.type] ?? p.type}
                    </span>
                  </div>
                  {p.description && <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed line-clamp-3">{p.description}</p>}
                  <div className="mt-auto pt-4 border-t border-zinc-200 dark:border-zinc-800/60 flex items-center justify-between text-xs">
                    <span className="text-zinc-500">
                      <strong className="text-zinc-900 dark:text-white">{p.partnerships?.length ?? 0}</strong> active partnership{p.partnerships?.length === 1 ? '' : 's'}
                    </span>
                    {p.websiteUrl && (
                      <a href={p.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-indigo-500 hover:text-indigo-400 font-semibold">
                        Website <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
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
