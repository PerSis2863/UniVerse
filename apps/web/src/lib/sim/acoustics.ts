// Hyperion Simulate → Sound (M551): acoustics in a room's floor plan, by the finite-difference time-domain method
// engineering acoustics uses for rooms and ducts: pressure at the cells' middles, air velocity on their faces
// (a staggered grid), stepped in time with ∂v/∂t = −∇p/ρ and ∂p/∂t = −ρc²∇·v. Walls and furniture are rigid (no air
// moves through them); a wall can absorb part of what reaches it (its absorption, 0 hard to 1 dead), and the box's
// open sides can let sound out (free field) or reflect it (a closed room). A source plays a tone, a pulse (for the
// room's resonances) or a chirp. From it: the wave as it moves, the loudness everywhere (dB, from the pressure's RMS),
// the level at a listener, and the room's modes (peaks of the listener's spectrum after a pulse).

export const C_AIR = 343, RHO_AIR = 1.204, P_REF = 20e-6;

/** A rectangle in metres: a wall or piece of furniture (absorption 0 hard to 1 soaking up all that reaches it). */
export interface Block { id: string; x: number; y: number; w: number; h: number; absorb: number }
export interface SoundModel {
  width: number; height: number;
  /** 'room': the box's sides are hard walls; 'open': sound leaves through them. */
  edges: 'room' | 'open';
  blocks: Block[];
  source: { x: number; y: number; kind: 'tone' | 'pulse'; hz: number };
  listener: { x: number; y: number };
}

export class SoundSim {
  readonly nx: number; readonly ny: number; readonly h: number; readonly dt: number;
  readonly p: Float32Array; readonly vx: Float32Array; readonly vy: Float32Array;
  /** 1 where air is, 0 inside a block; and each cell's loss per step (absorbing walls and the open sides' sponge). */
  readonly air: Uint8Array; readonly loss: Float32Array;
  /** Σp² since the sound settled (for the loudness), and how many steps it covers. */
  readonly energy: Float32Array; heard = 0;
  /** The listener's pressure, step by step (for its level and the spectrum). */
  readonly trace: number[] = [];
  t = 0; steps = 0;
  private readonly src: number; private readonly lis: number;

  constructor(readonly m: SoundModel, cells = 200) {
    this.h = Math.max(m.width, m.height) / cells;
    this.nx = Math.max(8, Math.round(m.width / this.h)); this.ny = Math.max(8, Math.round(m.height / this.h));
    this.dt = (0.5 * this.h) / C_AIR; // the CFL limit in 2D is h/(c√2); 0.5 keeps a margin
    const n = this.nx * this.ny;
    this.p = new Float32Array(n); this.vx = new Float32Array((this.nx + 1) * this.ny); this.vy = new Float32Array(this.nx * (this.ny + 1));
    this.air = new Uint8Array(n).fill(1); this.loss = new Float32Array(n); this.energy = new Float32Array(n);
    const sponge = m.edges === 'open' ? Math.max(6, Math.round(this.nx / 12)) : 0;
    for (let j = 0; j < this.ny; j++) for (let i = 0; i < this.nx; i++) {
      const c = j * this.nx + i, x = (i + 0.5) * this.h, y = (j + 0.5) * this.h;
      for (const b of m.blocks) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) this.air[c] = 0;
      // A sponge at the open sides: the loss grows smoothly to the edge, so the wave leaves without bouncing.
      const d = Math.min(i, j, this.nx - 1 - i, this.ny - 1 - j);
      if (sponge && d < sponge) this.loss[c] = 0.25 * ((sponge - d) / sponge) ** 2;
    }
    // An absorbing block takes a share of the sound in the air cells touching it each step.
    for (let j = 0; j < this.ny; j++) for (let i = 0; i < this.nx; i++) {
      const c = j * this.nx + i;
      if (!this.air[c]) continue;
      for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
        if (a < 0 || b < 0 || a >= this.nx || b >= this.ny || this.air[b * this.nx + a]) continue;
        const blk = m.blocks.find((k) => { const x = (a + 0.5) * this.h, y = (b + 0.5) * this.h; return x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h; });
        if (blk) this.loss[c] = Math.max(this.loss[c], 0.2 * Math.min(1, Math.max(0, blk.absorb)));
      }
    }
    const cell = (x: number, y: number) => Math.min(this.ny - 1, Math.max(0, Math.floor(y / this.h))) * this.nx + Math.min(this.nx - 1, Math.max(0, Math.floor(x / this.h)));
    this.src = cell(m.source.x, m.source.y); this.lis = cell(m.listener.x, m.listener.y);
  }

  /** The source's strength now (a pressure added at its cell, Pa). */
  private drive(t: number) {
    const s = this.m.source;
    if (s.kind === 'pulse') { const w = 1 / (Math.PI * Math.max(50, s.hz)), u = (t - 4 * w) / w; return 2 * Math.exp(-u * u); }
    return Math.sin(2 * Math.PI * s.hz * t) * Math.min(1, t * s.hz / 3); // a soft start: three cycles to full
  }

  step(count = 1) {
    const { nx, ny, p, vx, vy, air, loss, dt, h } = this, kv = dt / (RHO_AIR * h), kp = (RHO_AIR * C_AIR * C_AIR * dt) / h;
    for (let s = 0; s < count; s++) {
      // Velocity on the faces between two air cells (a face beside a block or a hard edge stays still).
      for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) { const a = j * nx + i - 1, b = a + 1; vx[j * (nx + 1) + i] = air[a] && air[b] ? vx[j * (nx + 1) + i] - kv * (p[b] - p[a]) : 0; }
      for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) { const a = (j - 1) * nx + i, b = a + nx; vy[j * nx + i] = air[a] && air[b] ? vy[j * nx + i] - kv * (p[b] - p[a]) : 0; }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const c = j * nx + i;
        if (!air[c]) continue;
        const div = vx[j * (nx + 1) + i + 1] - vx[j * (nx + 1) + i] + vy[(j + 1) * nx + i] - vy[j * nx + i];
        p[c] = (p[c] - kp * div) * (1 - loss[c]);
      }
      this.t += dt; this.steps++;
      p[this.src] += this.drive(this.t);
      this.trace.push(p[this.lis]);
      // Loudness counts once the tone has crossed the box twice.
      if (this.t > (2 * Math.hypot(this.m.width, this.m.height)) / C_AIR) { for (let c = 0; c < p.length; c++) this.energy[c] += p[c] * p[c]; this.heard++; }
    }
  }

  /** The level everywhere (dB re 20 µPa, from the RMS since it settled), −Infinity inside blocks. */
  levels(): Float32Array {
    const out = new Float32Array(this.p.length);
    for (let c = 0; c < out.length; c++) out[c] = this.air[c] && this.heard ? 10 * Math.log10(Math.max(1e-30, this.energy[c] / this.heard) / (P_REF * P_REF)) : -Infinity;
    return out;
  }
  /** The listener's level (dB) over the last `seconds`. */
  listenerDb(seconds = 0.05) {
    const n = Math.min(this.trace.length, Math.max(1, Math.round(seconds / this.dt)));
    let s = 0;
    for (let k = this.trace.length - n; k < this.trace.length; k++) s += this.trace[k] ** 2;
    return n ? 10 * Math.log10(Math.max(1e-30, s / n) / (P_REF * P_REF)) : -Infinity;
  }
}

