// Hyperion: a driving scenario's camera and radar fused into tracks (M575), and the tracks scored with GOSPA against
// what the sensors could see. Shared by trackScenario (the language) and the Scenario designer.

import * as S from './scenario';
import * as F from './fusion';

export interface ScenarioTracks { steps: F.TrackStep[]; gospa: { t: number; gospa: number; loc: number; missed: number; false: number }[]; mean: number }
/** Each detection in the world (the ego pose and the sensor's mount), tracked, then scored each step against the
 *  actors some sensor saw in the last second, at the point a sensor reports (the footprint's point nearest the ego). */
export function scenarioTracks(spec: S.ScenarioSpec, run: S.Run, o: { q?: number; confirm?: [number, number]; drop?: number; cutoff?: number } = {}): ScenarioTracks {
  const ego = run.poses[spec.ego ?? 0], byT = new Map<number, S.Detection[]>();
  for (const d of run.detections) { const k = Math.round(d.t / spec.dt); (byT.get(k) ?? byT.set(k, []).get(k)!).push(d); }
  const steps = run.t.map((t, k) => {
    const e = ego[k], meas: F.Meas[] = [];
    for (const d of byT.get(k) ?? []) {
      const se = spec.sensors[d.sensor], m = se.mount ?? [0, 0, 0], sx = e.x + m[0] * Math.cos(e.yaw) - m[1] * Math.sin(e.yaw), sy = e.y + m[0] * Math.sin(e.yaw) + m[1] * Math.cos(e.yaw), look = e.yaw + ((se.yaw ?? 0) * Math.PI) / 180;
      if (se.kind === 'vision') {
        const rng = Math.hypot(d.x, d.y), sl = (se.noise ?? 1) * (0.1 + 0.01 * rng), sw = (se.noise ?? 1) * 0.1, c = Math.cos(look), s = Math.sin(look);
        meas.push({ t, kind: 'pos', z: [sx + d.x * c - d.y * s, sy + d.x * s + d.y * c], R: [[c * c * sl * sl + s * s * sw * sw, c * s * (sl * sl - sw * sw)], [c * s * (sl * sl - sw * sw), s * s * sl * sl + c * c * sw * sw]] });
      } else if (se.kind === 'radar' && d.range !== undefined) {
        const n = se.noise ?? 1;
        meas.push({ t, kind: 'radar', z: [d.range, ((d.az ?? 0) * Math.PI) / 180, d.rate ?? 0], R: [[0.25 * n * n, 0, 0], [0, (n * Math.PI / 180) ** 2, 0], [0, 0, 0.25 * n * n]], sx, sy, look, evx: e.v * Math.cos(e.yaw), evy: e.v * Math.sin(e.yaw) });
      }
    }
    return { t, meas };
  });
  const out = F.track(steps, o);
  const seen = new Map<number, number>(); // actor → the last step a sensor saw it
  const g = out.map((st, k) => {
    for (const d of byT.get(k) ?? []) if (d.truth >= 0) seen.set(d.truth, k);
    const e = ego[k];
    const truth = [...seen].filter(([, last]) => k - last <= Math.round(1 / spec.dt)).map(([i]) => {
      const C = S.corners(run.actors[i], run.poses[i][k]); let best: [number, number] = [run.poses[i][k].x, run.poses[i][k].y], bd = Infinity;
      for (let a = 0; a < 4; a++) { const [ax, ay] = C[a], [bx, by] = C[(a + 1) % 4], ex = bx - ax, ey = by - ay, u = Math.max(0, Math.min(1, ((e.x - ax) * ex + (e.y - ay) * ey) / (ex * ex + ey * ey))), px = ax + u * ex, py = ay + u * ey, dd = Math.hypot(px - e.x, py - e.y); if (dd < bd) { bd = dd; best = [px, py]; } }
      return best;
    });
    const r = F.gospa(st.tracks.filter((x) => x.confirmed).map((x) => [x.x, x.y]), truth, o.cutoff ?? 5);
    return { t: st.t, gospa: r.gospa, loc: r.localization, missed: r.missed, false: r.false };
  });
  return { steps: out, gospa: g, mean: g.reduce((s, x) => s + x.gospa, 0) / Math.max(1, g.length) };
}
