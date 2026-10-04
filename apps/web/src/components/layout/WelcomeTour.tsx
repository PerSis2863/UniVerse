'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { authedJson } from '@/lib/authed-fetch';
import { useRouter } from 'next/navigation';
import { BookOpen, Globe2, GraduationCap, LayoutDashboard, MessageSquare, Search, type LucideIcon } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

// A short first-time tour of the main places in the menu, shown once per person: skipping or
// finishing it is saved on the account (tourDoneAt), so it doesn't come back on another device,
// in the installed app, or after the browser's storage is cleared.
// Search can bring it back ("Take the tour"): window.dispatchEvent(new Event('universe:tour')).

type Stop = { icon: LucideIcon; title: string; text: string; href?: string; search?: boolean };

const STOPS: Record<string, Stop[]> = {
  STUDENT: [
    { icon: LayoutDashboard, title: 'Dashboard', text: 'Your day at a glance. Its tabs hold your timetable and the latest information from your university.', href: '/student' },
    { icon: BookOpen, title: 'Blackboard', text: 'Under Schooling: each course’s materials and announcements, plus the AI tutor that answers from them.', href: '/student/blackboard' },
    { icon: GraduationCap, title: 'My progress', text: 'Also under Schooling: your grades, attendance and quizzes in one place.', href: '/student/grades' },
    { icon: Globe2, title: 'Global Impact', text: 'Projects to join, your verified credentials and your skills passport to share with employers.', href: '/student/impact/ngo-marketplace' },
    { icon: Search, title: 'Search', text: 'Press the search button (or Ctrl+K) to find any page, person, course, internship or link.', search: true },
  ],
  TEACHER: [
    { icon: LayoutDashboard, title: 'Dashboard', text: 'Your classes and what needs your attention today.', href: '/teacher' },
    { icon: BookOpen, title: 'Blackboard', text: 'Under Schooling: post announcements and materials. The AI tutor tab answers your students from those materials.', href: '/teacher/blackboard' },
    { icon: GraduationCap, title: 'Grades and quizzes', text: 'Also under Schooling: grade work, run quizzes and take attendance.', href: '/teacher/grades' },
    { icon: MessageSquare, title: 'Messages', text: 'Chat with students, colleagues and groups.', href: '/teacher/inbox' },
    { icon: Search, title: 'Search', text: 'Press the search button (or Ctrl+K) to find any page, person or course.', search: true },
  ],
};

const doneKey = (userId: string) => `universe-tour-done:${userId}`;

export function WelcomeTour({ role }: { role?: string }) {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const stops = STOPS[role ?? ''];
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  // The account (already loaded with the app's startup data, so no extra request).
  const { data: account } = useSWR<{ id: string; tourDoneAt?: string | null }>(user?.id ? '/api/core/users/me' : null, authedJson, { revalidateOnFocus: false });

  useEffect(() => {
    if (!user?.id || !stops || !account) return;
    let seen = !!account.tourDoneAt;
    try {
      if (localStorage.getItem(doneKey(user.id))) {
        // Skipped on this device before the account remembered it: save it there now.
        if (!seen) void api.patch('/users/me', { tourDone: true }).catch(() => {});
        seen = true;
      }
    } catch { /* storage blocked: the account decides */ }
    const t = seen ? undefined : setTimeout(() => setOpen(true), 800);
    const again = () => { setStep(0); setOpen(true); };
    window.addEventListener('universe:tour', again);
    return () => { if (t) clearTimeout(t); window.removeEventListener('universe:tour', again); };
  }, [user?.id, stops, account]);

  if (!open || !stops || !user) return null;
  const stop = stops[step];
  const last = step === stops.length - 1;
  const finish = () => {
    try { localStorage.setItem(doneKey(user.id), '1'); } catch { /* ignore */ }
    setOpen(false);
    void api.patch('/users/me', { tourDone: true }).catch(() => {});
  };
  const show = () => {
    finish();
    if (stop.search) window.dispatchEvent(new Event('universe:open-palette'));
    else if (stop.href) router.push(stop.href);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      className="backdrop-in fixed inset-0 z-[110] bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && finish()}
      onKeyDown={(e) => { if (e.key === 'Escape') finish(); }}
    >
      <div data-sheet className="sheet-in w-full sm:max-w-md rounded-3xl glass-sidebar border border-zinc-200 dark:border-white/10 shadow-2xl p-5 sheet-safe-bottom sm:pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Welcome to UniVerse · {step + 1} of {stops.length}</p>
        <div className="mt-3 flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-indigo-500/12 text-indigo-500">
            <stop.icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 id="tour-title" className="font-bold text-lg text-zinc-900 dark:text-white leading-snug">{stop.title}</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{stop.text}</p>
          </div>
        </div>
        <div className="mt-4 flex justify-center gap-1.5" aria-hidden="true">
          {stops.map((_, i) => <span key={i} className={cn('h-1.5 rounded-full transition-all', i === step ? 'w-5 bg-indigo-500' : 'w-1.5 bg-zinc-300 dark:bg-white/20')} />)}
        </div>
        <div className="mt-5 flex items-center gap-2">
          <button onClick={finish} className="px-3 py-2.5 rounded-xl text-sm font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white">Skip</button>
          <div className="flex-1" />
          <button onClick={show} className="px-3.5 py-2.5 rounded-xl text-sm font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-white/[0.07] hover:bg-zinc-200 dark:hover:bg-white/10">
            {stop.search ? 'Open search' : 'Take me there'}
          </button>
          <button autoFocus onClick={() => (last ? finish() : setStep(step + 1))} className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500">
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
