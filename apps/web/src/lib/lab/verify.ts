import { kind, type Value } from './values';

// Hyperion's checks for scripts (M476): why two values differ (or null when they match), for assertEqual and
// verifyEqual. Numbers match within an absolute or relative tolerance (none unless given, as MATLAB); sizes, kinds,
// text, cells and struct fields are compared all the way down.

export interface Tol { abs: number; rel: number }
const fmt = (x: number) => (Number.isInteger(x) ? String(x) : String(+x.toPrecision(8)));
const sizeText = (v: Value) => (v.k === 'mat' || v.k === 'cell' || v.k === 'sym' ? `${v.r}×${v.c}${v.k === 'mat' && (v.p ?? 1) > 1 ? `×${v.p}` : ''}` : v.k === 'str' ? `1×${v.v.length}` : '1×1');

export function differs(actual: Value, expected: Value, tol: Tol = { abs: 0, rel: 0 }, path = ''): string | null {
  const at = path ? ` in ${path}` : '';
  if (actual.k !== expected.k) {
    // Text and its character codes are different kinds; a number and a logical are compared by value.
    return `${kind(actual)} instead of ${kind(expected)}${at}`;
  }
  if (actual.k === 'str' && expected.k === 'str') return actual.v === expected.v ? null : `“${actual.v}” instead of “${expected.v}”${at}`;
  if (actual.k === 'mat' && expected.k === 'mat') {
    if (sizeText(actual) !== sizeText(expected)) return `size ${sizeText(actual)} instead of ${sizeText(expected)}${at}`;
    if ((actual.cls ?? 'double') !== (expected.cls ?? 'double')) return `class ${actual.cls ?? 'double'} instead of ${expected.cls ?? 'double'}${at}`;
    for (let i = 0; i < actual.d.length; i++) {
      const re = [actual.d[i], expected.d[i]], im = [actual.im?.[i] ?? 0, expected.im?.[i] ?? 0];
      const gap = Math.hypot(re[0] - re[1], im[0] - im[1]), size = Math.hypot(re[1], im[1]);
      const same = (Number.isNaN(re[0]) && Number.isNaN(re[1])) || re[0] === re[1] && im[0] === im[1] || gap <= tol.abs || gap <= tol.rel * size;
      if (!same) {
        const show = (r: number, q: number) => (q ? `${fmt(r)}${q < 0 ? '−' : '+'}${fmt(Math.abs(q))}i` : fmt(r));
        return `element ${i + 1}${at} is ${show(re[0], im[0])}, expected ${show(re[1], im[1])} (off by ${fmt(gap)}${tol.abs || tol.rel ? `, more than the tolerance` : ''})`;
      }
    }
    return null;
  }
  if (actual.k === 'cell' && expected.k === 'cell') {
    if (actual.r !== expected.r || actual.c !== expected.c) return `size ${sizeText(actual)} instead of ${sizeText(expected)}${at}`;
    for (let i = 0; i < actual.d.length; i++) { const w = differs(actual.d[i], expected.d[i], tol, `${path}{${i + 1}}`); if (w) return w; }
    return null;
  }
  if (actual.k === 'struct' && expected.k === 'struct') {
    const a = [...actual.f.keys()].sort(), e = [...expected.f.keys()].sort();
    const missing = e.filter((k) => !actual.f.has(k)), extra = a.filter((k) => !expected.f.has(k));
    if (missing.length || extra.length) return `${missing.length ? `no field ${missing.join(', ')}` : ''}${missing.length && extra.length ? ' and ' : ''}${extra.length ? `an extra field ${extra.join(', ')}` : ''}${at}`;
    for (const k of e) { const w = differs(actual.f.get(k)!, expected.f.get(k)!, tol, `${path}.${k}`); if (w) return w; }
    return null;
  }
  if (actual.k === 'fn' && expected.k === 'fn') return (actual.src ?? actual.name) === (expected.src ?? expected.name) ? null : `a different function${at}`;
  if (actual.k === 'sym' && expected.k === 'sym') return JSON.stringify(actual.d) === JSON.stringify(expected.d) ? null : `a different expression${at}`;
  return `different values${at}`;
}

/** The %% sections of a test script: the code before the first is shared set-up, each section one test named by its
 * title (or "Test 1", "Test 2"…). `line` is where each starts (from 1). */
export function sections(code: string): { setup: string; tests: { name: string; code: string; line: number }[] } {
  const lines = code.split('\n'), tests: { name: string; code: string; line: number }[] = [];
  let setup: string[] = [], cur: { name: string; body: string[]; line: number } | null = null;
  const close = () => { if (cur) tests.push({ name: cur.name, code: cur.body.join('\n'), line: cur.line }); };
  lines.forEach((l, i) => {
    const m = /^\s*%%(?!%)\s*(.*)$/.exec(l);
    if (m) { close(); cur = { name: m[1].trim() || `Test ${tests.length + 1}`, body: [], line: i + 1 }; return; }
    if (cur) cur.body.push(l); else setup.push(l);
  });
  close();
  // A test script whose sections hold function definitions only: those aren't tests (they are run by name).
  if (!tests.length) setup = lines;
  return { setup: setup.join('\n'), tests };
}
