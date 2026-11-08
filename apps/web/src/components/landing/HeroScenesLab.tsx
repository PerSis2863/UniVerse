'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Bike, Check, Crown, Droplets, Home, Leaf, Recycle, ScanLine, ShieldCheck, Sparkles, Stethoscope, TreePine, Utensils } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE, useCalm } from './bits';
import { pop, still, useStep } from './HeroScenes';

// The landing hero's pictures for the four Lab apps (M117: split from HeroScenes.tsx so the landing and
// sign-in load them only when one of these tabs is opened; UniVersity's stays in HeroScenes.tsx): Trace a
// holographic label over a dotted world, Relief a radar, Green a growing landscape, Play a neon arcade.

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
    <div className="relative h-[480px] w-full max-w-[520px]" role="img" aria-label="A product label scanned as genuine while its journey draws across a map">
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
      <motion.div className="absolute left-1/2 top-[150px] w-[260px] -translate-x-1/2 [transform-style:preserve-3d]" animate={calm ? undefined : { rotateY: [-14, 14, -14], rotateX: [8, -4, 8] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }} style={{ transformPerspective: 900 }}>
        <div className="relative overflow-hidden rounded-[1.75rem] bg-[linear-gradient(135deg,#151517,#0f0f11)] p-5 ring-1 ring-white/15 shadow-[0_30px_80px_-20px_rgba(79,142,247,0.55)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_30%,rgba(79,142,247,0.18)_45%,rgba(167,139,250,0.16)_52%,transparent_65%)] bg-[length:250%_100%] [animation:holo_5s_linear_infinite]" aria-hidden />
          <p className="text-[11px] text-zinc-400">Product passport</p>
          <p className="mt-1 text-xl font-bold text-white">Aurora olive oil</p>
          <p className="text-xs text-zinc-300">unit 1,204 of 5,000</p>
          <div className="relative mt-4 grid grid-cols-7 gap-1 rounded-xl bg-white p-2.5">
            {Array.from({ length: 49 }, (_, i) => <span key={i} className={cn('aspect-square rounded-[2px]', (i * 7 + (i % 5) * 3) % 3 === 0 || [0, 1, 7, 8, 5, 6, 12, 13, 35, 36, 42, 43].includes(i) ? 'bg-zinc-900' : 'bg-transparent')} />)}
            {!calm && s < 2 && <motion.span className="absolute inset-x-1 h-0.5 bg-pink-500 shadow-[0_0_14px_3px_rgba(79,142,247,0.8)]" animate={{ top: ['8%', '92%', '8%'] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} />}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-300"><ScanLine className="h-3.5 w-3.5 text-pink-300" aria-hidden />{scanned ? 'Scanned in Paris 11e' : 'Scanning…'}</p>
        </div>
      </motion.div>
      <AnimatePresence>
        {scanned && <motion.div key="g" {...pop} className="absolute end-2 top-[150px] flex items-center gap-2 rounded-2xl bg-emerald-400 px-3.5 py-2 text-sm font-bold text-emerald-950 shadow-[0_10px_40px_-8px_rgba(52,211,153,0.7)]"><ShieldCheck className="h-4 w-4" aria-hidden />Genuine</motion.div>}
        {s >= 5 && <motion.div key="p" {...pop} className="absolute bottom-10 start-2 flex items-center gap-2 rounded-2xl bg-[#1d1d20] px-3.5 py-2 text-sm text-white ring-1 ring-pink-400/40"><Sparkles className="h-4 w-4 text-pink-300" aria-hidden />The shop earned <b>25 points</b></motion.div>}
        {s >= 7 && <motion.div key="r" {...pop} className="absolute bottom-24 end-0 rounded-2xl bg-[#1d1d20] px-3.5 py-2 text-xs text-zinc-200 ring-1 ring-white/10">Made → shipped → shop · <b className="text-white">4 stops</b></motion.div>}
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

/* ── Green: a living planet ──
   A globe turns slowly (a band of dots sliding under a shaded sphere); green patches bloom where
   people act; a tree, a bike and a recycling badge orbit on a tilted ring; the CO₂ saved climbs and a
   ticker shows each action. Transform, opacity and offset-distance only; Reduce Motion: still. */
const ACTS = [
  { icon: TreePine, who: 'Maya planted a tree', kg: 22 },
  { icon: Bike, who: 'Leo cycled 12 km to school', kg: 2 },
  { icon: Recycle, who: 'Class 9B recycled 8 kg', kg: 5 },
  { icon: Leaf, who: 'Omar went meat-free today', kg: 3 },
] as const;
const BLOOMS = [[18, 38, 26], [42, 62, 34], [64, 30, 22], [80, 58, 30], [30, 74, 20], [56, 46, 18]] as const; // % across the band, % down, size px
const RING = 'M 20 150 A 160 52 0 1 0 340 150 A 160 52 0 1 0 20 150';

function Green() {
  const { s, loop, calm } = useStep(ACTS.length, 1700);
  const n = loop * ACTS.length + s;
  const kg = 412 + Array.from({ length: n + 1 }, (_, i) => ACTS[i % ACTS.length].kg).reduce((a, b) => a + b, 0);
  const act = ACTS[s];
  const band = (
    <div className="relative h-full w-1/2 shrink-0 bg-[radial-gradient(circle,rgba(167,243,208,0.35)_1.2px,transparent_1.6px)] [background-size:11px_11px]">
      {BLOOMS.map(([x, y, r], i) => (
        <motion.span key={i} className="absolute rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.85),rgba(16,185,129,0.25)_60%,transparent_72%)]" style={{ left: `${x}%`, top: `${y}%`, width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r }}
          initial={false} animate={{ scale: calm || i <= n ? 1 : 0.3, opacity: calm || i <= n ? 1 : 0.15 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }} />
      ))}
    </div>
  );
  return (
    <div className="relative h-[480px] w-full max-w-[520px]" role="img" aria-label="A planet turning while green patches bloom and the CO₂ saved climbs">
      {/* stars */}
      {[[8, 12], [22, 30], [86, 18], [74, 8], [92, 44], [12, 52], [60, 14]].map(([x, y], i) => (
        <motion.span key={i} aria-hidden className="absolute h-1 w-1 rounded-full bg-white" style={{ left: `${x}%`, top: `${y}%` }} animate={calm ? undefined : { opacity: [0.2, 0.9, 0.2] }} transition={{ duration: 2.4 + (i % 3), delay: i * 0.3, repeat: Infinity, ease: 'easeInOut' }} />
      ))}
      {/* the counter */}
      <div className="absolute inset-x-0 top-6 text-center">
        <p className="text-xs text-emerald-200/80">CO₂ saved by Class 9B</p>
        <div className="relative mx-auto mt-1 h-14 overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p key={kg} className="font-mono text-5xl font-bold tabular-nums text-white" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }} transition={{ duration: 0.5, ease: EASE }}>
              {kg}<span className="ms-2 text-lg font-medium text-emerald-200">kg</span>
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
      {/* the planet and its ring */}
      <div className="absolute left-1/2 top-[120px] h-[300px] w-[360px] -translate-x-1/2">
        <svg aria-hidden className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 360 300">
          <path d={RING} transform="translate(0 0)" fill="none" stroke="rgba(110,231,183,0.18)" strokeWidth="1.5" strokeDasharray="2 6" />
        </svg>
        <div className="absolute left-1/2 top-[25px] h-[250px] w-[250px] -translate-x-1/2 overflow-hidden rounded-full bg-[#0a2a1f] shadow-[0_0_80px_-10px_rgba(52,211,153,0.55),inset_0_0_40px_rgba(52,211,153,0.25)]">
          <motion.div className="flex h-full w-[200%]" animate={calm ? undefined : { x: ['0%', '-50%'] }} transition={{ duration: 26, repeat: Infinity, ease: 'linear' }}>
            {band}{band}
          </motion.div>
          {/* light and shade: lit top-left, night on the right */}
          <span aria-hidden className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_32%_28%,rgba(255,255,255,0.22),transparent_38%),radial-gradient(circle_at_85%_70%,rgba(0,0,0,0.75),transparent_62%)]" />
        </div>
        <span aria-hidden className="absolute left-1/2 top-[13px] h-[274px] w-[274px] -translate-x-1/2 rounded-full ring-1 ring-emerald-300/25" />
        {/* things on the ring (they ride the same ellipse) */}
        {!calm && [TreePine, Bike, Recycle].map((Icon, i) => (
          <motion.span key={i} aria-hidden className="absolute left-0 top-0 -ms-4 -mt-4 grid h-8 w-8 place-items-center rounded-full bg-emerald-400 text-emerald-950 shadow-[0_0_20px_rgba(52,211,153,0.8)]"
            style={{ offsetPath: `path("${RING}")`, offsetRotate: '0deg' }} initial={{ offsetDistance: `${i * 33}%` }} animate={{ offsetDistance: [`${i * 33}%`, `${i * 33 + 100}%`] }} transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}>
            <Icon className="h-4 w-4" />
          </motion.span>
        ))}
      </div>
      {/* the ticker */}
      <div className="absolute inset-x-6 bottom-5 h-14">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={n} className="absolute inset-0 flex items-center gap-3 rounded-full bg-black/30 px-4 ring-1 ring-emerald-300/25 shadow-[0_0_30px_-8px_rgba(52,211,153,0.6)]"
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }} transition={{ duration: 0.5, ease: EASE }}>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-400/20 text-emerald-200"><act.icon className="h-5 w-5" aria-hidden /></span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{act.who}</span>
            <span className="font-mono text-sm font-bold text-emerald-300">−{act.kg} kg</span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Play: a neon race track ──
   Four players race round a glowing oval at their own pace, each a light with a comet tail (SVG
   animateMotion: smooth and cheap); the board below re-orders as they overtake, with laps. */
