'use client';

import { useEffect, useRef, useState } from 'react';
import { m as motion, useMotionTemplate, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { Nfc } from 'lucide-react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { reducedMotion } from '@/lib/page-transition';
import { cn } from '@/lib/utils';

// The Impact Wallet's cards (M52, after the owner's "Ledgerline" video): a stack of cards, one per
// app, the front one swaying slowly on its own and leaning toward the pointer (or a finger), with a
// light that slides over it, a hologram that shifts colour as it turns and a shadow that moves the
// other way. Picking a card brings it to the front. Everything on the cards is also in the panel
// beside them as text. Reduce Motion: the stack holds still at a slight angle.

export interface WalletCard {
  id: string;
  /** The card's name ("Impact", "Trace points"). */
  name: string;
  finish: 'abyss' | 'pink' | 'aqua' | 'blue';
  /** The big embossed line on the card. */
  line: string;
  /** Small labels under the line (the impact card names its four groups). */
  under?: string[];
  /** What the side panel says. */
  value: string;
  unit: string;
  note: string;
  /** A bar in the side panel: how far along (0–1) and what it measures. */
  bar?: { pct: number; label: string };
}

/** Time that runs only while the stack is on screen and the tab is open (not with Reduce Motion). */
function useScreenTime(ref: React.RefObject<HTMLElement | null>) {
  const time = useMotionValue(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    let raf = 0, seen = false, last = 0;
    const tick = (ms: number) => {
      time.set(time.get() + Math.min(64, ms - last));
      last = ms;
      raf = seen && !document.hidden ? requestAnimationFrame(tick) : 0;
    };
    const go = () => { if (!raf && seen && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); } };
    const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; go(); });
    io.observe(el);
    document.addEventListener('visibilitychange', go);
    return () => { cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', go); };
  }, [ref, time]);
  return time;
}

const ORDER = [
  { x: 0, y: 0, z: 0, rotate: 0, scale: 1 },
  { x: 34, y: -22, z: -50, rotate: 5, scale: 0.95 },
  { x: 64, y: -40, z: -100, rotate: 9, scale: 0.9 },
  { x: 90, y: -56, z: -150, rotate: 12, scale: 0.86 },
];

function Face({ card, holder, front, holo }: { card: WalletCard; holder: string; front: boolean; holo: MotionValue<string> }) {
  const light = card.finish === 'abyss';
  return (
    <div className={cn('wcard', `wcard-${card.finish}`)} aria-hidden>
      <div className="relative flex h-full flex-col justify-between p-[7%]">
        <div className="flex items-center gap-2">
          <UniverseLogo size={22} animated={false} withGlow={false} />
          <span className={cn('text-[13px] font-bold tracking-tight', light ? 'text-white' : 'text-[#171f44]')}>{card.name}</span>
          <Nfc className={cn('ms-auto h-5 w-5', light ? 'text-white/80' : 'text-[#171f44]/70')} />
        </div>
        <div className="flex items-center justify-between">
          <span className="wcard-chip" />
          {front && <motion.span className="wcard-holo" style={{ backgroundImage: holo }} />}
        </div>
        <div>
          <p className={cn('wcard-emboss font-mono text-[clamp(15px,5.2cqi,22px)] font-semibold tabular-nums tracking-[0.12em]', light ? 'text-white' : 'text-[#171f44]')} translate="no">{card.line}</p>
          {card.under && (
            <p className={cn('mt-0.5 flex justify-between pe-[8%] font-mono text-[11px] uppercase tracking-wider', light ? 'text-white/70' : 'text-[#171f44]/75')}>
              {card.under.map((u) => <span key={u}>{u}</span>)}
            </p>
          )}
        </div>
        <div className="flex items-end justify-between">
          <span className={cn('truncate font-mono text-[12px] uppercase tracking-[0.14em]', light ? 'text-white/85' : 'text-[#171f44]/85')} translate="no">{holder}</span>
          <span className={cn('shrink-0 text-[11px] font-bold uppercase tracking-[0.18em]', light ? 'text-aqua-300' : 'text-[#171f44]')}>Impact</span>
        </div>
      </div>
    </div>
  );
}

