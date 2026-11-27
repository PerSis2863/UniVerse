// Hyperion's driving tests (M581, the owner, 27 Nov: the automated-driving page's "integrate and test… requirements…
// test suites"): what a run of a driving scenario measured about the ego vehicle (collisions, the closest gap to what
// is in its path, time to collision, headway, braking and jerk, speed, time off the road), so requirements can be
// checked against many scenarios and reported. Pure.

import * as S from './scenario';

export interface Metrics {
  Collided: boolean; CollisionTime: number; MinGap: number; MinTTC: number; TimeOfMinTTC: number; MinHeadway: number;
  MaxDecel: number; MaxAccel: number; MaxJerk: number; MaxSpeed: number; OffRoadSeconds: number; Duration: number;
}

/** The ego vehicle's measurements over a run. Something is "in its path" when it is ahead and overlaps the ego's
 *  width (plus 0.3 m); its gap is bumper to bumper along the ego's heading; time to collision is that gap over the
 *  closing speed (only while closing); headway is the gap over the ego's speed (above 1 m/s). */
export function scenarioMetrics(run: S.Run, ego = 0): Metrics {
  const P = run.poses[ego], A = run.actors[ego], n = P.length, dt = n > 1 ? run.t[1] - run.t[0] : 0.1;
  let minGap = Infinity, minTTC = Infinity, tTTC = NaN, minHw = Infinity, offRoad = 0;
  for (let k = 0; k < n; k++) {
    const e = P[k], c = Math.cos(e.yaw), s = Math.sin(e.yaw);
    for (let j = 0; j < run.poses.length; j++) {
      if (j === ego) continue;
      const q = run.poses[j][k], B = run.actors[j], dx = (q.x - e.x) * c + (q.y - e.y) * s, dy = -(q.x - e.x) * s + (q.y - e.y) * c;
      if (dx <= 0 || Math.abs(dy) > (A.W + B.W) / 2 + 0.3) continue;
      const gap = Math.max(0, dx - (A.L + B.L) / 2), closing = e.v - q.v * Math.cos(q.yaw - e.yaw);
      minGap = Math.min(minGap, gap);
      if (closing > 0.1) { const ttc = gap / closing; if (ttc < minTTC) { minTTC = ttc; tTTC = run.t[k]; } }
      if (e.v > 1) minHw = Math.min(minHw, gap / e.v);
    }
    if (run.roads.length) {
      let near = Infinity, half = 0;
      for (const rd of run.roads) for (let i = 0; i < rd.x.length; i++) { const d = Math.hypot(rd.x[i] - e.x, rd.y[i] - e.y); if (d < near) { near = d; half = (rd.lanes * (rd.laneWidth ?? 3.6)) / 2; } }
      if (near > half) offRoad += dt;
    }
  }
  const acc = P.slice(1).map((p, k) => (p.v - P[k].v) / dt), jerk = acc.slice(1).map((a, k) => Math.abs(a - acc[k]) / dt);
  const hit = run.collisions.find((h) => h.a === ego || h.b === ego);
  return {
    Collided: !!hit, CollisionTime: hit?.t ?? NaN, MinGap: minGap, MinTTC: minTTC, TimeOfMinTTC: tTTC, MinHeadway: minHw,
    MaxDecel: Math.max(0, ...acc.map((a) => -a)), MaxAccel: Math.max(0, ...acc), MaxJerk: Math.max(0, ...jerk),
    MaxSpeed: Math.max(0, ...P.map((p) => p.v)), OffRoadSeconds: +offRoad.toFixed(6), Duration: run.t[n - 1] ?? 0,
  };
}

export interface Outcome { scenario: string; requirement: string; passed: boolean; detail: string }
const fmt = (v: unknown) => (typeof v === 'number' ? (Number.isFinite(v) ? +v.toPrecision(4) : String(v)) : String(v));
const escH = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A test report as a self-contained HTML page: the summary, which scenario met which requirement, every scenario's
 *  measurements, and each failure with the measurements its check used. */
