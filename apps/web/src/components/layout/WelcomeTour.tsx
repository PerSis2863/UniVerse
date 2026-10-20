'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { authedJson } from '@/lib/authed-fetch';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

// The guided tour (Stage 5 · Q18): a few stops for each role that point at the real buttons: the
// menu item, the phone's tab bar, the search field, the bell. Each stop finds its button on screen
// (data-tour-href on menu links and tabs, data-tour-hrefs on a closed menu group, data-tour on the
// rest); when it's hidden (a phone's menu), the More button is shown instead, and with nothing to
// point at, the card sits in the middle. Skip ends it; Later (or Escape) closes it and it comes back
// at the same stop next time; progress and finishing are saved on the account (tourStep,
// tourDoneAt), so another device carries on. Search ("Take the tour") starts it again:
// window.dispatchEvent(new Event('universe:tour')).

type Stop = { title: string; text: string; href?: string; target?: 'search' | 'notifications' };

const STOPS: Record<string, Stop[]> = {
  STUDENT: [
    { title: 'Your home', text: 'Your day at a glance: classes, what’s due and the latest from your university.', href: '/student' },
    { title: 'Courses', text: 'Every course you take, with its materials, live classes and courses saved for offline.', href: '/student/courses' },
    { title: 'Blackboard', text: 'Announcements and materials for each course, and the AI tutor that answers from them.', href: '/student/blackboard' },
    { title: 'Messages', text: 'Chats with classmates, teachers and groups, and your calls.', href: '/student/inbox' },
    { title: 'Global Impact', text: 'Projects and volunteering to join, your verified credentials and your skills passport.', href: '/student/impact/ngo-marketplace' },
    { title: 'Student life', text: 'Clubs, events and tickets, the campus board, rooms and the dining menu.', href: '/student/life/associations' },
    { title: 'Search', text: 'Find any page, person, course or setting from here (or press Ctrl+K).', target: 'search' },
    { title: 'Notifications', text: 'New grades, messages and reminders arrive here. Choose what you’re told about in Settings.', target: 'notifications' },
    { title: 'Settings', text: 'Your profile (photo, cover, pronouns, links), the language, notifications and accessibility.', href: '/student/settings' },
  ],
  TEACHER: [
    { title: 'Your home', text: 'Your classes and what needs your attention today.', href: '/teacher' },
    { title: 'Courses', text: 'Your courses: materials, modules, live classes and the gradebook.', href: '/teacher/courses' },
    { title: 'Blackboard', text: 'Post announcements and materials; the AI tutor answers your students from them.', href: '/teacher/blackboard' },
    { title: 'Students', text: 'Your students, early warnings, mastery and meetings with parents.', href: '/teacher/students' },
    { title: 'Grades', text: 'Mark work, give feedback and see the gradebook.', href: '/teacher/grades' },
    { title: 'Messages', text: 'Chat with students, colleagues and parents, and your calls.', href: '/teacher/inbox' },
    { title: 'Search', text: 'Find any page, person, course or setting from here (or press Ctrl+K).', target: 'search' },
    { title: 'Settings', text: 'Your profile, notifications, the hours parents can message you and accessibility.', href: '/teacher/settings' },
  ],
  ADMIN: [
    { title: 'Overview', text: 'How your school is doing today: people, courses, activity and anything that needs you.', href: '/admin' },
    { title: 'Users', text: 'Invite staff and students, change roles, import from a spreadsheet.', href: '/admin/users' },
    { title: 'Verify credentials', text: 'Approve the credentials students request, signed so employers can check them.', href: '/admin/credentials' },
    { title: 'Student life', text: 'Events, ticket prices, menus and campus services.', href: '/admin/student-life' },
    { title: 'Messages', text: 'Chats, calls and announcements to everyone.', href: '/admin/inbox' },
    { title: 'Search', text: 'Find any page, person, course or setting from here (or press Ctrl+K).', target: 'search' },
    { title: 'Settings', text: 'Your profile and your school’s settings.', href: '/admin/settings' },
  ],
};

const doneKey = (userId: string) => `universe-tour-done:${userId}`;
const visible = (el: Element | null): el is HTMLElement => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight && getComputedStyle(el).visibility !== 'hidden';
};
const first = (selector: string) => [...document.querySelectorAll(selector)].find(visible) ?? null;

/** The button a stop points at, and whether it's the stop's own or a stand-in (a menu group, More). */
function locate(stop: Stop): { el: HTMLElement; via?: string } | null {
  if (stop.target) { const el = first(`[data-tour="${stop.target}"]`); return el ? { el } : null; }
  if (!stop.href) return null;
  const own = first(`[data-tour-href="${CSS.escape(stop.href)}"]`);
  if (own) return { el: own };
  const group = first(`[data-tour-hrefs~="${CSS.escape(stop.href)}"]`);
  if (group) return { el: group, via: `Open ${group.textContent?.trim() || 'this menu'} to find it.` };
  const more = first('[data-tour="more"]');
  return more ? { el: more, via: 'It’s under More.' } : null;
}

type Spot = { top: number; left: number; width: number; height: number; via?: string };

