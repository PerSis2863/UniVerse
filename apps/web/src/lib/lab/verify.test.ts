import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { FileStore } from './files';
import { toMat } from './values';
import { sections } from './verify';
import { runScriptTests, type TestReport } from './verify-lab';
import './verify-lab';

const lab = () => { let out = ''; const files = new FileStore(); const l = new Lab({ out: (t) => { out += t; }, files }); return { l, files, out: () => out }; };

describe('Hyperion unit tests for scripts (M476)', () => {
  it('splits a test script into set-up and sections', () => {
    const s = sections('x = 1;\n%% Adds\nassert(x + 1 == 2)\n%%\ny = 2;');
    expect(s.setup).toBe('x = 1;');
    expect(s.tests.map((t) => [t.name, t.line])).toEqual([['Adds', 2], ['Test 2', 4]]);
  });
  it('runs each section in its own workspace after the set-up, and says why one failed', () => {
    const { l } = lab();
    const r: TestReport = runScriptTests(l, `a = [1 2 3];\n%% Sum\nassertEqual(sum(a), 6)\nb = 5;\n%% Fresh workspace\nassertFalse(exist('b') == 1)\n%% Close enough\nverifyEqual(0.1 + 0.2, 0.3, 'AbsTol', 1e-12)\n%% Two soft failures\nverifyEqual(a, [1 2 4]);\nverifyTrue(false, 'still running');\nassertSize(a, [1 3])\n%% An error\nundefined_thing + 1\n%% Expected error\nassertError(@() error('bad input'), 'bad')`, 'demo.m');
    expect(r.tests.map((t) => t.passed)).toEqual([true, true, true, false, false, true]);
    expect(r.tests[3].details).toEqual(['verifyEqual failed: element 3 is 3, expected 4 (off by 1)', 'verifyTrue failed: the condition is false (still running)']);
    expect(r.tests[4].details[0]).toMatch(/stopped with an error/);
    expect(r.tests[3].line).toBe(9);
  });
  it('runs test functions with their fixtures, and runtests gives a table', () => {
    const { l, out } = lab();
    l.run(`log = {};\nresults = runtests;\nfunction setupOnce(tc)\nend\nfunction testAdd(tc)\n  verifyEqual(tc, 1 + 1, 2)\nend\nfunction testStruct(tc)\n  assertEqual(struct('a', 1, 'b', 'x'), struct('a', 1, 'b', 'y'))\nend\nfunction helper()\nend`);
    const t = l.vars.get('results') as { f: Map<string, unknown> };
    expect([...toMat(t.f.get('Passed') as never).d]).toEqual([1, 0]);
    expect(out()).toContain('“x” instead of “y” in .b');
    expect(out()).toContain('1 passed, 1 failed');
  });
  it('runtests reads a test file from Hyperion’s files; checks outside tests stop the code', () => {
    const { l, files } = lab();
    files.putText('t_math.m', '%% Square root\nassertEqual(sqrt(16), 4)\n%% Less than\nassertLessThan([1 2], 3)');
    l.run("r = runtests('t_math');");
    expect([...toMat((l.vars.get('r') as unknown as { f: Map<string, never> }).f.get('Passed')!).d]).toEqual([1, 1]);
    expect(() => l.run('verifyEqual(1, 2)')).toThrow(/verifyEqual failed/);
    expect(() => l.run("runtests('nope')")).toThrow(/no nope\.m/);
  });
});
