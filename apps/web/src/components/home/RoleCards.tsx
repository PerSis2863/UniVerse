'use client';

import { formatDistanceToNowStrict } from 'date-fns';
import { m as motion } from 'framer-motion';
import { AlertTriangle, BookOpen, CalendarPlus, CheckCircle2, ClipboardList, FilePlus2, HelpCircle, Megaphone, PenLine, Plus, ShieldAlert, Target, UserCheck, Users, Wallet, type LucideIcon } from 'lucide-react';
import Link from '@/components/ui/Link';
import { money } from '@/components/fees/shared';
import { fadeUp } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { Attention, LiveNumbers } from './use-home';

// The role-specific home cards (Stage 5 · Q8): the student's daily goal, the teacher's "needs
// attention" list and create shortcuts, and the admin's numbers for today.

const card = 'relative rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl p-5 md:p-6';

function Title({ icon: Icon, children, id }: { icon: LucideIcon; children: React.ReactNode; id: string }) {
  return (
    <h2 id={id} className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-4">
      <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 border border-indigo-500/20 flex items-center justify-center"><Icon className="w-4 h-4 text-indigo-600 dark:text-indigo-300" /></span>
      {children}
    </h2>
  );
}

function Ring({ value, max, size = 92 }: { value: number; max: number; size?: number }) {
  const r = 40, c = 2 * Math.PI * r, share = Math.min(1, max ? value / max : 0);
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90 shrink-0" aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" className="stroke-zinc-200 dark:stroke-white/[0.08]" />
      <motion.circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" strokeLinecap="round" className={share >= 1 ? 'stroke-emerald-500' : 'stroke-indigo-500'}
        strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - c * share }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
    </svg>
  );
}

