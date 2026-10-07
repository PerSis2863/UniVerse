'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m as motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Download, Minus, Plus, X } from 'lucide-react';
import { safeHref } from '@/lib/safe-href';
import { spring } from '@/lib/motion';

// Photos in a chat, full screen (Stage 4 · 1.8): every photo of the chat in order, swipe or arrow
// keys between them, zoom with a pinch, the mouse wheel, a double tap or the buttons, and drag to
// look around when zoomed. Swipe down (or Esc) to close.

export interface ViewerImage { url: string; name?: string | null }

const MAX = 5;

export function ImageViewer({ images, start, onClose }: { images: ViewerImage[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(Math.min(Math.max(0, start), images.length - 1));
  const [dir, setDir] = useState(0);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; px: number; py: number; dist: number; scale: number; moved: boolean } | null>(null);
  const lastTap = useRef(0);
  const img = images[i];

  const go = useCallback((d: number) => {
    const next = i + d;
    if (next < 0 || next >= images.length) return;
    setDir(d);
    setI(next);
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, [i, images.length]);
  const zoomTo = (s: number) => {
    const next = Math.min(MAX, Math.max(1, s));
    setScale(next);
    if (next === 1) setPos({ x: 0, y: 0 });
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === '+' || e.key === '=') setScale((s) => Math.min(MAX, s + 0.5));
      else if (e.key === '-') setScale((s) => { const n = Math.max(1, s - 0.5); if (n === 1) setPos({ x: 0, y: 0 }); return n; });
    };
    window.addEventListener('keydown', key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = overflow; };
  }, [go, onClose]);

  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const dist = pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y, dist, scale, moved: false };
    setDragging(true);
  };
  const move = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    if (pts.length === 2 && g.dist) {
      // Pinch.
      g.moved = true;
      zoomTo(g.scale * (Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / g.dist));
      return;
    }
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) g.moved = true;
    if (scale > 1) setPos({ x: g.px + dx, y: g.py + dy });
    else setPos({ x: dx, y: Math.max(0, dy) }); // follows the finger before a swipe
  };
  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g || pointers.current.size) return;
    gesture.current = null;
    setDragging(false);
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.moved) {
      // A double tap zooms in (or back out).
      const now = e.timeStamp;
      if (now - lastTap.current < 300) { zoomTo(scale > 1 ? 1 : 2.5); lastTap.current = 0; } else lastTap.current = now;
      return;
    }
    if (scale > 1) return;
    if (dy > 120 && Math.abs(dy) > Math.abs(dx)) return onClose();
    if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    setPos({ x: 0, y: 0 });
  };
  const wheel = (e: React.WheelEvent) => zoomTo(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15));

  const btn = 'w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center disabled:opacity-30';
  return createPortal(
    <motion.div role="dialog" aria-label="Photo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={spring.smooth} className="fixed inset-0 z-[95] bg-black/95 text-white flex flex-col select-none">
      <div className="h-14 shrink-0 flex items-center gap-1 px-3 pt-[env(safe-area-inset-top)]">
        <p className="flex-1 min-w-0 truncate text-sm text-white/80">{images.length > 1 ? `${i + 1} of ${images.length}` : ''}{img?.name ? `${images.length > 1 ? ' · ' : ''}${img.name}` : ''}</p>
        <button type="button" aria-label="Zoom out" disabled={scale <= 1} onClick={() => zoomTo(scale - 0.5)} className={btn}><Minus className="w-5 h-5" /></button>
        <button type="button" aria-label="Zoom in" disabled={scale >= MAX} onClick={() => zoomTo(scale + 0.5)} className={btn}><Plus className="w-5 h-5" /></button>
        <a href={safeHref(img?.url ?? '')} download={img?.name ?? 'photo'} target="_blank" rel="noopener noreferrer" aria-label="Download" className={btn}><Download className="w-5 h-5" /></a>
        <button type="button" onClick={onClose} aria-label="Close" className={btn}><X className="w-6 h-6" /></button>
      </div>
      <div className="relative flex-1 min-h-0 overflow-hidden touch-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}>
        <AnimatePresence initial={false} custom={dir}>
          <motion.img
            key={img?.url}
            src={safeHref(img?.url ?? '')}
            alt={img?.name ?? ''}
            draggable={false}
            custom={dir}
            initial={{ opacity: 0, x: dir * 80 }}
            animate={{ opacity: 1, x: pos.x, y: pos.y, scale }}
            exit={{ opacity: 0, x: -dir * 80 }}
            transition={dragging ? { duration: 0 } : spring.smooth}
            className="absolute inset-0 m-auto max-w-full max-h-full object-contain p-2"
          />
        </AnimatePresence>
        {images.length > 1 && (
          <>
            <button type="button" aria-label="Previous photo" disabled={i === 0} onClick={() => go(-1)} className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 items-center justify-center disabled:opacity-0 transition-opacity"><ChevronLeft className="w-6 h-6" /></button>
            <button type="button" aria-label="Next photo" disabled={i === images.length - 1} onClick={() => go(1)} className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 items-center justify-center disabled:opacity-0 transition-opacity"><ChevronRight className="w-6 h-6" /></button>
          </>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}
