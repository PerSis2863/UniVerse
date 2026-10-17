'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m as motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, MonitorPlay, NotebookText, X } from 'lucide-react';
import { H, themeOf, widthOf, type DeckJSON } from '@/lib/slides/deck';
import { SlideView, stepsOf } from './SlideView';

// Presenting a deck (Office suite): full screen, the arrows, space, Page Up / Down or a tap move on
// (a slide's animated items appear first, one per step); Escape ends. Transitions fade, slide or
// zoom. The presenter view shows the notes, the next slide and a timer; the audience window
// (a second screen) follows along through a BroadcastChannel, so nothing goes through the server.

const VARIANTS = {
  none: { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } },
  fade: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  slide: { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '-100%' } },
  zoom: { initial: { opacity: 0, scale: 0.85 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 1.08 } },
};

export interface ShowState { i: number; step: number }
export const channelName = (docId: string) => `slides:${docId}`;

function useFit(box: React.RefObject<HTMLDivElement | null>, W: number) {
  const [size, setSize] = useState({ w: 1280, h: 720 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [box]);
  return Math.min(size.w / W, size.h / H);
}

/** The slide filling the space, with its transition. */
function Stage({ deck, at, step, label }: { deck: DeckJSON; at: number; step: number; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const W = widthOf(deck.ratio), theme = themeOf(deck.theme);
  const scale = useFit(box, W);
  const s = deck.slides[at];
  const v = VARIANTS[s?.transition ?? 'none'];
  return (
    <div ref={box} className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden">
      <AnimatePresence initial={false} mode="popLayout">
        {s && (
          <motion.div key={s.id} initial={v.initial} animate={v.animate} exit={v.exit} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="shadow-2xl">
            <SlideView slide={s} theme={theme} W={W} scale={scale} mode="show" step={step} label={label} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Presenter({ deck, docId, start, onClose }: { deck: DeckJSON; docId: string; start: number; onClose: () => void }) {
  const shown = deck.slides.map((s, i) => ({ s, i })).filter((x) => !x.s.hidden);
  const list = shown.length ? shown : deck.slides.map((s, i) => ({ s, i }));
  const [pos, setPos] = useState(() => Math.max(0, list.findIndex((x) => x.i >= start)));
  const [step, setStep] = useState(0);
  const [presenter, setPresenter] = useState(false);
  const [controls, setControls] = useState(true);
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const root = useRef<HTMLDivElement>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const cur = list[Math.min(pos, list.length - 1)];
  const steps = cur ? stepsOf(cur.s) : 0;
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  const next = () => { if (step < steps) setStep(step + 1); else if (pos < list.length - 1) { setPos(pos + 1); setStep(0); } };
  const prev = () => { if (step > 0) setStep(step - 1); else if (pos > 0) { setPos(pos - 1); setStep(stepsOf(list[pos - 1].s)); } };
  const keys = useRef({ next, prev });
  useEffect(() => { keys.current = { next, prev }; });

  useEffect(() => {
    const el = root.current;
    void el?.requestFullscreen?.().catch(() => {});
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].includes(e.key)) { e.preventDefault(); keys.current.next(); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(e.key)) { e.preventDefault(); keys.current.prev(); }
      else if (e.key === 'Home') { e.preventDefault(); setPos(0); setStep(0); }
      else if (e.key === 'End') { e.preventDefault(); setPos(list.length - 1); setStep(0); }
      else if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); }
    };
    const onFs = () => { if (!document.fullscreenElement && el && document.body.contains(el)) { /* left full screen: keep presenting in the window */ } };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('fullscreenchange', onFs);
    try { channel.current = new BroadcastChannel(channelName(docId)); } catch { channel.current = null; }
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('fullscreenchange', onFs);
      clearInterval(tick);
      channel.current?.postMessage({ end: true });
      channel.current?.close();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [docId, list.length]);
  // The audience window follows.
  useEffect(() => { channel.current?.postMessage({ i: cur?.i ?? 0, step }); }, [cur?.i, step]);
  // Controls fade after a moment without the pointer moving.
  useEffect(() => { if (!controls) return; const t = setTimeout(() => setControls(false), 2500); return () => clearTimeout(t); }, [controls, pos]);

  const touch = useRef<number | null>(null);
  const elapsed = Math.floor((now - started) / 1000);
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  const label = `Slide ${pos + 1} of ${list.length}`;
  const nextSlide = list[pos + 1]?.s;
  const W = widthOf(deck.ratio), theme = themeOf(deck.theme);

  return createPortal(
    <div ref={root} role="dialog" aria-modal="true" aria-label="Presenting" className="fixed inset-0 z-[90] bg-black text-white flex flex-col" onPointerMove={() => setControls(true)}
      onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }} onTouchEnd={(e) => { const x = e.changedTouches[0]?.clientX; if (touch.current != null && x != null && Math.abs(x - touch.current) > 50) { if (x < touch.current) next(); else prev(); } touch.current = null; }}>
      <p className="sr-only" aria-live="polite">{label}</p>
      {presenter ? (
        <div className="flex-1 min-h-0 grid grid-rows-[1fr_auto] md:grid-rows-1 md:grid-cols-[2fr_1fr] gap-4 p-4">
          <div onClick={next} className="min-h-0 flex cursor-pointer"><Stage deck={deck} at={cur?.i ?? 0} step={step} label={label} /></div>
          <div className="flex flex-col gap-3 min-h-0">
            <div className="flex items-center justify-between text-sm"><span className="font-semibold">{label}</span><span className="tabular-nums text-2xl font-semibold" aria-label={`Time: ${clock}`}>{clock}</span></div>
            <div><p className="text-xs uppercase tracking-wide text-zinc-400 mb-1">Next</p>{nextSlide ? <SlideView slide={nextSlide} theme={theme} W={W} scale={240 / W} mode="thumb" /> : <p className="text-sm text-zinc-400">End of the presentation</p>}</div>
            <div className="flex-1 min-h-0 overflow-y-auto rounded-xl bg-white/[0.06] p-3"><p className="text-xs uppercase tracking-wide text-zinc-400 mb-1">Notes</p><p className="text-lg leading-relaxed whitespace-pre-wrap">{cur?.s.notes || 'No notes for this slide.'}</p></div>
          </div>
        </div>
      ) : (
        // A click or tap on the slide moves on (keys and the Next button do it too; the slide's own
        // words stay readable to screen readers).
        <div onClick={next} className="flex-1 min-h-0 flex cursor-pointer"><Stage deck={deck} at={cur?.i ?? 0} step={step} label={label} /></div>
      )}
      <div className={`absolute left-3 bottom-3 flex items-center gap-1 rounded-full bg-zinc-900/80 backdrop-blur px-2 py-1 transition-opacity ${controls || presenter ? 'opacity-100' : 'opacity-0 focus-within:opacity-100'}`}>
        <button type="button" onClick={prev} aria-label="Previous" className="p-2 rounded-full hover:bg-white/10"><ChevronLeft className="w-5 h-5" /></button>
        <span className="text-sm tabular-nums px-1">{pos + 1} / {list.length}</span>
        <button type="button" onClick={next} aria-label="Next slide" className="p-2 rounded-full hover:bg-white/10"><ChevronRight className="w-5 h-5" /></button>
        <button type="button" onClick={() => setPresenter((p) => !p)} aria-pressed={presenter} aria-label="Presenter view (notes, next slide, timer)" title="Presenter view" className="p-2 rounded-full hover:bg-white/10"><NotebookText className="w-5 h-5" /></button>
        <button type="button" onClick={() => { window.open(`/slides/${docId}?audience=1`, `audience-${docId}`, 'popup,width=1280,height=720'); setPresenter(true); }} aria-label="Open the audience window for a second screen" title="Audience window" className="p-2 rounded-full hover:bg-white/10"><MonitorPlay className="w-5 h-5" /></button>
        <button type="button" onClick={onClose} aria-label="End the presentation" className="p-2 rounded-full hover:bg-white/10"><X className="w-5 h-5" /></button>
      </div>
    </div>,
    document.body,
  );
}

/** The audience window: the slide the presenter is on, nothing else. */
export function Audience({ deck, docId }: { deck: DeckJSON; docId: string }) {
  const [at, setAt] = useState<ShowState>({ i: 0, step: 0 });
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try { ch = new BroadcastChannel(channelName(docId)); } catch { return; }
    ch.onmessage = (e) => { const d = e.data as Partial<ShowState> & { end?: boolean }; if (d.end) setEnded(true); else if (typeof d.i === 'number') { setAt({ i: d.i, step: d.step ?? 0 }); setEnded(false); } };
    return () => ch?.close();
  }, [docId]);
  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col" onDoubleClick={() => void document.documentElement.requestFullscreen?.().catch(() => {})}>
      {ended ? <p className="m-auto text-zinc-400">The presentation has ended.</p> : <Stage deck={deck} at={Math.min(at.i, deck.slides.length - 1)} step={at.step} label={`Slide ${at.i + 1}`} />}
      <p className="absolute bottom-2 right-3 text-xs text-zinc-600">Double-click for full screen</p>
    </div>
  );
}
