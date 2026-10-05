'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeftRight, Building2, CheckCircle2, GraduationCap, Loader2, Plus, Users } from 'lucide-react';
import Link from '@/components/ui/Link';
import { api } from '@/lib/api';
import { authedJson } from '@/lib/authed-fetch';
import { courseColor } from '@/lib/course-color';
import { haptic } from '@/lib/haptics';

// My courses → courses from partner campuses (upgrade 9): courses a partner campus shared with the
// student's campus, and their exchange campus's courses during an exchange. Hidden for students
// whose school isn't in a campus network.

interface Joint { id: string; code: string; name: string; description: string | null; credits: number; color: string | null; teacher: string; campus: string | null; viaExchange: boolean; enrolled: boolean; students: number }
interface JointData { courses: Joint[]; exchange: { campus: string; from: string | null; until: string | null } | null }

const day = (v: string | null) => (v ? new Date(v).toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' }) : '');

export function JointCourses() {
  const { data, mutate } = useSWR<JointData>('/api/network/joint', authedJson, { revalidateOnFocus: false });
  const { mutate: refresh } = useSWRConfig();
  const [busy, setBusy] = useState<string | null>(null);
  if (!data || (!data.courses.length && !data.exchange)) return null;

  const enrol = async (c: Joint) => {
    setBusy(c.id);
    haptic('tap');
    try {
      await api.post(`/courses/${c.id}/enroll`);
      await Promise.all([mutate(), refresh('/courses/my')]);
      toast.success(`You joined ${c.code}`, { description: 'It’s in My courses now, with its Blackboard and class calls.' });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-10 space-y-4" aria-labelledby="joint-courses">
      <div>
        <h2 id="joint-courses" className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Building2 className="w-5 h-5 text-indigo-500" aria-hidden />Courses from partner campuses</h2>
        <p className="text-sm text-zinc-500">Partner universities opened these courses to your campus. Join one and it works like your own: Blackboard, quizzes and class calls.</p>
      </div>
      {data.exchange && (
        <p className="rounded-2xl bg-indigo-500/10 text-indigo-800 dark:text-indigo-200 px-4 py-3 text-sm flex items-start gap-2">
          <ArrowLeftRight className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          <span>You’re on exchange at <b>{data.exchange.campus}</b>{data.exchange.from ? ` from ${day(data.exchange.from)}` : ''}{data.exchange.until ? ` to ${day(data.exchange.until)}` : ''}, so you can also join its courses.</span>
        </p>
      )}
      {data.courses.length === 0 ? (
        <p className="text-sm text-zinc-500">No courses are open to you yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.courses.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.05 }}
              className="flex flex-col rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: courseColor(c.color, c.code) }}>{c.code.slice(-3)}</div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-right">{c.viaExchange ? 'Exchange campus' : c.campus ?? 'Partner campus'}</span>
              </div>
              <h3 className="font-bold text-zinc-900 dark:text-white">{c.name}</h3>
              <p className="text-xs font-mono text-zinc-500 mt-0.5">{c.code} · {c.credits} cr{c.campus ? ` · ${c.campus}` : ''}</p>
              {c.description && <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-2 line-clamp-2">{c.description}</p>}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 mt-3">
                <span className="inline-flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" aria-hidden />{c.teacher}</span>
                <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" aria-hidden />{c.students} enrolled</span>
              </div>
              <div className="mt-auto pt-4">
                {c.enrolled ? (
                  <Link href={`/student/blackboard?course=${c.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-4 h-4" aria-hidden /> Joined · Open</Link>
                ) : (
                  <button type="button" onClick={() => void enrol(c)} disabled={busy === c.id} className="btn-primary btn-sm">{busy === c.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Plus className="w-4 h-4" aria-hidden />} Join course</button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
