'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Bell, Camera, Check, Clock3, Crown, Droplets, Flame, GraduationCap, MapPin, Medal, TreePine, Truck } from 'lucide-react';
import { AppIcon } from '@/components/apps/AppIcon';
import type { AppId } from '@/lib/apps';
import { cn } from '@/lib/utils';
import { EASE } from './bits';

// The landing hero's phones for UniVersity, Relief, Green and Play, in the style of Trace's
// PassportCard: each plays one short story step by step (about 9 s) and starts again. With Reduce
// Motion each shows its finished screen and stays still.

const STEPS = 11;
const STEP_MS = 900;

/** The story's step (0…STEPS-1); the last step with Reduce Motion. */
function useStep() {
  const calm = useReducedMotion();
  const [s, set] = useState(0);
  useEffect(() => {
    if (calm) return;
    const t = setInterval(() => set((x) => (x + 1) % STEPS), STEP_MS);
    return () => clearInterval(t);
  }, [calm]);
  return calm ? STEPS - 1 : s;
}

const rise = { initial: { opacity: 0, y: 14, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, transition: { duration: 0.2 } }, transition: { duration: 0.5, ease: EASE } };

/** The phone: a frame, a notch, a status bar with the app's name. Shared with PassportCard's look. */
export function Phone({ app, title, label, children }: { app: AppId; title: string; label: string; children: React.ReactNode }) {
  return (
    <div className="relative w-[300px] sm:w-[330px] rounded-[44px] p-3 bg-gradient-to-b from-white/15 to-white/[0.03] shadow-[0_40px_90px_-30px_rgba(236,72,153,0.55)] ring-1 ring-white/10" aria-label={label} role="img">
      <div className="passport relative min-h-[540px] overflow-hidden rounded-[34px] px-4 pb-5 pt-10">
        <span aria-hidden className="absolute left-1/2 top-3 h-5 w-20 -translate-x-1/2 rounded-full bg-black/80" />
        <div className="flex items-center gap-2.5">
          <AppIcon id={app} size={30} />
          <p className="text-sm font-bold text-white">{title}</p>
          <span className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-pink-500/15 px-2 py-0.5 text-[11px] font-semibold text-pink-200"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pink-400" />live</span>
        </div>
        <div className="relative mt-4">{children}</div>
      </div>
    </div>
  );
}

/** A finger's tap: a ring that grows and fades where a button is pressed. */
function Tap({ on }: { on: boolean }) {
  return (
    <AnimatePresence>
      {on && <motion.span key="tap" aria-hidden initial={{ opacity: 0.7, scale: 0.6 }} animate={{ opacity: 0, scale: 1.8 }} exit={{ opacity: 0 }} transition={{ duration: 0.7, ease: EASE }} className="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-pink-300" />}
    </AnimatePresence>
  );
}

/* ── UniVersity: a late hand-in goes to the teacher, then into the gradebook ── */
const CLASS = [['Ana López', 'B+'], ['Tom Reid', 'A−'], ['Sara Khan', 'A']] as const;

