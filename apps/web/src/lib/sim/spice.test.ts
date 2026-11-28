import { describe, expect, it } from 'vitest';
import { readSpice, spiceExpr, spiceValue } from './spice';
import { netlist } from './schematic';
import { Circuit } from './circuit';

describe('SPICE netlists and faults on the Circuits board (M567)', () => {
  it('reads SPICE numbers', () => {
    expect(spiceValue('4.7k')).toBeCloseTo(4700, 9);
    expect(spiceValue('10uF')).toBeCloseTo(1e-5, 15);
    expect(spiceValue('2.2MEG')).toBeCloseTo(2.2e6, 6);
    expect(spiceValue('5m')).toBeCloseTo(5e-3, 12);
    expect(spiceValue('abc')).toBeNull();
  });
  it('a divider and an RC from a netlist: the nets join as written and it runs', () => {
    const r = readSpice(`divider and RC
* a comment
V1 in 0 DC 10
R1 in mid 1k
R2 mid 0 1k
R3 mid out 1k
C1 out 0 1u
.tran 10u 20m
.end`);
    expect(r.parts).toBe(5);
    expect(r.warnings).toEqual([]);
    expect(r.board.dt).toBeCloseTo(1e-5, 12);
    expect(r.board.window).toBeCloseTo(0.03, 12); // 20 ms shown on the 30 ms screen
    const net = netlist(r.board);
    expect(net.grounded).toBe(true);
    const c = new Circuit(net.parts).dc();
    const mid = net.parts.find((p) => p.kind === 'R' && p.value === 1000)!;
    // DC: the capacitor open, so mid = out = 5 V.
    expect(c.v(mid.b)).toBeCloseTo(5, 6);
    const v = net.parts.find((p) => p.kind === 'V')!;
    expect(c.v(v.a)).toBeCloseTo(10, 9);
  });
  it('sources, a MOSFET with its model and what is left out', () => {
    const r = readSpice(`switching
V1 vdd 0 12
V2 g 0 PULSE(0 10 0 1n 1n 5u 10u)
R1 vdd d 10
M1 d g 0 0 nch
.model nch NMOS (VTO=3)
Q1 a b c qmod
.end`);
    const m = r.board.items.find((i) => i.kind === 'M')!;
    expect(m.value).toBe(3);
    const pulse = r.board.items.find((i) => i.kind === 'V' && i.wave === 'square')!;
    expect(pulse.freq).toBeCloseTo(1e5, 6);
    expect(r.warnings.some((w) => w.startsWith('Q1'))).toBe(true);
    // With the gate high, current flows through the 10 Ω.
    const net = netlist(r.board), c = new Circuit(net.parts);
    for (let k = 0; k < 20; k++) c.step(1e-7);
    const m1 = net.parts.find((p) => p.kind === 'M')!;
    expect(c.v(m1.g)).toBeGreaterThan(9);
    expect(c.v(m1.a)).toBeLessThan(6);
  });
  it('a resistor that fails open at 1 ms, then a short', () => {
    for (const kind of ['open', 'short'] as const) {
      const r = readSpice(`fault\nV1 a 0 10\nR1 a b 1k\nR2 b 0 1k\n.end`);
      const r2 = r.board.items.find((i) => i.kind === 'R' && i.y1 !== i.y2 && i.x1 === Math.max(...r.board.items.filter((j) => j.kind === 'R').map((j) => j.x1)))!;
      r2.fault = { kind, at: 1e-3 };
      const net = netlist(r.board), c = new Circuit(net.parts).dc(), b = net.parts.find((p) => p.id === r2.id)!.a;
      expect(c.v(b)).toBeCloseTo(5, 6);
      for (let k = 0; k < 20; k++) c.step(1e-4);
      expect(c.v(b)).toBeCloseTo(kind === 'open' ? 10 : 0, 1);
    }
  });
});

describe('vendor libraries and subcircuits (M568)', () => {
  const lib = `* a vendor's library
.lib typical
.subckt DIV top mid PARAMS: R=1k
R1 top mid {R}
R2 mid 0 {R*3}
.ends DIV
.model IRFX VDMOS(Vto=3.5 Rd=10m)
.endl`;
  it('works out .param expressions', () => {
    const v = new Map([['r', 1000]]);
    expect(spiceExpr('r*2+1k', v)).toBe(3000);
    expect(spiceExpr('(1+1)^3', v)).toBe(8);
    expect(spiceExpr('nope', v)).toBeNull();
  });
  it('a subcircuit from an included library, its parameters, nets kept apart per instance', () => {
    const r = readSpice(`uses a library
.include "parts/vendor.lib"
.param big=2k
V1 in 0 12
X1 in a DIV
X2 a b DIV PARAMS: R={big}
M1 b in 0 0 IRFX
.end`, [{ name: 'vendor.lib', text: lib }]);
    expect(r.warnings.filter((w) => !/body is tied/.test(w))).toEqual([]);
    expect(r.parts).toBe(6); // V1, four resistors, M1
    const net = netlist(r.board), R = net.parts.filter((p) => p.kind === 'R').map((p) => p.value).sort((a, b) => a - b);
    expect(R).toEqual([1000, 2000, 3000, 6000]);
    expect(r.board.items.find((i) => i.kind === 'M')!.value).toBeCloseTo(3.5, 9);
  });
  it('says what is missing', () => {
    const r = readSpice('t\n.lib other.lib typ\nX1 a 0 OPAMP\nR1 a 0 1k\n');
    expect(r.warnings.join(' ')).toMatch(/open that file together/);
    expect(r.warnings.join(' ')).toMatch(/no subcircuit called OPAMP/);
    expect(readSpice('t\nX1 a DIV\nR9 a 0 1\n', [{ name: 'v.lib', text: lib }]).warnings.join(' ')).toMatch(/has 2 pins, given 1/);
  });
});
