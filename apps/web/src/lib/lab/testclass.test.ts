import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { FileStore } from './files';
import { readTestClass } from './testclass';
import { runScriptTests } from './verify-lab';

// M523: MATLAB's class-based tests: the blocks found, set-ups kept on the test case, parameters, teardowns, skips.
const CLASS = `classdef SolverTest < matlab.unittest.TestCase
    % Checks the solver.
    properties
        Data
        Tol = 1e-9; % how close is close enough (the end of a comment)
    end
    properties (TestParameter)
        n = {1, 2, 3}
        kind = struct('small', 2, 'large', 200)
    end
    methods (TestClassSetup)
        function makeData(tc)
            tc.Data = magic(4);
        end
    end
    methods (TestMethodSetup)
        function before(tc)
            tc.Data(end, end) = tc.Data(end, end) + 0;
        end
    end
    methods (Test)
        function testSum(tc)
            for k = 1:2
                s = 'it''s the end';
            end
            tc.verifyEqual(sum(tc.Data(:)), 136, 'AbsTol', tc.Tol);
        end
        function testSquare(tc, n)
            tc.verifyEqual(n^2, n*n);
        end
        function testBoth(tc, n, kind)
            tc.verifyLessThan(n, kind);
        end
        function testWrong(tc)
            tc.verifyEqual(tc.half(4), 3);
            tc.verifyTrue(false, 'second failure');
        end
        function testTeardown(tc)
            tc.addTeardown(@() fprintf('cleaned up\\n'));
            tc.assertEqual(1, 1);
        end
        function testSkipped(tc)
            tc.assumeTrue(false, 'needs a GPU');
            error('never reached');
        end
    end
    methods
        function y = half(tc, x)
            y = x / 2;
        end
    end
end`;

describe('Hyperion class-based tests (M523)', () => {
  it('finds the properties and methods blocks, not the ends of loops, indexes, strings or comments', () => {
    const c = readTestClass(CLASS)!;
    expect(c.name).toBe('SolverTest');
    expect(c.blocks.map((b) => [b.kind, b.attrs.join()])).toEqual([['properties', ''], ['properties', 'TestParameter'], ['methods', 'TestClassSetup'], ['methods', 'TestMethodSetup'], ['methods', 'Test'], ['methods', '']]);
    expect(readTestClass('x = 1;')).toBeNull();
    expect(() => readTestClass('classdef Point < handle\nend')).toThrow(/only as tests/);
  });
  it('runs every test (each parameter, every combination), keeps the set-up on the test case, and reports', () => {
    let out = '';
    const lab = new Lab({ out: (t) => { out += t; }, files: new FileStore() });
    const r = runScriptTests(lab, CLASS, 'SolverTest.m');
    const by = Object.fromEntries(r.tests.map((t) => [t.name, t]));
    expect(r.name).toBe('SolverTest');
    expect(by['SolverTest/testSum'].passed).toBe(true);
    expect(['1', '2', '3'].every((n) => by[`SolverTest/testSquare(n=${n})`].passed)).toBe(true);
    expect(by['SolverTest/testBoth(n=3,kind=small)'].passed).toBe(false);
    expect(by['SolverTest/testBoth(n=1,kind=large)'].passed).toBe(true);
    expect(by['SolverTest/testWrong'].details).toEqual(['verifyEqual failed: element 1 is 2, expected 3 (off by 1)', 'verifyTrue failed: the condition is false (second failure)']);
    expect(by['SolverTest/testTeardown'].passed).toBe(true);
    expect(out).toContain('cleaned up');
    expect(by['SolverTest/testSkipped (skipped)']).toMatchObject({ passed: true, details: ['skipped: assumeTrue failed: the condition is false (needs a GPU)'] });
    expect(r.tests).toHaveLength(1 + 3 + 6 + 3);
  });
  it('runtests runs a class file from Hyperion’s files', () => {
    let out = '';
    const files = new FileStore();
    files.load('SolverTest.m', { bytes: new TextEncoder().encode(CLASS) });
    const lab = new Lab({ out: (t) => { out += t; }, files });
    lab.run("r = runtests('SolverTest');");
    expect(out).toMatch(/Running SolverTest: 13 tests/);
    expect(out).toMatch(/10 passed, 3 failed/);
  });
});
