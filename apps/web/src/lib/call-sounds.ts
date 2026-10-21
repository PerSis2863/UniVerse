'use client';

// Call sounds, made in the browser (no audio files to download): the ringback the caller hears
// while waiting, and the ringtone for an incoming call. Each returns a function that stops it.
// Browsers only allow sound after someone has tapped the page; until then these stay silent.

function pattern(tones: { freq: number[]; on: number; off: number }, volume: number): () => void {
  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  try {
    ctx = new AudioContext();
  } catch {
    return () => {};
  }
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  const oscs = tones.freq.map((f) => {
    const o = ctx!.createOscillator();
    o.frequency.value = f;
    o.connect(gain);
    o.start();
    return o;
  });
  const cycle = () => {
    if (stopped || !ctx) return;
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(volume, t, 0.02);
    gain.gain.setTargetAtTime(0, t + tones.on / 1000, 0.03);
    timer = setTimeout(cycle, tones.on + tones.off);
  };
  void ctx.resume().then(cycle).catch(() => {});
  // Safe to call more than once (the call answered, then the screen closing): closing a closed
  // AudioContext rejects, which showed up as an error in the owner console.
  return () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    try { oscs.forEach((o) => o.stop()); } catch { /* already stopped */ }
    void ctx?.close().catch(() => {});
  };
}

/** What the caller hears while it rings: 425 Hz, 1 s on, 3 s off (the familiar European ringback). */
export const ringback = () => pattern({ freq: [425], on: 1000, off: 3000 }, 0.06);

/** The incoming-call sounds to choose from (Settings → Notifications, kept on this device). */
export const RINGTONES = {
  classic: { name: 'Classic', tones: { freq: [660, 880], on: 900, off: 1400 }, volume: 0.05 },
  soft: { name: 'Soft', tones: { freq: [440, 554], on: 1200, off: 1800 }, volume: 0.035 },
  bright: { name: 'Bright', tones: { freq: [988, 1319], on: 500, off: 900 }, volume: 0.04 },
  pulse: { name: 'Pulse', tones: { freq: [740], on: 220, off: 380 }, volume: 0.04 },
  silent: { name: 'Vibrate only', tones: null, volume: 0 },
} as const;
export type Ringtone = keyof typeof RINGTONES;
export const chosenRingtone = (): Ringtone => {
  try { const v = localStorage.getItem('uv-ringtone'); return v && v in RINGTONES ? (v as Ringtone) : 'classic'; } catch { return 'classic'; }
};
export const chooseRingtone = (r: Ringtone) => { try { if (r === 'classic') localStorage.removeItem('uv-ringtone'); else localStorage.setItem('uv-ringtone', r); } catch { /* private mode */ } };

/** Incoming call: the chosen ringtone, repeating (a short beep instead while already on a call). */
export const ringtone = (waiting = false, which: Ringtone = chosenRingtone()) => {
  // Call waiting: two short soft beeps every few seconds, so the current call isn't drowned out.
  if (waiting) return pattern({ freq: [440], on: 180, off: 2800 }, 0.03);
  const r = RINGTONES[which];
  return r.tones ? pattern({ freq: [...r.tones.freq], on: r.tones.on, off: r.tones.off }, r.volume) : () => {};
};

/** A soft two-note chime, once (office hours: it's your turn). */
export function chime() {
  let ctx: AudioContext;
  try { ctx = new AudioContext(); } catch { return; }
  const t = ctx.currentTime;
  [[880, 0], [1320, 0.18]].forEach(([f, at]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + at);
    g.gain.exponentialRampToValueAtTime(0.07, t + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.7);
    o.connect(g).connect(ctx.destination);
    o.start(t + at);
    o.stop(t + at + 0.75);
  });
  void ctx.resume().catch(() => {});
  setTimeout(() => void ctx.close().catch(() => {}), 1200);
}
