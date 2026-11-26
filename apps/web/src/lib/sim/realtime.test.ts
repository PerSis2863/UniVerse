import { describe, expect, it } from 'vitest';
import { boardLevel, EXAMPLES, newBlock, simulate, type Block, type BlockKind, type Diagram, type Wire } from './blocks';
import { MAX_CATCH_UP, RealTime } from './realtime';

const B = (kind: BlockKind, p: Block['p'] = {}): Block => { const b = newBlock(kind, 0, 0); b.p = { ...b.p, ...p }; return b; };
const W = (from: Block, to: Block, inPort = 0): Wire => ({ id: `${from.id}${to.id}${inPort}`, from: from.id, out: 0, to: to.id, in: inPort });

describe('real-time runs', () => {
  it('stepping by the clock gives the same answer as the offline run', () => {
    const d = EXAMPLES.find((e) => e.id === 'loop')!.make(), rt = new RealTime(d, { read: () => 0 }, () => {});
    let s = rt.advance(0);
    for (let k = 0; k < 60; k++) s = rt.advance(1 / 60);
    const off = simulate(d), id = Object.keys(s.scopes)[0], y = [...off.scopes.values()][0][0];
    const k = off.t.findIndex((t) => t >= s.t - 1e-9);
    expect(s.t).toBeCloseTo(1, 6);
    expect(s.scopes[id][0]).toBeCloseTo(y[k], 6);
  });

  it('a board loop: the input read from the board, the output written as PWM only when it changes', () => {
    const inp = B('boardIn', { pin: 'A5', scale: 2 }), g = B('gain', { k: 1 }), out = B('boardOut', { pin: 9, lo: 0, hi: 2 }), sc = B('scope');
    const d: Diagram = { stop: 10, dt: 0.01, blocks: [inp, g, out, sc], wires: [W(inp, g), W(g, out), W(g, sc)] };
    const writes: number[] = [];
    let raw = 1;
    const rt = new RealTime(d, { read: (b) => (b.id === inp.id ? raw : 0) }, (_, lvl) => writes.push(lvl));
    rt.advance(0.1); rt.advance(0.1);
    raw = 0.5; rt.advance(0.1);
    expect(writes).toEqual([128, 64]);
    expect(boardLevel({ ...out, p: { ...out.p, mode: 'digital' } }, 1.2)).toBe(1);
  });

  it('a stall is cut short and counted, not caught up all at once', () => {
    const d = EXAMPLES.find((e) => e.id === 'loop')!.make(), rt = new RealTime(d, { read: () => 0 }, () => {});
    rt.advance(2);
    expect(rt.t).toBeCloseTo(MAX_CATCH_UP, 6);
    expect(rt.timing.dropped).toBe(Math.round((2 - MAX_CATCH_UP) / d.dt));
  });
});
