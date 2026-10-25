'use client';

// UniVerse Play's sounds (M35): made in the browser with the Web Audio API (oscillators and a burst
// of noise), so there are no sound files to download. Short, quiet and soft-edged. Off with the
// arena's speaker button (kept on the device). The audio starts on the first tap (Play), as
// browsers require.

export type Sfx = 'tick' | 'go' | 'right' | 'wrong' | 'combo' | 'pick' | 'drop' | 'splash' | 'boost' | 'power' | 'end' | 'win' | 'whoosh' | 'key' | 'alarm' | 'thunder';

const KEY = 'uv-play-sound';
let ac: AudioContext | null = null;
let noise: AudioBuffer | null = null;

export const soundOn = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
export function setSoundOn(on: boolean) { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ } }

/** Starts the audio (call from a tap). */
export function unlockAudio() {
  if (typeof window === 'undefined') return;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  ac ??= new Ctx();
  if (ac.state === 'suspended') void ac.resume();
}

function tone(freq: number, at: number, dur: number, { type = 'sine', vol = 0.12, to }: { type?: OscillatorType; vol?: number; to?: number } = {}) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(ac.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function hiss(at: number, dur: number, { vol = 0.1, from = 800, to = 3000, q = 0.8 }: { vol?: number; from?: number; to?: number; q?: number } = {}) {
  if (!ac) return;
  if (!noise) {
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noise;
  f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(from, at);
  f.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(ac.destination);
  src.start(at);
  src.stop(at + dur + 0.02);
}

/** Plays a sound; `level` raises the pitch (combos, streaks). */
export function sfx(name: Sfx, level = 0) {
  if (!ac || ac.state !== 'running' || !soundOn()) return;
  const t = ac.currentTime, up = Math.pow(1.06, Math.min(level, 14));
  switch (name) {
    case 'tick': tone(880, t, 0.06, { type: 'square', vol: 0.04 }); break;
    case 'go': tone(660, t, 0.12, { type: 'triangle' }); tone(990, t + 0.1, 0.22, { type: 'triangle', vol: 0.14 }); break;
    case 'right': tone(660 * up, t, 0.09, { type: 'triangle' }); tone(990 * up, t + 0.07, 0.16, { type: 'triangle' }); break;
    case 'wrong': tone(220, t, 0.18, { type: 'sawtooth', vol: 0.06, to: 140 }); break;
    case 'combo': tone(523 * up, t, 0.07, { type: 'square', vol: 0.05 }); tone(784 * up, t + 0.06, 0.07, { type: 'square', vol: 0.05 }); tone(1046 * up, t + 0.12, 0.14, { type: 'square', vol: 0.05 }); break;
    case 'pick': tone(1200 * up, t, 0.07, { vol: 0.08, to: 1800 * up }); break;
    case 'drop': tone(300, t, 0.12, { vol: 0.08, to: 120 }); break;
    case 'splash': hiss(t, 0.35, { vol: 0.09, from: 2400, to: 500 }); break;
    case 'boost': tone(200, t, 0.45, { type: 'sawtooth', vol: 0.05, to: 900 }); hiss(t, 0.4, { vol: 0.05, from: 600, to: 4000 }); break;
    case 'power': [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.06, 0.16, { type: 'triangle', vol: 0.09 })); break;
    case 'end': tone(784, t, 0.18, { type: 'triangle' }); tone(523, t + 0.16, 0.34, { type: 'triangle' }); break;
    case 'win': [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, t + i * 0.09, 0.26, { type: 'triangle', vol: 0.1 })); break;
    case 'whoosh': hiss(t, 0.28, { vol: 0.06, from: 400, to: 2600, q: 0.5 }); break;
    case 'key': tone(1500 + Math.random() * 300, t, 0.025, { type: 'square', vol: 0.025 }); break;
    case 'alarm': tone(880, t, 0.12, { type: 'square', vol: 0.05 }); tone(660, t + 0.14, 0.12, { type: 'square', vol: 0.05 }); break;
    case 'thunder': hiss(t, 1.1, { vol: 0.16, from: 900, to: 80, q: 0.4 }); break;
  }
}
