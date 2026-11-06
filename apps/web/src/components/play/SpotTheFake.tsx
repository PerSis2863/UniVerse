'use client';

import { useEffect, useMemo, useReducer, useState } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, BadgeCheck, CalendarClock, Flame, Heart, Lightbulb, MapPin, ScanLine, ShieldAlert, ShieldCheck, Tag, Type } from 'lucide-react';
import { FAKE_LIVES, fakePoints, fakeRound, monthName, rankFor, type FakeReason, type Passport } from '@/lib/play/fakes';
import { hash } from '@/lib/seeded-shuffle';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useArena } from './arena';
import { Burst } from './fx';
import type { GameProps } from './game-props';
import { haptic } from '@/lib/haptics';

// Spot the Fake (src/lib/play/fakes.ts): product passports for one product, one is a copy. Read the
// journey, scans, seal, brand, dates and price, then tap the copy (keys 1–6). Cards are dealt onto
// the table; the copy flips over to show its red stamp and what gave it away; real ones get a green
// seal. Three lives (hearts break), six passports from round 5, and an inspector rank that rises.

const REVEAL_MS = 2800;
const REASON: Record<FakeReason, { label: string; icon: typeof Tag }> = {
  journey: { label: 'Impossible journey', icon: MapPin }, scans: { label: 'Scanned far too often', icon: ScanLine }, seal: { label: 'Seal doesn’t match', icon: ShieldAlert },
  brand: { label: 'Misspelt brand', icon: Type }, dates: { label: 'Dates don’t add up', icon: CalendarClock }, price: { label: 'Far too cheap', icon: Tag },
};

/** The UV lamp (M39): clears one genuine passport. One to start, one more every 3 copies caught (up to 3). */
const UV_MAX = 3, UV_EVERY = 3;
interface S { i: number; shownAt: number; picked: number | null; timedOut: boolean; lives: number; score: number; streak: number; best: number; gained: number; caught: number; picks: number; uv: number; cleared: number[] }
type A = { t: 'pick'; choice: number; fake: number; at: number; seconds: number; cards: number } | { t: 'timeout' } | { t: 'next'; at: number } | { t: 'uv'; card: number };

function reducer(s: S, a: A): S {
  if (a.t === 'next') return s.lives <= 0 ? s : { ...s, i: s.i + 1, shownAt: a.at, picked: null, timedOut: false, gained: 0, cleared: [] };
  if (s.picked !== null || s.timedOut) return s;
  if (a.t === 'uv') return s.uv > 0 && a.card >= 0 && !s.cleared.includes(a.card) ? { ...s, uv: s.uv - 1, cleared: [...s.cleared, a.card] } : s;
  if (a.t === 'timeout') return { ...s, timedOut: true, lives: s.lives - 1, streak: 0, gained: 0, picks: s.picks + 1 };
  if (s.cleared.includes(a.choice)) return s;
  const ok = a.choice === a.fake;
  const streak = ok ? s.streak + 1 : 0;
  const gained = fakePoints(ok, s.shownAt + a.seconds * 1000 - a.at, streak, a.seconds, a.cards);
  return { ...s, picked: a.choice, lives: ok ? s.lives : s.lives - 1, streak, best: Math.max(s.best, streak), score: s.score + gained, gained, caught: s.caught + (ok ? 1 : 0), picks: s.picks + 1, uv: ok && (s.caught + 1) % UV_EVERY === 0 ? Math.min(UV_MAX, s.uv + 1) : s.uv };
}

/** The passport's QR cells (M104: the real layout, 21 × 21: three finder squares, the timing lines,
 *  data from the serial), the same for the same serial. */
