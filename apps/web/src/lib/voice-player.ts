'use client';

import { useSyncExternalStore } from 'react';

// One voice-note player for the whole app (Stage 4 · 1.7): starting a voice message stops any
// other, and it keeps playing when you switch chats or pages; MiniPlayer
// (src/components/chat/MiniPlayer.tsx) shows it while its message isn't on screen.

export interface VoiceState { src: string | null; title: string; playing: boolean; pos: number; dur: number; rate: number; onScreen: number }

let state: VoiceState = { src: null, title: '', playing: false, pos: 0, dur: 0, rate: 1, onScreen: 0 };
const subs = new Set<() => void>();
const set = (p: Partial<VoiceState>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };

let audio: HTMLAudioElement | null = null;
function el() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'metadata';
  audio.addEventListener('play', () => set({ playing: true }));
  audio.addEventListener('pause', () => set({ playing: false }));
  audio.addEventListener('ended', () => set({ playing: false, pos: 0 }));
  audio.addEventListener('timeupdate', () => set({ pos: audio!.currentTime }));
  audio.addEventListener('loadedmetadata', () => { if (Number.isFinite(audio!.duration)) set({ dur: audio!.duration }); });
  return audio;
}

export const voice = {
  /** Plays this voice message (or pauses/resumes it if it's the one playing). */
  toggle(src: string, title: string, durationHint?: number) {
    const a = el();
    if (state.src === src) { if (a.paused) void a.play().catch(() => {}); else a.pause(); return; }
    a.src = src;
    a.playbackRate = state.rate;
    set({ src, title, pos: 0, dur: durationHint ?? 0 });
    void a.play().catch(() => {});
  },
  seek(src: string, t: number) { if (state.src === src && audio) { audio.currentTime = t; set({ pos: t }); } },
  setRate(rate: number) { if (audio) audio.playbackRate = rate; set({ rate }); },
  stop() { if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); } set({ src: null, playing: false, pos: 0 }); },
  /** A player for the current message is on screen (the mini player hides then). */
  shown(delta: 1 | -1) { set({ onScreen: Math.max(0, state.onScreen + delta) }); },
};

export const useVoice = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => state, () => state);

/** Bars for a voice message without a recorded waveform: steady-looking, the same every time. */
export function fallbackBars(seed: string, n = 40): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: n }, (_, i) => { h = Math.imul(h ^ (h >>> 13), 1274126177) + i; return 6 + (Math.abs(h) % 20); });
}