/** The strongest peaks of a signal's spectrum (Hz), between lo and hi, by a plain DFT on a Hann window. */
export function spectrumPeaks(x: number[], dt: number, lo: number, hi: number, count = 6): { hz: number; level: number }[] {
  const n = x.length, df = 1 / (n * dt), k0 = Math.max(1, Math.floor(lo / df)), k1 = Math.min(Math.floor(n / 2), Math.ceil(hi / df));
  const w = x.map((v, i) => v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))));
  const mag: number[] = [];
  for (let k = k0; k <= k1; k++) {
    let re = 0, im = 0;
    const a = (-2 * Math.PI * k) / n;
    for (let i = 0; i < n; i++) { re += w[i] * Math.cos(a * i); im += w[i] * Math.sin(a * i); }
    mag.push(Math.hypot(re, im));
  }
  const peaks: { hz: number; level: number }[] = [];
  for (let i = 1; i < mag.length - 1; i++) if (mag[i] > mag[i - 1] && mag[i] >= mag[i + 1]) {
    // A parabola through the three bins finds the peak between them.
    const d = (mag[i - 1] - mag[i + 1]) / (2 * (mag[i - 1] - 2 * mag[i] + mag[i + 1]) || 1);
    peaks.push({ hz: (k0 + i + d) * df, level: mag[i] });
  }
  const top = Math.max(1e-30, ...peaks.map((p) => p.level));
  return peaks.filter((p) => p.level > top * 0.05).sort((a, b) => b.level - a.level).slice(0, count).sort((a, b) => a.hz - b.hz);
}

/** A rectangular room's resonances (hard walls): f = (c/2)·√((m/W)² + (n/H)²), the lowest few above zero. */
export function roomModes(width: number, height: number, count = 6) {
  const out: { m: number; n: number; hz: number }[] = [];
  for (let m = 0; m < 8; m++) for (let n = 0; n < 8; n++) if (m || n) out.push({ m, n, hz: (C_AIR / 2) * Math.hypot(m / width, n / height) });
  return out.sort((a, b) => a.hz - b.hz).slice(0, count);
}

let seq = 0;
export const blockId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;
export const SOUND_PRESETS: { id: string; name: string; make: () => SoundModel }[] = [
  { id: 'room', name: 'A room with a sofa', make: () => ({ width: 6, height: 4, edges: 'room', blocks: [{ id: blockId(), x: 3.6, y: 0.3, w: 1.8, h: 0.8, absorb: 0.6 }], source: { x: 1, y: 2, kind: 'tone', hz: 120 }, listener: { x: 4.5, y: 2.5 } }) },
  { id: 'barrier', name: 'A noise barrier outdoors', make: () => ({ width: 30, height: 15, edges: 'open', blocks: [{ id: blockId(), x: 12, y: 0, w: 0.5, h: 6, absorb: 0 }], source: { x: 6, y: 2, kind: 'tone', hz: 60 }, listener: { x: 20, y: 2 } }) },
  { id: 'two-rooms', name: 'Two rooms and a door', make: () => ({ width: 8, height: 4, edges: 'room', blocks: [{ id: blockId(), x: 3.9, y: 0, w: 0.2, h: 1.5, absorb: 0 }, { id: blockId(), x: 3.9, y: 2.5, w: 0.2, h: 1.5, absorb: 0 }], source: { x: 1.5, y: 2, kind: 'tone', hz: 100 }, listener: { x: 6.5, y: 2 } }) },
  { id: 'modes', name: 'Find a room’s resonances', make: () => ({ width: 5, height: 3.5, edges: 'room', blocks: [], source: { x: 0.4, y: 0.4, kind: 'pulse', hz: 400 }, listener: { x: 4.5, y: 3.1 } }) },
];
