// Sounds in the app (M45), off until turned on in Settings → Appearance: a soft chime when something
// worked and a low note when it didn't, made in the browser (Web Audio, no files). Played with the
// matching vibration (haptic() in src/lib/haptics.ts), so the two always agree. Taps make no sound.
// UniVerse Play has its own sounds and switch (src/components/play/sound.ts).

let ac: AudioContext | null = null;

export const soundsOn = () => { try { return localStorage.getItem('uv-sounds') === 'on'; } catch { return false; } };
export function setSounds(on: boolean) { try { if (on) localStorage.setItem('uv-sounds', 'on'); else localStorage.removeItem('uv-sounds'); } catch { /* private mode */ } }

function note(freq: number, at: number, dur: number, vol: number) {
  const o = ac!.createOscillator(), g = ac!.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(ac!.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** success: two rising notes; warning: one low note. Only after a tap (browsers require it). */
export function chime(kind: 'success' | 'warning') {
  try {
    if (!soundsOn()) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    ac ??= new Ctx();
    if (ac.state === 'suspended') void ac.resume();
    const t = ac.currentTime + 0.01;
    if (kind === 'success') { note(784, t, 0.14, 0.07); note(1175, t + 0.08, 0.22, 0.06); }
    else note(262, t, 0.2, 0.06);
  } catch { /* no audio */ }
}
