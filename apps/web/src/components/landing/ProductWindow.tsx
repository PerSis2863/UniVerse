'use client';

import { useRef } from 'react';
import { m as motion, useScroll, useSpring, useTransform } from 'framer-motion';
import { Bell, BookOpen, Briefcase, CalendarClock, Check, ClipboardCheck, Coffee, Folder, GraduationCap, LayoutGrid, ListChecks, MessageSquare, PenLine, Search, Settings, type LucideIcon } from 'lucide-react';
import { AppIcon } from '@/components/apps/AppIcon';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { cn } from '@/lib/utils';
import { CountUp, EASE, Live, useCalm } from './bits';

// M116 (the owner: "really big and attractive", the first impression): under UniVersity's hero, a big
// picture of the student home as it really looks in the app (the M91 look: the near-black menu with a
// white pill for the chosen entry, frosted headline cards with a thin-line icon in a circle, big
// numbers with a small unit, pink only for what is live and the number that matters). Drawn in HTML:
// sharp at any size, almost no weight, and it follows the look. It lies back and tilts up flat as it
// scrolls into view (the product arriving: transform only, through a spring so wheel steps glide).
// Phones get the same home inside a phone. A made-up student on the real screens; no usage numbers.
// Reduce Motion: flat and still. Nothing in it is a control (one picture to screen readers).

type Kpi = { icon: LucideIcon; to: number; unit: string; label: string; sub: string; frost?: 'dusk' | 'gold' };
const KPIS: Kpi[] = [
  { icon: BookOpen, to: 5, unit: '', label: 'Enrolled courses', sub: 'This term', frost: 'dusk' },
  { icon: ClipboardCheck, to: 96, unit: '%', label: 'Attendance', sub: 'Present or late', frost: 'gold' },
  { icon: GraduationCap, to: 86, unit: '%', label: 'Average grade', sub: 'Up 4 since September' },
  { icon: ListChecks, to: 3, unit: '', label: 'Due this week', sub: 'Next: Maths essay' },
];
const MENU: [LucideIcon, string, number?][] = [
  [LayoutGrid, 'Home'], [MessageSquare, 'Messages', 2], [GraduationCap, 'Learn'], [PenLine, 'Collaborate'],
  [Briefcase, 'Careers & impact'], [Coffee, 'Campus'], [Folder, 'My records'], [Settings, 'Settings'],
];
const DAY = [
  { time: '09:00', what: 'English', where: 'Room 2A', state: 'done' },
  { time: '10:30', what: 'Physics', where: 'Lab 4, now', state: 'now' },
  { time: '13:15', what: 'Chemistry', where: 'Lab 2', state: 'later' },
  { time: '14:45', what: 'History', where: 'Room 5C', state: 'later' },
] as const;
const MARKS = [62, 74, 70, 81, 78, 91]; // %, the last one newest
const barHeight = (m: number) => `${Math.round(((m - 40) / 60) * 100)}%`; // marks 40–100 span the bar area, so the climb shows

const card = 'rounded-[22px] border border-white/[0.07] bg-[#151517]';
const pill = (on: boolean) => cn('rounded-full font-semibold', on ? 'bg-[#f4f4f5] text-[#111113]' : 'border border-white/[0.1] text-zinc-300');

export function ProductWindow() {
  const ref = useRef<HTMLDivElement>(null);
  const calm = useCalm();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'start 0.2'] });
  const p = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.6 });
  const rotateX = useTransform(p, [0, 1], [calm ? 0 : 24, 0]);
  const scale = useTransform(p, [0, 1], [calm ? 1 : 0.88, 1]);
  const y = useTransform(p, [0, 1], [calm ? 0 : 48, 0]);
  return (
    <section className="relative px-4 sm:px-6 pb-10 sm:pb-16 lg:-mt-40">
      <div ref={ref} className="relative mx-auto max-w-6xl [perspective:1800px]">
        {/* The warm light the window stands in (the page's corner light, still). */}
        <div aria-hidden className="absolute -inset-x-16 top-[8%] -bottom-[12%] bg-[radial-gradient(closest-side,rgba(214,170,92,0.16),transparent)]" />
        <motion.div style={{ rotateX, scale, y, transformOrigin: '50% 0%' }} className="relative">
          <Live>
            <div role="img" aria-label="UniVersity's student home: today's classes, what is due, attendance, grades and a message from a teacher">
              <div className="hidden md:block"><Desktop /></div>
              <div className="md:hidden"><Phone /></div>
            </div>
          </Live>
        </motion.div>
      </div>
    </section>
  );
}

function Desktop() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/[0.1] bg-[#0b0b0c] shadow-[0_70px_160px_-50px_rgba(0,0,0,0.95)]">
      <div className="flex items-center gap-3 border-b border-white/[0.06] bg-[#0e0e10] px-4 py-3">
        <span className="flex w-14 gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="h-3 w-3 rounded-full bg-white/[0.14]" />)}</span>
        <span className="mx-auto rounded-full bg-white/[0.05] px-4 py-1 font-mono text-xs text-zinc-400">universeimpact.com/student</span>
        <span className="w-14" />
      </div>
      <div className="grid grid-cols-[200px_1fr] lg:grid-cols-[236px_1fr]">
        <Menu />
        <Home />
      </div>
    </div>
  );
}

