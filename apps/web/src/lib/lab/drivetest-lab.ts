import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { FileStore } from './files';
import { bool, mat, num, str, toMat, truthy, type Cell, type Fn, type Struct, type Value } from './values';
import * as S from './scenario';
import { isScenario, specOf } from './scenario-lab';
import * as T from './scenario-test';

// Driving tests in the language (M581): scenarioMetrics (what a run measured), requirements and addRequirement
// (each a check on those measurements, @(m) m.MinTTC >= 2), verifyScenarios (every requirement against every
// scenario, or against a scenario built from each row of parameters) and testReport (an HTML report in Hyperion's files).

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const struct = (f: [string, Value][]): Struct => ({ k: 'struct', f: new Map(f) });
const colCell = (d: Value[]): Cell => ({ k: 'cell', r: d.length, c: 1, d });
const wrap = <T,>(f: () => T): T => { try { return f(); } catch (e) { if (e instanceof LabError) throw e; throw new LabError((e as Error).message); } };
const metricsStruct = (m: T.Metrics): Struct => struct(Object.entries(m).map(([k, v]) => [k, typeof v === 'boolean' ? bool(v) : num(v)]));
const metricsOf = (s: Struct) => wrap(() => T.scenarioMetrics(S.runScenario({ ...specOf(s), sensors: [] }), specOf(s).ego ?? 0));
const isReqs = (v: Value | undefined): v is Struct => v?.k === 'struct' && v.f.has('Requirements');
const reqList = (R: Struct) => { const ids = (R.f.get('ID') as Cell).d, tx = (R.f.get('Text') as Cell).d, ck = (R.f.get('Check') as Cell).d; return ids.map((id, i) => ({ id: textOf(id), text: textOf(tx[i]), fn: ck[i] as Fn })); };
const reqsStruct = (L: { id: string; text: string; fn: Fn }[]): Struct => struct([['Requirements', bool(true)], ['ID', colCell(L.map((r) => str(r.id)))], ['Text', colCell(L.map((r) => str(r.text)))], ['Check', colCell(L.map((r) => r.fn))]]);
const srcOf = (f: Fn) => f.src ?? (f.name ? `@${f.name}` : '@(m) …');

def('scenarioMetrics', (a) => {
  if (!isScenario(a[0])) throw new LabError('m = scenarioMetrics(s): what a run of the drivingScenario measured about the ego vehicle.');
  return [metricsStruct(metricsOf(a[0] as Struct))];
});
def('requirements', () => [reqsStruct([])]);
def('addRequirement', (a) => {
  if (!isReqs(a[0])) throw new LabError("R = addRequirement(R, 'R1', 'Never collides', @(m) ~m.Collided): R from requirements().");
  const id = a[1] ? textOf(a[1]) : '', text = a[2] ? textOf(a[2]) : '', fn = a[3];
  if (!id || fn?.k !== 'fn') throw new LabError("addRequirement(R, 'ID', 'what it asks', @(m) check): the check takes the measurements m (see scenarioMetrics) and gives true or false.");
  const L = reqList(a[0]);
  if (L.some((r) => r.id === id)) throw new LabError(`addRequirement: there is already a requirement ${id}.`);
  return [reqsStruct([...L, { id, text: text || id, fn }])];
});

