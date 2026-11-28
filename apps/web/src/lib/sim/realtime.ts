import { boardLevel, compile, KINDS, type Block, type BoardIo, type Diagram } from './blocks';

// Hyperion Simulate → Blocks → Real time (M564, the owner's picture: "hardware-in-the-loop testing and rapid control
// prototyping: run real-time simulations … and analyze the results"). The diagram is stepped against the wall clock:
// each animation frame it catches up with the time that has passed, reading Board inputs from a real or simulated
// Arduino (Firmata) and writing Board outputs to it. With the plant simulated and the controller on the board it is
// hardware in the loop; with the controller here and the real machine on the board, rapid control prototyping. It
// keeps the timing honest: how many steps ran, how late frames were, and the steps it had to drop to keep up.

export interface Sample { t: number; scopes: Record<string, number[]> }
export interface Timing { steps: number; frames: number; worstLateMs: number; dropped: number; turnaroundMs: number }

/** At most this much model time is caught up in one frame; more is dropped (and counted), so a stall can't freeze the page. */
export const MAX_CATCH_UP = 0.25;

export class RealTime {
  readonly m: ReturnType<typeof compile>;
  readonly x: Float64Array;
  t = 0;
  timing: Timing = { steps: 0, frames: 0, worstLateMs: 0, dropped: 0, turnaroundMs: 0 };
  private last = new Map<string, number>();
  private debt = 0;
  constructor(private dg: Diagram, io: BoardIo, private write: (b: Block, level: number) => void) {
    this.m = compile(dg, undefined, io);
    this.x = Float64Array.from(this.m.x0);
    this.m.update(0, this.x);
  }
  /** Runs the model forward by `wall` seconds of real time; returns a sample for the scopes and writes the outputs. */
  advance(wall: number, frameMs = 0): Sample {
    const h = Math.max(1e-5, this.dg.dt), t0 = performance.now();
    let want = wall;
    if (want > MAX_CATCH_UP) { this.timing.dropped += Math.round((want - MAX_CATCH_UP) / h); want = MAX_CATCH_UP; }
    // The part of a step left over is carried to the next frame, so model time keeps exactly with the clock.
    this.debt += want;
    const n = Math.max(0, Math.floor(this.debt / h + 1e-9));
    this.debt -= n * h;
    for (let k = 0; k < n; k++) {
      this.m.step(this.t, this.x, h);
      this.t += h;
      this.m.update(this.t, this.x);
      if (!this.x.every(Number.isFinite)) throw new Error(`The model blew up at t = ${+this.t.toPrecision(3)} s.`);
    }
    this.m.outputs(this.t, this.x);
    const scopes: Record<string, number[]> = {};
    for (const b of this.m.blocks) {
      if (b.kind === 'scope') scopes[b.id] = Array.from({ length: KINDS.scope.ins(b.p) }, (_, i) => (this.m.into.has(`${b.id}:${i}`) ? this.m.input(b, i) : NaN));
      if (b.kind === 'boardOut') {
        // Written only when the level changes (a serial line has little room).
        const level = boardLevel(b, this.m.input(b, 0));
        if (this.last.get(b.id) !== level) { this.last.set(b.id, level); this.write(b, level); }
      }
    }
    this.timing.steps += n;
    this.timing.frames += 1;
    this.timing.worstLateMs = Math.max(this.timing.worstLateMs, frameMs);
    this.timing.turnaroundMs = performance.now() - t0;
    return { t: this.t, scopes };
  }
}
