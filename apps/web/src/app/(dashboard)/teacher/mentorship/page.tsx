'use client';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';

import { Topbar } from '@/components/layout/Topbar';
import { m as motion } from 'framer-motion';
import { Users, CalendarCheck, HeartHandshake, Briefcase, MessageSquare, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authedJson } from '@/lib/authed-fetch';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { Avatar } from '@/components/ui/Avatar';
import { MentorSetup } from '@/components/careers/MentorSetup';

// Mentors (industry volunteers, alumni and staff) who help students, and your own mentor profile:
// students book the times you offer from Internships → Mentors (Stage 5 · Q15).

type Mentor = {
  id: string;
  company: string | null;
  jobTitle: string | null;
  skills: unknown;
  hoursCommitted: number;
  isAvailable: boolean;
  isAlumni?: boolean;
  gradYear?: number | null;
  user: { id: string; name: string; avatar: string | null };
};
const skillsOf = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export default function MentorshipPage() {
  const router = useRouter();
  const { data: mentorsData, isLoading: loading } = useSWR<Mentor[]>('/mentorship/mentors', fetcher, {
    onError: () => toast.error('Failed to load mentors'),
  });
  const mentors = Array.isArray(mentorsData) ? mentorsData : [];
  const [opening, setOpening] = useState<string | null>(null);

  // A one-to-one chat with the mentor (made if needed).
  const message = async (m: Mentor) => {
    setOpening(m.id);
    try {
      const { id } = await authedJson<{ id: string }>('/api/chat/conversations', { method: 'POST', body: JSON.stringify({ userId: m.user.id }) });
      router.push(`/teacher/inbox?c=${encodeURIComponent(id)}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOpening(null);
    }
  };

  const [skill, setSkill] = useState('');
  const shown = mentors.filter((m) => {
    const q = skill.trim().toLowerCase();
    return !q || [m.user?.name, m.company, m.jobTitle, ...skillsOf(m.skills)].some((v) => v?.toLowerCase().includes(q));
  });
  const totalHours = mentors.reduce((acc, m) => acc + (m.hoursCommitted || 0), 0);
  const taking = mentors.filter((m) => m.isAvailable).length;

  return (
    <div className="min-h-screen">
      <Topbar
        title="Volunteer & Mentor Portal"
        subtitle="Mentors who help your students, and your own mentoring."
      />

      <main className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

        {/* Header Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="kpi-card group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-700 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                <Users className="w-5 h-5" aria-hidden />
              </div>
              <h3 className="text-zinc-500 dark:text-zinc-400 font-medium">Mentors</h3>
            </div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-white">{mentors.length}</div>
          </div>

          <div className="kpi-card group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-700 dark:text-emerald-400 group-hover:scale-110 transition-transform">
                <CalendarCheck className="w-5 h-5" aria-hidden />
              </div>
              <h3 className="text-zinc-500 dark:text-zinc-400 font-medium">Taking bookings</h3>
            </div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-white">{taking}</div>
          </div>

          <div className="kpi-card group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-800 dark:text-amber-400 group-hover:scale-110 transition-transform">
                <HeartHandshake className="w-5 h-5" aria-hidden />
              </div>
              <h3 className="text-zinc-500 dark:text-zinc-400 font-medium">Hours offered</h3>
            </div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-white">{totalHours}</div>
          </div>
        </div>

        {/* Your own mentoring */}
        <section className="card" aria-labelledby="my-mentoring">
          <h2 id="my-mentoring" className="text-lg font-bold text-zinc-900 dark:text-white">Mentor students yourself</h2>
          <div className="mt-3">
            <MentorSetup intro="Offer times for one-to-one video calls about careers, internships and next steps. Students book them from Internships → Mentors; each booking appears in your Calls and calendar." />
          </div>
        </section>

        {/* Mentors List */}
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Mentors</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Industry volunteers, alumni and staff who help students.</p>
            </div>
            <input
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              placeholder="Filter by skill, company or name"
              aria-label="Filter mentors"
              className="input sm:!w-56"
            />
          </div>

          {loading ? (
            <ContentSkeleton variant="grid" />
          ) : mentors.length === 0 ? (
            <div className="text-center py-10 text-zinc-500">No mentors yet.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {shown.map((mentor, i) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 6) * 0.03 }}
                  key={mentor.id}
                  className="p-5 rounded-xl border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-white/[0.02] hover:bg-zinc-100 dark:hover:bg-white/[0.04] transition-all group min-w-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-4 min-w-0">
                      <Avatar name={mentor.user.name} src={mentor.user.avatar} size={48} />
                      <div className="min-w-0">
                        <h3 className="font-bold text-zinc-900 dark:text-white text-base break-words">{mentor.user.name}</h3>
                        {(mentor.jobTitle || mentor.company) && (
                          <div className="text-sm text-zinc-500 dark:text-zinc-400 flex items-center gap-2 mt-0.5 min-w-0">
                            <Briefcase className="w-3.5 h-3.5 shrink-0" aria-hidden />
                            <span className="truncate">{[mentor.jobTitle, mentor.company].filter(Boolean).join(' · ')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <span className={cn(
                      'text-xs px-2.5 py-1 rounded-full font-medium shrink-0',
                      mentor.isAvailable
                        ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                        : 'bg-amber-500/10 text-amber-800 dark:text-amber-300'
                    )}>
                      {mentor.isAvailable ? 'Taking bookings' : 'Paused'}
                    </span>
                  </div>

                  {(skillsOf(mentor.skills).length > 0 || mentor.isAlumni) && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {mentor.isAlumni && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-fuchsia-500/10 text-fuchsia-800 dark:text-fuchsia-300">
                          <GraduationCap className="w-3.5 h-3.5" aria-hidden /> Alumni{mentor.gradYear ? `, ${mentor.gradYear}` : ''}
                        </span>
                      )}
                      {skillsOf(mentor.skills).map((s) => (
                        <span key={s} className="text-xs px-2 py-1 rounded-md bg-zinc-200 dark:bg-white/5 text-zinc-700 dark:text-zinc-300">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-5 pt-4 border-t border-zinc-200 dark:border-white/[0.06] flex items-center justify-between gap-3">
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      <strong className="text-zinc-900 dark:text-white">{mentor.hoursCommitted || 0}h</strong> offered
                    </div>
                    <button type="button" className="btn-secondary btn-sm" disabled={opening === mentor.id} onClick={() => message(mentor)}>
                      <MessageSquare className="w-4 h-4" aria-hidden /> Message
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
