import { LabError, parse } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { Lab, textOf } from './interp';
import { FileStore } from './files';
import { bool, kind, mat, sizeOf, str, toMat, truthy, type Cell, type Struct, type Value } from './values';
import { differs, sections, type Tol } from './verify';

// Hyperion's unit tests for scripts (M476). Two ways to write them, as MATLAB has:
//  • a test script: set-up code, then one %% section per test (each runs in its own fresh workspace after the
//    set-up); run it with the window's Test button or runtests('file.m') for a file in Hyperion's files;
//  • test functions: local functions named test… taking the test case (function testAdd(tc)); runtests with no
//    file runs every one the code defined, with setupOnce / teardownOnce / setup / teardown when present.
// Checks: assert… stops the test at the first failure, verify… records it and goes on (both take the test case
// first or not: verifyEqual(tc, a, b) and assertEqual(a, b) both work). MATLAB's matlab.unittest classes aren't here;
// the results are a table (Name, Passed, Failed, Duration, Details) and the window shows them as a panel.

export interface TestResult { name: string; passed: boolean; ms: number; details: string[]; line?: number }
export interface TestReport { name: string; tests: TestResult[]; ms: number }

/** The failures verify… recorded in the test now running (null when no test is running: they then stop the code). */
let collecting: string[] | null = null;
class AssertionFailed extends LabError {}

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const isCase = (v: Value | undefined) => v?.k === 'struct' && v.f.has('TestName') && v.f.has('IsTestCase');
const fail = (soft: boolean, msg: string) => {
  if (soft && collecting) { collecting.push(msg); return; }
  throw new AssertionFailed(msg);
};
/** Defines assertX and verifyX: `check` gets the arguments after the optional test case and says what failed. */
function qualify(name: string, check: (a: Value[], lab: Lab) => string | null) {
  for (const [prefix, soft] of [['assert', false], ['verify', true]] as const) {
    def(`${prefix}${name}`, (a, _n, lab) => {
      const args = isCase(a[0]) ? a.slice(1) : a;
      const why = check(args, lab);
      if (why) fail(soft, `${prefix}${name} failed: ${why}`);
      return [];
    });
  }
}
const tolOf = (a: Value[], from: number): Tol => {
  const t: Tol = { abs: 0, rel: 0 };
  for (let i = from; i + 1 < a.length; i += 2) {
    const k = a[i].k === 'str' ? (a[i] as { v: string }).v.toLowerCase() : '';
    if (k === 'abstol') t.abs = toMat(a[i + 1]).d[0];
    else if (k === 'reltol') t.rel = toMat(a[i + 1]).d[0];
  }
  return t;
};
const need = (a: Value[], n: number, what: string) => { if (a.length < n) throw new LabError(`It needs ${what}.`); };
const note = (a: Value[], from: number) => { const v = a[from]; return v?.k === 'str' && !/^(abstol|reltol)$/i.test(v.v) ? ` (${v.v})` : ''; };

qualify('Equal', (a) => { need(a, 2, 'the value and the one expected'); const w = differs(a[0], a[1], tolOf(a, 2)); return w ? w + note(a, 2) : null; });
qualify('NotEqual', (a) => { need(a, 2, 'two values'); return differs(a[0], a[1]) ? null : `both are the same${note(a, 2)}`; });
qualify('True', (a) => { need(a, 1, 'a condition'); return truthy(a[0]) ? null : `the condition is false${note(a, 1)}`; });
qualify('False', (a) => { need(a, 1, 'a condition'); return truthy(a[0]) ? `the condition is true${note(a, 1)}` : null; });
qualify('Empty', (a) => { need(a, 1, 'a value'); const [r, c] = sizeOf(a[0]); return r * c === 0 ? null : `it is ${r}×${c}, not empty${note(a, 1)}`; });
qualify('NotEmpty', (a) => { need(a, 1, 'a value'); const [r, c] = sizeOf(a[0]); return r * c ? null : `it is empty${note(a, 1)}`; });
qualify('Size', (a) => { need(a, 2, 'a value and its size'); const s = sizeOf(a[0]), want = [...toMat(a[1]).d]; return s.join('×') === want.join('×') ? null : `size ${s.join('×')}, expected ${want.join('×')}${note(a, 2)}`; });
qualify('Class', (a) => { need(a, 2, 'a value and a class name'); const k = kind(a[0]).split(' ')[0], want = textOf(a[1]); return k === want ? null : `class ${k}, expected ${want}${note(a, 2)}`; });
const compare = (name: string, ok: (x: number, y: number) => boolean, word: string) => qualify(name, (a) => {
  need(a, 2, 'two values');
  const x = toMat(a[0]), y = toMat(a[1]);
  for (let i = 0; i < x.d.length; i++) { const yi = y.d.length === 1 ? y.d[0] : y.d[i]; if (!ok(x.d[i], yi)) return `${x.d[i]} is not ${word} ${yi}${x.d.length > 1 ? ` (element ${i + 1})` : ''}${note(a, 2)}`; }
  return null;
});
compare('LessThan', (x, y) => x < y, 'less than');
compare('LessThanOrEqual', (x, y) => x <= y, 'at most');
compare('GreaterThan', (x, y) => x > y, 'greater than');
compare('GreaterThanOrEqual', (x, y) => x >= y, 'at least');
qualify('Error', (a, lab) => {
  need(a, 1, 'a function to call: assertError(@() f(x))');
  const want = a[1] ? textOf(a[1]) : '';
  try { lab.callFn(a[0], [], 0); } catch (e) {
    if (e instanceof AssertionFailed || !(e instanceof LabError)) throw e;
    return !want || e.message.includes(want) || (e as LabError & { id?: string }).id === want ? null : `it stopped with “${e.message}”, not one containing “${want}”`;
  }
  return 'it ran without an error';
});
def('assertFail verifyFail', (a) => { fail(false, `failed${a[a.length - 1]?.k === 'str' ? `: ${textOf(a[a.length - 1])}` : ''}`); return []; });

