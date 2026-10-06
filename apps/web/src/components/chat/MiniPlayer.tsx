'use client';

import { AnimatePresence, m as motion } from 'framer-motion';
import { Mic, Pause, Play, X } from 'lucide-react';
import { useVoice, voice } from '@/lib/voice-player';
import { spring } from '@/lib/motion';

// The voice message that's playing, while its message isn't on screen (you opened another chat
// or page): play/pause, progress, speed, close (src/lib/voice-player.ts).

export function MiniPlayer() {
  const v = useVoice();
  const show = !!v.src && v.onScreen === 0 && (v.playing || v.pos > 0);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return (
    <AnimatePresence>
      {show && (
        <motion.div key="mini-voice" initial={{ y: 40, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0, scale: 0.96 }} transition={spring.smooth}
          className="fixed z-[280] right-3 lg:right-6 bottom-[calc(var(--mobile-tabbar-h,0px)+env(safe-area-inset-bottom)+4.5rem)] lg:bottom-6 w-[min(92vw,20rem)] rounded-2xl glass-sidebar border border-zinc-200 dark:border-white/10 shadow-2xl p-2.5 flex items-center gap-2.5" role="region" aria-label="Voice message playing">
          <button type="button" onClick={() => v.src && voice.toggle(v.src, v.title)} aria-label={v.playing ? 'Pause' : 'Play'} className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white flex items-center justify-center">
            {v.playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate flex items-center gap-1"><Mic className="w-3 h-3 shrink-0 text-indigo-500" />{v.title}</p>
            <div className="mt-1 h-1 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><div className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${v.dur ? Math.min(100, (v.pos / v.dur) * 100) : 0}%` }} /></div>
            <p className="text-[10px] text-zinc-500 tabular-nums mt-0.5">{fmt(v.pos)}{v.dur ? ` / ${fmt(v.dur)}` : ''}</p>
          </div>
          <button type="button" onClick={() => voice.setRate(v.rate === 1 ? 1.5 : v.rate === 1.5 ? 2 : 1)} aria-label="Playback speed" className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300">{v.rate}×</button>
          <button type="button" onClick={() => voice.stop()} aria-label="Stop" className="p-1.5 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