export function CampusPhone() {
  const s = useStep();
  return (
    <Phone app="campus" title="Late hand-ins" label="A late hand-in going to the teacher, then into the gradebook">
      <AnimatePresence>
        {s >= 1 && (
          <motion.div key="in" {...rise} className="passport-card flex items-center gap-3 px-3.5 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10"><Bell className="h-4 w-4 text-white" aria-hidden /></span>
            <div className="min-w-0"><p className="text-sm font-semibold text-white">Maths essay handed in</p><p className="text-[11px] text-zinc-300">Ana López · 9:42</p></div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mt-2.5 min-h-[52px]">
        <AnimatePresence>
          {s >= 2 && (
            <motion.div key="late" {...rise} className="flex items-center gap-2 rounded-2xl bg-amber-400/10 px-3.5 py-3 ring-1 ring-amber-300/30">
              <Clock3 className="h-4 w-4 text-amber-300" aria-hidden />
              <p className="text-sm text-white">Due 9:00 · <b>42 min late</b></p>
              <span className="ms-auto rounded-full bg-amber-300 px-2 py-0.5 text-[11px] font-bold text-amber-950">Late?</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="mt-2.5 min-h-[104px]">
        <AnimatePresence mode="wait">
          {s >= 3 && s < 6 && (
            <motion.div key="ask" {...rise} className="passport-card px-3.5 py-3 ring-1 ring-fuchsia-400/30">
              <p className="text-sm font-semibold text-white">Ask the teacher</p>
              <p className="text-[11px] text-zinc-300">Ms Reid decides, nobody chases anyone</p>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <span className="rounded-full bg-white/10 py-1.5 text-center text-xs font-semibold text-white">Accept</span>
                <motion.span animate={{ scale: s === 4 ? 0.94 : 1 }} transition={{ duration: 0.2 }} className={cn('relative rounded-full py-1.5 text-center text-xs font-semibold transition-colors duration-300', s >= 4 ? 'bg-pink-500 text-white' : 'bg-white/10 text-white')}>
                  Extension<Tap on={s === 4} />
                </motion.span>
              </div>
            </motion.div>
          )}
          {s >= 6 && (
            <motion.div key="done" {...rise} className="flex items-center gap-2 rounded-2xl bg-emerald-400/10 px-3.5 py-3 ring-1 ring-emerald-300/30">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-400 text-emerald-950"><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /></span>
              <p className="text-sm text-white">Extension until <b>Friday</b></p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="passport-card mt-2.5 px-3.5 py-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-300"><GraduationCap className="h-3.5 w-3.5" aria-hidden />Gradebook · Maths</p>
        <ul className="mt-2 space-y-1.5">
          {CLASS.map(([name, grade], i) => {
            const lit = i === 0 && s >= 7;
            return (
              <li key={name} className={cn('flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors duration-500', lit && 'bg-pink-500/15')}>
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-[11px] font-bold text-white">{name[0]}</span>
                <span className="text-sm text-white">{name}</span>
                <span className="ms-auto text-[11px] text-zinc-300">{i === 0 ? (s >= 7 ? 'extended' : 'waiting') : 'on time'}</span>
                <span className="w-7 text-end font-mono text-sm font-bold text-white">{i === 0 && s < 7 ? '–' : grade}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <AnimatePresence>
        {s >= 8 && <motion.p key="told" {...rise} className="mt-3 text-center text-xs text-zinc-300">Ana sees it on her phone · nobody had to email</motion.p>}
      </AnimatePresence>
    </Phone>
  );
}

/* ── Relief: a need appears on the map, a helper takes it, the van drives there ── */
const ROUTE = [[18, 82], [18, 60], [46, 60], [46, 34], [74, 34]] as const;

export function ReliefPhone() {
  const s = useStep();
  const calm = useReducedMotion();
  const driving = s >= 4, delivered = s >= 7;
  return (
    <Phone app="relief" title="Needs near you" label="A need for water matched with a helper who drives it there">
      <div className="relative h-[250px] overflow-hidden rounded-3xl bg-[#121214] ring-1 ring-white/10">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d="M-5 20 C 30 30, 55 8, 105 18" stroke="#1e3a5f" strokeWidth="7" fill="none" />
          {[12, 34, 60, 86].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth="2.5" />)}
          {[18, 46, 74].map((x) => <line key={x} y1="0" y2="100" x1={x} x2={x} stroke="rgba(255,255,255,0.07)" strokeWidth="2.5" />)}
          <motion.polyline points={ROUTE.map((p) => p.join(',')).join(' ')} fill="none" stroke="#ec4899" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
            initial={false} animate={{ pathLength: driving ? 1 : 0, opacity: driving ? 1 : 0 }} transition={{ duration: calm ? 0 : 1.2, ease: EASE }} style={{ filter: 'drop-shadow(0 0 4px rgba(236,72,153,0.8))' }} />
        </svg>
        {/* The need */}
        <span className="absolute" style={{ left: '74%', top: '34%' }}>
          {!delivered && <span className="play-ripple absolute -inset-3 rounded-full bg-red-500/40" aria-hidden />}
          <span className={cn('relative -ms-3 -mt-3 grid h-6 w-6 place-items-center rounded-full ring-2 ring-white/80 transition-colors duration-500', delivered ? 'bg-emerald-500' : 'bg-red-500')}>
            {delivered ? <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} aria-hidden /> : <Droplets className="h-3.5 w-3.5 text-white" aria-hidden />}
          </span>
        </span>
        {/* The helper's van */}
        <motion.span className="absolute -ms-3.5 -mt-3.5 grid h-7 w-7 place-items-center rounded-full bg-white shadow-[0_0_18px_rgba(236,72,153,0.7)]" initial={false}
          animate={driving ? { left: ROUTE.map((p) => `${p[0]}%`), top: ROUTE.map((p) => `${p[1]}%`) } : { left: `${ROUTE[0][0]}%`, top: `${ROUTE[0][1]}%` }}
          transition={{ duration: calm || !driving ? 0 : 2.4, ease: 'easeInOut' }}>
          <Truck className="h-4 w-4 text-zinc-900" aria-hidden />
        </motion.span>
        <span className="absolute bottom-2 end-3 text-[11px] text-zinc-400">areas only, never a door</span>
      </div>
      <div className="mt-3 min-h-[150px] space-y-2.5">
        <AnimatePresence>
          {s >= 1 && (
            <motion.div key="need" {...rise} className="passport-card flex items-center gap-3 px-3.5 py-3">
              <Droplets className="h-5 w-5 shrink-0 text-sky-300" aria-hidden />
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-white">Drinking water, 40 L</p><p className="flex items-center gap-1 text-[11px] text-zinc-300"><MapPin className="h-3 w-3" aria-hidden />Riverside camp · 5 people</p></div>
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold transition-colors duration-500', delivered ? 'bg-emerald-400 text-emerald-950' : 'bg-red-500 text-white')}>{delivered ? 'Done' : 'Critical'}</span>
            </motion.div>
          )}
          {s >= 2 && (
            <motion.div key="help" {...rise} className="passport-card flex items-center gap-3 px-3.5 py-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-orange-500 text-xs font-bold text-white">S</span>
              <p className="flex-1 text-sm text-white">{delivered ? <>Sam delivered it · <b>18 min</b></> : driving ? <>Sam is on the way</> : <>Sam is 2 km away</>}</p>
              <motion.span animate={{ scale: s === 3 ? 0.92 : 1 }} transition={{ duration: 0.2 }} className={cn('relative rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-300', s >= 3 ? 'bg-pink-500 text-white' : 'bg-white/10 text-white')}>
                {s >= 3 ? 'Taken' : 'I can help'}<Tap on={s === 3} />
              </motion.span>
            </motion.div>
          )}
          {delivered && (
            <motion.p key="ok" {...rise} className="flex items-center justify-center gap-1.5 text-sm font-semibold text-emerald-300"><Check className="h-4 w-4" aria-hidden />5 people helped · the NGO sees it live</motion.p>
          )}
        </AnimatePresence>
      </div>
    </Phone>
  );
}

/* ── Green: plant trees, prove it with a photo, watch the CO₂ and the team goal climb ── */
export function GreenPhone() {
  const s = useStep();
  const calm = useReducedMotion();
  const kg = s >= 4 ? 478 : 412;
  const goal = s >= 7 ? 0.86 : s >= 4 ? 0.74 : 0.66;
  const C = 2 * Math.PI * 52;
  return (
    <Phone app="green" title="My climate actions" label="Planting trees, proving it with a photo, and the CO₂ saved climbing">
      <div className="flex flex-col items-center">
        <div className="relative h-36 w-36">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
            <circle cx="60" cy="60" r="52" stroke="rgba(255,255,255,0.08)" strokeWidth="10" fill="none" />
            <motion.circle cx="60" cy="60" r="52" stroke="url(#gp)" strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={C}
              initial={false} animate={{ strokeDashoffset: C * (1 - goal) }} transition={{ duration: calm ? 0 : 1, ease: EASE }} />
            <defs><linearGradient id="gp" x1="0" x2="1"><stop offset="0" stopColor="#10b981" /><stop offset="1" stopColor="#a3e635" /></linearGradient></defs>
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.p key={kg} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.4, ease: EASE }} className="font-mono text-3xl font-bold tabular-nums text-white">{kg}</motion.p>
              </AnimatePresence>
              <p className="text-[11px] text-zinc-300">kg CO₂ this month</p>
            </div>
          </div>
          <AnimatePresence>{s === 4 && <motion.span key="plus" initial={{ opacity: 0, y: 0 }} animate={{ opacity: 1, y: -26 }} exit={{ opacity: 0 }} transition={{ duration: 0.6, ease: EASE }} className="absolute -end-4 top-2 rounded-full bg-emerald-400 px-2 py-0.5 text-xs font-bold text-emerald-950">+66 kg</motion.span>}</AnimatePresence>
        </div>
      </div>
      <motion.div animate={{ scale: s === 1 ? 0.96 : 1 }} transition={{ duration: 0.2 }} className={cn('passport-card relative mt-4 flex items-center gap-3 px-3.5 py-3 transition-shadow duration-300', s >= 1 && 'ring-1 ring-emerald-300/40')}>
        <TreePine className="h-5 w-5 text-emerald-300" aria-hidden />
        <p className="flex-1 text-sm font-semibold text-white">I planted 3 trees</p>
        <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold transition-colors duration-300', s >= 1 ? 'bg-pink-500 text-white' : 'bg-white/10 text-white')}>{s >= 1 ? 'Logged' : 'Log it'}</span>
        <Tap on={s === 1} />
      </motion.div>
      <div className="mt-2.5 min-h-[60px]">
        <AnimatePresence mode="wait">
          {s >= 2 && s < 4 && (
            <motion.div key="proof" {...rise} className="passport-card relative flex items-center gap-3 overflow-hidden px-3.5 py-3">
              <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-emerald-900/60 text-xl">🌳<span className="play-scanline absolute inset-x-0 top-0 h-0.5 bg-pink-400 shadow-[0_0_10px_rgba(236,72,153,0.9)]" aria-hidden /></span>
              <p className="flex items-center gap-1.5 text-sm text-white"><Camera className="h-4 w-4 text-zinc-300" aria-hidden />Checking the photo…</p>
            </motion.div>
          )}
          {s >= 4 && (
            <motion.div key="ok" {...rise} className="flex items-center gap-2 rounded-2xl bg-emerald-400/10 px-3.5 py-3 ring-1 ring-emerald-300/30">
              <Check className="h-4 w-4 text-emerald-300" aria-hidden /><p className="text-sm text-white">Proof checked · <b>66 kg</b> saved</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <motion.div initial={false} animate={{ opacity: s >= 5 ? 1 : 0.35, scale: s === 5 ? 1.05 : 1 }} transition={{ duration: 0.35, ease: EASE }} className="passport-card flex items-center gap-2 px-3 py-2.5">
          <Flame className="h-5 w-5 text-orange-400" aria-hidden /><p className="text-sm text-white"><b>{s >= 5 ? 12 : 11}</b> day streak</p>
        </motion.div>
        <motion.div initial={false} animate={{ opacity: s >= 6 ? 1 : 0.35, rotate: s === 6 ? [0, -8, 6, 0] : 0, scale: s === 6 ? 1.05 : 1 }} transition={{ duration: 0.5, ease: EASE }} className="passport-card flex items-center gap-2 px-3 py-2.5">
          <Medal className="h-5 w-5 text-amber-300" aria-hidden /><p className="text-sm text-white">Tree hero</p>
        </motion.div>
      </div>
      <div className="passport-card mt-2.5 px-3.5 py-3">
        <div className="flex items-center justify-between text-[11px] text-zinc-300"><span>Class 9B · weekly challenge</span><span className="font-mono text-white">{Math.round(goal * 100)}%</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full w-full origin-left rounded-full bg-gradient-to-r from-emerald-500 to-lime-400 rtl:origin-right" initial={false} animate={{ scaleX: goal }} transition={{ duration: calm ? 0 : 0.9, ease: EASE }} /></div>
      </div>
    </Phone>
  );
}

/* ── Play: friends join a room, 3-2-1, a question answered right, you take the lead ── */
const FRIENDS = [{ name: 'You', color: '#ec4899' }, { name: 'Maya', color: '#6366f1' }, { name: 'Omar', color: '#f97316' }, { name: 'Leo', color: '#10b981' }];
const OPTIONS = ['Oxygen', 'CO₂', 'Helium', 'Nitrogen'];

export function PlayPhone() {
  const s = useStep();
  const scores = s >= 7 ? [2950, 2700, 2400, 1900] : [2000, 2700, 2400, 1900];
  const order = FRIENDS.map((f, i) => ({ ...f, score: scores[i] })).sort((a, b) => b.score - a.score);
  return (
    <Phone app="play" title="Room K7Q2MX · Quiz Clash" label="Friends join a game room, answer a question and the scoreboard changes">
      <div className="min-h-[224px]">
        <AnimatePresence mode="wait">
          {s < 2 && (
            <motion.div key="lobby" {...rise} className="pt-4 text-center">
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-300">Room code</p>
              <p className="mt-1 font-mono text-4xl font-bold tracking-[0.15em] text-white">K7Q2MX</p>
              <div className="mt-6 flex justify-center gap-2">
                {FRIENDS.map((f, i) => (
                  <motion.span key={f.name} initial={{ opacity: 0, scale: 0.85, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: i * 0.18, duration: 0.4, ease: EASE }}
                    className="grid h-11 w-11 place-items-center rounded-full text-sm font-bold text-white ring-2 ring-black/40" style={{ background: f.color }}>{f.name[0]}</motion.span>
                ))}
              </div>
              <p className="mt-4 text-sm text-zinc-300">4 friends joined</p>
            </motion.div>
          )}
          {s >= 2 && s < 5 && (
            <motion.div key={`n${s}`} initial={{ opacity: 0, scale: 1.4 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }} transition={{ duration: 0.4, ease: EASE }}
              className="grid h-[230px] place-items-center font-black text-8xl text-white [text-shadow:0_0_40px_rgba(236,72,153,0.8)]">{5 - s}</motion.div>
          )}
          {s >= 5 && (
            <motion.div key="q" {...rise}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-pink-200">Question 4 of 10 · Planet</p>
              <p className="mt-1.5 text-lg font-bold leading-snug text-white">Which gas do trees take in to grow?</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {OPTIONS.map((o, i) => {
                  const right = i === 1 && s >= 6;
                  return (
                    <motion.span key={o} animate={{ scale: i === 1 && s === 6 ? [1, 0.94, 1.04, 1] : 1 }} transition={{ duration: 0.45 }}
                      className={cn('relative rounded-2xl px-3 py-3 text-center text-sm font-semibold transition-colors duration-300', right ? 'bg-emerald-500 text-white' : s >= 6 ? 'bg-white/[0.04] text-zinc-400' : 'bg-white/10 text-white')}>
                      {o}<Tap on={i === 1 && s === 6} />
                    </motion.span>
                  );
                })}
              </div>
              <AnimatePresence>{s >= 6 && <motion.p key="pts" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className="mt-3 text-center text-sm font-bold text-emerald-300">+950 · streak ×3 🔥</motion.p>}</AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <ol className="mt-2 space-y-1.5">
        {order.map((f, i) => (
          <motion.li key={f.name} layout transition={{ type: 'spring', stiffness: 380, damping: 32 }} className={cn('flex items-center gap-2.5 rounded-2xl px-3 py-2', f.name === 'You' ? 'bg-pink-500/15 ring-1 ring-pink-400/40' : 'bg-white/[0.05]')}>
            <span className="w-4 font-mono text-xs text-zinc-300">{i + 1}</span>
            <span className="grid h-7 w-7 place-items-center rounded-full text-xs font-bold text-white" style={{ background: f.color }}>{f.name[0]}</span>
            <span className="text-sm font-semibold text-white">{f.name}</span>
            {i === 0 && s >= 7 && <motion.span initial={{ opacity: 0, y: -6, rotate: -20 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.4, ease: EASE }}><Crown className="h-4 w-4 text-amber-300" aria-hidden /></motion.span>}
            <span className="ms-auto font-mono text-sm tabular-nums text-white">{f.score.toLocaleString('en')}</span>
          </motion.li>
        ))}
      </ol>
    </Phone>
  );
}
