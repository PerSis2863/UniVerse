'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { CalendarClock, Loader2, MapPin, Sparkles, Users, type LucideIcon } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';

export interface NgoProject {
  id: string;
  name: string;
  description: string;
  type: string | null;
  location: string | null;
  duration: string | null;
  openings: number;
  impactPoints: number;
  skillsRequired: string[];
  sdgNumber: number | null;
  deadline: string | null;
  ngo: { name: string; sector: string | null; isVerified?: boolean };
  _count?: { applications: number };
}

interface Props {
  filter?: (p: NgoProject) => boolean;
  sort?: 'deadline' | 'newest';
  guide: { icon: LucideIcon; title: string; description: string; steps: string[] };
}

const daysLeft = (iso: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null);

/** Real NGO projects from the API, with apply, filtering and an onboarding guide when there are none. */
export function NgoProjectBoard({ filter, sort = 'newest', guide }: Props) {
  const { data, error, isLoading } = useSWR<NgoProject[]>('/impact/ngo-projects', fetcher);
  const [applying, setApplying] = useState<NgoProject | null>(null);
  const [motivation, setMotivation] = useState('');
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<string[]>([]);

  const projects = useMemo(() => {
    const list = (Array.isArray(data) ? data : []).filter((p) => (filter ? filter(p) : true));
    return sort === 'deadline'
      ? [...list].sort((a, b) => (a.deadline ? +new Date(a.deadline) : Infinity) - (b.deadline ? +new Date(b.deadline) : Infinity))
      : list;
  }, [data, filter, sort]);

  const apply = async () => {
    if (!applying) return;
    setBusy(true);
    try {
      await api.post(`/impact/ngo-projects/${applying.id}/apply`, { motivation: motivation.trim() || undefined });
      setApplied((a) => [...a, applying.id]);
      toast.success('Application sent', { description: `${applying.ngo.name} will review it.` });
      setApplying(null);
      setMotivation('');
    } catch {
      toast.error('Could not apply right now. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <div className="grid md:grid-cols-2 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-48 rounded-3xl bg-zinc-200/60 dark:bg-white/[0.04] animate-pulse" />)}</div>;
  if (error) return <p className="text-sm text-rose-500">Couldn&apos;t load projects right now. Please try again shortly.</p>;
  if (projects.length === 0) {
    return (
      <FeatureGuide
        icon={guide.icon}
        title={guide.title}
        description={guide.description}
        steps={guide.steps}
        example={
          <div>
            <ExampleRow title="Weekend Maths Tutoring" meta="City Learning Trust · Remote · 4 openings" right="+50 XP" />
            <ExampleRow title="Community Garden Build" meta="Green Roots NGO · On site · closes in 5 days" right="+80 XP" accent="from-emerald-500 to-teal-500" />
          </div>
        }
        action={{ label: 'Browse the NGO marketplace', href: '/student/impact/ngo-marketplace' }}
      />
    );
  }

  return (
    <>
      <div className="grid md:grid-cols-2 gap-4">
        {projects.map((p, i) => {
          const left = daysLeft(p.deadline);
          const urgent = left !== null && left >= 0 && left <= 14;
          const done = applied.includes(p.id);
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.04 }}
              className="rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl p-5 flex flex-col gap-3 hover:border-indigo-500/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-zinc-900 dark:text-white">{p.name}</h3>
                  <p className="text-xs text-zinc-500">{p.ngo.name}{p.ngo.sector ? ` · ${p.ngo.sector}` : ''}</p>
                </div>
                <span className="shrink-0 text-xs font-bold px-2 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">+{p.impactPoints} XP</span>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-3">{p.description}</p>
              {p.skillsRequired?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {p.skillsRequired.slice(0, 5).map((s) => <span key={s} className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300">{s}</span>)}
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 mt-auto">
                {p.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{p.location}{p.type ? ` · ${p.type}` : ''}</span>}
                <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{p.openings} opening{p.openings === 1 ? '' : 's'}</span>
                {left !== null && left >= 0 && (
                  <span className={cn('inline-flex items-center gap-1', urgent && 'text-rose-500 font-semibold')}><CalendarClock className="w-3.5 h-3.5" />closes in {left} day{left === 1 ? '' : 's'}</span>
                )}
              </div>
              <button
                onClick={() => setApplying(p)}
                disabled={done}
                className={cn('mt-1 w-full py-2.5 rounded-xl text-sm font-bold transition-colors', done ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white hover:opacity-95')}
              >
                {done ? 'Applied' : 'Apply'}
              </button>
            </motion.div>
          );
        })}
      </div>

      {applying && (
        <div className="backdrop-in fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={(e) => e.target === e.currentTarget && setApplying(null)}>
          <div className="sheet-in w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#11152a] border border-zinc-200 dark:border-white/10 p-6 shadow-2xl">
            <h3 className="text-lg font-black text-zinc-900 dark:text-white flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-500" /> Apply to {applying.name}</h3>
            <p className="text-sm text-zinc-500 mt-1">{applying.ngo.name} will review your application.</p>
            <textarea
              autoFocus
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              maxLength={2000}
              placeholder="Why do you want to join, and what can you bring? (optional)"
              className="mt-4 w-full min-h-[120px] px-4 py-3 rounded-2xl bg-zinc-50 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setApplying(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-white/[0.06]">Cancel</button>
              <button onClick={apply} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-fuchsia-600 disabled:opacity-60 inline-flex items-center justify-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send application
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
