'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Lightbulb, MapPin, Package } from 'lucide-react';
import { CITIES } from '@/components/trace/map/cities';
import { WorldCanvas, type Box, type Frame, type MapHandle } from '@/components/trace/map/WorldCanvas';
import { PIN_HINTS, PIN_SECONDS_PER, PIN_TARGETS, kmBetween, pinPoints, pinRegion, pinStreakBonus, pinTarget, pinVerdict } from '@/lib/play/pin';
import { useDarkMode } from '@/lib/use-dark';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { GameProps } from './game-props';
import { haptic } from '@/lib/haptics';

// World Pin (src/lib/play/pin.ts): a parcel is heading to a city; tap where it is on the world map
// (Trace's own map: drag and zoom work, city names are hidden). Your pin drops, the real one rises,
// a line draws between them and the map glides to show both, then back out for the next city.
// Keyboard: move the map with the arrows and press Enter to pin the middle (the cross).

const PER = PIN_SECONDS_PER * 1000;
const REVEAL_MS = 2200;
const WORLD: Box = [-170, -56, 180, 76];
const HIDE = new Set(CITIES.map((c) => c[0]));

interface Pick { lat: number; lng: number; km: number; pts: number }
interface S { i: number; shownAt: number; pick: Pick | null; timedOut: boolean; revealAt: number; score: number; best: number; streak: number; hints: number; hinted: boolean }
type A = { t: 'pick'; pick: Pick; at: number } | { t: 'timeout'; at: number } | { t: 'next'; at: number } | { t: 'hint' };

function reducer(s: S, a: A): S {
  if (a.t === 'next') return { ...s, i: s.i + 1, shownAt: a.at, pick: null, timedOut: false, hinted: false };
  if (s.pick || s.timedOut) return s;
  if (a.t === 'hint') return s.hints > 0 && !s.hinted ? { ...s, hints: s.hints - 1, hinted: true } : s;
  if (a.t === 'timeout') return { ...s, timedOut: true, revealAt: a.at, streak: 0 };
  // Close pins in a row (within 500 km) build a streak bonus; a hint halves the city's points.
  const streak = a.pick.km < 500 ? s.streak + 1 : 0;
  const pts = Math.round(a.pick.pts * (s.hinted ? 0.5 : 1)) + (streak ? pinStreakBonus(streak) : 0);
  return { ...s, pick: { ...a.pick, pts }, revealAt: a.at, score: s.score + pts, best: Math.max(s.best, pts), streak };
}