/** Today's study actions against the student's goal, and the days this week they reached it. */
export function GoalCard({ study, goal, onGoal }: { study: { today: number; week: { day: string; actions: number }[] } | undefined; goal: number; onGoal: (g: number) => void }) {
  if (!study) return null;
  const met = study.week.filter((d) => d.actions >= goal).length;
  const left = Math.max(0, goal - study.today);
  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" aria-labelledby="goal-title" className={card}>
      <Title icon={Target} id="goal-title">Daily goal</Title>
      <div className="flex items-center gap-4">
        <div className="relative">
          <Ring value={study.today} max={goal} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-black text-zinc-900 dark:text-white tabular-nums">{study.today}/{goal}</span>
            <span className="text-[10px] text-zinc-600 dark:text-zinc-400">today</span>
          </div>
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">{left ? `${left} more to reach today’s goal` : 'Goal reached today 🎉'}</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Quizzes, flashcard reviews and questions to your course tutor count.</p>
          <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">Goal
            <select value={goal} onChange={(e) => onGoal(Number(e.target.value))} className="input py-1 w-auto text-xs">
              {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n} a day</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="mt-4">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">This week: goal reached on {met} of 7 days</p>
        <div className="flex gap-1.5" role="list" aria-label="The last 7 days">
          {study.week.map((d) => {
            const label = new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
            return (
              <div key={d.day} role="listitem" className="flex-1 flex flex-col items-center gap-1" aria-label={`${label}: ${d.actions} of ${goal}`}>
                <span aria-hidden className="w-full h-10 rounded-lg bg-zinc-200 dark:bg-white/[0.07] overflow-hidden flex items-end">
                  <span className={cn('w-full rounded-lg', d.actions >= goal ? 'bg-emerald-500' : 'bg-indigo-400')} style={{ height: `${Math.min(100, (d.actions / goal) * 100)}%` }} />
                </span>
                <span aria-hidden className="text-[10px] text-zinc-600 dark:text-zinc-400">{label.slice(0, 2)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </motion.section>
  );
}

function Row({ icon: Icon, tone, title, sub, href, action }: { icon: LucideIcon; tone: 'amber' | 'rose' | 'indigo' | 'sky'; title: string; sub?: string; href: string; action: string }) {
  const tones = { amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-300', indigo: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300', sky: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' };
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', tones[tone])}><Icon className="w-4 h-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-900 dark:text-white">{title}</p>
        {sub && <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate">{sub}</p>}
      </div>
      <Link href={href} className="btn-secondary btn-sm shrink-0" aria-label={`${action}: ${title}`}>{action}</Link>
    </li>
  );
}

/** Work waiting to be graded, missing hand-ins, students at risk and unanswered questions. */
export function AttentionCard({ attention }: { attention: Attention | undefined }) {
  if (!attention) return <section className={card}><div className="h-28 rounded-2xl skeleton" /></section>;
  const { toGrade, late, missing, atRisk, questions } = attention;
  const nothing = !toGrade && !missing.length && !atRisk.total && !questions.total;
  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" aria-labelledby="attention-title" className={card}>
      <Title icon={AlertTriangle} id="attention-title">Needs attention</Title>
      {nothing ? (
        <p className="text-sm text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />All clear: nothing is waiting for you.</p>
      ) : (
        <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
          {toGrade > 0 && <Row icon={PenLine} tone="indigo" title={`${toGrade} waiting to be graded`} sub={late ? `${late} handed in late` : undefined} href="/teacher/assignments" action="Grade" />}
          {missing.map((a) => (
            <Row key={a.id} icon={ClipboardList} tone="amber" title={`${a.missing} haven’t handed in “${a.title}”`} sub={`${a.code} · due ${formatDistanceToNowStrict(new Date(a.due), { addSuffix: true })}`} href={`/teacher/assignments/${a.id}`} action="Open" />
          ))}
          {atRisk.total > 0 && (
            <Row icon={ShieldAlert} tone="rose" title={`${atRisk.total} student${atRisk.total === 1 ? '' : 's'} at risk`} sub={atRisk.students.map((s) => `${s.name} (${s.code})`).join(', ')} href="/teacher/early-warning" action="Review" />
          )}
          {questions.total > 0 && (
            <Row icon={HelpCircle} tone="sky" title={`${questions.total} unanswered question${questions.total === 1 ? '' : 's'}`} sub={questions.threads.map((t) => `“${t.title}” (${t.code})`).join(', ')}
              href={`/teacher/blackboard?course=${questions.threads[0]?.courseId ?? ''}&tab=discussion`} action="Answer" />
          )}
        </ul>
      )}
    </motion.section>
  );
}

/** One tap to the things teachers make most. */
export function CreateCard({ onNewCourse }: { onNewCourse: () => void }) {
  const items: { label: string; icon: LucideIcon; href?: string; onClick?: () => void }[] = [
    { label: 'Assignment', icon: FilePlus2, href: '/teacher/assignments' },
    { label: 'Quiz', icon: CheckCircle2, href: '/teacher/quizzes' },
    { label: 'Announcement', icon: Megaphone, href: '/teacher/blackboard' },
    { label: 'Document', icon: ClipboardList, href: '/docs?new=doc' },
    { label: 'Class call', icon: CalendarPlus, href: '/calls' },
    { label: 'Course', icon: BookOpen, onClick: onNewCourse },
  ];
  const cls = 'group flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors text-center';
  const inner = (it: (typeof items)[number]) => (
    <>
      <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 border border-indigo-500/15 flex items-center justify-center group-hover:scale-110 transition-transform"><it.icon className="w-4 h-4 text-indigo-600 dark:text-indigo-300" /></span>
      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{it.label}</span>
    </>
  );
  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" aria-labelledby="create-title" className={card}>
      <Title icon={Plus} id="create-title">Create</Title>
      <div className="grid grid-cols-3 gap-1">
        {items.map((it) => it.href
          ? <Link key={it.label} href={it.href} className={cls} aria-label={`New ${it.label.toLowerCase()}`}>{inner(it)}</Link>
          : <button key={it.label} type="button" onClick={it.onClick} className={cls} aria-label={`New ${it.label.toLowerCase()}`}>{inner(it)}</button>)}
      </div>
    </motion.section>
  );
}

function Tile({ icon: Icon, label, value, sub, href, tone }: { icon: LucideIcon; label: string; value: string; sub: string; href: string; tone: string }) {
  return (
    <Link href={href} className={cn(card, 'p-4 md:p-5 block hover:border-indigo-500/30 transition-colors')}>
      <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', tone)}><Icon className="w-4 h-4" /></span>
      <span className="block text-2xl font-black text-zinc-900 dark:text-white tabular-nums">{value}</span>
      <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
      <span className="block text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">{sub}</span>
    </Link>
  );
}

/** The school today: attendance, fees collected, open safety flags, who's using UniVerse, approvals. */
export function LiveNumbersCard({ live }: { live: LiveNumbers | undefined }) {
  if (!live) return <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-36 rounded-3xl skeleton" />)}</div>;
  const { attendance: att, fees, safety, active, pending } = live;
  const fee = fees[0];
  return (
    <section aria-labelledby="live-title">
      <h2 id="live-title" className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
        <span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60 motion-reduce:hidden" /><span className="relative w-2 h-2 rounded-full bg-emerald-500" /></span>
        Today, live
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Tile icon={UserCheck} tone="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" label="Attendance today" value={att.marked ? `${Math.round((att.present / att.marked) * 100)}%` : '—'} sub={att.marked ? `${att.present} of ${att.marked} present · ${att.absent} absent` : 'Not taken yet today'} href="/admin/attendance" />
        <Tile icon={Wallet} tone="bg-sky-500/10 text-sky-700 dark:text-sky-300" label="Fees collected today" value={fee ? money(fee.today, fee.currency) : '—'} sub={fee ? `${money(fee.month, fee.currency)} this month${fees.length > 1 ? ` · ${fees.length - 1} more currenc${fees.length > 2 ? 'ies' : 'y'}` : ''}` : 'Nothing this month yet'} href="/admin/fees" />
        <Tile icon={ShieldAlert} tone={safety.high ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'} label="Safety flags open" value={String(safety.open)} sub={safety.high ? `${safety.high} serious` : safety.open ? 'To review' : 'Nothing to review'} href="/admin/safety" />
        <Tile icon={Users} tone="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" label="Using UniVerse now" value={String(active.now)} sub={`${active.today} today`} href="/admin/users" />
        <Tile icon={CheckCircle2} tone="bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300" label="Waiting for approval" value={String(pending)} sub={pending ? 'New accounts' : 'None waiting'} href="/admin/approvals" />
      </div>
    </section>
  );
}