export function reportHtml(title: string, reqs: { id: string; text: string; check: string }[], scenarios: string[], outcomes: Outcome[], metrics: Metrics[], when = new Date()) {
  const passed = outcomes.filter((o) => o.passed).length, all = outcomes.length, ok = passed === all;
  const cell = (s: string, r: string) => { const o = outcomes.find((x) => x.scenario === s && x.requirement === r); return o ? `<td class="${o.passed ? 'pass' : 'fail'}" title="${escH(o.detail)}">${o.passed ? '✓ pass' : '✗ fail'}</td>` : '<td>–</td>'; };
  const keys = Object.keys(metrics[0] ?? {}) as (keyof Metrics)[];
  const fails = outcomes.filter((o) => !o.passed);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escH(title)}</title>
<style>
body{font:14px/1.5 system-ui,sans-serif;margin:24px;color:#18181b;background:#fff;max-width:1100px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}p.meta{color:#52525b;margin:0 0 16px}
.badge{display:inline-block;padding:4px 10px;border-radius:999px;font-weight:600}.ok{background:#dcfce7;color:#166534}.bad{background:#fee2e2;color:#991b1b}
table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #e4e4e7;padding:6px 8px;text-align:start;vertical-align:top}th{background:#f4f4f5}
td.pass{color:#166534;background:#f0fdf4}td.fail{color:#991b1b;background:#fef2f2;font-weight:600}code{font-family:ui-monospace,monospace;font-size:12px}
.wrap{overflow-x:auto}
</style></head><body>
<h1>${escH(title)}</h1>
<p class="meta">Made by Hyperion on ${when.toISOString().slice(0, 16).replace('T', ' ')} UTC · ${scenarios.length} scenario${scenarios.length === 1 ? '' : 's'} × ${reqs.length} requirement${reqs.length === 1 ? '' : 's'}</p>
<p><span class="badge ${ok ? 'ok' : 'bad'}">${ok ? 'All passed' : `${all - passed} of ${all} checks failed`}</span> ${passed} of ${all} checks passed.</p>
<h2>Requirements</h2>
<div class="wrap"><table><thead><tr><th>ID</th><th>Requirement</th><th>Check</th><th>Scenarios passed</th></tr></thead><tbody>
${reqs.map((r) => { const o = outcomes.filter((x) => x.requirement === r.id), p = o.filter((x) => x.passed).length; return `<tr><td>${escH(r.id)}</td><td>${escH(r.text)}</td><td><code>${escH(r.check)}</code></td><td class="${p === o.length ? 'pass' : 'fail'}">${p} / ${o.length}</td></tr>`; }).join('\n')}
</tbody></table></div>
<h2>Which scenario met which requirement</h2>
<div class="wrap"><table><thead><tr><th>Scenario</th>${reqs.map((r) => `<th>${escH(r.id)}</th>`).join('')}</tr></thead><tbody>
${scenarios.map((s) => `<tr><td>${escH(s)}</td>${reqs.map((r) => cell(s, r.id)).join('')}</tr>`).join('\n')}
</tbody></table></div>
<h2>Failures</h2>
${fails.length ? `<div class="wrap"><table><thead><tr><th>Scenario</th><th>Requirement</th><th>Why</th></tr></thead><tbody>
${fails.map((o) => `<tr><td>${escH(o.scenario)}</td><td>${escH(o.requirement)}</td><td>${escH(o.detail)}</td></tr>`).join('\n')}
</tbody></table></div>` : '<p>None.</p>'}
<h2>What each scenario measured</h2>
<div class="wrap"><table><thead><tr><th>Scenario</th>${keys.map((k) => `<th>${k}</th>`).join('')}</tr></thead><tbody>
${scenarios.map((s, i) => `<tr><td>${escH(s)}</td>${keys.map((k) => `<td>${escH(String(fmt(metrics[i]?.[k])))}</td>`).join('')}</tr>`).join('\n')}
</tbody></table></div>
<p class="meta">Gaps in metres (bumper to bumper, along the ego's heading), times in seconds, speeds in m/s, accelerations in m/s², jerk in m/s³.</p>
</body></html>
`;
}