export function WorldPin({ seed, startsAt, clock, onProgress, onDone }: GameProps) {
  const [s, dispatch] = useReducer(reducer, startsAt, (at): S => ({ i: 0, shownAt: at, pick: null, timedOut: false, revealAt: 0, score: 0, best: 0, streak: 0, hints: PIN_HINTS, hinted: false }));
  const target = useMemo(() => pinTarget(seed, s.i), [seed, s.i]);
  const dark = useDarkMode();
  const calm = useReducedMotion();
  const map = useRef<MapHandle>(null);
  const seen = useRef<{ lngLat: Frame['lngLat']; w: number; h: number } | null>(null);
  const answered = !!s.pick || s.timedOut;
  const last = s.i >= PIN_TARGETS - 1;
  // The hint's view is a little off-centre (the same for everyone in a room), so it doesn't give the city away.
  const hintShift = useMemo(() => ({ x: Math.sin(seed * 0.37 + s.i * 2.1) * 9, y: Math.cos(seed * 0.21 + s.i * 1.7) * 6 }), [seed, s.i]);
  const hint = () => dispatch({ t: 'hint' });

  const pinAt = useCallback((x: number, y: number) => {
    if (!seen.current || answered) return;
    const [lng, lat] = seen.current.lngLat(x, y);
    const km = kmBetween({ lat, lng }, target);
    dispatch({ t: 'pick', pick: { lat, lng, km, pts: pinPoints(km, s.shownAt + PER - clock()) }, at: clock() });
    haptic(km < 500 ? 'tap' : 'warning', false);
  }, [answered, target, s.shownAt, clock]);

  // The per-city clock, then the reveal, then the next city (or the end after fifteen).
  useEffect(() => {
    if (answered) {
      const id = setTimeout(() => (last ? onDone(s.score, s.i + 1) : dispatch({ t: 'next', at: clock() })), REVEAL_MS);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => dispatch({ t: 'timeout', at: clock() }), Math.max(0, s.shownAt + PER - clock()));
    return () => clearTimeout(id);
  }, [answered, last, s.shownAt, s.score, s.i, clock, onDone]);

  // Glide to show both pins, and back out for the next city (or, with a hint, to the region).
  useEffect(() => {
    if (!answered && s.hinted) { map.current?.flyTo([target.lng - 22 + hintShift.x, target.lat - 14 + hintShift.y, target.lng + 22 + hintShift.x, target.lat + 14 + hintShift.y], { pad: 30, maxZoom: 3 }); return; }
    if (!answered) { map.current?.home(); return; }
    const p = s.pick ?? target;
    const box: Box = [Math.min(p.lng, target.lng), Math.min(p.lat, target.lat), Math.max(p.lng, target.lng), Math.max(p.lat, target.lat)];
    map.current?.flyTo(box, { pad: 90, maxZoom: 5 });
  }, [answered, s.pick, s.hinted, target, hintShift]);

  useEffect(() => { onProgress(s.score, s.i); }, [s.score, s.i, onProgress]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && seen.current && document.activeElement?.getAttribute('role') === 'application') {
        e.preventDefault();
        pinAt(seen.current.w / 2, seen.current.h / 2);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [pinAt]);

  const draw = useCallback((f: Frame) => {
    seen.current = { lngLat: f.lngLat, w: f.w, h: f.h };
    const { ctx } = f;
    if (!answered) {
      ctx.strokeStyle = dark ? 'rgba(249,168,212,0.55)' : 'rgba(219,39,119,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(f.w / 2 - 8, f.h / 2); ctx.lineTo(f.w / 2 + 8, f.h / 2); ctx.moveTo(f.w / 2, f.h / 2 - 8); ctx.lineTo(f.w / 2, f.h / 2 + 8); ctx.stroke();
      return;
    }
    const since = Math.min(1, (clock() - s.revealAt) / 700);
    const ease = 1 - (1 - since) ** 3;
    const [tx, ty] = f.at(target.lng, target.lat);
    if (s.pick) {
      const [px, py] = f.at(s.pick.lng, s.pick.lat);
      ctx.strokeStyle = '#f472b6'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (tx - px) * ease, py + (ty - py) * ease); ctx.stroke(); ctx.setLineDash([]);
      pin(ctx, px, py - (1 - ease) * 30, '#ec4899');
      if (since >= 1) {
        const label = `${Math.round(s.pick.km).toLocaleString()} km`;
        ctx.font = '700 13px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
        const mx = (px + tx) / 2, my = (py + ty) / 2 - 10, tw = ctx.measureText(label).width + 16;
        ctx.fillStyle = dark ? 'rgba(20,20,22,0.9)' : 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(mx - tw / 2, my - 13, tw, 22, 11); ctx.fill();
        ctx.fillStyle = dark ? '#f9a8d4' : '#be185d'; ctx.fillText(label, mx, my + 2);
      }
    }
    // The real place: a pulse and a green pin.
    const pulse = (f.t / 1000) % 1.4 / 1.4;
    ctx.strokeStyle = `rgba(74,222,128,${0.7 * (1 - pulse)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(tx, ty, 6 + pulse * 22, 0, Math.PI * 2); ctx.stroke();
    pin(ctx, tx, ty - (1 - ease) * 18, '#22c55e');
    ctx.font = '700 13px Inter, system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = dark ? '#f8fafc' : '#0f172a'; ctx.fillText(target.name, tx + 12, ty - 14);
  }, [answered, dark, clock, s.revealAt, s.pick, target]);

  const verdict = s.pick ? pinVerdict(s.pick.km) : 'Time’s up';
  return (
    <div className="mx-auto w-full">
      <div className="relative">
        <WorldCanvas ref={map} label="World map: tap where the city is" homeBox={WORLD} dark={dark} live={answered && !calm} draw={draw}
          onPoint={(p, kind) => { if (p && kind === 'click') pinAt(p.x, p.y); }} skipCities={HIDE}
          className="h-[min(62vh,540px)] min-h-80 w-full overflow-hidden rounded-3xl ring-1 ring-black/10 dark:ring-white/10" />
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3">
          <AnimatePresence mode="wait">
            <motion.div key={s.i} initial={{ opacity: 0, y: calm ? 0 : -10, scale: calm ? 1 : 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={spring.bouncy}
              className="w-full max-w-sm overflow-hidden rounded-2xl bg-white/95 shadow-xl ring-1 ring-black/5 dark:bg-[#141416]/95 dark:ring-white/10">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-pink-600 text-white"><Package className="w-5 h-5" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Parcel {s.i + 1} of {PIN_TARGETS} · deliver to</p>
                  <p className="truncate text-lg font-bold text-zinc-900 dark:text-white" aria-live="polite">{target.name}</p>
                  {s.hinted && <p className="text-xs font-semibold text-pink-700 dark:text-pink-300" aria-live="polite">Hint: somewhere in {pinRegion(target.lat, target.lng)} (half points)</p>}
                </div>
                <button type="button" onClick={hint} disabled={answered || s.hinted || s.hints <= 0}
                  className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white transition-[opacity,transform] duration-150 active:scale-95 disabled:opacity-40 dark:bg-white dark:text-zinc-900">
                  <Lightbulb className="w-3.5 h-3.5" aria-hidden />Hint ×{s.hints}
                </button>
                <span className="text-end text-xs text-zinc-500 dark:text-zinc-400">Best<span className="block text-sm font-bold tabular-nums text-zinc-900 dark:text-white">{s.best}</span></span>
              </div>
              <div className="h-1 bg-zinc-200 dark:bg-white/10"><div key={s.i} className="play-drain h-full bg-gradient-to-r from-fuchsia-500 to-pink-500" style={{ animationDuration: `${PER}ms`, animationPlayState: answered ? 'paused' : 'running' }} /></div>
            </motion.div>
          </AnimatePresence>
        </div>
        <AnimatePresence>
          {answered && (
            <motion.div key={`r${s.i}`} initial={{ opacity: 0, y: calm ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={spring.bouncy}
              className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-3">
              <p className={cn('inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold shadow-xl', s.pick && s.pick.pts > 0 ? 'bg-emerald-700 text-white' : 'bg-[#141416] text-white')} aria-live="polite">
                <MapPin className="w-4 h-4" aria-hidden />{verdict}{s.pick ? ` · +${s.pick.pts}` : ''}{s.streak > 1 ? ` · ${s.streak} close in a row` : ''}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">Tap the map to pin · drag and pinch to look closer · keyboard: arrows move, Enter pins the cross.</p>
    </div>
  );
}

function pin(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y - 16, 8, Math.PI * 0.75, Math.PI * 0.25); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 16, 3, 0, Math.PI * 2); ctx.fill();
}