const TRACK = 'M 70 40 H 330 A 60 60 0 0 1 330 160 H 70 A 60 60 0 0 1 70 40 Z';
const RACERS = [
  { n: 'You', c: '#4f8ef7', lap: 6.2, at: 0 },
  { n: 'Leo', c: '#10b981', lap: 6.6, at: 0.12 },
  { n: 'Omar', c: '#f97316', lap: 7.1, at: 0.24 },
  { n: 'Maya', c: '#818cf8', lap: 6.9, at: 0.36 },
];

function Play() {
  const calm = useCalm();
  const [t, setT] = useState(0); // seconds since the race started, for the board
  useEffect(() => {
    if (calm) return;
    const start = performance.now();
    const id = setInterval(() => setT((performance.now() - start) / 1000), 400);
    return () => clearInterval(id);
  }, [calm]);
  const run = RACERS.map((r) => ({ ...r, d: r.at + t / r.lap })).sort((a, b) => b.d - a.d);
  return (
    <div className="relative h-[480px] w-full max-w-[520px]" role="img" aria-label="Four players racing round a neon track while the room's board re-orders">
      <div className="flex items-center justify-between px-5 pt-5 font-mono text-xs text-zinc-300">
        <span>Type Race · room K7Q2MX</span>
        <span className="inline-flex items-center gap-1.5"><span className="relative flex h-2 w-2"><span className="absolute inset-0 animate-ping rounded-full bg-fuchsia-400/70" /><span className="relative h-2 w-2 rounded-full bg-fuchsia-400" /></span>live</span>
      </div>
      <svg viewBox="0 0 400 200" className="mx-auto mt-2 block w-[92%]" aria-hidden>
        <defs><filter id="race-glow"><feGaussianBlur stdDeviation="3" /></filter></defs>
        <path d={TRACK} fill="none" stroke="#4f8ef7" strokeWidth="18" opacity="0.12" />
        <path d={TRACK} fill="none" stroke="rgba(122,174,250,0.55)" strokeWidth="1.5" style={{ filter: 'drop-shadow(0 0 6px #4f8ef7)' }} />
        <path d={TRACK} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="4 8" />
        <line x1="200" y1="28" x2="200" y2="52" stroke="#fff" strokeWidth="2" strokeDasharray="3 3" />
        <text x="200" y="110" textAnchor="middle" className="fill-white font-mono text-[22px] font-bold">LAP {Math.floor(run[0].d) + 1}</text>
        <text x="200" y="128" textAnchor="middle" className="fill-fuchsia-200 font-mono text-[11px]">first to 10 wins</text>
        {RACERS.map((r) => (
          <g key={r.n}>
            {[0.3, 0.2, 0.1, 0].map((lag, k) => (
              <circle key={k} r={k === 3 ? 6 : 5 - k} fill={r.c} opacity={k === 3 ? 1 : 0.2 + k * 0.15} filter={k === 3 ? undefined : 'url(#race-glow)'}>
                {!calm && <animateMotion dur={`${r.lap}s`} repeatCount="indefinite" path={TRACK} begin={`${-(r.at * r.lap) - lag}s`} />}
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <ol className="absolute inset-x-2 bottom-2 space-y-1">
        {run.map((r, i) => (
          <motion.li key={r.n} layout transition={{ type: 'spring', stiffness: 380, damping: 32 }} className={cn('flex items-center gap-2.5 rounded-full px-3.5 py-1.5 bg-black/30 ring-1 ring-white/[0.07]', r.n === 'You' && 'bg-fuchsia-500/20 ring-fuchsia-400/50 shadow-[0_0_24px_-6px_rgba(79,142,247,0.7)]')}>
            <span className="w-4 font-mono text-xs text-zinc-300">{i + 1}</span>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.c, boxShadow: `0 0 10px ${r.c}` }} />
            <span className="text-sm font-semibold text-white">{r.n}</span>
            {i === 0 && <Crown className="h-4 w-4 text-amber-300" aria-hidden />}
            <span className="ms-auto font-mono text-xs tabular-nums text-zinc-300">lap {Math.floor(r.d) + 1}</span>
            <span className="w-14 text-end font-mono text-sm tabular-nums text-white">{Math.round(60 + (r.d % 1) * 40 + Math.floor(r.d) * 3)} wpm</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

export const TraceScene = still(Trace);
export const ReliefScene = still(Relief);
export const GreenScene = still(Green);
export const PlayScene = still(Play);