// ——— Running tests ———
const files = (lab: Lab) => { const s = (lab.host as { files?: unknown }).files; return s instanceof FileStore ? s : null; };
/** One test: its own workspace, its failures collected. */
function one(lab: Lab, name: string, body: (child: Lab) => void, line?: number): TestResult {
  const child = new Lab(lab.host);
  for (const [k, f] of lab.fns) child.fns.set(k, f);
  const was = collecting, details: string[] = [];
  collecting = details;
  const t0 = performance.now();
  try { body(child); } catch (e) {
    if (!(e instanceof LabError)) throw e;
    details.push(e instanceof AssertionFailed ? e.message : `stopped with an error: ${e.message}`);
  } finally { collecting = was; }
  return { name, passed: !details.length, ms: performance.now() - t0, details, ...(line ? { line } : {}) };
}
/** A test script's %% sections, each after the shared set-up. */
export function runScriptTests(lab: Lab, code: string, name = 'tests'): TestReport {
  const t0 = performance.now(), { setup, tests } = sections(code);
  const prog = parse(code);
  for (const [k, f] of prog.fns) lab.fns.set(k, f);
  const out: TestResult[] = [];
  for (const t of tests) {
    // A section holding only function definitions isn't a test.
    if (!parse(t.code).body.length) continue;
    out.push(one(lab, t.name, (child) => { if (setup.trim()) child.run(setup); child.run(t.code); }, t.line));
  }
  // Test functions defined in the script run too.
  out.push(...runFunctionTests(lab, [...prog.fns.keys()]).tests);
  return { name, tests: out, ms: performance.now() - t0 };
}
/** Local functions named test… (and the fixtures around them). */
export function runFunctionTests(lab: Lab, names = [...lab.fns.keys()]): TestReport {
  const t0 = performance.now(), tests = names.filter((n) => /^test/i.test(n) && n.toLowerCase() !== 'tests');
  const has = (n: string) => lab.fns.has(n);
  const tc = (name: string): Struct => ({ k: 'struct', f: new Map<string, Value>([['TestName', str(name)], ['IsTestCase', bool(true)]]) });
  const call = (n: string, name: string) => { if (has(n)) lab.call(n, lab.fns.get(n)!.params.length ? [tc(name)] : [], 0); };
  const out: TestResult[] = [];
  if (tests.length) {
    try { call('setupOnce', 'setupOnce'); } catch (e) { if (e instanceof LabError) return { name: 'tests', tests: tests.map((n) => ({ name: n, passed: false, ms: 0, details: [`setupOnce stopped: ${e.message}`] })), ms: 0 }; throw e; }
    for (const n of tests) out.push(one(lab, n, () => { call('setup', n); try { lab.call(n, lab.fns.get(n)!.params.length ? [tc(n)] : [], 0); } finally { call('teardown', n); } }));
    try { call('teardownOnce', 'teardownOnce'); } catch { /* reported by the tests' own results */ }
  }
  return { name: 'tests', tests: out, ms: performance.now() - t0 };
}
/** The report as MATLAB-like text for the command window. */
export function reportText(r: TestReport): string {
  const failed = r.tests.filter((t) => !t.passed), lines = [`Running ${r.name}: ${r.tests.length} test${r.tests.length === 1 ? '' : 's'}`];
  for (const t of r.tests) lines.push(`  ${t.passed ? '✓' : '✗'} ${t.name}  (${t.ms.toFixed(1)} ms)${t.passed ? '' : `\n      ${t.details.join('\n      ')}`}`);
  lines.push(failed.length ? `${r.tests.length - failed.length} passed, ${failed.length} failed (${r.ms.toFixed(0)} ms).` : `All ${r.tests.length} passed (${r.ms.toFixed(0)} ms).`);
  return `${lines.join('\n')}\n`;
}
/** The results as a table: Name, Passed, Failed, Duration (s), Details. */
function table(r: TestReport): Struct {
  const n = r.tests.length, col = (d: Value[]): Cell => ({ k: 'cell', r: n, c: 1, d });
  return { k: 'struct', table: true, f: new Map<string, Value>([
    ['Name', col(r.tests.map((t) => str(t.name)))],
    ['Passed', { ...mat(n, 1, r.tests.map((t) => (t.passed ? 1 : 0))), logical: true }],
    ['Failed', { ...mat(n, 1, r.tests.map((t) => (t.passed ? 0 : 1))), logical: true }],
    ['Duration', mat(n, 1, r.tests.map((t) => t.ms / 1000))],
    ['Details', col(r.tests.map((t) => str(t.details.join('; '))))],
  ]) };
}
/** Told each report, for the window's results panel (the worker sets it). */
export const testReports: { onReport: ((r: TestReport) => void) | null } = { onReport: null };

def('runtests', (a, nout, lab) => {
  let r: TestReport;
  if (a[0]) {
    const name = textOf(a[0]), fs = files(lab), file = /\.m$/i.test(name) ? name : `${name}.m`;
    if (!fs?.has(file)) throw new LabError(`There’s no ${file} in Hyperion’s files. Save the test script there, or press Test above a script.`);
    r = runScriptTests(lab, fs.text(file), file);
  } else {
    r = runFunctionTests(lab);
    if (!r.tests.length) throw new LabError('No tests: name local functions test… (function testAdd(tc)), or give runtests a test script.');
  }
  lab.host.out(reportText(r));
  testReports.onReport?.(r);
  return nout > 0 ? [table(r)] : [];
});
