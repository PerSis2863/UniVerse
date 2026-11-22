'use client';

import { AnimatePresence, m as motion } from 'framer-motion';
import { BedDouble, Camera, Check, Droplets, Home, Plane, ScanLine, ShieldCheck, Sparkles, Stethoscope, Sun, Utensils } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE, useCalm } from './bits';
import { pop, still, useStep } from './HeroScenes';

// The landing hero's pictures for the four Lab apps (M117: split from HeroScenes.tsx so the landing and
// sign-in load them only when one of these tabs is opened; UniVersity's stays in HeroScenes.tsx): Trace a
// holographic label over a dotted world, Relief a radar, Play a neon arcade.

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

function Trace() {
  const { s, calm } = useStep(9);
  const scanned = s >= 2;
  return (
    <div className="relative h-[520px] w-full max-w-[520px]" role="img" aria-label="A product label scanned as genuine while its journey draws across a map">
      <svg viewBox="0 0 480 220" className="absolute inset-x-0 top-6 w-full opacity-80" aria-hidden>
        {DOTS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.8" fill="rgba(122,174,250,0.32)" />)}
        {ARCS.map(([a, b], i) => {
          const mx = (a[0] + b[0]) / 2, my = Math.min(a[1], b[1]) - 46, on = s >= 3 + i;
          return (
            <g key={i}>
              <motion.path d={`M ${a[0]} ${a[1]} Q ${mx} ${my} ${b[0]} ${b[1]}`} fill="none" stroke="#4f8ef7" strokeWidth="1.6" strokeLinecap="round"
                initial={false} animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }} transition={{ duration: calm ? 0 : 0.8, ease: EASE }} style={{ filter: 'drop-shadow(0 0 4px rgba(79,142,247,0.9))' }} />
              <circle cx={b[0]} cy={b[1]} r={on ? 4 : 0} fill="#ffd6f0" style={{ transition: 'r 300ms' }} />
            </g>
          );
        })}
      </svg>
      {/* The label, tilting slowly, a beam passing over its code */}
      <div className={cn('absolute left-1/2 top-[150px] w-[260px] -translate-x-1/2 [transform-style:preserve-3d]', !calm && 'scene-tilt')}>
        <div className="on-dark relative overflow-hidden rounded-[1.75rem] bg-[linear-gradient(135deg,#151517,#0f0f11)] p-5 ring-1 ring-white/15 shadow-[0_30px_80px_-20px_rgba(79,142,247,0.55)]">
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden><div className={cn('absolute inset-y-0 -start-[75%] w-[250%] bg-[linear-gradient(115deg,transparent_30%,rgba(79,142,247,0.18)_45%,rgba(167,139,250,0.16)_52%,transparent_65%)]', !calm && 'holo-pan')} /></div>
          <p className="text-[11px] text-zinc-400">Product passport</p>
          <p className="mt-1 text-xl font-bold text-white">Aurora olive oil</p>
          <p className="text-xs text-zinc-300">unit 1,204 of 5,000</p>
          <div className="relative mt-4 grid grid-cols-7 gap-1 rounded-xl bg-white p-2.5">
            {Array.from({ length: 49 }, (_, i) => <span key={i} className={cn('aspect-square rounded-[2px]', (i * 7 + (i % 5) * 3) % 3 === 0 || [0, 1, 7, 8, 5, 6, 12, 13, 35, 36, 42, 43].includes(i) ? 'bg-zinc-900' : 'bg-transparent')} />)}
            {!calm && s < 2 && <span aria-hidden className="scan-sweep absolute inset-x-1 inset-y-0 pointer-events-none"><span className="block h-0.5 bg-pink-500 shadow-[0_0_14px_3px_rgba(79,142,247,0.8)]" /></span>}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-300"><ScanLine className="h-3.5 w-3.5 text-pink-300" aria-hidden />{scanned ? 'Scanned in Paris 11e' : 'Scanning…'}</p>
        </div>
      </div>
      <AnimatePresence>
        {scanned && <motion.div key="g" {...pop} className="absolute end-2 top-[150px] flex items-center gap-2 rounded-2xl bg-emerald-400 px-3.5 py-2 text-sm font-bold text-emerald-950 shadow-[0_10px_40px_-8px_rgba(52,211,153,0.7)]"><ShieldCheck className="h-4 w-4" aria-hidden />Genuine</motion.div>}
        {s >= 5 && <motion.div key="p" {...pop} className="on-dark absolute bottom-10 start-2 flex items-center gap-2 rounded-2xl bg-[#1d1d20] px-3.5 py-2 text-sm text-white ring-1 ring-pink-400/40"><Sparkles className="h-4 w-4 text-pink-300" aria-hidden />The shop earned <b>25 points</b></motion.div>}
        {s >= 7 && <motion.div key="r" {...pop} className="on-dark absolute bottom-24 end-0 rounded-2xl bg-[#1d1d20] px-3.5 py-2 text-xs text-zinc-200 ring-1 ring-white/10">Made → shipped → shop · <b className="text-white">4 stops</b></motion.div>}
      </AnimatePresence>
    </div>
  );
}

