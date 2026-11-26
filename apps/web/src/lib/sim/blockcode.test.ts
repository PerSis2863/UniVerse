import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXAMPLES, simulate, type Diagram } from './blocks';
import { buildIr, emulate } from './blockir';
import { generateCode, type Lang } from './blockcode';

const has = (cmd: string, arg = '--version') => { try { execFileSync(cmd, [arg], { stdio: 'ignore' }); return true; } catch { return false; } };
const hasCc = has('cc'), hasCxx = has('c++'), hasIv = has('iverilog', '-V'), hasGhdl = has('ghdl');
const ex = (id: string) => EXAMPLES.find((e) => e.id === id)!.make();
const write = (dg: Diagram, lang: Lang) => { const dir = mkdtempSync(join(tmpdir(), 'uv-code-')); for (const f of generateCode(dg, lang)) writeFileSync(join(dir, f.name), f.text); return dir; };
const rows = (out: string) => out.trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
/** The emulated outputs, a row a step. */
/** Fixed point against the emulation: a chart may switch a step earlier or later when a level crosses its threshold
 * by less than a fixed-point step, and 0.01 s is 655/65,536 (so “after 1 s” comes a step later): all but 2 % of steps within 0.02. */
const closeEnough = (got: number[][], want: number[][]) => {
  const off = got.filter((row, k) => row.some((v, j) => Math.abs(v / 65536 - want[k][j]) >= 0.02)).length;
  expect(off).toBeLessThanOrEqual(got.length * 0.02);
};
const expected = (dg: Diagram, steps: number) => { const ir = buildIr(dg), o = emulate(ir, steps); return Array.from({ length: steps }, (_, k) => ir.outputs.map((x) => o[x.name][k])); };

describe('code from block diagrams', () => {
  it('the generated step (Euler) follows the Runge–Kutta run when the step is small', () => {
    const d = { ...ex('spring'), dt: 0.0005 }, ir = buildIr(d), steps = Math.round(5 / d.dt), o = emulate(ir, steps + 1);
    const r = simulate(d), y = [...r.scopes.values()][0][0], k = r.t.findIndex((t) => t >= 5 - 1e-9);
    expect(o[ir.outputs[0].name][steps]).toBeCloseTo(y[k], 2);
  });

  it.skipIf(!hasCc)('C: compiled with -Wall -Werror, the same numbers as Hyperion, a chart included', () => {
    for (const id of ['cruise', 'tank', 'spring', 'hil']) {
      const d = ex(id), dir = write(d, 'c');
      execFileSync('cc', ['-std=c99', '-Wall', '-Wextra', '-Werror', '-o', join(dir, 'run'), join(dir, 'main.c'), join(dir, 'model.c'), '-lm'], { cwd: dir });
      const got = rows(execFileSync(join(dir, 'run'), ['3000']).toString()), want = expected(d, 3000);
      got.forEach((row, k) => row.forEach((v, j) => expect(Math.abs(v - want[k][j])).toBeLessThan(1e-9 * Math.max(1, Math.abs(want[k][j])))));
    }
  });

  it.skipIf(!hasCxx)('C++: the same numbers', () => {
    const d = ex('tank'), dir = write(d, 'cpp');
    execFileSync('c++', ['-std=c++17', '-Wall', '-Werror', '-o', join(dir, 'run'), join(dir, 'main.cpp')], { cwd: dir });
    const got = rows(execFileSync(join(dir, 'run'), ['2000']).toString()), want = expected(d, 2000);
    got.forEach((row, k) => row.forEach((v, j) => expect(v).toBeCloseTo(want[k][j], 9)));
  });

  it.skipIf(!hasIv)('Verilog: run in Icarus, within fixed point’s steps of Hyperion', () => {
    for (const id of ['tank', 'loop']) {
      const d = ex(id), dir = write(d, 'verilog');
      execFileSync('iverilog', ['-g2012', '-o', join(dir, 'sim'), join(dir, 'model.v'), join(dir, 'model_tb.v')], { cwd: dir });
      const got = rows(execFileSync('vvp', ['-n', join(dir, 'sim')]).toString().split('\n').filter((l) => /^-?\d/.test(l)).join('\n')), want = expected(d, 1000);
      expect(got.length).toBe(1000);
      closeEnough(got, want);
    }
  });

  it.skipIf(!hasGhdl)('VHDL: run in GHDL, the same as the Verilog', () => {
    const d = ex('tank'), dir = write(d, 'vhdl');
    for (const args of [['-a', '--std=08', 'model.vhd', 'model_tb.vhd'], ['-e', '--std=08', 'model_tb']]) execFileSync('ghdl', args, { cwd: dir });
    const got = rows(execFileSync('ghdl', ['-r', '--std=08', 'model_tb'], { cwd: dir }).toString().split('\n').filter((l) => /^-?\d/.test(l)).join('\n')), want = expected(d, 1000);
    expect(got.length).toBe(1000);
    closeEnough(got, want);
  });

  it('Structured Text: a function block with its inputs, outputs and a CASE for the chart', () => {
    const st = generateCode(ex('tank'), 'st')[0].text;
    expect(st).toMatch(/FUNCTION_BLOCK model/);
    expect(st).toMatch(/VAR_OUTPUT[\s\S]*scope1_1 : LREAL;/);
    expect(st).toMatch(/CASE chart1_state OF/);
    expect(st).not.toMatch(/&&|\|\||==|!=/);
  });

  it('what fixed point can’t do is refused by name', () => {
    const d = { ...ex('loop') }, sine = { ...d.blocks[0], kind: 'sine' as const, p: { amplitude: 1, frequency: 1, phase: 0 } };
    expect(() => generateCode({ ...d, blocks: [sine, ...d.blocks.slice(1)] }, 'verilog')).toThrow(/sin\(\) \(a Sine wave block\)/);
    expect(() => generateCode({ ...d, wires: [] }, 'c')).toThrow(/Nothing comes out/);
  });
});

