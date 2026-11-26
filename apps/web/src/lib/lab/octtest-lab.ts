import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { Lab, textOf } from './interp';
import { mat, str, toMat, type Value } from './values';
import { encodeQr } from '@/lib/qr';
import { gfx } from './plot';
import { files, one, reportText, testReports, type TestResult } from './verify-lab';
import './plot3d'; // imshow, before pixel info

// The GNU Octave packages' sixth wave (M561, written fresh): tests kept inside a function's own file, as Octave
// writes them (%!assert, %!test, %!error, %!fail, %!shared, %!function, %!xtest; test('name') runs them, demo('name')
// runs its %!demo blocks); examples in its help text checked against what they print (doctest, `>> code` then the
// output expected); qrcode; impixel and impixelinfo (the pixel under the pointer, src/components/lab/pixel-info.ts).

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
function fileOf(lab: Lab, a: Value | undefined, what: string) {
  if (!a) throw new LabError(`${what}('name'): a function or script saved in Hyperion's files as name.m.`);
  const name = textOf(a).trim(), file = /\.m$/i.test(name) ? name : `${name}.m`, fs = files(lab);
  if (!fs?.has(file)) throw new LabError(`There's no ${file} in Hyperion's files: save it there first (Files → Save, or the window's Save to files).`);
  return { file, base: file.replace(/\.m$/i, ''), text: fs.text(file) };
}

// ——— %! blocks ———
const KINDS = new Set(['assert', 'test', 'error', 'fail', 'shared', 'function', 'endfunction', 'demo', 'xtest', 'warning', 'testif']);
interface Block { kind: string; head: string; body: string[]; line: number }
export function blocksOf(text: string): Block[] {
  const out: Block[] = [];
  text.replace(/\r/g, '').split('\n').forEach((raw, i) => {
    const m = /^\s*%!(.*)$/.exec(raw);
    if (!m) return;
    const k = /^([a-z]+)\b(.*)$/.exec(m[1]);
    if (k && KINDS.has(k[1])) out.push({ kind: k[1], head: k[2].trim(), body: [], line: i + 1 });
    else out[out.length - 1]?.body.push(m[1].replace(/^ /, ''));
  });
  return out;
}
/** Splits `<pattern> code` into the pattern and the code. */
const patterned = (s: string): [RegExp | null, string] => {
  const m = /^<([^>]*)>\s*([\s\S]*)$/.exec(s);
  if (!m) return [null, s];
  try { return [new RegExp(m[1]), m[2]]; } catch { return [null, m[2]]; }
};
function expectError(L: Lab, code: string, want: RegExp | null) {
  try { L.run(code); } catch (e) {
    if (!(e instanceof LabError)) throw e;
    if (want && !want.test(e.message)) throw new LabError(`the error was “${e.message}”, not one matching ${want.source}`);
    return;
  }
  throw new LabError('expected an error, but the code ran');
}

def('test', (a, nout, lab) => {
  const { file, base, text } = fileOf(lab, a[0], 'test');
  const blocks = blocksOf(text);
  const fns = [] as string[];
  let shared = '';
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === 'function') {
      const end = blocks.findIndex((x, j) => j > i && x.kind === 'endfunction');
      fns.push([`function ${b.head}`, ...b.body, 'end'].join('\n'));
      if (end > 0) i = end;
    }
  }
  const t0 = performance.now(), tests: TestResult[] = [];
  let known = 0;
  const setUp = (L: Lab) => { if (/^\s*function\b/m.test(text)) L.run(text); if (shared) L.run(shared); if (fns.length) L.run(fns.join('\n')); };
  let n = 0;
  for (const b of blocks) {
    const code = [b.head, ...b.body].join('\n');
    if (b.kind === 'shared') {
      const names = b.head.split(/[\s,]+/).filter(Boolean);
      shared = [...names.map((v) => `${v} = [];`), ...b.body].join('\n');
      continue;
    }
    if (!['assert', 'test', 'error', 'fail', 'xtest', 'warning'].includes(b.kind)) continue;
    n += 1;
    const name = `${base} ${b.kind} ${n} (line ${b.line})`;
    const r = one(lab, name, (L) => {
      setUp(L);
      const call = (fn: string) => { const c = code.trim(); return c.startsWith('(') ? `${fn}${c}` : `${fn}(${c})`; };
      if (b.kind === 'assert') L.run(call('assert'));
      else if (b.kind === 'fail') L.run(call('__octfail__'));
      else if (b.kind === 'error') { const [want, c] = patterned(code); expectError(L, c, want); }
      else L.run(code);
    }, b.line);
    if (b.kind === 'xtest' && !r.passed) { known += 1; r.passed = true; r.name += ' (known failure)'; }
    tests.push(r);
  }
  if (!tests.length) throw new LabError(`${file} has no tests: write them at its end as %!assert (f(2), 4) or %!test blocks.`);
  const report = { name: base, tests, ms: performance.now() - t0 };
  lab.host.out(reportText(report));
  const passed = tests.filter((t) => t.passed).length;
  lab.host.out(`PASSES ${passed} out of ${tests.length} test${tests.length === 1 ? '' : 's'}${known ? ` (${known} known failure${known === 1 ? '' : 's'})` : ''}\n`);
  testReports.onReport?.(report);
  return nout > 0 ? [mat(1, 1, [passed === tests.length ? 1 : 0], true), mat(1, 1, [tests.length])] : [];
});
// fail("code", "pattern"): the code must stop with an error (matching the pattern, when given).
def('__octfail__', (a, _n, lab) => {
  const code = textOf(a[0] ?? str('')), want = a[1] ? new RegExp(textOf(a[1])) : null;
  expectError(new Lab(lab.host), code, want);
  return [];
});
def('fail', (a, n, lab) => BUILTINS.__octfail__(a, n, lab));