function qrCells(serial: string) {
  let x = hash(serial) >>> 0 || 1;
  const cells: [number, number][] = [];
  for (let cy = 0; cy < 21; cy++) for (let cx = 0; cx < 21; cx++) {
    if ((cx < 8 && cy < 8) || (cx > 12 && cy < 8) || (cx < 8 && cy > 12)) continue;
    if (cy === 6 || cx === 6) { if ((cx + cy) % 2 === 0) cells.push([cx, cy]); continue; }
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    if (x / 4294967296 < 0.48) cells.push([cx, cy]);
  }
  return cells;
}
function MiniCode({ serial }: { serial: string }) {
  const cells = useMemo(() => qrCells(serial), [serial]);
  return (
    <svg viewBox="-1 -1 23 23" className="h-11 w-11 shrink-0 rounded-[4px] bg-white" shapeRendering="crispEdges" aria-hidden>
      {[[0, 0], [14, 0], [0, 14]].map(([fx, fy]) => <g key={`${fx}${fy}`}><rect x={fx} y={fy} width="7" height="7" fill="#111113" /><rect x={fx + 1} y={fy + 1} width="5" height="5" fill="#fff" /><rect x={fx + 2} y={fy + 2} width="3" height="3" fill="#111113" /></g>)}
      {cells.map(([cx, cy]) => <rect key={`${cx}-${cy}`} x={cx} y={cy} width="1" height="1" fill="#111113" />)}
    </svg>
  );
}

/** A barcode under the passport (bars from the serial, like an EAN). */
function barsFor(serial: string) {
  let x = hash(`${serial}:bars`) >>> 0 || 7, at = 0;
  const bars: [number, number][] = [];
  for (let i = 0; i < 34 && at < 96; i++) { x = (x * 1103515245 + 12345) >>> 0; const w = 1 + ((x >>> 16) % 3); if (i % 2 === 0) bars.push([at, w]); at += w; }
  return bars;
}
function Barcode({ serial }: { serial: string }) {
  const bars = useMemo(() => barsFor(serial), [serial]);
  return (
    <span className="mt-2 flex items-end gap-2" aria-hidden>
      <svg viewBox="0 0 96 18" preserveAspectRatio="none" className="h-5 w-24" shapeRendering="crispEdges">{bars.map(([bx, bw]) => <rect key={bx} x={bx} y="0" width={bw} height="18" fill="#e4e4e7" />)}</svg>
      <span className="font-mono text-[11px] tracking-widest text-zinc-400">{serial.replace(/\D/g, '').padEnd(6, '0').slice(0, 6)}</span>
    </span>
  );
}

function Row({ icon: Icon, children, warn }: { icon: typeof Tag; children: React.ReactNode; warn?: boolean }) {
  return (
    <span className="flex items-start gap-2">
      <Icon className={cn('mt-0.5 w-3.5 h-3.5 shrink-0', warn ? 'text-amber-300' : 'text-zinc-400')} aria-hidden />
      <span className="min-w-0 text-zinc-200">{children}</span>
    </span>
  );
}