/** Runs every check on one scenario's measurements. */
function checkAll(lab: Lab, reqs: ReturnType<typeof reqList>, name: string, m: T.Metrics): T.Outcome[] {
  const ms = metricsStruct(m);
  return reqs.map((r) => {
    let passed = false, detail: string;
    try { const v = lab.callFn(r.fn, [ms])[0]; passed = !!v && truthy(v); detail = passed ? 'met' : 'not met'; } catch (e) { detail = `the check failed: ${(e as Error).message}`; }
    const used = [...new Set([...srcOf(r.fn).matchAll(new RegExp(`\\b${r.fn.params?.[0] ?? 'm'}\\.(\\w+)`, 'g'))].map((x) => x[1]))].filter((k) => k in m);
    if (used.length) detail += `: ${used.map((k) => `${k} = ${String(+Number(m[k as keyof T.Metrics]).toPrecision(4))}`).join(', ')}`;
    return { scenario: name, requirement: r.id, passed, detail };
  });
}
def('verifyScenarios', (a, _n, lab) => {
  const USE = "res = verifyScenarios(R, {s1, s2}, 'Names', {'cut-in', 'braking'}), or verifyScenarios(R, @(p) myScenario(p(1), p(2)), [10 20; 15 30]): every requirement against every scenario.";
  if (!isReqs(a[0])) throw new LabError(USE);
  const reqs = reqList(a[0]);
  if (!reqs.length) throw new LabError('verifyScenarios: R has no requirements yet (addRequirement).');
  let built: Struct[], names: string[] = [];
  let rest = 2;
  if (a[1]?.k === 'fn') {
    const P = a[2] ? toMat(a[2]) : null;
    if (!P || !P.r) throw new LabError(USE);
    rest = 3;
    built = Array.from({ length: P.r }, (_, i) => {
      const row = Array.from({ length: P.c }, (_, j) => P.d[i + j * P.r]), s = lab.callFn(a[1] as Fn, [mat(1, P.c, row)])[0];
      if (!isScenario(s)) throw new LabError(`verifyScenarios: the function gave something other than a drivingScenario for row ${i + 1}.`);
      names.push(`[${row.map((x) => +x.toPrecision(4)).join(' ')}]`);
      return s as Struct;
    });
  } else {
    const list = a[1]?.k === 'cell' ? a[1].d : a[1] ? [a[1]] : [];
    if (!list.length || !list.every(isScenario)) throw new LabError(USE);
    built = list as Struct[]; names = built.map((_, i) => `Scenario ${i + 1}`);
  }
  if (built.length > 500) throw new LabError('verifyScenarios: at most 500 scenarios at once.');
  for (let i = rest; i < a.length; i += 2) {
    if (textOf(a[i]).toLowerCase() !== 'names' || a[i + 1]?.k !== 'cell') throw new LabError("verifyScenarios: the option is 'Names', {…} (one name a scenario).");
    const nm = (a[i + 1] as Cell).d.map((x) => textOf(x));
    if (nm.length !== built.length) throw new LabError(`verifyScenarios: ${nm.length} names for ${built.length} scenarios.`);
    names = nm;
  }
  const metrics = built.map(metricsOf), out = built.flatMap((_, i) => checkAll(lab, reqs, names[i], metrics[i]));
  const passed = out.filter((o) => o.passed).length;
  return [struct([
    ['AllPassed', bool(passed === out.length)], ['Passed', num(passed)], ['Failed', num(out.length - passed)],
    ['Results', { k: 'struct', table: true, f: new Map<string, Value>([['Scenario', colCell(out.map((o) => str(o.scenario)))], ['Requirement', colCell(out.map((o) => str(o.requirement)))], ['Passed', { ...mat(out.length, 1, out.map((o) => (o.passed ? 1 : 0))), logical: true }], ['Detail', colCell(out.map((o) => str(o.detail)))]]) }],
    ['Metrics', colCell(metrics.map(metricsStruct))], ['Scenarios', colCell(names.map((x) => str(x)))], ['Requirements', a[0]],
  ])];
});
def('testReport', (a, _n, lab) => {
  const r = a[0];
  if (r?.k !== 'struct' || !r.f.has('Results') || !isReqs(r.f.get('Requirements'))) throw new LabError("testReport(res, 'report.html', 'Title', 'ACC tests'): res from verifyScenarios.");
  const name = a[1] ? textOf(a[1]) : 'report.html';
  if (!/^[\w./-]+\.html?$/i.test(name)) throw new LabError("testReport: the report's file name ends in .html.");
  const title = a[2] && textOf(a[2]).toLowerCase() === 'title' && a[3] ? textOf(a[3]) : 'Driving test report';
  const tb = r.f.get('Results') as Struct, col = (k: string) => (tb.f.get(k) as Cell).d.map((x) => textOf(x)), ok = toMat(tb.f.get('Passed')!).d;
  const sc = col('Scenario'), rq = col('Requirement'), dt = col('Detail');
  const outcomes: T.Outcome[] = sc.map((s, i) => ({ scenario: s, requirement: rq[i], passed: !!ok[i], detail: dt[i] }));
  const metrics = (r.f.get('Metrics') as Cell).d.map((m) => Object.fromEntries([...(m as Struct).f].map(([k, v]) => [k, toMat(v).logical ? !!toMat(v).d[0] : toMat(v).d[0]])) as unknown as T.Metrics);
  const html = T.reportHtml(title, reqList(r.f.get('Requirements') as Struct).map((q) => ({ id: q.id, text: q.text, check: srcOf(q.fn) })), (r.f.get('Scenarios') as Cell).d.map((x) => textOf(x)), outcomes, metrics);
  const fs = (lab.host as { files?: unknown }).files;
  if (!(fs instanceof FileStore)) throw new LabError('testReport: Hyperion’s files aren’t here.');
  fs.putText(name, html);
  lab.host.out(`Wrote ${name}: ${toMat(r.f.get('Passed')!).d[0]} of ${outcomes.length} checks passed.\n`);
  return [];
});