export function WalletCards({ cards, holder }: { cards: WalletCard[]; holder: string }) {
  const [front, setFront] = useState(cards[0]?.id ?? '');
  const stage = useRef<HTMLDivElement>(null);
  const time = useScreenTime(stage);
  // The pointer over the stack (0–1) and how much it leads (0 idle, 1 following the pointer).
  const px = useMotionValue(0.5), py = useMotionValue(0.5);
  const hover = useSpring(0, { stiffness: 120, damping: 20 });
  const sx = useSpring(px, { stiffness: 150, damping: 18 }), sy = useSpring(py, { stiffness: 150, damping: 18 });
  const idleY = useTransform(time, (t) => -10 + Math.sin(t / 2300) * 9);
  const idleX = useTransform(time, (t) => 8 + Math.cos(t / 3100) * 4);
  const rotateY = useTransform([idleY, sx, hover] as MotionValue<number>[], ([i, x, h]: number[]) => i * (1 - h) + (x - 0.5) * 36 * h);
  const rotateX = useTransform([idleX, sy, hover] as MotionValue<number>[], ([i, y, h]: number[]) => i * (1 - h) + (0.5 - y) * 28 * h);
  // The light slides across as the card turns; the shadow moves the other way.
  const gx = useTransform(rotateY, (r) => 50 + r * 2.6), gy = useTransform(rotateX, (r) => 35 - r * 3);
  const glare = useMotionTemplate`radial-gradient(70% 90% at ${gx}% ${gy}%, rgba(255,255,255,0.34), rgba(255,255,255,0.06) 40%, transparent 65%)`;
  const holoDeg = useTransform(rotateY, (r) => r * 9);
  const holo = useMotionTemplate`conic-gradient(from ${holoDeg}deg, #fe81d1, #74ffed, #a9b4ff, #ffc0e6, #fe81d1)`;
  const shadowX = useTransform(rotateY, (r) => -r * 1.4), shadowS = useTransform(rotateX, (r) => 1 - r * 0.012);

  const order = [front, ...cards.map((c) => c.id).filter((id) => id !== front)];
  const shown = cards.find((c) => c.id === front) ?? cards[0];
  const move = (e: React.PointerEvent) => {
    if (reducedMotion()) return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width); py.set((e.clientY - r.top) / r.height);
    hover.set(1);
  };
  const leave = () => { hover.set(0); px.set(0.5); py.set(0.5); };
  if (!shown) return null;

  return (
    <div className="panel relative overflow-hidden p-5 sm:p-6">
      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div ref={stage} className="wcard-stage relative mx-auto w-full max-w-[400px] touch-pan-y pe-[72px] pt-[56px] pb-6"
          onPointerMove={move} onPointerLeave={leave} onPointerUp={leave} onPointerCancel={leave}>
          <motion.span aria-hidden className="wcard-shadow" style={{ x: shadowX, scaleX: shadowS }} />
          <motion.div className="relative" style={{ rotateX, rotateY, transformStyle: 'preserve-3d', transformPerspective: 1100 }}>
            {/* The cards behind first; each knows its place in the stack. */}
            {[...order].reverse().map((id) => {
              const card = cards.find((c) => c.id === id)!;
              const at = order.indexOf(id), o = ORDER[Math.min(at, ORDER.length - 1)];
              return (
                <motion.div key={id} className={cn(at === 0 ? 'relative' : 'absolute inset-0')} style={{ zIndex: 10 - at, transformStyle: 'preserve-3d' }}
                  initial={false} animate={{ x: o.x, y: o.y, z: o.z, rotate: o.rotate, scale: o.scale, opacity: at > 3 ? 0 : 1 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 26 }}>
                  <Face card={card} holder={holder} front={at === 0} holo={holo} />
                  {at === 0 && <motion.span aria-hidden className="wcard-glare" style={{ backgroundImage: glare }} />}
                </motion.div>
              );
            })}
          </motion.div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Your cards</p>
          <h3 className="mt-1 text-2xl font-bold text-zinc-900 dark:text-white">{shown.name}</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{shown.note}</p>
          <p className="mt-4 font-mono text-3xl font-semibold tabular-nums text-zinc-900 dark:text-white">{shown.value} <span className="font-sans text-base font-medium text-zinc-500 dark:text-zinc-400">{shown.unit}</span></p>
          {shown.bar && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-900/[0.07] dark:bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-aqua-400 transition-[width] duration-700" style={{ width: `${Math.round(Math.max(0, Math.min(1, shown.bar.pct)) * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{shown.bar.label}</p>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Pick a card">
            {cards.map((c) => (
              <button key={c.id} type="button" onClick={() => setFront(c.id)} aria-pressed={c.id === front}
                className={cn('wcard-thumb', `wcard-${c.finish}`, c.id === front && 'is-on')}>
                <span className="sr-only">{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
