'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, m as motion, useInView, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { AppIcon } from '@/components/apps/AppIcon';
import { APPS, type AppId } from '@/lib/apps';
import { cn } from '@/lib/utils';
import { CampusScene, GreenScene, PlayScene, ReliefScene, TraceScene } from './HeroScenes';
import { Accent, EASE, Live, useCalm } from './bits';

// The scroll story under the landing's hero (M44): the five apps' pictures turning into each other as
// the page scrolls, one screen each, while the picture stays put (sticky). Each picture's box is full
// width (M56: a bare one shrank to its widest label, so Relief's radar vanished); the words sit in a
// pool of navy so the river passing behind them doesn't cut through. Only the picture on screen
// and its neighbours are drawn, and only while the story is near the screen. With Reduce Motion they
// only cross-fade.

const SCENE: Record<AppId, () => React.ReactNode> = { campus: CampusScene, trace: TraceScene, relief: ReliefScene, green: GreenScene, play: PlayScene };
const N = APPS.length;

function Layer({ i, at, calm, shown, children }: { i: number; at: MotionValue<number>; calm: boolean; shown: boolean; children: React.ReactNode }) {
  // at: 0…N-1, where the story is. Fully shown within a quarter step of its place, gone by three quarters.
  const opacity = useTransform(at, (x) => Math.max(0, Math.min(1, (0.75 - Math.abs(x - i)) / 0.5)));
  const scale = useTransform(at, (x) => (calm ? 1 : 1 - 0.1 * Math.min(1, Math.abs(x - i))));
  const y = useTransform(at, (x) => (calm ? 0 : (i - x) * 60));
  return <motion.div aria-hidden={!shown} className="absolute inset-0 flex justify-center" style={{ opacity, scale, y }}>{children}</motion.div>;
}

export function ScrollStory({ onPick }: { onPick?: (id: AppId) => void }) {
  const ref = useRef<HTMLElement>(null);
  const calm = useCalm();
  const near = useInView(ref, { margin: '300px 0px' });
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const at = useTransform(scrollYProgress, [0, 1], [0, N - 1]);
  const [now, setNow] = useState(0);
  useMotionValueEvent(at, 'change', (x) => setNow(Math.round(x)));
  const app = APPS[now];

  const go = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + (i / (N - 1)) * (el.offsetHeight - window.innerHeight), behavior: calm ? 'auto' : 'smooth' });
  };

  return (
    <section ref={ref} id="story" aria-label="Every app, one after another" className="relative px-6" style={{ height: `${N * 100}svh` }}>
      <div className="sticky top-0 h-svh flex items-center">
        <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-6 lg:gap-12 items-center">
          <div className="text-pool pt-16 sm:pt-20 lg:pt-0">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={app.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }} transition={{ duration: 0.3, ease: EASE }}>
                <div className="mt-6 flex items-center gap-3"><AppIcon id={app.id} size={44} /><p className="text-lg font-bold text-white">{app.name}</p></div>
                <h2 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white">{app.tagline.split(' ').slice(0, -1).join(' ')} <Accent>{app.tagline.split(' ').pop()}.</Accent></h2>
                <button type="button" onClick={() => { onPick?.(app.id); window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' }); }}
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-200 hover:text-white">
                  Open {app.name} <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden />
                </button>
              </motion.div>
            </AnimatePresence>
            <ol className="mt-8 flex gap-2" aria-label="Apps">
              {APPS.map((a, i) => (
                <li key={a.id}>
                  <button type="button" onClick={() => go(i)} aria-label={a.name} aria-current={i === now ? 'step' : undefined}
                    className="group grid place-items-center h-6 w-8">
                    <span className={cn('block h-1.5 rounded-full transition-[width,background-color] duration-300', i === now ? 'w-8 bg-white' : 'w-3 bg-white/25 group-hover:bg-white/50')} />
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <div className="relative h-[480px] [@media(max-height:780px)]:h-[400px] [@media(max-height:780px)]:scale-[0.82] origin-top">
            {APPS.map((a, i) => {
              if (!near || Math.abs(i - now) > 1) return null;
              const Scene = SCENE[a.id];
              return <Layer key={a.id} i={i} at={at} calm={calm} shown={i === now}><Live away={i !== now} className="flex w-full justify-center"><Scene /></Live></Layer>;
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