def('demo', (a, _n, lab) => {
  const { file, text } = fileOf(lab, a[0], 'demo');
  const demos = blocksOf(text).filter((b) => b.kind === 'demo');
  if (!demos.length) throw new LabError(`${file} has no %!demo blocks.`);
  const which = a[1] ? Math.round(toMat(a[1]).d[0]) : 0;
  const pick = which ? [demos[which - 1]] : demos;
  if (!pick[0]) throw new LabError(`${file} has ${demos.length} demo${demos.length === 1 ? '' : 's'}.`);
  if (/^\s*function\b/m.test(text)) lab.run(text);
  pick.forEach((d, k) => {
    const code = [d.head, ...d.body].filter((l) => l.trim()).join('\n');
    lab.host.out(`${file} example ${which || k + 1}:\n${code.split('\n').map((l) => `  ${l}`).join('\n')}\n\n`);
    lab.run(code);
  });
  return [];
});

// ——— doctest: `>> code` in the help text, then what it should print ———
interface Example { code: string[]; want: string[]; line: number }
export function examplesOf(text: string): Example[] {
  const out: Example[] = [];
  let cur: Example | null = null;
  text.replace(/\r/g, '').split('\n').forEach((raw, i) => {
    const m = /^\s*%+(?!!)\s?(.*)$/.exec(raw);
    if (!m) { cur = null; return; }
    const t = m[1];
    const code = /^\s*>>\s?(.*)$/.exec(t);
    if (code) {
      if (cur && !cur.want.length) cur.code.push(code[1]);
      else { cur = { code: [code[1]], want: [], line: i + 1 }; out.push(cur); }
    } else if (cur) { if (t.trim()) cur.want.push(t); else if (cur.want.length) cur = null; }
  });
  return out;
}
const same = (got: string, want: string) => {
  const norm = (s: string) => s.split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean).join('\n');
  const g = norm(got), w = norm(want);
  if (w.includes('...')) { const re = new RegExp(`^${w.split('...').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*')}$`); return re.test(g); }
  return g === w;
};
def('doctest', (a, nout, lab) => {
  const { file, base, text } = fileOf(lab, a[0], 'doctest');
  const ex = examplesOf(text);
  if (!ex.length) throw new LabError(`${file} has no examples: in its help text write >> code, then on the next lines what it prints.`);
  let printed = '';
  const L = new Lab({ ...lab.host, out: (t: string) => { printed += t; } });
  for (const [k, f] of lab.fns) L.fns.set(k, f);
  if (/^\s*function\b/m.test(text)) L.run(text);
  const t0 = performance.now(), tests: TestResult[] = [];
  ex.forEach((e, i) => {
    tests.push(one(lab, `${base} example ${i + 1} (line ${e.line})`, () => {
      printed = '';
      try { L.run(e.code.join('\n')); } catch (err) { if (!(err instanceof LabError)) throw err; printed += `error: ${err.message}\n`; }
      if (!same(printed, e.want.join('\n'))) throw new LabError(`>> ${e.code.join('\n>> ')}\n      expected: ${e.want.join(' | ') || '(nothing)'}\n      got:      ${printed.trim().split('\n').join(' | ') || '(nothing)'}`);
    }, e.line));
  });
  const report = { name: `${base} (doctest)`, tests, ms: performance.now() - t0 };
  lab.host.out(reportText(report));
  testReports.onReport?.(report);
  const passed = tests.filter((t) => t.passed).length;
  return nout > 0 ? [mat(1, 1, [passed]), mat(1, 1, [tests.length])] : [];
});

// ——— QR codes ———
def('qrcode', (a) => {
  if (!a[0]) throw new LabError('q = qrcode(text): the code as a logical matrix, true where it is dark (imshow(~q) shows it).');
  let margin = 4;
  for (let i = 1; i + 1 < a.length; i += 2) if (/^margin$/i.test(textOf(a[i]))) margin = Math.max(0, Math.min(20, Math.round(toMat(a[i + 1]).d[0])));
  let m: boolean[][];
  try { m = encodeQr(textOf(a[0])); } catch { throw new LabError('That text is too long for a QR code (about 2,300 characters at most).'); }
  const n = m.length + 2 * margin, d = new Float64Array(n * n);
  m.forEach((row, r) => row.forEach((dark, c) => { if (dark) d[(c + margin) * n + r + margin] = 1; }));
  return [mat(n, n, d, true)];
});

// ——— Pixels ———
def('impixel', (a) => {
  const I = a[0] ? toMat(a[0]) : null;
  if (!I || !a[1] || !a[2]) throw new LabError('v = impixel(I, columns, rows): the pixels\' values, one row each (three columns).');
  const cs = [...toMat(a[1]).d], rs = [...toMat(a[2]).d];
  if (cs.length !== rs.length) throw new LabError('impixel: as many columns as rows.');
  const n = I.r * I.c, p = I.p ?? 1, out = new Float64Array(cs.length * 3);
  cs.forEach((c0, k) => {
    const c = Math.round(c0), r = Math.round(rs[k]);
    for (let ch = 0; ch < 3; ch++) out[ch * cs.length + k] = c >= 1 && c <= I.c && r >= 1 && r <= I.r ? I.d[(c - 1) * I.r + r - 1 + (p >= 3 ? ch * n : 0)] : NaN;
  });
  return [mat(cs.length, 3, out)];
});
def('impixelinfo', (_a, _n, lab) => {
  const g = gfx(lab), f = g.current ?? g.figure();
  f.pixelinfo = true;
  g.changed();
  lab.host.out('Point at the picture: its pixel\'s column, row and value show under the figure.\n');
  return [];
});
