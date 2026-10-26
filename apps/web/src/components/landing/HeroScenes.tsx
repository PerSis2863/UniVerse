'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Check, ClipboardCheck, Crown, Droplets, Home, Leaf, ScanLine, ShieldCheck, Sparkles, Stethoscope, UserRound, Utensils } from 'lucide-react';
import { GameIcon } from '@/components/play/GameIcon';
import { cn } from '@/lib/utils';
import { EASE } from './bits';

// The landing hero's pictures, one style per app (the owner: "different style animation" for each):
// UniVersity a live workflow diagram, Trace a holographic label over a dotted world, Relief a radar,
// Green a growing landscape, Play a neon arcade. Each plays a short story and starts again; with
// Reduce Motion each shows its finished picture and stays still.

/** The story's step, 0…steps-1, every `ms`; the last step with Reduce Motion. */
function useStep(steps: number, ms = 900) {
  const calm = useReducedMotion();
  const [s, set] = useState(0);
  useEffect(() => {
    if (calm) return;
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [calm, ms]);
  return { s: calm ? steps - 1 : s % steps, loop: calm ? 0 : Math.floor(s / steps), calm: !!calm };
}

const pop = { initial: { opacity: 0, y: 10, scale: 0.92 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, scale: 0.96, transition: { duration: 0.2 } }, transition: { duration: 0.45, ease: EASE } };

/* ── UniVersity: the late hand-in flow, a light travelling through it ── */
const NODES = { start: [92, 120], check: [246, 120], yes: [400, 48], no: [400, 192] } as const;
const curve = (to: 'yes' | 'no') => { const [x, y] = NODES[to]; return `M 296 120 C 330 120, 326 ${y}, ${x - 72} ${y}`; };
/** Points along the comet's way, for the travelling light. */
function way(to: 'yes' | 'no') {
  const [, ty] = NODES[to], out: [number, number][] = [];
  for (let i = 0; i <= 10; i++) out.push([152 + (196 - 152) * (i / 10), 120]);
  for (let i = 1; i <= 16; i++) {
    const t = i / 16, u = 1 - t, x = u ** 3 * 296 + 3 * u * u * t * 330 + 3 * u * t * t * 326 + t ** 3 * 328, y = u ** 3 * 120 + 3 * u * u * t * 120 + 3 * u * t * t * ty + t ** 3 * ty;
    out.push([x, y]);
  }
  return out;
}

export function CampusScene() {
  const { s, loop, calm } = useStep(8);
  const to: 'yes' | 'no' = loop % 2 ? 'no' : 'yes';
  const pts = way(to);
  const lit = (n: keyof typeof NODES) => (n === 'start' ? s >= 0 && s < 2 : n === 'check' ? s >= 2 && s < 4 : n === to && s >= 4);
  const rows = [
    ['Hand-in arrives', 'Maths essay, sent at 9:42', 'when'],
    ['Late?', 'It was due at 9:00', 'check'],
    to === 'yes' ? ['Ask the teacher', 'Accept it or give an extension', 'asks a person'] : ['Into the gradebook', 'Marked on time, the student sees it', 'by itself'],
  ];
  const row = s < 2 ? 0 : s < 4 ? 1 : 2;
  return (
    <div className="dark relative w-full max-w-[520px] rounded-[2rem] bg-[#111112]/95 p-5 text-start ring-1 ring-white/10 shadow-[0_40px_120px_-40px_rgba(236,72,153,0.45)]" role="img" aria-label="A late hand-in flowing to the teacher or into the gradebook">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/25 ring-1 ring-white/10"><ClipboardCheck className="h-5 w-5 text-fuchsia-200" aria-hidden /></span>
        <div><p className="font-semibold text-white">Late hand-ins</p><p className="font-mono text-xs text-zinc-400">assignments</p></div>
        <span className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-fuchsia-500/15 px-3 py-1 font-mono text-xs text-fuchsia-200"><span className="h-2 w-2 animate-pulse rounded-full bg-fuchsia-400" />running</span>
      </div>
      <div className="relative mt-4 aspect-[480/240] w-full border-y border-white/10">
        <svg viewBox="0 0 480 240" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d="M 152 120 L 196 120" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
          {(['yes', 'no'] as const).map((k) => <path key={k} d={curve(k)} stroke={k === to && s >= 3 ? '#ec4899' : 'rgba(255,255,255,0.18)'} strokeWidth={k === to && s >= 3 ? 2 : 1.5} fill="none" style={{ transition: 'stroke 400ms' }} />)}
          <text x="300" y="84" className="fill-zinc-400 font-mono text-[11px]">yes</text>
          <text x="300" y="166" className="fill-zinc-400 font-mono text-[11px]">no</text>
          {!calm && (s === 1 || s === 3) && (
            <motion.circle key={`${loop}-${s}`} r="5" fill="#f9a8d4" style={{ filter: 'drop-shadow(0 0 8px #ec4899)' }}
              initial={{ cx: s === 1 ? pts[0][0] : pts[10][0], cy: s === 1 ? pts[0][1] : pts[10][1] }}
              animate={s === 1 ? { cx: pts.slice(0, 11).map((p) => p[0]), cy: pts.slice(0, 11).map((p) => p[1]) } : { cx: pts.slice(10).map((p) => p[0]), cy: pts.slice(10).map((p) => p[1]) }}
              transition={{ duration: 0.85, ease: 'easeInOut' }} />
          )}
        </svg>
        {([['start', 'Hand-in arrives'], ['check', 'Late?'], ['yes', 'Ask the teacher'], ['no', 'Into the gradebook']] as const).map(([k, label]) => {
          const [x, y] = NODES[k], on = lit(k);
          return (
            <motion.div key={k} animate={{ scale: on ? 1.06 : 1 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              className={cn('absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-2xl border px-3 py-2 text-[12px] font-semibold text-white transition-[border-color,box-shadow,background-color] duration-300 sm:px-4 sm:text-sm',
                on ? 'border-pink-400/80 bg-[#1d1418] shadow-[0_0_30px_rgba(236,72,153,0.55)]' : 'border-white/10 bg-[#161618]', k === 'yes' && 'border-fuchsia-400/40')}
              style={{ left: `${(x / 480) * 100}%`, top: `${(y / 240) * 100}%` }}>
              {k === 'yes' && <UserRound className="me-1 inline h-3.5 w-3.5 -mt-0.5 text-fuchsia-300" aria-hidden />}{label}
            </motion.div>
          );
        })}
      </div>
      <ol className="mt-3 space-y-1">
        {rows.map(([title, sub, tag], i) => (
          <motion.li key={`${i}-${title}`} layout className={cn('flex items-start gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-300', row === i && 'bg-white/[0.06]')}>
            <span className="mt-0.5 font-mono text-xs text-zinc-400">0{i + 1}</span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">{title}</span><span className="block text-xs text-zinc-300">{sub}</span></span>
            <span className="flex items-center gap-1.5 font-mono text-xs text-zinc-400">
              {tag}{i < row || (i === row && s >= 5) ? <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid h-4 w-4 place-items-center rounded-full bg-emerald-400 text-emerald-950"><Check className="h-3 w-3" strokeWidth={3} aria-hidden /></motion.span> : null}
            </span>
          </motion.li>
        ))}
      </ol>
      <p className="mt-2 font-mono text-xs text-zinc-400">Runs on every hand-in, in every course</p>
    </div>
  );
}

/* ── Trace: a holographic label tilting over a world of dots, routes drawing between cities ── */
const DOTS: [number, number][] = (() => {
  // A rough world in dots (a coarse mask of the continents on a 40×20 grid).
  const rows = [
    '..............###.........####..........', '....######...#####.....##########.......', '...##########.###....###############....', '....#########........################...',
    '.....#######.......###.##############...', '......#####........#######.#########....', '.......###.........########...######....', '........##..........######.....###.##...',
    '.........###........#####......#...#....', '.........#####.......###...........##...', '..........####.......###..........####..', '..........###........##...........####..', '..........##..............................', '...........#..............................',
  ];
  const out: [number, number][] = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') out.push([x * 12 + 6, y * 12 + 30]); }));
  return out;
})();
const ARCS = [[[210, 90], [330, 110]], [[330, 110], [415, 150]], [[90, 80], [210, 90]], [[130, 160], [330, 110]]] as const;

export function TraceScene() {
  const { s, calm } = useStep(9);
  const scanned = s >= 2;
  return (
    <div className="relative h-[480px] w-full max-w-[520px]" role="img" aria-label="A product label scanned as genuine while its journey draws across a map">
      <svg viewBox="0 0 480 220" className="absolute inset-x-0 top-6 w-full opacity-80" aria-hidden>
        {DOTS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.8" fill="rgba(244,114,182,0.32)" />)}
        {ARCS.map(([a, b], i) => {
          const mx = (a[0] + b[0]) / 2, my = Math.min(a[1], b[1]) - 46, on = s >= 3 + i;
          return (
            <g key={i}>
              <motion.path d={`M ${a[0]} ${a[1]} Q ${mx} ${my} ${b[0]} ${b[1]}`} fill="none" stroke="#ec4899" strokeWidth="1.6" strokeLinecap="round"
                initial={false} animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }} transition={{ duration: calm ? 0 : 0.8, ease: EASE }} style={{ filter: 'drop-shadow(0 0 4px rgba(236,72,153,0.9))' }} />
              <circle cx={b[0]} cy={b[1]} r={on ? 4 : 0} fill="#fbcfe8" style={{ transition: 'r 300ms' }} />
            </g>
          );
        })}
      </svg>
      {/* The label, tilting slowly, a beam passing over its code */}
      <motion.div className="absolute left-1/2 top-[150px] w-[260px] -translate-x-1/2 [transform-style:preserve-3d]" animate={calm ? undefined : { rotateY: [-14, 14, -14], rotateX: [8, -4, 8] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }} style={{ transformPerspective: 900 }}>
        <div className="relative overflow-hidden rounded-[1.75rem] bg-[linear-gradient(135deg,#1c1b1f,#121214)] p-5 ring-1 ring-white/15 shadow-[0_30px_80px_-20px_rgba(236,72,153,0.55)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_30%,rgba(236,72,153,0.18)_45%,rgba(167,139,250,0.16)_52%,transparent_65%)] bg-[length:250%_100%] [animation:holo_5s_linear_infinite]" aria-hidden />
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400">Product passport</p>
          <p className="mt-1 text-xl font-bold text-white">Aurora olive oil</p>
          <p className="text-xs text-zinc-300">unit 1,204 of 5,000</p>
          <div className="relative mt-4 grid grid-cols-7 gap-1 rounded-xl bg-white p-2.5">
            {Array.from({ length: 49 }, (_, i) => <span key={i} className={cn('aspect-square rounded-[2px]', (i * 7 + (i % 5) * 3) % 3 === 0 || [0, 1, 7, 8, 5, 6, 12, 13, 35, 36, 42, 43].includes(i) ? 'bg-zinc-900' : 'bg-transparent')} />)}
            {!calm && s < 2 && <motion.span className="absolute inset-x-1 h-0.5 bg-pink-500 shadow-[0_0_14px_3px_rgba(236,72,153,0.8)]" animate={{ top: ['8%', '92%', '8%'] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} />}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-300"><ScanLine className="h-3.5 w-3.5 text-pink-300" aria-hidden />{scanned ? 'Scanned in Paris 11e' : 'Scanning…'}</p>
        </div>
      </motion.div>
      <AnimatePresence>
        {scanned && <motion.div key="g" {...pop} className="absolute end-2 top-[150px] flex items-center gap-2 rounded-2xl bg-emerald-400 px-3.5 py-2 text-sm font-bold text-emerald-950 shadow-[0_10px_40px_-8px_rgba(52,211,153,0.7)]"><ShieldCheck className="h-4 w-4" aria-hidden />Genuine</motion.div>}
        {s >= 5 && <motion.div key="p" {...pop} className="absolute bottom-10 start-2 flex items-center gap-2 rounded-2xl bg-[#1b1b1e] px-3.5 py-2 text-sm text-white ring-1 ring-pink-400/40"><Sparkles className="h-4 w-4 text-pink-300" aria-hidden />The shop earned <b>25 points</b></motion.div>}
        {s >= 7 && <motion.div key="r" {...pop} className="absolute bottom-24 end-0 rounded-2xl bg-[#1b1b1e] px-3.5 py-2 text-xs text-zinc-200 ring-1 ring-white/10">Made → shipped → shop · <b className="text-white">4 stops</b></motion.div>}
      </AnimatePresence>
    </div>
  );
}

/* ── Relief: a radar sweeps the area; needs blip up, helpers lock on ── */
const BLIPS = [
  { x: 64, y: 30, icon: Droplets, what: 'Water, 40 L', at: 1 }, { x: 28, y: 62, icon: Utensils, what: 'Food for 5', at: 3 },
  { x: 72, y: 70, icon: Stethoscope, what: 'Lift to the clinic', at: 5 }, { x: 40, y: 24, icon: Home, what: 'Shelter, 2 nights', at: 6 },
];

export function ReliefScene() {
  const { s, calm } = useStep(10);
  const helped = BLIPS.filter((b) => s >= b.at + 2).length;
  return (
    <div className="relative grid h-[480px] w-full max-w-[520px] place-items-center" role="img" aria-label="A radar finding needs nearby and helpers taking them">
      <div className="relative aspect-square w-[min(100%,420px)] overflow-hidden rounded-full bg-[radial-gradient(circle,#1a1210_0%,#0d0b0b_70%)] ring-1 ring-orange-400/25 shadow-[0_0_80px_-10px_rgba(249,115,22,0.35)]">
        {[25, 50, 75].map((r) => <span key={r} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-orange-300/15" style={{ width: `${r}%`, height: `${r}%` }} aria-hidden />)}
        <span className="absolute inset-x-0 top-1/2 h-px bg-orange-300/10" aria-hidden /><span className="absolute inset-y-0 left-1/2 w-px bg-orange-300/10" aria-hidden />
        {!calm && <span className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,transparent_300deg,rgba(251,146,60,0.45)_360deg)] [animation:play-spin_3.6s_linear_infinite]" aria-hidden />}
        <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_14px_white]" aria-hidden />
        {BLIPS.map((b) => {
          const on = s >= b.at, taken = s >= b.at + 1, done = s >= b.at + 2;
          return (
            <span key={b.what}>
              {taken && <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden><motion.line x1="50" y1="50" x2={b.x} y2={b.y} stroke={done ? '#34d399' : '#ec4899'} strokeWidth="0.6" strokeDasharray="2 1.5" initial={{ pathLength: calm ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6 }} /></svg>}
              <AnimatePresence>
                {on && (
                  <motion.span key="b" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }} className="absolute -ms-4 -mt-4" style={{ left: `${b.x}%`, top: `${b.y}%` }}>
                    {!done && <span className="play-ripple absolute inset-0 rounded-full bg-orange-500/50" />}
                    <span className={cn('relative grid h-8 w-8 place-items-center rounded-full ring-2 ring-white/70 transition-colors duration-500', done ? 'bg-emerald-500' : 'bg-orange-500')}>
                      {done ? <Check className="h-4 w-4 text-white" strokeWidth={3} aria-hidden /> : <b.icon className="h-4 w-4 text-white" aria-hidden />}
                    </span>
                    <span className="absolute start-9 top-1 whitespace-nowrap rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">{done ? 'helped' : b.what}</span>
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          );
        })}
      </div>
      <div className="absolute bottom-0 start-0 rounded-2xl bg-[#151517]/95 px-4 py-3 ring-1 ring-white/10">
        <p className="font-mono text-xs text-zinc-400">people helped today</p>
        <AnimatePresence mode="popLayout" initial={false}><motion.p key={helped} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="font-mono text-3xl font-bold tabular-nums text-white">{128 + helped * 5}</motion.p></AnimatePresence>
      </div>
      <div className="absolute end-0 top-4 rounded-full bg-orange-500/15 px-3 py-1 font-mono text-xs text-orange-200 ring-1 ring-orange-400/30">areas only, never a door</div>
    </div>
  );
}

/* ── Green: a landscape where trees grow and the CO₂ saved climbs ── */
const TREES = [[70, 196, 1], [118, 206, 1.3], [170, 190, 0.9], [300, 200, 1.2], [352, 210, 1], [410, 194, 1.4]] as const;

export function GreenScene() {
  const { s, calm } = useStep(9);
  const grown = Math.min(TREES.length, s);
  const kg = 412 + grown * 22;
  return (
    <div className="relative h-[480px] w-full max-w-[520px] overflow-hidden rounded-[2rem] bg-[linear-gradient(180deg,#0e1a16_0%,#0b1310_60%,#0a0f0d_100%)] ring-1 ring-emerald-300/15" role="img" aria-label="Trees growing on hills while the CO₂ saved climbs">
      <motion.div className="absolute -top-24 end-10 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(253,224,71,0.5),rgba(253,224,71,0)_65%)]" animate={calm ? undefined : { scale: [1, 1.08, 1] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} aria-hidden />
      <svg viewBox="0 0 480 300" className="absolute inset-x-0 bottom-0 w-full" aria-hidden>
        <path d="M0 210 C 90 170, 170 200, 250 186 S 400 160, 480 190 L 480 300 L 0 300 Z" fill="#11281f" />
        <path d="M0 250 C 120 214, 220 246, 320 228 S 440 220, 480 236 L 480 300 L 0 300 Z" fill="#163526" />
        {TREES.map(([x, y, k], i) => (
          <motion.g key={i} initial={false} animate={{ scale: i < grown ? k : 0.25, opacity: i < grown ? 1 : 0.25 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }} style={{ transformOrigin: `${x}px ${y}px`, transformBox: 'view-box' }}>
            <rect x={x - 2.5} y={y - 22} width="5" height="22" rx="2" fill="#5b3b24" />
            <circle cx={x} cy={y - 34} r="18" fill="#22c55e" /><circle cx={x - 11} cy={y - 26} r="12" fill="#16a34a" /><circle cx={x + 11} cy={y - 27} r="12" fill="#15803d" />
          </motion.g>
        ))}
      </svg>
      {/* Leaves drifting up from each new tree */}
      <AnimatePresence>
        {!calm && s >= 1 && s <= TREES.length && (
          <motion.span key={s} initial={{ opacity: 0, y: 0 }} animate={{ opacity: [0, 1, 0], y: -90 }} transition={{ duration: 1.4, ease: 'easeOut' }} className="absolute text-emerald-300" style={{ left: `${(TREES[s - 1][0] / 480) * 100}%`, bottom: '38%' }} aria-hidden><Leaf className="h-5 w-5" /></motion.span>
        )}
      </AnimatePresence>
      <div className="absolute inset-x-0 top-10 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-200/80">Class 9B saved</p>
        <div className="mt-1 flex items-baseline justify-center gap-2">
          <AnimatePresence mode="popLayout" initial={false}><motion.span key={kg} initial={{ opacity: 0, y: 18, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -18 }} transition={{ duration: 0.4, ease: EASE }} className="font-mono text-6xl font-bold tabular-nums text-white">{kg}</motion.span></AnimatePresence>
          <span className="text-lg text-emerald-200">kg CO₂</span>
        </div>
        <AnimatePresence>{s >= 1 && s <= TREES.length && <motion.p key={`t${s}`} {...pop} className="mx-auto mt-3 w-fit rounded-full bg-emerald-400 px-3 py-1 text-sm font-bold text-emerald-950">+1 tree planted · photo checked</motion.p>}</AnimatePresence>
        <AnimatePresence>{s >= 7 && <motion.p key="badge" {...pop} className="mx-auto mt-3 w-fit rounded-full bg-amber-300 px-3 py-1 text-sm font-bold text-amber-950">🏅 Weekly challenge won</motion.p>}</AnimatePresence>
      </div>
    </div>
  );
}

/* ── Play: neon arcade cards in 3D, one comes forward each beat; a live scoreboard ── */
const DECK = ['quiz', 'pin', 'rescue', 'ocean', 'type'] as const;
const NAMES: Record<(typeof DECK)[number], string> = { quiz: 'Quiz Clash', pin: 'World Pin', rescue: 'Flood Rescue', ocean: 'Ocean Cleanup', type: 'Type Race' };
const PLAYERS = [{ n: 'Maya', c: '#6366f1' }, { n: 'Omar', c: '#f97316' }, { n: 'You', c: '#ec4899' }, { n: 'Leo', c: '#10b981' }];

export function PlayScene() {
  const { s, loop } = useStep(10, 1100);
  const front = (loop * 2 + Math.floor(s / 5)) % DECK.length;
  const score = (i: number) => 1200 + ((s + loop * 10) * (140 + i * 37)) % 2600 + (PLAYERS[i].n === 'You' ? s * 120 : 0);
  const board = PLAYERS.map((p, i) => ({ ...p, v: score(i) })).sort((a, b) => b.v - a.v);
  return (
    <div className="relative h-[480px] w-full max-w-[520px]" role="img" aria-label="Game cards spinning forward while a room's scoreboard changes">
      <div className="absolute inset-x-0 top-0 h-[290px]" style={{ perspective: 1000 }}>
        {DECK.map((g, i) => {
          const d = (i - front + DECK.length) % DECK.length, rel = d > 2 ? d - DECK.length : d;
          return (
            <motion.div key={g} initial={false} animate={{ x: rel * 120, z: -Math.abs(rel) * 140, rotateY: rel * -28, opacity: Math.abs(rel) > 2 ? 0 : 1 - Math.abs(rel) * 0.25 }} transition={{ type: 'spring', stiffness: 160, damping: 22 }}
              className="absolute left-1/2 top-6 -ms-[90px] h-[240px] w-[180px] rounded-[1.75rem] bg-[linear-gradient(160deg,#241a2b,#121214)] p-4 ring-1 ring-fuchsia-400/30 shadow-[0_0_40px_-6px_rgba(217,70,239,0.55)]" style={{ zIndex: 10 - Math.abs(rel) }}>
              <GameIcon game={g} size="lg" />
              <p className="mt-4 text-lg font-bold text-white">{NAMES[g]}</p>
              <p className="font-mono text-xs text-fuchsia-200">solo or a room of 8</p>
              <span className="absolute bottom-4 start-4 end-4 rounded-full bg-fuchsia-500 py-2 text-center text-sm font-bold text-white shadow-[0_5px_0_#86198f]">Play</span>
            </motion.div>
          );
        })}
      </div>
      <div className="absolute inset-x-6 bottom-0 rounded-[1.5rem] bg-[#121214]/95 p-3 ring-1 ring-white/10">
        <p className="mb-1.5 flex items-center justify-between px-1 font-mono text-xs text-zinc-400"><span>Room K7Q2MX · live</span><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 animate-pulse rounded-full bg-fuchsia-400" />4 playing</span></p>
        <ol className="space-y-1">
          {board.map((p, i) => (
            <motion.li key={p.n} layout transition={{ type: 'spring', stiffness: 380, damping: 32 }} className={cn('flex items-center gap-2.5 rounded-xl px-2.5 py-1.5', p.n === 'You' && 'bg-fuchsia-500/15 ring-1 ring-fuchsia-400/40')}>
              <span className="w-4 font-mono text-xs text-zinc-400">{i + 1}</span>
              <span className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: p.c }}>{p.n[0]}</span>
              <span className="text-sm font-semibold text-white">{p.n}</span>
              {i === 0 && <Crown className="h-4 w-4 text-amber-300" aria-hidden />}
              <span className="ms-auto font-mono text-sm tabular-nums text-white">{p.v.toLocaleString('en')}</span>
            </motion.li>
          ))}
        </ol>
      </div>
    </div>
  );
}