/* ── Relief: a radar sweeps the area; needs blip up, helpers lock on ── */
const BLIPS = [
  { x: 64, y: 30, icon: Droplets, what: 'Water, 40 L', at: 1 }, { x: 28, y: 62, icon: Utensils, what: 'Food for 5', at: 3 },
  { x: 72, y: 70, icon: Stethoscope, what: 'Lift to the clinic', at: 5 }, { x: 40, y: 24, icon: Home, what: 'Shelter, 2 nights', at: 6 },
];

function Relief() {
  const { s, calm } = useStep(10);
  const helped = BLIPS.filter((b) => s >= b.at + 2).length;
  return (
    <div className="relative grid h-[480px] w-full max-w-[520px] place-items-center" role="img" aria-label="A radar finding needs nearby and helpers taking them">
      <div className="relative aspect-square w-[min(100%,420px)] overflow-hidden rounded-full bg-[radial-gradient(circle,#222c5e_0%,#121839_70%)] ring-1 ring-orange-400/25 shadow-[0_0_80px_-10px_rgba(249,115,22,0.35)]">
        {[25, 50, 75].map((r) => <span key={r} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-orange-300/15" style={{ width: `${r}%`, height: `${r}%` }} aria-hidden />)}
        <span className="absolute inset-x-0 top-1/2 h-px bg-orange-300/10" aria-hidden /><span className="absolute inset-y-0 left-1/2 w-px bg-orange-300/10" aria-hidden />
        {!calm && <span className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,transparent_300deg,rgba(251,146,60,0.45)_360deg)] [animation:play-spin_3.6s_linear_infinite]" aria-hidden />}
        <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_14px_white]" aria-hidden />
        {BLIPS.map((b) => {
          const on = s >= b.at, taken = s >= b.at + 1, done = s >= b.at + 2;
          return (
            <span key={b.what}>
              {taken && <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden><motion.line x1="50" y1="50" x2={b.x} y2={b.y} stroke={done ? '#34d399' : '#4f8ef7'} strokeWidth="0.6" strokeDasharray="2 1.5" initial={{ pathLength: calm ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6 }} /></svg>}
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
      <div className="absolute bottom-0 start-0 rounded-2xl bg-[var(--surface)]/95 px-4 py-3 ring-1 ring-white/10">
        <p className="text-xs text-zinc-400">people helped today</p>
        {/* The count rolls like a meter inside its own line (the old number never shows under the new). */}
        <div className="overflow-hidden"><AnimatePresence mode="popLayout" initial={false}><motion.p key={helped} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="font-mono text-3xl font-bold tabular-nums text-white">{128 + helped * 5}</motion.p></AnimatePresence></div>
      </div>
      <div className="absolute end-0 top-4 rounded-full bg-orange-500/15 px-3 py-1 text-xs text-orange-200 ring-1 ring-orange-400/30 whitespace-nowrap">areas only, never a door</div>
    </div>
  );
}

const ROUTE = 'M40 150 C 110 40, 190 40, 220 110 S 330 170, 360 60';
const STOPS = [{ x: 40, y: 150, n: 'Lisbon' }, { x: 220, y: 110, n: 'Sintra' }, { x: 360, y: 60, n: 'Porto' }];
const PLAN = [
  { d: 'Day 1', icon: Camera, t: 'Belém Tower at sunrise', w: '09:00' },
  { d: 'Day 1', icon: Utensils, t: 'Custard tarts in Alfama', w: '13:30' },
  { d: 'Day 2', icon: Sun, t: 'Pena Palace, 18 °C and sunny', w: '10:00' },
  { d: 'Day 3', icon: BedDouble, t: 'A riverside stay in Porto', w: '19:00' },
];
function Travel() {
  const calm = useCalm();
  return (
    <div className="relative h-[480px] w-full max-w-[520px]" role="img" aria-label="A trip from Lisbon to Sintra and Porto drawn as a route with a plane flying it, and the plan for each day">
      <div className="flex items-center justify-between px-5 pt-5 font-mono text-xs text-zinc-300">
        <span>Portugal · 3 days · 2 friends</span>
        <span className="inline-flex items-center gap-1.5"><Plane className="h-3.5 w-3.5 text-sky-300" aria-hidden />planned together</span>
      </div>
      <svg viewBox="0 0 400 200" className="mx-auto mt-2 block w-[92%]" aria-hidden>
        <path d={ROUTE} fill="none" stroke="#38bdf8" strokeWidth="14" opacity="0.1" />
        <path d={ROUTE} fill="none" stroke="rgba(125,211,252,0.7)" strokeWidth="1.6" strokeDasharray="5 6" />
        {STOPS.map((p) => (
          <g key={p.n}>
            <circle cx={p.x} cy={p.y} r="6" fill="#0ea5e9" opacity="0.25" />
            <circle cx={p.x} cy={p.y} r="3" fill="#e0f2fe" />
            <text x={p.x} y={p.y + 20} textAnchor="middle" className="fill-sky-100 font-mono text-[11px]">{p.n}</text>
          </g>
        ))}
        <g>
          <path d="M8 0 L-7 -6 L-3 0 L-7 6 Z" fill="#fff" />
          {!calm && <animateMotion dur="7s" repeatCount="indefinite" path={ROUTE} rotate="auto" />}
        </g>
      </svg>
      <ol className="absolute inset-x-2 bottom-2 space-y-1">
        {PLAN.map((p, i) => (
          <motion.li key={p.t} initial={calm ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.08, duration: 0.4, ease: EASE }}
            className="flex items-center gap-2.5 rounded-full bg-black/30 px-3.5 py-1.5 ring-1 ring-white/[0.07]">
            <span className="w-11 font-mono text-xs text-sky-200">{p.d}</span>
            <p.icon className="h-4 w-4 text-sky-300" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{p.t}</span>
            <span className="font-mono text-xs text-zinc-300">{p.w}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

/** M376: the Lab: a few lines of MATLAB-style code and the plot they make. */
const CURVE = Array.from({ length: 81 }, (_, i) => { const t = (i / 80) * 20; return `${i ? 'L' : 'M'}${(20 + t * 18).toFixed(1)},${(100 - 70 * Math.exp(-0.15 * t) * Math.cos(t)).toFixed(1)}`; }).join(' ');
function Lab() {
  const calm = useCalm();
  return (
    <div className="relative h-[480px] w-full max-w-[520px]" role="img" aria-label="A short script that solves a damped spring with ode45 and plots it, and the plot it draws">
      <pre className="mx-5 mt-5 rounded-2xl bg-black/40 p-4 font-mono text-[12.5px] leading-relaxed text-violet-100 ring-1 ring-white/[0.07]">
        <span className="text-zinc-400">% a damped spring</span>{'\n'}
        f = @(t, y) [y(2); -y(1) - 0.3*y(2)];{'\n'}
        [t, y] = ode45(f, [0 20], [1; 0]);{'\n'}
        plot(t, y(:, 1)); grid on{'\n'}
        title(<span className="text-amber-200">&apos;Position&apos;</span>)
      </pre>
      <svg viewBox="0 0 400 200" className="mx-auto mt-4 block w-[92%]" aria-hidden>
        <rect x="20" y="20" width="360" height="160" fill="none" stroke="rgba(255,255,255,0.18)" />
        {[60, 100, 140].map((y) => <line key={y} x1="20" x2="380" y1={y} y2={y} stroke="rgba(255,255,255,0.07)" />)}
        <motion.path d={CURVE} fill="none" stroke="#a78bfa" strokeWidth="2" initial={calm ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: EASE }} />
      </svg>
    </div>
  );
}

export const LabScene = still(Lab);
export const TraceScene = still(Trace);
export const ReliefScene = still(Relief);
export const TravelScene = still(Travel);
