import { describe, expect, it } from 'vitest';
import * as S from './scenario';
import { scenarioMetrics, reportHtml } from './scenario-test';
import { Lab } from './interp';
import { FileStore } from './files';
import { Graphics } from './plot';
import { toMat, type Cell, type Struct } from './values';
import './machines-lab';

// M581: driving tests: the measurements worked by hand, requirements checked over many scenarios, the report.
const drive = (x: number, y: number, v: number): S.ActorSpec => ({ cls: 'car', position: [x, y], waypoints: [[x, y], [x + 500, y]], speeds: [v] });
const run = (actors: S.ActorSpec[], stop = 2, roads: S.RoadSpec[] = []) => S.runScenario({ dt: 0.1, stop, roads, actors, sensors: [] });

describe('Hyperion driving tests (M581)', () => {
  it('measures time to collision and headway as worked by hand', () => {
    const m = scenarioMetrics(run([drive(0, 0, 20), drive(50, 0, 10)]));
    // gap 50 − 4.7 = 45.3 m closing at 10 m/s; after 2 s it is 25.3 m: 2.53 s to collision, 1.265 s of headway
    expect(m.Collided).toBe(false); expect(m.MinGap).toBeCloseTo(25.3, 1); expect(m.MinTTC).toBeCloseTo(2.53, 1);
    expect(m.TimeOfMinTTC).toBeCloseTo(2, 5); expect(m.MinHeadway).toBeCloseTo(1.265, 1); expect(m.MaxSpeed).toBeCloseTo(20, 5);
  });
  it('finds a crash, ignores the next lane, and counts time off the road', () => {
    const hit = scenarioMetrics(run([drive(0, 0, 15), { cls: 'car', position: [30, 0] }], 4));
    expect(hit.Collided).toBe(true); expect(hit.MinGap).toBe(0); expect(hit.MinTTC).toBe(0);
    expect(scenarioMetrics(run([drive(0, 0, 20), drive(30, 3.6, 5)])).MinTTC).toBe(Infinity);
    const road: S.RoadSpec = { centers: [[-50, 0], [600, 0]], lanes: 2, laneWidth: 3.6 };
    expect(scenarioMetrics(run([drive(0, 1.8, 20)], 2, [road])).OffRoadSeconds).toBe(0);
    expect(scenarioMetrics(run([drive(0, 6, 20)], 2, [road])).OffRoadSeconds).toBeCloseTo(2.1, 5);
  });
  it('the report shows passes, failures and their measurements, safely', () => {
    const m = scenarioMetrics(run([drive(0, 0, 20), drive(50, 0, 10)]));
    const html = reportHtml('ACC <tests>', [{ id: 'R1', text: 'TTC ≥ 3 s', check: '@(m) m.MinTTC >= 3' }], ['slow lead'], [{ scenario: 'slow lead', requirement: 'R1', passed: false, detail: 'not met: MinTTC = 2.53' }], [m]);
    expect(html).toContain('ACC &lt;tests&gt;'); expect(html).toContain('1 of 1 checks failed'); expect(html).toContain('MinTTC = 2.53'); expect(html).not.toContain('<tests>');
  });
  it('requirements against a family of scenarios, in the language, and the report file', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files, graphics: new Graphics() });
    l.run(`R = requirements();
R = addRequirement(R, 'R1', 'Never collides', @(m) ~m.Collided);
R = addRequirement(R, 'R2', 'Keeps 2 s to collision', @(m) m.MinTTC >= 2);
res = verifyScenarios(R, @(p) follow(p(1), p(2)), [12 60; 20 50; 25 15]);
one = verifyScenarios(R, follow(12, 60), 'Names', {'easy'});
m = scenarioMetrics(follow(12, 60));
testReport(res, 'acc.html', 'Title', 'Following a slower car');
function s = follow(v, gap)
  s = drivingScenario('StopTime', 4);
  [s, e] = vehicle(s, 'Position', [0 0]); s = trajectory(s, e, [0 0; 400 0], v);
  [s, l] = vehicle(s, 'Position', [gap 0]); s = trajectory(s, l, [gap 0; 400 0], 10);
end`);
    const res = l.vars.get('res') as Struct, T = res.f.get('Results') as Struct;
    expect(toMat(res.f.get('AllPassed')!).d[0]).toBe(0);
    expect([...toMat(T.f.get('Passed')!).d]).toEqual([1, 1, 1, 0, 0, 0]); // 12 m/s: both; 20 m/s from 50 m: 5.3 m left, 0.53 s to collision; 25 m/s from 15 m: a crash
    const det = (T.f.get('Detail') as Cell).d.map((x) => (x.k === 'str' ? x.v : ''));
    expect(det[3]).toMatch(/^not met: MinTTC = 0\.\d+/); expect(det[4]).toMatch(/Collided = 1/);
    expect(toMat((l.vars.get('one') as Struct).f.get('Passed')!).d[0]).toBe(2);
    expect(toMat((l.vars.get('m') as Struct).f.get('MinTTC')!).d[0]).toBeGreaterThan(2);
    expect(files.text('acc.html')).toContain('Following a slower car');
    expect(() => l.run("R = addRequirement(R, 'R1', 'again', @(m) true)")).toThrow(/already/);
    expect(() => l.run('verifyScenarios(requirements(), follow(20, 60))')).toThrow(/no requirements/);
  });
});
