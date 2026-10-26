import { soundOn, audioContext } from '../sound';
import type { Surface } from './player';

// Ridgeline Ops' sound (the owner: "distinct gunshot acoustics (suppressed vs unsuppressed with
// distant canyon echoes), bullet whiz/crack sounds when shot at, footsteps changing by surface
// (grass, metal, gravel), breathing when low stamina, and military radio comms"). Everything is
// made in the browser on the arena's audio context: layered noise and tones, a generated echo
// (a long, decaying impulse through a convolver) that distant shots send more into, sounds placed
// left or right and muffled by distance, the sound arriving late from far away, a wind bed, birds
// by day and crickets by night, rain, and radio lines spoken through the browser's voice.

type Ctx = AudioContext;
export class OpsAudio {
  private ctx: Ctx | null = null;
  private out: GainNode | null = null;
  private echo: ConvolverNode | null = null;
  private echoIn: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private beds: { wind: GainNode; rain: GainNode; engine: OscillatorNode; engineGain: GainNode; rotor: GainNode; breath: GainNode } | null = null;
  private birdAt = 0; private cricketAt = 0;
  private voice: SpeechSynthesisVoice | null = null;
  constructor() { this.setup(); }

  /** Builds the mix once the arena's audio has started (the first tap). */
  private setup() {
    if (this.ctx) return true;
    const ctx = audioContext();
    if (!ctx || ctx.state !== 'running') return false;
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.out = ctx.createGain(); this.out.gain.value = 0.9; this.out.connect(comp);
    // The echo: a 2.6 s tail with a few early slaps off the hills.
    const len = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * 0.5;
      for (const [at, k] of [[0.11, 0.6], [0.23, 0.45], [0.41, 0.35], [0.7, 0.25]]) { const s = Math.floor(at * ctx.sampleRate) + ch * 300; for (let i = 0; i < 400; i++) d[s + i] += (Math.random() * 2 - 1) * k * (1 - i / 400); }
    }
    this.echo = ctx.createConvolver(); this.echo.buffer = ir;
    this.echoIn = ctx.createGain(); this.echoIn.gain.value = 0.5;
    this.echoIn.connect(this.echo).connect(this.out);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // Beds: wind, rain, an engine, the rotor, breathing (all silent until turned up).
    const loop = (filter: BiquadFilterType, freq: number, q = 0.7) => { const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true; const f = ctx.createBiquadFilter(); f.type = filter; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; src.connect(f).connect(g).connect(this.out!); src.start(); return g; };
    const engine = ctx.createOscillator(); engine.type = 'sawtooth'; engine.frequency.value = 40;
    const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 380;
    const eg = ctx.createGain(); eg.gain.value = 0; engine.connect(ef).connect(eg).connect(this.out); engine.start();
    this.beds = { wind: loop('lowpass', 420), rain: loop('highpass', 2200, 0.4), engine, engineGain: eg, rotor: loop('lowpass', 140, 1.2), breath: loop('bandpass', 900, 0.9) };
    try { this.voice = speechSynthesis.getVoices().find((v) => /en[-_](GB|US)/i.test(v.lang)) ?? null; } catch { this.voice = null; }
    return true;
  }
  private ok() { return soundOn() && this.setup() && !!this.ctx; }

  private burst(at: number, dur: number, { type = 'bandpass' as BiquadFilterType, from = 2000, to = 400, q = 0.8, vol = 0.3, pan = 0, echo = 0 } = {}) {
    const ctx = this.ctx!, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner();
    src.buffer = this.noise; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(from, at); f.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(f).connect(g).connect(p).connect(this.out!);
    if (echo > 0) { const e = ctx.createGain(); e.gain.value = echo; g.connect(e).connect(this.echoIn!); }
    src.start(at, Math.random()); src.stop(at + dur + 0.05);
  }
  private tone(at: number, freq: number, dur: number, { type = 'sine' as OscillatorType, to = 0, vol = 0.2, pan = 0, echo = 0 } = {}) {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
    o.type = type; o.frequency.setValueAtTime(freq, at); if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    p.pan.value = Math.max(-1, Math.min(1, pan));
    o.connect(g).connect(p).connect(this.out!);
    if (echo > 0) { const e = this.ctx!.createGain(); e.gain.value = echo; g.connect(e).connect(this.echoIn!); }
    o.start(at); o.stop(at + dur + 0.05);
  }

  /** A gunshot `dist` m away, `pan` −1…1, its kind's weight; suppressed shots are a thump and a click. */
  gun(dist: number, pan: number, { heavy = 1, suppressed = false, mine = false } = {}) {
    if (!this.ok()) return;
    const at = this.ctx!.currentTime + (mine ? 0 : Math.min(1.5, dist / 343)), near = Math.max(0.04, 1 - dist / 420), far = Math.min(1, dist / 160);
    if (suppressed) {
      this.burst(at, 0.09, { from: 900, to: 200, vol: 0.22 * near * heavy, pan, q: 1 });
      this.tone(at, 140, 0.06, { to: 60, vol: 0.12 * near, pan });
      if (mine) this.tone(at + 0.02, 2600, 0.02, { type: 'square', vol: 0.03 });
      return;
    }
    // The crack (high, short), the body (low noise), the thump (a falling tone), the echo off the hills.
    const cut = 9000 * (1 - far * 0.85) + 600;
    this.burst(at, 0.05, { type: 'highpass', from: cut, to: cut * 0.6, vol: 0.45 * near * heavy, pan, q: 0.5 });
    this.burst(at, 0.16 * heavy, { type: 'lowpass', from: 2600 * (1 - far * 0.7) + 300, to: 180, vol: 0.5 * near * heavy, pan, echo: 0.35 + far * 0.9 });
    this.tone(at, 110 * (2 - heavy * 0.6), 0.14 * heavy, { to: 42, vol: 0.32 * near * heavy, pan });
  }
  /** A bullet passing close: a supersonic crack and a whiz. */
  whiz(pan: number, supersonic: boolean) {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    if (supersonic) this.burst(t, 0.03, { type: 'highpass', from: 5000, to: 3000, vol: 0.4, pan, q: 0.4 });
    this.burst(t + 0.01, 0.18, { from: 3200, to: 700, vol: 0.18, pan: pan * 0.8, q: 2.5 });
  }
  /** Your hit landing: flesh, armour, armour breaking, a headshot, a kill. */
  hit(kind: 'flesh' | 'armour' | 'break' | 'head' | 'kill') {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    if (kind === 'flesh') this.burst(t, 0.06, { type: 'lowpass', from: 900, to: 200, vol: 0.25 });
    if (kind === 'armour') { this.tone(t, 2400, 0.08, { type: 'triangle', vol: 0.09, to: 1800 }); this.burst(t, 0.04, { from: 4000, to: 2500, vol: 0.12, q: 3 }); }
    if (kind === 'break') { this.burst(t, 0.22, { type: 'highpass', from: 5000, to: 2500, vol: 0.28, q: 0.6 }); this.tone(t, 1700, 0.18, { type: 'square', vol: 0.05, to: 900 }); }
    if (kind === 'head') { this.tone(t, 1900, 0.18, { type: 'triangle', vol: 0.14 }); this.tone(t + 0.02, 2850, 0.14, { vol: 0.06 }); }
    if (kind === 'kill') { this.tone(t, 520, 0.16, { type: 'triangle', vol: 0.15 }); this.tone(t + 0.07, 780, 0.22, { type: 'triangle', vol: 0.13 }); }
  }
  /** You're hit: a thud and a breathy grunt. */
  hurt(armour: boolean) { if (!this.ok()) return; const t = this.ctx!.currentTime; this.burst(t, 0.1, { type: 'lowpass', from: armour ? 2200 : 700, to: 150, vol: 0.4 }); if (armour) this.tone(t, 900, 0.1, { type: 'square', vol: 0.04, to: 500 }); }
  step(surface: Surface, loud = 0.5, pan = 0) {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime, v = 0.12 * loud;
    if (surface === 'grass') this.burst(t, 0.12, { type: 'lowpass', from: 1400, to: 300, vol: v * 0.8, pan });
    if (surface === 'gravel' || surface === 'sand') { for (let i = 0; i < 4; i++) this.burst(t + i * 0.015, 0.05, { from: 3000 + Math.random() * 2000, to: 1500, vol: v * 0.7, pan, q: 2 }); }
    if (surface === 'asphalt' || surface === 'concrete') { this.burst(t, 0.05, { from: 1800, to: 600, vol: v, pan, q: 1.4 }); this.tone(t, 160, 0.05, { vol: v * 0.5, to: 90, pan }); }
    if (surface === 'metal') { this.tone(t, 340 + Math.random() * 80, 0.18, { type: 'triangle', vol: v * 0.6, pan }); this.burst(t, 0.05, { from: 3000, to: 1200, vol: v, pan }); }
    if (surface === 'wood') { this.tone(t, 190, 0.09, { type: 'triangle', vol: v * 0.9, to: 120, pan }); this.burst(t, 0.04, { from: 1200, to: 500, vol: v * 0.6, pan }); }
    if (surface === 'water') this.burst(t, 0.25, { from: 1200, to: 300, vol: v * 1.2, pan, q: 0.5 });
  }
  /** Reload parts: magazine out, magazine in, the bolt racked. */
  reload(part: 'out' | 'in' | 'rack' | 'pump' | 'bolt') {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    if (part === 'out') { this.tone(t, 1900, 0.025, { type: 'square', vol: 0.04 }); this.burst(t + 0.02, 0.07, { from: 2500, to: 1200, vol: 0.08, q: 2 }); }
    if (part === 'in') { this.tone(t, 1300, 0.03, { type: 'square', vol: 0.06 }); this.burst(t, 0.06, { from: 1600, to: 800, vol: 0.12, q: 2 }); }
    if (part === 'rack' || part === 'bolt') { this.burst(t, 0.06, { from: 3000, to: 1500, vol: 0.12, q: 2 }); this.tone(t + 0.12, 900, 0.04, { type: 'square', vol: 0.06 }); }
    if (part === 'pump') { this.burst(t, 0.09, { from: 1500, to: 700, vol: 0.16, q: 1.4 }); this.burst(t + 0.18, 0.08, { from: 1800, to: 900, vol: 0.16, q: 1.4 }); }
  }
  /** Handling sounds for the animations' moments: magazine release and clack, bolt back and slam,
   *  a round pushed in, velcro on the plate carrier, the grenade's pin, a syringe, cloth; brass
   *  tinkling on the ground, a magazine landing, a ricochet's whine. */
  foley(kind: 'grab' | 'magOut' | 'magIn' | 'boltBack' | 'boltSlam' | 'shell' | 'velcro' | 'pin' | 'inject' | 'cloth' | 'tink' | 'magLand' | 'ricochet', pan = 0, loud = 1) {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime, v = loud;
    if (kind === 'grab') this.burst(t, 0.05, { from: 1400, to: 700, vol: 0.05 * v, q: 1.2 });
    if (kind === 'magOut') { this.tone(t, 2100, 0.02, { type: 'square', vol: 0.05 * v }); this.burst(t + 0.015, 0.11, { from: 2800, to: 1100, vol: 0.1 * v, q: 2.2 }); }
    if (kind === 'magIn') { this.burst(t, 0.035, { type: 'lowpass', from: 2600, to: 500, vol: 0.32 * v, q: 0.8 }); this.tone(t, 1250, 0.05, { type: 'square', vol: 0.07 * v, to: 900 }); this.tone(t + 0.005, 180, 0.07, { vol: 0.18 * v, to: 90 }); }
    if (kind === 'boltBack') { this.burst(t, 0.08, { from: 3200, to: 1400, vol: 0.12 * v, q: 2.5 }); this.tone(t, 700, 0.04, { type: 'triangle', vol: 0.04 * v, to: 500 }); }
    if (kind === 'boltSlam') { this.burst(t, 0.05, { type: 'lowpass', from: 3500, to: 700, vol: 0.3 * v, q: 0.9 }); this.tone(t, 1600, 0.06, { type: 'square', vol: 0.06 * v, to: 1100 }); this.tone(t, 220, 0.08, { vol: 0.14 * v, to: 110 }); }
    if (kind === 'shell') { this.burst(t, 0.05, { from: 1800, to: 900, vol: 0.12 * v, q: 1.8 }); this.tone(t + 0.03, 1400, 0.03, { type: 'square', vol: 0.04 * v }); }
    if (kind === 'velcro') for (let i = 0; i < 7; i++) this.burst(t + i * 0.022, 0.03, { from: 4200 - i * 200, to: 2400, vol: 0.09 * v, q: 0.7 });
    if (kind === 'pin') { this.tone(t, 3100, 0.12, { type: 'triangle', vol: 0.06 * v, to: 2700 }); this.burst(t, 0.03, { from: 5000, to: 3000, vol: 0.05 * v, q: 3 }); }
    if (kind === 'inject') { this.burst(t, 0.12, { from: 900, to: 300, vol: 0.12 * v, q: 1 }); this.tone(t + 0.05, 600, 0.08, { vol: 0.04 * v, to: 300 }); }
    if (kind === 'cloth') this.burst(t, 0.18, { type: 'lowpass', from: 1600, to: 400, vol: 0.05 * v, q: 0.6 });
    if (kind === 'tink') { const f = 4200 + Math.random() * 1800; this.tone(t, f, 0.09, { type: 'triangle', vol: 0.035 * v, pan }); this.tone(t + 0.07, f * 1.06, 0.06, { type: 'triangle', vol: 0.018 * v, pan }); }
    if (kind === 'magLand') { this.burst(t, 0.07, { type: 'lowpass', from: 1800, to: 400, vol: 0.14 * v, pan }); this.tone(t, 900, 0.05, { type: 'triangle', vol: 0.04 * v, pan, to: 600 }); }
    if (kind === 'ricochet') { const f = 2600 + Math.random() * 1600; this.tone(t, f, 0.28, { type: 'sine', vol: 0.06 * v, to: f * 0.45, pan }); this.burst(t, 0.04, { from: 6000, to: 3000, vol: 0.08 * v, pan, q: 2 }); }
  }
  boom(dist: number, pan: number, big = 1) {
    if (!this.ok()) return;
    const at = this.ctx!.currentTime + Math.min(1.5, dist / 343), near = Math.max(0.08, 1 - dist / 600);
    this.burst(at, 1.3 * big, { type: 'lowpass', from: 2400 * near + 200, to: 40, vol: 0.7 * near, pan, echo: 1.2 });
    this.tone(at, 70, 0.9, { to: 25, vol: 0.5 * near, pan });
  }
  thunder(delay: number) { if (!this.ok()) return; const at = this.ctx!.currentTime + delay; this.burst(at, 3.2, { type: 'lowpass', from: 600, to: 40, vol: 0.45, q: 0.3, echo: 0.8 }); this.tone(at, 50, 2.4, { to: 28, vol: 0.25 }); }
  /** The flashbang's ringing ears. */
  ring(power: number) { if (!this.ok()) return; this.tone(this.ctx!.currentTime, 3800, 2.5 * power + 0.5, { vol: 0.08 * power }); }
  click() { if (!this.ok()) return; this.tone(this.ctx!.currentTime, 2400, 0.02, { type: 'square', vol: 0.05 }); }
  ui(kind: 'pick' | 'buy' | 'deny' | 'plate' | 'heal' | 'legend') {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    if (kind === 'pick') this.tone(t, 700, 0.06, { type: 'triangle', vol: 0.08, to: 1100 });
    if (kind === 'buy') { this.tone(t, 880, 0.08, { type: 'triangle', vol: 0.1 }); this.tone(t + 0.08, 1320, 0.12, { type: 'triangle', vol: 0.1 }); }
    if (kind === 'deny') this.tone(t, 220, 0.18, { type: 'square', vol: 0.05, to: 160 });
    if (kind === 'plate') { this.burst(t, 0.12, { from: 1200, to: 400, vol: 0.2, q: 1.2 }); this.tone(t + 0.1, 600, 0.06, { type: 'square', vol: 0.05 }); }
    if (kind === 'heal') [392, 523, 659].forEach((f, i) => this.tone(t + i * 0.08, f, 0.2, { vol: 0.06 }));
    if (kind === 'legend') { [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone(t + i * 0.07, f, 0.45, { type: 'triangle', vol: 0.07 })); this.burst(t, 0.6, { from: 6000, to: 9000, vol: 0.05, q: 1 }); }
  }
  /** A radio call: the squelch, a beep, the words (spoken if the browser can). */
  radio(text: string, speak: boolean) {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    this.burst(t, 0.12, { from: 2800, to: 1800, vol: 0.06, q: 1.5 }); this.tone(t + 0.1, 1450, 0.07, { type: 'square', vol: 0.025 });
    if (speak && typeof speechSynthesis !== 'undefined') {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.08; u.pitch = 0.75; u.volume = 0.7; if (this.voice) u.voice = this.voice;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
      } catch { /* no voice */ }
    }
  }
  /** The beds, each frame: wind (more on high ground), rain, the engine you drive, the rotor, breathing. */
  update(o: { height: number; rain: number; night: boolean; engine: number; rotor: number; breath: number; time: number }) {
    if (!this.ok() || !this.beds) return;
    const t = this.ctx!.currentTime, b = this.beds, set = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t, 0.3);
    set(b.wind, 0.03 + Math.min(0.06, o.height / 900) + o.rain * 0.03);
    set(b.rain, o.rain * 0.09);
    set(b.engineGain, o.engine > 0 ? 0.05 + o.engine * 0.05 : 0); b.engine.frequency.setTargetAtTime(38 + o.engine * 80, t, 0.15);
    set(b.rotor, o.rotor * 0.35 * (0.6 + 0.4 * Math.sin(o.time * 22)));
    set(b.breath, o.breath * 0.05 * (0.5 + 0.5 * Math.sin(o.time * 2.6)));
    // Birds by day, crickets at night.
    if (!o.night && o.rain < 0.3 && o.time > this.birdAt) { this.birdAt = o.time + 3 + Math.random() * 7; const f = 2400 + Math.random() * 1600; for (let i = 0; i < 3; i++) this.tone(t + i * 0.09, f * (1 + i * 0.06), 0.07, { vol: 0.015, to: f * 1.2, pan: Math.random() * 2 - 1 }); }
    if (o.night && o.time > this.cricketAt) { this.cricketAt = o.time + 0.7 + Math.random(); const p = Math.random() * 2 - 1; for (let i = 0; i < 4; i++) this.tone(t + i * 0.05, 4400, 0.03, { type: 'square', vol: 0.006, pan: p }); }
  }
}
