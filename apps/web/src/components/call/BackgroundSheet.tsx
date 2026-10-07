'use client';

import { useRef } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Ban, Droplet, Droplets, ImagePlus, Loader2, X } from 'lucide-react';
import { SCENES, type Background } from '@/lib/call-background';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Choosing a call background (src/lib/call-background.ts): none, blur, strong blur, a scene or your
// own picture. The choice is remembered for the next call.

const same = (a: Background, b: Background) => a.kind === b.kind && (a.kind !== 'blur' || !!a.strong === !!(b as { strong?: boolean }).strong) && (a.kind !== 'image' || a.id === (b as { id?: string }).id);

export function BackgroundSheet({ open, onClose, value, onPick, busy, custom, onUpload }: {
  open: boolean; onClose: () => void; value: Background; onPick: (b: Background) => void;
  /** Getting ready (the first time: downloading the engine). */ busy: boolean;
  /** Your own picture, if you added one. */ custom: string | null;
  onUpload: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const tile = (selected: boolean) => cn('relative aspect-video rounded-xl overflow-hidden flex flex-col items-center justify-center gap-1 text-[11px] font-medium ring-2 transition-[box-shadow,transform] active:scale-95', selected ? 'ring-fuchsia-400 shadow-lg shadow-fuchsia-500/20' : 'ring-transparent hover:ring-white/20');
  const options: { b: Background; label: string; icon?: typeof Ban; css?: string; img?: string }[] = [
    { b: { kind: 'none' }, label: 'None', icon: Ban },
    { b: { kind: 'blur' }, label: 'Blur', icon: Droplet },
    { b: { kind: 'blur', strong: true }, label: 'Strong blur', icon: Droplets },
    ...SCENES.map((s) => ({ b: { kind: 'image', id: s.id } as Background, label: s.label, css: s.css })),
    ...(custom ? [{ b: { kind: 'image', id: 'custom' } as Background, label: 'Your picture', img: custom }] : []),
  ];
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="bg-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 z-30" aria-hidden />
          <div key="bg" className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] z-40 px-3 flex justify-center pointer-events-none">
            <motion.div role="dialog" aria-label="Background" initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.96 }} transition={spring.smooth}
              className="pointer-events-auto w-full max-w-md rounded-3xl bg-[#121830]/95 backdrop-blur-2xl border border-white/10 shadow-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Background</p>
                  <p className="text-[11px] text-zinc-400">Done on this device; your room never leaves it.</p>
                </div>
                <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4" /></button>
              </div>
              <div className="relative grid grid-cols-3 sm:grid-cols-4 gap-2">
                {options.map((o, i) => (
                  <motion.button key={o.label} type="button" onClick={() => onPick(o.b)} aria-pressed={same(o.b, value)}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.snappy, delay: i * 0.02 }}
                    className={cn(tile(same(o.b, value)), !o.css && !o.img && 'bg-white/[0.07]')} style={o.css ? { background: o.css } : undefined}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- your own picture, kept on this device */}
                    {o.img && <img src={o.img} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                    {o.icon && <o.icon className="w-5 h-5" />}
                    <span className={cn('relative', (o.css || o.img) && 'mt-auto mb-1 px-1.5 py-0.5 rounded-full bg-black/45 backdrop-blur')}>{o.label}</span>
                  </motion.button>
                ))}
                <button type="button" onClick={() => fileRef.current?.click()} className={cn(tile(false), 'bg-white/[0.04] border border-dashed border-white/15')}>
                  <ImagePlus className="w-5 h-5" />{custom ? 'New picture' : 'Your picture'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
                <AnimatePresence>
                  {busy && (
                    <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 rounded-xl bg-[#121830]/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-sm text-center px-6">
                      <Loader2 className="w-6 h-6 animate-spin text-fuchsia-300" />
                      Getting backgrounds ready… (the first time takes a moment)
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