export function WelcomeTour({ role }: { role?: string }) {
  const user = useAuthStore((s) => s.user);
  const stops = STOPS[role ?? ''];
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const next = useRef<HTMLButtonElement>(null);
  // The account (already loaded with the app's startup data, so no extra request).
  const { data: account } = useSWR<{ id: string; tourDoneAt?: string | null; tourStep?: number }>(user?.id ? '/api/core/users/me' : null, authedJson, { revalidateOnFocus: false });

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
    const resume = () => { setStep(Math.min(account.tourStep ?? 0, stops.length - 1)); setOpen(true); };
    const t = seen ? undefined : setTimeout(resume, 800);
    const again = () => { setStep(0); setOpen(true); };
    window.addEventListener('universe:tour', again);
    return () => { if (t) clearTimeout(t); window.removeEventListener('universe:tour', again); };
  }, [user?.id, stops, account]);

  // Find this stop's button (after the page settles), bring it into view, and follow it.
  const stop = stops?.[step];
  useEffect(() => {
    if (!open || !stop) return;
    let frame = 0;
    const measure = () => {
      const found = locate(stop);
      if (!found) { setSpot(null); return; }
      const r = found.el.getBoundingClientRect();
      setSpot({ top: r.top, left: r.left, width: r.width, height: r.height, via: found.via });
    };
    const start = setTimeout(() => {
      locate(stop)?.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      frame = requestAnimationFrame(measure);
    }, 60);
    const follow = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    // Menus and tab bars can still be sliding into place: measure again as the page settles.
    const settle = [350, 900].map((ms) => setTimeout(follow, ms));
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    return () => { clearTimeout(start); settle.forEach(clearTimeout); cancelAnimationFrame(frame); window.removeEventListener('resize', follow); window.removeEventListener('scroll', follow, true); };
  }, [open, stop]);
  useEffect(() => { if (open) next.current?.focus({ preventScroll: true }); }, [open, step]);

  if (!open || !stops || !user || !stop) return null;
  const last = step === stops.length - 1;
  const goTo = (n: number) => {
    setStep(n);
    void api.patch('/users/me', { tourStep: n }).catch(() => {});
  };
  const finish = () => {
    try { localStorage.setItem(doneKey(user.id), '1'); } catch { /* ignore */ }
    setOpen(false);
    void api.patch('/users/me', { tourDone: true, tourStep: 0 }).catch(() => {});
  };
  // Later: close for now; it comes back at this stop next time.
  const later = () => { setOpen(false); void api.patch('/users/me', { tourStep: step }).catch(() => {}); };

  // Where the card goes: under the button when there's room, else above it; centred with no button.
  const W = typeof window === 'undefined' ? 390 : window.innerWidth, H = typeof window === 'undefined' ? 800 : window.innerHeight;
  const cardW = Math.min(360, W - 24);
  const pad = 6;
  const card: React.CSSProperties | undefined = spot
    ? {
        width: cardW,
        left: Math.max(12, Math.min(W - cardW - 12, spot.left + spot.width / 2 - cardW / 2)),
        ...(spot.top + spot.height + 230 < H ? { top: spot.top + spot.height + pad + 10 } : { bottom: H - spot.top + pad + 10 }),
      }
    : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      aria-describedby="tour-text"
      className="fixed inset-0 z-[110]"
      onKeyDown={(e) => {
        if (e.key === 'Escape') later();
        if (e.key === 'ArrowRight' && !last) goTo(step + 1);
        if (e.key === 'ArrowLeft' && step > 0) goTo(step - 1);
      }}
    >
      {spot ? (
        // The spotlight: a ring around the real button, everything else dimmed.
        <div aria-hidden className="absolute rounded-2xl ring-2 ring-white/90 transition-all duration-300 ease-out pointer-events-none"
          style={{ top: spot.top - pad, left: spot.left - pad, width: spot.width + pad * 2, height: spot.height + pad * 2, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }} />
      ) : <div aria-hidden className="absolute inset-0 bg-black/55" />}
      <div className={cn('absolute rounded-3xl glass-sidebar border border-zinc-200 dark:border-white/10 shadow-2xl p-5', !spot && 'left-3 right-3 bottom-3 sm:left-1/2 sm:right-auto sm:bottom-auto sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[24rem]')} style={card}>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Tour · {step + 1} of {stops.length}</p>
        <h2 id="tour-title" className="mt-1.5 font-bold text-lg text-zinc-900 dark:text-white leading-snug">{stop.title}</h2>
        <p id="tour-text" className="text-sm text-zinc-600 dark:text-zinc-300 mt-1">{stop.text}{spot?.via ? ` ${spot.via}` : ''}</p>
        <div className="mt-3 h-1 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden" aria-hidden>
          <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${((step + 1) / stops.length) * 100}%` }} />
        </div>
        <div className="mt-4 flex items-center gap-1.5">
          <button type="button" onClick={finish} className="btn-ghost btn-sm">Skip tour</button>
          <button type="button" onClick={later} className="btn-ghost btn-sm">Later</button>
          <span className="flex-1" />
          {step > 0 && <button type="button" onClick={() => goTo(step - 1)} className="btn-secondary btn-sm">Back</button>}
          <button ref={next} type="button" onClick={() => (last ? finish() : goTo(step + 1))} className="btn-primary btn-sm">{last ? 'Done' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}
