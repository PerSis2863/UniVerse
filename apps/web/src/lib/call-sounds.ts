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
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    try { oscs.forEach((o) => o.stop()); void ctx?.close(); } catch { /* closed */ }
  };
}

/** What the caller hears while it rings: 425 Hz, 1 s on, 3 s off (the familiar European ringback). */
export const ringback = () => pattern({ freq: [425], on: 1000, off: 3000 }, 0.06);

/** Incoming call: two soft tones, repeating (a short beep instead while already on a call). */
export const ringtone = (waiting = false) => (waiting
  // Call waiting: two short soft beeps every few seconds, so the current call isn't drowned out.
  ? pattern({ freq: [440], on: 180, off: 2800 }, 0.03)
  : pattern({ freq: [660, 880], on: 900, off: 1400 }, 0.05));