describe('delays in generated code (M567)', () => {
  const withDelay = () => {
    const d = ex('loop'), it2 = d.blocks.find((b) => b.kind === 'integrator')!, sum = d.blocks.find((b) => b.kind === 'sum')!;
    const dl = { id: 'dly', kind: 'delay' as const, x: 0, y: 0, p: { time: 0.05, initial: 0 } };
    // The feedback comes back 0.05 s late: the loop rings a little.
    return { ...d, blocks: [...d.blocks, dl], wires: [...d.wires.filter((w) => !(w.to === sum.id && w.in === 1)), { id: 'w1', from: it2.id, out: 0, to: 'dly', in: 0 }, { id: 'w2', from: 'dly', out: 0, to: sum.id, in: 1 }] };
  };
  it('the emulation follows the simulation', () => {
    const d = withDelay(), ir = buildIr(d), o = emulate(ir, 3001), r = simulate(d), y = [...r.scopes.values()][0][0];
    expect(o[ir.outputs[0].name][3000]).toBeCloseTo(y[r.t.findIndex((t) => t >= 3 - 1e-9)], 2);
  });
  it.skipIf(!hasCc)('C with a delay: the same numbers', () => {
    const d = withDelay(), dir = write(d, 'c');
    execFileSync('cc', ['-std=c99', '-Wall', '-Wextra', '-Werror', '-o', join(dir, 'run'), join(dir, 'main.c'), join(dir, 'model.c'), '-lm'], { cwd: dir });
    const got = rows(execFileSync(join(dir, 'run'), ['500']).toString()), want = expected(d, 500);
    got.forEach((row, k) => row.forEach((v, j) => expect(v).toBeCloseTo(want[k][j], 9)));
  });
  it.skipIf(!hasIv || !hasGhdl)('Verilog and VHDL with a delay', () => {
    const d = withDelay(), want = expected(d, 1000);
    const dv = write(d, 'verilog');
    execFileSync('iverilog', ['-g2012', '-o', join(dv, 'sim'), join(dv, 'model.v'), join(dv, 'model_tb.v')]);
    closeEnough(rows(execFileSync('vvp', ['-n', join(dv, 'sim')]).toString().split('\n').filter((l) => /^-?\d/.test(l)).join('\n')), want);
    const dh = write(d, 'vhdl');
    for (const args of [['-a', '--std=08', 'model.vhd', 'model_tb.vhd'], ['-e', '--std=08', 'model_tb']]) execFileSync('ghdl', args, { cwd: dh });
    closeEnough(rows(execFileSync('ghdl', ['-r', '--std=08', 'model_tb'], { cwd: dh }).toString().split('\n').filter((l) => /^-?\d/.test(l)).join('\n')), want);
  });
});