function Menu() {
  return (
    <div className="flex flex-col gap-0.5 border-e border-white/[0.06] bg-[#0e0e10] p-3">
      <div className="flex items-center gap-2 px-1.5 py-1.5">
        <UniverseLogo size="sm" animated={false} withGlow={false} />
        <span className="truncate text-sm font-black tracking-tight text-white">UniVerse<span className="font-medium text-zinc-400"> Impact</span></span>
      </div>
      <div className="mb-2 mt-2 flex items-center gap-2.5 rounded-2xl border border-white/[0.07] bg-[#151517] p-2.5">
        <AppIcon id="campus" size={30} />
        <span className="min-w-0"><span className="block text-[13px] font-semibold text-white">UniVersity</span><span className="block truncate text-[11px] text-zinc-400">Schools and universities</span></span>
      </div>
      {MENU.map(([Icon, label, count], i) => (
        <span key={label} className={cn('flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium', i === 0 ? 'bg-[#f4f4f5] text-[#111113]' : 'text-zinc-300')}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
          {count && <span className="ms-auto grid h-5 min-w-5 place-items-center rounded-full bg-[var(--ins-hot)] px-1.5 text-[11px] font-bold text-[#111113]">{count}</span>}
        </span>
      ))}
      <div className="mt-auto flex items-center gap-2.5 border-t border-white/[0.06] px-1.5 pt-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#27272a] text-xs font-bold text-white">MP</span>
        <span className="min-w-0"><span className="block text-[13px] font-semibold text-white">Maya Patel</span><span className="block text-[11px] text-zinc-400">Year 11</span></span>
      </div>
    </div>
  );
}

function Home() {
  return (
    <div className="min-w-0 p-5 lg:p-6 [background:radial-gradient(60%_50%_at_100%_0%,rgba(98,136,176,0.13),transparent),radial-gradient(50%_45%_at_0%_100%,rgba(214,170,92,0.1),transparent)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-2xl font-bold tracking-tight text-white">Dashboard</p>
          <p className="text-sm text-zinc-400">Good morning, Maya</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden lg:flex h-9 w-44 items-center gap-2 rounded-full bg-white/[0.05] px-3 text-xs text-zinc-400"><Search className="h-3.5 w-3.5" aria-hidden />Search<span className="ms-auto font-mono text-[11px]">⌘K</span></span>
          <span className="relative grid h-9 w-9 place-items-center rounded-full bg-white/[0.05]">
            <Bell className="h-4 w-4 text-zinc-300" aria-hidden />
            <span className="absolute -end-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--ins-hot)] px-1 text-[11px] font-bold leading-none text-[#111113]">2</span>
          </span>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        {['Overview', 'Timetable', 'Study planner'].map((t, i) => <span key={t} className={cn(pill(i === 0), 'px-4 py-1.5 text-[13px]')}>{t}</span>)}
      </div>
      <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {KPIS.map((k) => <KpiCard key={k.label} k={k} />)}
      </div>
      <div className="mt-3 grid grid-cols-[1.2fr_1fr] gap-3">
        <div className="space-y-3"><UpNext /><Note /></div>
        <Day rows={4} />
      </div>
    </div>
  );
}

function KpiCard({ k, small }: { k: Kpi; small?: boolean }) {
  return (
    <div className={cn(k.frost ? 'rounded-[22px] border border-transparent' : card, small ? 'p-3.5' : 'p-4')} style={k.frost ? { background: `var(--karma-${k.frost})` } : undefined}>
      <span className="karma-icon !h-9 !w-9 text-white"><k.icon className="h-4 w-4" aria-hidden /></span>
      <p className={cn('font-bold leading-none tracking-tight text-white', small ? 'mt-3 text-[28px]' : 'mt-4 text-[34px]')}>
        <CountUp to={k.to} /><span className="ms-0.5 text-base font-semibold text-zinc-300">{k.unit}</span>
      </p>
      <p className="mt-2 text-[13px] font-medium text-white">{k.label}</p>
      <p className="truncate text-xs text-zinc-300">{k.sub}</p>
    </div>
  );
}

function UpNext({ small }: { small?: boolean }) {
  return (
    <div className={cn(card, small ? 'p-3.5' : 'p-4')}>
      <p className="flex items-center gap-2 text-sm font-semibold text-white">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.06]"><CalendarClock className="h-4 w-4 text-zinc-300" aria-hidden /></span>Up next
      </p>
      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/[0.05] px-3 py-2.5">
        {/* The live dot: pink only for what is happening now. */}
        <span className="relative h-2.5 w-2.5 shrink-0"><span className="ins-live absolute inset-0 rounded-full bg-[var(--ins-hot)]" /><span className="absolute inset-0 rounded-full bg-[var(--ins-hot)]" /></span>
        <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-white">Physics: forces and motion</span><span className="block truncate text-xs text-zinc-400">Now, Lab 4 with Ms Rao</span></span>
        {!small && <span className={cn(pill(true), 'px-3 py-1 text-xs')}>Open</span>}
      </div>
      <div className="mt-1.5 flex items-center gap-3 px-3 py-2">
        <ListChecks className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
        <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-white">Maths essay</span><span className="block truncate text-xs text-zinc-400">Due tomorrow, 09:00</span></span>
        <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-white/[0.08]"><span className="block h-full w-[70%] rounded-full bg-white/70" /></span>
      </div>
    </div>
  );
}

