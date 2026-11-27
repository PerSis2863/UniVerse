import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { FileStore } from './files';
import { toMat, type Struct } from './values';
import { waits } from './wait';
import './codegen-lab';
import './mixsig-lab';

// M569: dpigen's SystemVerilog and C really pass in a SystemVerilog simulator (Verilator, where it's installed), a
// sabotaged block really fails, and cosim sends a testbench's files and reads the answer.
const QUANT = `function [y, err] = quant(x, step)
  y = round(x / step) * step;
  err = sum(abs(y - x));
end`;
const lab = () => { const files = new FileStore(); let out = ''; const l = new Lab({ out: (t) => { out += t; }, files }); l.run(QUANT); l.run("dpigen('quant', {[0.12 0.37 -0.51 0.9], 0.25})"); return { l, files, out: () => out }; };
let hasVerilator = true;
try { execFileSync('verilator', ['--version'], { stdio: 'ignore' }); } catch { hasVerilator = false; }
afterEach(() => { waits.page = null; });

describe('Hyperion cosim (M569)', () => {
  it.skipIf(!hasVerilator)('the testbench passes in Verilator, and catches a wrong block', () => {
    const { files } = lab(), dir = mkdtempSync(join(tmpdir(), 'hyp-sv-'));
    for (const f of ['quant.c', 'quant.h', 'quant_dpi.sv', 'quant_tb.sv']) writeFileSync(join(dir, f), files.text(f));
    const sim = () => {
      execFileSync('verilator', ['--binary', '--timing', '-Wno-fatal', '--top-module', 'quant_tb', 'quant_dpi.sv', 'quant_tb.sv', 'quant.c'], { cwd: dir, stdio: 'ignore' });
      return execFileSync(join(dir, 'obj_dir', 'Vquant_tb'), { cwd: dir }).toString();
    };
    expect(sim()).toContain('PASS: quant matches Hyperion');
    // a block that rounds the wrong way must fail
    writeFileSync(join(dir, 'quant.c'), readFileSync(join(dir, 'quant.c'), 'utf8').replace('round(', 'floor('));
    const bad = sim();
    expect(bad).toContain('MISMATCH');
    expect(bad).toContain('FAIL');
  }, 240_000);
  it('sends the testbench’s files to the computer app and reads the answer', () => {
    const { l } = lab();
    let asked: { kind: string; body: { id: string; files: Record<string, string>; top: string } } | null = null;
    waits.page = (kind, body) => { asked = { kind, body: body as never }; return { ok: true, exitCode: 0, ms: 4200, out: 'PASS: quant matches Hyperion\n' }; };
    l.run("r = cosim('Verilator', 'quant_tb');");
    expect(asked!.kind).toBe('cosim');
    expect(asked!.body.id).toBe('verilator');
    expect(Object.keys(asked!.body.files).sort()).toEqual(['quant.c', 'quant.h', 'quant_dpi.sv', 'quant_tb.sv']);
    const r = l.vars.get('r') as Struct;
    expect(toMat(r.f.get('Passed')!).d[0]).toBe(1);
    waits.page = () => ({ ok: true, exitCode: 0, ms: 10, out: 'MISMATCH y[1]\nFAIL: 1 mismatches\n' });
    l.run("r = cosim('verilator', 'quant_tb');");
    expect(toMat((l.vars.get('r') as Struct).f.get('Passed')!).d[0]).toBe(0);
    expect(() => l.run("cosim('modelsim', 'quant_tb')")).toThrow(/one of/);
    waits.page = null;
    expect(() => l.run("cosim('verilator', 'quant_tb')")).toThrow(/computer app/);
  });
});
