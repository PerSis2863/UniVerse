'use client';

import { useSyncExternalStore } from 'react';

// The focus timer (Collaborate → Home, and the small pill beside Collaborate's tabs): rounds of
// focused work and short breaks. Kept on this device, so it carries on across pages and reloads.
// A focus round that ends starts its break by itself; a break that ends waits for the next start.

export const PRESETS = [[25, 5], [50, 10], [15, 3]] as const;
export type Phase = 'focus' | 'break';
export interface FocusState { phase: Phase; preset: number; endsAt: number | null; left: number; rounds: number }

const KEY = 'uv-focus';
const minutes = (preset: number, phase: Phase) => (PRESETS[preset] ?? PRESETS[0])[phase === 'focus' ? 0 : 1] * 60_000;
export const ready = (preset = 0, rounds = 0): FocusState => ({ phase: 'focus', preset, endsAt: null, left: minutes(preset, 'focus'), rounds });

/** What's left of the round now (ms). */
export const remaining = (s: FocusState, now: number) => (s.endsAt ? Math.max(0, s.endsAt - now) : s.left);
/** How much of the round has gone, 0–1. */
export const progress = (s: FocusState, now: number) => 1 - remaining(s, now) / minutes(s.preset, s.phase);

/** Moves the timer on to `now`: a finished round gives the next one, and says which round ended. */
export function tick(s: FocusState, now: number): { state: FocusState; ended: Phase | null } {
  if (!s.endsAt || s.endsAt > now) return { state: s, ended: null };
  if (s.phase === 'focus') {
    const rest = minutes(s.preset, 'break');
    return { state: { ...s, phase: 'break', endsAt: s.endsAt + rest, left: rest, rounds: s.rounds + 1 }, ended: 'focus' };
  }
  return { state: ready(s.preset, s.rounds), ended: 'break' };
}

export const start = (s: FocusState, now: number): FocusState => (s.endsAt ? s : { ...s, endsAt: now + s.left });
export const pause = (s: FocusState, now: number): FocusState => (s.endsAt ? { ...s, endsAt: null, left: remaining(s, now) } : s);
export const skip = (s: FocusState, now: number): FocusState => tick({ ...s, endsAt: now }, now).state;

function load(): FocusState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as FocusState | null;
    if (v && (v.phase === 'focus' || v.phase === 'break') && typeof v.left === 'number' && PRESETS[v.preset]) return v;
  } catch { /* no storage */ }
  return ready();
}

let state: FocusState | null = null;
const subs = new Set<() => void>();
const IDLE = ready();
const get = () => (state ??= typeof window === 'undefined' ? IDLE : load());

export function setFocus(next: FocusState) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  subs.forEach((f) => f());
}

const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
/** The timer's state, shared by every part of the page that shows it. */
export const useFocus = () => useSyncExternalStore(subscribe, get, () => IDLE);
export const focusNow = get;

/** A soft two-note chime when a round ends (no file to download). */
export function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [660, 880].forEach((hz, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = hz; o.type = 'sine';
      const t = ctx.currentTime + i * 0.22;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.65);
    });
    setTimeout(() => void ctx.close().catch(() => {}), 1500);
  } catch { /* sound is optional */ }
}