function Front({ c, k, answered, shot }: { c: Passport; k: number; answered: boolean; shot?: string }) {
  const fast = c.km > 0 && c.km / c.hours > 500;
  return (
    <span className="flex h-full flex-col">
      <span className="flex items-start gap-3">
        {/* The product photo (rendered in 3D once, M104), in a little studio light box */}
        <span className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_50%_35%,#ffffff,#d4d4d8)] ring-1 ring-white/20" aria-hidden>
          {shot ? <span className="h-full w-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${shot})` }} /> : <span className="text-2xl">{c.emoji}</span>}
          <span className="play-holo absolute bottom-1 end-1 h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="sr-only">Passport {k + 1}: </span>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Product passport</span>
          <span className="block truncate text-base font-semibold text-white" translate="no">{c.brand}</span>
          <span className="block font-mono text-[11px] text-zinc-400">#{c.serial}</span>
        </span>
        <MiniCode serial={c.serial} />
      </span>
      <span className="mt-3 block space-y-1.5 text-xs">
        <Row icon={c.sealOk ? ShieldCheck : ShieldAlert} warn={!c.sealOk}>{c.sealOk ? 'Seal checks out' : 'Seal doesn’t match'}</Row>
        <Row icon={ScanLine}><span className="tabular-nums">{c.scans}</span> scan{c.scans === 1 ? '' : 's'}</Row>
        <Row icon={MapPin}>{c.firstCity === c.lastCity ? c.firstCity : `${c.firstCity} → ${c.lastCity}`} <span className={cn('tabular-nums', answered && fast ? 'font-semibold text-red-300' : 'text-zinc-400')}>· {c.km.toLocaleString()} km in {c.hours} h</span></Row>
        <Row icon={CalendarClock}>Made {monthName(c.made)} · best before {monthName(c.bestBefore)}</Row>
        <Row icon={Tag}><span className="tabular-nums">${c.price}</span></Row>
      </span>
      <span className="mt-auto block">
        <Barcode serial={c.serial} />
      </span>
      <span className="absolute end-3 top-3 hidden h-6 w-6 place-items-center rounded-md bg-white/10 text-[11px] font-bold text-zinc-300 sm:grid" aria-hidden>{k + 1}</span>
    </span>
  );
}

export function SpotTheFake({ seed, startsAt, clock, onProgress, onDone, onStats }: GameProps) {
  const [s, dispatch] = useReducer(reducer, startsAt, (at): S => ({ i: 0, shownAt: at, picked: null, timedOut: false, lives: FAKE_LIVES, score: 0, streak: 0, best: 0, gained: 0, caught: 0, picks: 0, uv: 1, cleared: [] }));
  const round = useMemo(() => fakeRound(seed, s.i), [seed, s.i]);
  // The round's product, photographed in 3D (M104; the emoji shows until the picture is ready).
  const [shots, setShots] = useState<Map<string, string> | null>(null);
  const product = round.cards[0].product;
  useEffect(() => {
    let on = true;
    void import('./world/shots').then((m) => m.productShots([product])).then((map) => { if (on) setShots(new Map(map)); }).catch(() => {});
    return () => { on = false; };
  }, [product]);
  const { announce, shake, sfx } = useArena();
  const calm = useReducedMotion();
  const answered = s.picked !== null || s.timedOut;
  const over = answered && s.lives <= 0;
  const PER = round.seconds * 1000;
  const n = round.cards.length;

  useEffect(() => {
    if (over) {
      const id = setTimeout(() => onDone(s.score, s.i + 1), REVEAL_MS);
      return () => clearTimeout(id);
    }
    const id = answered
      ? setTimeout(() => dispatch({ t: 'next', at: clock() }), REVEAL_MS)
      : setTimeout(() => dispatch({ t: 'timeout' }), Math.max(0, s.shownAt + PER - clock()));
    return () => clearTimeout(id);
  }, [answered, over, s.shownAt, s.score, s.i, PER, clock, onDone]);

  useEffect(() => { onProgress(s.score, s.i); }, [s.score, s.i, onProgress]);
  useEffect(() => {
    onStats?.([
      { label: 'Copies caught', value: String(s.caught) },
      { label: 'Accuracy', value: `${s.picks ? Math.round((100 * s.caught) / s.picks) : 0}%` },
      { label: 'Best streak', value: String(s.best) },
      { label: 'Rank', value: rankFor(s.caught) },
    ]);
  }, [s.caught, s.picks, s.best, onStats]);
  // Feedback: a catch (and a promotion), or a lost heart.
  useEffect(() => {
    if (!answered) return;
    if (s.gained) {
      sfx('right', s.streak);
      const before = rankFor(s.caught - 1), now = rankFor(s.caught);
      if (now !== before) { announce(`Promoted: ${now}!`, 'gold'); sfx('power'); }
      else if (s.streak >= 3 && s.streak % 2 === 1) announce(`${s.streak} in a row!`, 'pink');
    } else {
      sfx('wrong'); shake(0.8);
      haptic('warning', false);
      if (s.lives === 1) announce('Last life!', 'bad');
    }
  }, [answered, s.gained, s.streak, s.caught, s.lives, sfx, announce, shake]);
  // Round 5: the table grows to six passports.
  useEffect(() => { if (s.i === 4) { announce('Six passports now!', 'pink'); sfx('whoosh'); } }, [s.i, announce, sfx]);

  // The lamp lights a genuine passport that isn't cleared yet (which one comes from the round, so
  // it's the same for everyone in a room).
  const lamp = () => {
    if (answered || s.uv <= 0) return;
    const free = round.cards.map((_, k) => k).filter((k) => k !== round.fake && !s.cleared.includes(k));
    if (!free.length) return;
    dispatch({ t: 'uv', card: free[(seed + s.i * 7 + s.cleared.length) % free.length] });
    sfx('zap'); announce('UV lamp: one is genuine', 'pink');
  };
  const pick = (k: number) => dispatch({ t: 'pick', choice: k, fake: round.fake, at: clock(), seconds: round.seconds, cards: n });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = ['1', '2', '3', '4', '5', '6'].indexOf(e.key);
      if (k >= 0 && k < n) dispatch({ t: 'pick', choice: k, fake: round.fake, at: clock(), seconds: round.seconds, cards: n });
      if (e.key === 'Enter' && answered && !over) dispatch({ t: 'next', at: clock() });
      if (e.key.toLowerCase() === 'u') document.getElementById('fake-uv')?.click();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [round, n, answered, over, clock]);

  const reason = REASON[round.reason];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="font-medium text-zinc-400">Round <span className="tabular-nums text-white">{s.i + 1}</span> · <span className="text-white">{round.cards[0].product}</span> · <span className="text-pink-200">{rankFor(s.caught)}</span></p>
        <div className="flex items-center gap-3">
          <button id="fake-uv" type="button" onClick={lamp} disabled={answered || s.uv <= 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-100 ring-1 ring-violet-400/40 transition-[background-color,opacity,transform] duration-150 hover:bg-violet-500/25 active:scale-95 disabled:opacity-40">
            <Lightbulb className="w-3.5 h-3.5" aria-hidden />UV lamp <span className="tabular-nums">×{s.uv}</span><kbd className="hidden rounded bg-black/30 px-1 text-[11px] font-medium sm:inline">U</kbd>
          </button>
          {s.streak >= 2 && <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/15 px-2.5 py-1 font-semibold text-pink-200 ring-1 ring-pink-400/30"><Flame className="w-4 h-4 text-orange-300" aria-hidden /><span key={s.streak} className="play-tick">{s.streak}</span> in a row</span>}
          <span className="flex items-center gap-1" role="img" aria-label={`${s.lives} of ${FAKE_LIVES} lives left`}>
            {Array.from({ length: FAKE_LIVES }, (_, k) => (
              <motion.span key={k} animate={k < s.lives ? { scale: 1, opacity: 1, rotate: 0, y: 0 } : { scale: 0.8, opacity: 0.25, rotate: calm ? 0 : -25, y: calm ? 0 : 4 }} transition={spring.bouncy}>
                <Heart className={cn('w-6 h-6', k < s.lives ? 'fill-pink-500 text-pink-500 drop-shadow-[0_0_8px_rgba(254,129,209,0.6)]' : 'text-zinc-500')} aria-hidden />
              </motion.span>
            ))}
          </span>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div key={s.i} className="play-drain h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-pink-500" style={{ animationDuration: `${PER}ms`, animationPlayState: answered ? 'paused' : 'running' }} />
      </div>
      <p className="mt-3 text-sm text-zinc-300">One of these {n} is a copy. Which?</p>

      <div className={cn('mt-3 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2', n === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')} style={{ perspective: 1200 }}>
        {round.cards.map((c, k) => {
          const isFake = answered && k === round.fake;
          const wrongPick = answered && s.picked === k && k !== round.fake;
          const cleared = s.cleared.includes(k);
          return (
            <motion.button key={`${s.i}-${k}`} type="button" disabled={answered || cleared} onClick={() => pick(k)}
              initial={{ opacity: 0, y: calm ? 0 : 30, rotate: calm ? 0 : (k % 2 ? 3 : -3), scale: calm ? 1 : 0.94 }} animate={{ opacity: cleared && !answered ? 0.45 : answered && !isFake && !wrongPick ? 0.75 : 1, y: 0, rotate: 0, scale: 1 }}
              transition={{ ...spring.smooth, delay: answered ? 0 : 0.06 * k }}
              className={cn('group relative min-h-[17.5rem] rounded-[1.5rem] text-start outline-offset-4 transition-shadow duration-150', !answered && 'hover:shadow-[0_18px_40px_-18px_rgba(254,129,209,0.55)]')}>
              <motion.span className="absolute inset-0 block" style={{ transformStyle: 'preserve-3d' }} animate={{ rotateY: isFake && !calm ? 180 : 0 }} transition={{ type: 'spring', visualDuration: 0.6, bounce: 0.18 }}>
                <span className={cn('absolute inset-0 block overflow-hidden rounded-[1.5rem] bg-[#151517] p-4 ring-1 [backface-visibility:hidden]',
                  wrongPick ? 'play-shake ring-amber-400' : answered ? 'ring-emerald-400/40' : 'ring-white/10 group-hover:ring-pink-400/60')}>
                  <span className="play-scanline pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-pink-400/15 to-transparent" aria-hidden />
                  <Front c={c} k={k} answered={answered} shot={shots?.get(c.product)} />
                  {cleared && !answered && <span className="play-uv play-fibres pointer-events-none absolute inset-0 grid place-items-center rounded-[1.5rem] bg-violet-950/40"><span className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-2.5 py-1 text-xs font-bold text-white"><Lightbulb className="w-3.5 h-3.5" aria-hidden />Genuine (UV)</span></span>}
                  <AnimatePresence>
                    {answered && !isFake && (
                      <motion.span initial={{ opacity: 0, scale: calm ? 1 : 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring.bouncy, delay: 0.15 }}
                        className="absolute bottom-3 end-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200 ring-1 ring-emerald-400/40" aria-hidden>
                        <BadgeCheck className="w-3.5 h-3.5" />Genuine
                      </motion.span>
                    )}
                    {isFake && calm && <span className="absolute bottom-3 end-3 rounded-md border-2 border-red-400 px-2 text-sm font-black tracking-widest text-red-300" aria-hidden>COPY</span>}
                  </AnimatePresence>
                </span>
                {/* The back: what gave the copy away. */}
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-red-950 to-[#161033] p-5 text-center ring-2 ring-red-500 [backface-visibility:hidden] [transform:rotateY(180deg)]" aria-hidden>
                  {isFake && <Burst color="#f87171" />}
                  <span className="-rotate-12 rounded-lg border-[3px] border-double border-red-400 px-3 py-1 font-mono text-2xl font-black tracking-[0.25em] text-red-300 opacity-90 [mask-image:radial-gradient(circle_at_30%_40%,#000_55%,rgba(0,0,0,0.75)_70%,#000_85%)]">COPY</span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-100"><reason.icon className="w-4 h-4" />{reason.label}</span>
                  {shots?.get(c.product) ? <span className="h-16 w-16 bg-contain bg-center bg-no-repeat opacity-80 grayscale" style={{ backgroundImage: `url(${shots.get(c.product)})` }} /> : <span className="text-3xl" aria-hidden>{c.emoji}</span>}
                </span>
              </motion.span>
              {s.picked === k && s.gained > 0 && <span className="play-float pointer-events-none absolute left-1/2 top-2 z-10 rounded-full bg-emerald-700 px-2.5 py-0.5 text-sm font-bold text-white" aria-hidden>+{s.gained}</span>}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {answered && (
          <motion.div key={s.i} initial={{ opacity: 0, y: calm ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.smooth}
            className={cn('mt-4 flex flex-col gap-3 rounded-2xl p-4 ring-1 sm:flex-row sm:items-center', s.picked === round.fake ? 'bg-emerald-500/10 ring-emerald-400/30' : 'bg-red-500/10 ring-red-400/30')}>
            <p className="flex-1 text-sm text-zinc-100" aria-live="polite">
              <span className="font-semibold">{s.picked === round.fake ? `Caught it! +${s.gained}. ` : s.timedOut ? 'Time’s up. ' : 'That one was genuine. '}</span>{round.why}
            </p>
            {!over && <button type="button" onClick={() => dispatch({ t: 'next', at: clock() })} className="btn-secondary btn-sm self-start sm:self-auto">Next<ArrowRight className="w-4 h-4 rtl:-scale-x-100" aria-hidden /></button>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
