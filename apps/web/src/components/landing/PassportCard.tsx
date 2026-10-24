'use client';

import { useEffect, useState } from 'react';
import { m as motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check, MapPin, ScanLine, ShieldCheck, Sparkles } from 'lucide-react';
import { EASE } from './bits';

// The landing hero's phone (UniVerse Trace): a code gets scanned, the seal says "Genuine", the
// product's journey lights up stop by stop, and the shop's points land. Loops every ~7 s; with
// Reduce Motion it shows the finished passport and stays still (MotionConfig on the page).

const STOPS = [['Made', 'Jaén, Spain'], ['Shipped', 'Port of Valencia'], ['Warehouse', 'Lyon'], ['In the shop', 'Paris 11e']] as const;

export function PassportCard() {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0); // 0 scanning, 1 genuine, 2–5 journey stops, 6 points
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setStep((s) => (s >= 8 ? 0 : s + 1)), 850);
    return () => clearInterval(t);
  }, [reduced]);
  const shown = reduced ? 6 : Math.min(step, 6);
  return (
    <div className="relative w-[300px] sm:w-[330px] rounded-[44px] p-3 bg-gradient-to-b from-white/15 to-white/[0.03] shadow-[0_40px_90px_-30px_rgba(236,72,153,0.55)] ring-1 ring-white/10" aria-label="A product passport being scanned" role="img">
      <div className="relative rounded-[34px] overflow-hidden passport px-5 pt-10 pb-6 min-h-[540px]">
        <span aria-hidden className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-5 rounded-full bg-black/80" />
        <AnimatePresence mode="wait">
          {shown === 0 ? (
            <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.35 }} className="flex flex-col items-center pt-16">
              <span className="relative w-40 h-40 rounded-3xl border-2 border-pink-400/70 grid place-items-center overflow-hidden">
                <span className="grid grid-cols-5 gap-1 opacity-80" aria-hidden>{Array.from({ length: 25 }, (_, i) => <span key={i} className={`w-5 h-5 rounded-[3px] ${[0, 1, 3, 5, 7, 9, 11, 12, 14, 16, 18, 19, 21, 23, 24].includes(i) ? 'bg-white' : 'bg-white/10'}`} />)}</span>
                <motion.span className="absolute inset-x-0 h-0.5 bg-pink-400 shadow-[0_0_14px_2px_rgba(236,72,153,0.8)]" animate={{ y: [-70, 70, -70] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} />
              </span>
              <p className="mt-6 text-sm text-zinc-300 inline-flex items-center gap-2"><ScanLine className="w-4 h-4 text-pink-300" />Scanning the label…</p>
            </motion.div>
          ) : (
            <motion.div key="passport" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
              <div className="flex flex-col items-center text-center">
                <motion.span initial={{ scale: 0.6, rotate: -120, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ duration: 0.8, ease: EASE }} className="relative w-24 h-24 grid place-items-center">
                  <span className="passport-seal-ring" style={{ animation: 'none' }} />
                  <span className="w-[76px] h-[76px] rounded-full grid place-items-center bg-[radial-gradient(circle_at_30%_25%,#4a5c6a,#253745_55%,#11212d)] shadow-[0_0_40px_-4px_rgba(236,72,153,0.7)]"><ShieldCheck className="w-9 h-9 text-white" strokeWidth={1.6} /></span>
                </motion.span>
                <p className="mt-3 text-3xl font-black text-white tracking-tight">Genuine</p>
                <p className="text-xs text-zinc-300">Aurora olive oil · unit 1,204 of 5,000</p>
              </div>
              <ol className="mt-6 space-y-2.5">
                {STOPS.map(([stage, place], i) => {
                  const on = shown >= i + 2;
                  return (
                    <li key={stage} className={`flex items-center gap-3 rounded-2xl px-3 py-2 transition-all duration-500 ${on ? 'bg-white/[0.07] opacity-100' : 'opacity-30'}`}>
                      <span className={`w-6 h-6 rounded-full grid place-items-center transition-colors duration-500 ${on ? 'bg-pink-500 text-white' : 'bg-white/10 text-transparent'}`}><Check className="w-3.5 h-3.5" strokeWidth={3} /></span>
                      <span className="text-sm text-white font-semibold">{stage}</span>
                      <span className="ms-auto text-[11px] text-zinc-300 inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{place}</span>
                    </li>
                  );
                })}
              </ol>
              <motion.div initial={false} animate={{ opacity: shown >= 6 ? 1 : 0, y: shown >= 6 ? 0 : 10 }} transition={{ duration: 0.45, ease: EASE }} className="mt-5 rounded-2xl px-4 py-3 bg-pink-500/15 ring-1 ring-pink-400/40 flex items-center gap-2 text-sm text-white">
                <Sparkles className="w-4 h-4 text-pink-300" /> The shop earned <b>25 points</b>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