function Note() {
  return (
    <div className={cn(card, 'p-4')}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#27272a] text-xs font-bold text-white">SR</span>
        <span className="text-[13px] font-semibold text-white">Ms Rao</span>
        <span className="text-xs text-zinc-400">Physics, 8:12</span>
      </div>
      <p className="mt-2.5 rounded-2xl rounded-ss-md bg-white/[0.06] px-3.5 py-2.5 text-[13px] leading-relaxed text-zinc-200">Lovely lab report, Maya. Have a look at question 3 before Friday.</p>
    </div>
  );
}

function Day({ rows, marks = true }: { rows: number; marks?: boolean }) {
  return (
    <div className={cn(card, 'p-4')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">Your day</p>
        <p className="truncate text-xs text-zinc-400">Thursday 6 November</p>
      </div>
      <ol className="mt-3 space-y-1">
        {DAY.slice(0, rows).map((d) => (
          <li key={d.time} className={cn('flex items-center gap-3 rounded-xl px-2.5 py-2', d.state === 'now' && 'bg-white/[0.05] ring-1 ring-[var(--ins-hot)]/40')}>
            <span className="w-10 shrink-0 font-mono text-xs tabular-nums text-zinc-400">{d.time}</span>
            <span className={cn('h-7 w-1 shrink-0 rounded-full', d.state === 'now' ? 'bg-[var(--ins-hot)]' : d.state === 'done' ? 'bg-white/30' : 'bg-white/[0.12]')} />
            <span className="min-w-0 flex-1"><span className={cn('block truncate text-[13px] font-semibold', d.state === 'done' ? 'text-zinc-400' : 'text-white')}>{d.what}</span><span className="block truncate text-xs text-zinc-400">{d.where}</span></span>
            {d.state === 'done' && <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-400 text-emerald-950"><Check className="h-3 w-3" strokeWidth={3} aria-hidden /></span>}
          </li>
        ))}
      </ol>
      {marks && (
        <div className="mt-3 border-t border-white/[0.06] pt-3">
          <div className="flex items-baseline justify-between"><p className="text-xs text-zinc-400">Last six marks</p><p className="text-xs font-semibold text-white">91%</p></div>
          {/* The bars draw once as they come into view; the newest is the one that matters. */}
          <div className="mt-2 flex h-14 items-end gap-1.5">
            {MARKS.map((m, i) => (
              <motion.span key={i} className={cn('flex-1 origin-bottom rounded-md', i === MARKS.length - 1 ? 'bg-[var(--ins-hot)]' : 'bg-white/20')} style={{ height: barHeight(m) }}
                initial={{ scaleY: 0.15, opacity: 0.4 }} whileInView={{ scaleY: 1, opacity: 1 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.6, delay: 0.1 + i * 0.05, ease: EASE }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Phone() {
  return (
    <div className="mx-auto w-full max-w-[322px] rounded-[2.75rem] border border-white/[0.12] bg-[#0e0e10] p-2.5 shadow-[0_50px_120px_-40px_rgba(0,0,0,0.95)]">
      <div className="overflow-hidden rounded-[2.2rem] bg-[#0b0b0c] [background:radial-gradient(70%_40%_at_100%_0%,rgba(98,136,176,0.14),transparent),#0b0b0c]">
        <div className="flex items-center justify-between px-6 pt-3 text-xs font-semibold text-white">
          <span>9:41</span><span className="h-5 w-20 rounded-full bg-black" /><span className="flex items-end gap-0.5">{[5, 7, 9, 11].map((h) => <span key={h} className="w-[3px] rounded-sm bg-white" style={{ height: h }} />)}</span>
        </div>
        <div className="space-y-3 px-4 pb-4 pt-4">
          <div><p className="text-xl font-bold tracking-tight text-white">Dashboard</p><p className="text-xs text-zinc-400">Good morning, Maya</p></div>
          <UpNext small />
          <div className="grid grid-cols-2 gap-2.5">{KPIS.slice(0, 2).map((k) => <KpiCard key={k.label} k={k} small />)}</div>
          <Day rows={3} marks={false} />
        </div>
        <div className="flex justify-around border-t border-white/[0.06] bg-[#0e0e10] px-3 py-2.5">
          {MENU.slice(0, 4).map(([Icon, label], i) => (
            <span key={label} className={cn('grid h-9 w-12 place-items-center rounded-full', i === 0 ? 'bg-[#f4f4f5] text-[#111113]' : 'text-zinc-400')}><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
          ))}
        </div>
      </div>
    </div>
  );
}
