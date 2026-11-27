'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Code2, Download, Pause, Play, Trash2 } from 'lucide-react';
import { useDarkMode } from '@/lib/use-dark';
import { cn } from '@/lib/utils';
import * as S from '@/lib/lab/scenario';
import * as PC from '@/lib/lab/pointcloud';
import { scenarioTracks } from '@/lib/lab/scenario-track';
import { readOSM } from '@/lib/lab/osm';
import { shareFragment } from '@/lib/lab/share';
import { NumField, ui } from './bench-ui';

// Hyperion Simulate → Machines → Scenario designer (M573, after MathWorks' Driving Scenario Designer): roads drawn by
// clicking their centre points, cars, trucks and people placed on them with their speeds, the ego vehicle's camera,
// radar and lidar, and the run played back: a bird's-eye view with each sensor's coverage and what it sees, and a
// chase camera behind the ego vehicle. OpenDRIVE to download, Code to carry on in a script.

type Mode = 'look' | 'road' | 'car' | 'truck' | 'pedestrian';
interface Act { cls: S.ActorClass; path: [number, number][]; speed: number; wait: number; speeds?: number[] }
interface Design { roads: S.RoadSpec[]; actors: Act[]; stop: number; vision: boolean; radar: boolean; lidar: boolean }
const PRESETS: { name: string; make: () => Design }[] = [
  { name: 'Highway cut-in', make: () => ({ stop: 10, vision: true, radar: true, lidar: false, roads: [{ centers: [[0, 0], [150, 0], [300, 0]], lanes: 3, laneWidth: 3.6 }], actors: [
    { cls: 'car', path: [[0, 0], [300, 0]], speed: 20, wait: 0 },
    { cls: 'car', path: [[35, 3.6], [80, 3.6], [110, 0.3], [300, 0]], speed: 23, wait: 0 },
    { cls: 'truck', path: [[60, -3.6], [300, -3.6]], speed: 18, wait: 0 } ] }) },
  { name: 'Curve and a person crossing', make: () => ({ stop: 12, vision: true, radar: true, lidar: true, roads: [{ centers: [[0, 0], [60, 0], [110, 20], [150, 60]], lanes: 2, laneWidth: 3.6 }], actors: [
    { cls: 'car', path: [[0, -1.8], [60, -1.8], [109, 18.3], [148, 58.6]], speed: 10, wait: 0 },
    { cls: 'car', path: [[25, -1.8], [60, -1.8], [109, 18.3], [148, 58.6]], speed: 10, wait: 0 },
    { cls: 'pedestrian', path: [[75, 9], [75, -9]], speed: 1.4, wait: 8.5 } ] }) },
  { name: 'Stop and go (a crash)', make: () => ({ stop: 10, vision: true, radar: true, lidar: false, roads: [{ centers: [[0, 0], [250, 0]], lanes: 2, laneWidth: 3.6 }], actors: [
    { cls: 'car', path: [[0, -1.8], [250, -1.8]], speed: 16, wait: 0 },
    { cls: 'car', path: [[30, -1.8], [60, -1.8], [75, -1.8], [250, -1.8]], speed: 14, wait: 0, speeds: [14, 14, 0, 12] } ] }) },
];
const COLOURS: Record<S.ActorClass, string> = { car: '#71717a', truck: '#57534e', pedestrian: '#ea580c', bicycle: '#0891b2' };

function specOf(d: Design): S.ScenarioSpec {
  return {
    dt: 0.1, stop: d.stop, seed: 1, roads: d.roads.filter((r) => r.centers.length >= 2),
    actors: d.actors.map((a) => ({ cls: a.cls, position: a.path[0], ...(a.path.length >= 2 ? { waypoints: a.path, speeds: a.speeds ?? [a.speed], wait: a.wait } : {}) })),
    sensors: [...(d.vision ? [{ kind: 'vision' as const, mount: [1.9, 0, 1.1] as [number, number, number] }] : []), ...(d.radar ? [{ kind: 'radar' as const, mount: [3.7, 0, 0.2] as [number, number, number] }] : []), ...(d.lidar ? [{ kind: 'lidar' as const, mount: [0, 0, 1.8] as [number, number, number], channels: 16, azRes: 0.6 }] : [])],
  };
}
const codeOf = (d: Design) => [
  `% Made in Simulate → Machines → Scenario designer`,
  `s = drivingScenario('StopTime', ${d.stop});`,
  ...d.roads.filter((r) => r.centers.length >= 2).map((r) => `s = road(s, [${r.centers.map((c) => `${+c[0].toFixed(2)} ${+c[1].toFixed(2)}`).join('; ')}], 'Lanes', ${r.lanes}, 'LaneWidth', ${r.laneWidth});`),
  ...d.actors.flatMap((a, i) => [`[s, a${i + 1}] = ${a.cls === 'car' || a.cls === 'truck' ? 'vehicle' : 'actor'}(s, 'Class', '${a.cls}', 'Position', [${a.path[0].map((v) => +v.toFixed(2)).join(' ')}]);`, ...(a.path.length >= 2 ? [`s = trajectory(s, a${i + 1}, [${a.path.map((c) => `${+c[0].toFixed(2)} ${+c[1].toFixed(2)}`).join('; ')}], ${a.speeds ? `[${a.speeds.join(' ')}]` : a.speed}${a.wait ? `, 'Wait', ${a.wait}` : ''});`] : [])]),
  ...(d.vision ? [`s = addSensor(s, 'vision', 'Mount', [1.9 0 1.1]);`] : []), ...(d.radar ? [`s = addSensor(s, 'radar', 'Mount', [3.7 0 0.2]);`] : []), ...(d.lidar ? [`s = addSensor(s, 'lidar', 'Mount', [0 0 1.8], 'Channels', 16, 'AzimuthResolution', 0.6);`] : []),
  `r = runScenario(s)`, `plotScenario(s, ${(d.stop / 2).toFixed(1)})`, `writeOpenDRIVE(s, 'scenario.xodr')`,
].join('\n');

export function ScenarioBench() {
  const dark = useDarkMode(), router = useRouter();
  const [preset, setPreset] = useState(0);
  const [design, setDesign] = useState<Design>(() => PRESETS[0].make());
  const [mode, setMode] = useState<Mode>('look');
  const [speed, setSpeed] = useState(15);
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const top = useRef<HTMLCanvasElement>(null), chase = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);
  const view = useRef({ x0: 0, y0: 0, s: 1 });
  // M574: the objects the lidar finds in a scan (ground removed, clustered, boxed), worked out once a scan
  const boxes = useRef(new WeakMap<object, number[][]>());

  const result = useMemo(() => {
    if (!design.actors.length) return { run: null, error: '' }; // nothing to run yet: the hint below says what to do
    try { return { run: S.runScenario(specOf(design), { cloudEvery: 2 }), error: '' }; }
    catch (e) { return { run: null, error: (e as Error).message }; }
  }, [design]);
  const run = result.run, n = run?.t.length ?? 0;
  // M575: the camera and radar fused into tracks, scored with GOSPA
  const tracks = useMemo(() => { if (!run || (!design.vision && !design.radar)) return null; try { return scenarioTracks(specOf(design), run); } catch { return null; } }, [run, design]);
  const kk = Math.min(k, Math.max(0, n - 1));

  const kNow = useRef(0);
  useEffect(() => { kNow.current = kk; });
  useEffect(() => {
    if (!playing || n < 2) return;
    let raf = 0, t0 = 0;
    const from = kNow.current >= n - 1 ? 0 : kNow.current;
    const tick = (t: number) => { t0 ||= t; const next = Math.min(n - 1, from + Math.floor(((t - t0) / 1000) * 10)); setK(next); if (next < n - 1) raf = requestAnimationFrame(tick); else setPlaying(false); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, n]);

  // with no actors yet, the roads alone are drawn (a still, invisible ego only places the chase camera)
  const shownRun = useMemo((): S.Run | null => {
    if (run) return run;
    const roads = design.roads.filter((r) => r.centers.length >= 2).map(S.makeRoad), r0 = roads[0];
    return { t: [0], poses: [[{ x: r0?.x[0] ?? 0, y: r0?.y[0] ?? 0, yaw: r0?.h[0] ?? 0, v: 0 }]], actors: [{ cls: 'car', L: 0.01, W: 0.01, H: 0.01, name: '' }], roads, detections: [], lanes: [], clouds: [], collisions: [] };
  }, [run, design.roads]);
  const draw = useEffectEvent(() => {
    const b = box.current, run = shownRun;
    if (!b || !run) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(300, Math.floor((b.clientWidth - 24 - 12) / 2)), H = 360; // the panel's padding, the gap
    const setup = (c: HTMLCanvasElement | null) => { if (!c) return null; c.style.width = `${W}px`; c.style.height = `${H}px`; c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return ctx; };
    const grass = dark ? '#1c2a1d' : '#e3ecdc', asphalt = dark ? '#3f3f46' : '#c4c8ce', paint = dark ? '#e4e4e7' : '#ffffff', ink = dark ? '#d4d4d8' : '#3f3f46';
    const egoI = 0, ego = run.poses[egoI][kk];
    // ——— bird's eye ———
    const g = setup(top.current);
    if (g) {
      const clicked = design.roads.flatMap((r) => r.centers);
      const xs = [...run.roads.flatMap((r) => r.x), ...run.poses.flatMap((p) => p.map((q) => q.x)), ...clicked.map((c) => c[0]), ...(clicked.length || run.roads.length ? [] : [-50, 50])], ys = [...run.roads.flatMap((r) => r.y), ...run.poses.flatMap((p) => p.map((q) => q.y)), ...clicked.map((c) => c[1]), ...(clicked.length || run.roads.length ? [] : [-50, 50])];
      const x0 = Math.min(...xs) - 15, x1 = Math.max(...xs) + 15, y0 = Math.min(...ys) - 15, y1 = Math.max(...ys) + 15, s = Math.min(W / (x1 - x0), H / (y1 - y0));
      const ox = (W - (x1 - x0) * s) / 2, oy = (H - (y1 - y0) * s) / 2;
      view.current = { x0: x0 - ox / s, y0: y1 + oy / s, s };
      const P = (x: number, y: number): [number, number] => [(x - view.current.x0) * s, (view.current.y0 - y) * s];
      g.fillStyle = grass; g.fillRect(0, 0, W, H);
      for (const rd of run.roads) {
        const B = S.laneBoundaries(rd), L = B[B.length - 1], R = B[0];
        g.fillStyle = asphalt; g.beginPath(); L.x.forEach((x, i) => { const [px, py] = P(x, L.y[i]); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); for (let i = R.x.length - 1; i >= 0; i--) { const [px, py] = P(R.x[i], R.y[i]); g.lineTo(px, py); } g.closePath(); g.fill();
        for (const bd of B) { g.strokeStyle = paint; g.lineWidth = bd.solid ? 1.5 : 1; g.setLineDash(bd.solid ? [] : [6, 6]); g.beginPath(); bd.x.forEach((x, i) => { const [px, py] = P(x, bd.y[i]); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.stroke(); }
        g.setLineDash([]);
      }
      // the road points clicked so far
      g.fillStyle = dark ? '#fafafa' : '#18181b';
      for (const [cx, cy] of clicked) { const [px, py] = P(cx, cy); g.beginPath(); g.arc(px, py, 2.5, 0, 2 * Math.PI); g.fill(); }
      // the sensors' coverage, from the ego vehicle
      const sp = specOf(design);
      if (result.run) sp.sensors.forEach((se) => {
        if (se.kind === 'lidar') return;
        const fov = ((se.fov ?? (se.kind === 'radar' ? 20 : 40)) * Math.PI) / 180, R = Math.min(se.range ?? (se.kind === 'radar' ? 174 : 150), 120), m = se.mount ?? [0, 0, 0];
        const cx = ego.x + m[0] * Math.cos(ego.yaw), cy = ego.y + m[0] * Math.sin(ego.yaw);
        g.fillStyle = se.kind === 'radar' ? 'rgba(220,38,38,0.10)' : 'rgba(22,163,74,0.12)'; g.beginPath(); g.moveTo(...P(cx, cy));
        for (let a = -fov / 2; a <= fov / 2 + 1e-9; a += fov / 24) g.lineTo(...P(cx + R * Math.cos(ego.yaw + a), cy + R * Math.sin(ego.yaw + a)));
        g.closePath(); g.fill();
      });
      // lidar points of the nearest cloud
      const cloud = [...run.clouds].reverse().find((c) => c.t <= run.t[kk] + 1e-9);
      if (cloud) { g.fillStyle = dark ? '#a78bfa' : '#7c3aed'; for (const p of cloud.pts) { if (p[2] < 0.1) continue; const ex = p[0], ey = p[1]; const [px, py] = P(ego.x + ex * Math.cos(ego.yaw) - ey * Math.sin(ego.yaw), ego.y + ex * Math.sin(ego.yaw) + ey * Math.cos(ego.yaw)); g.fillRect(px - 0.75, py - 0.75, 1.5, 1.5); } }
      if (cloud) {
        let found = boxes.current.get(cloud);
        if (!found) {
          const down = PC.voxelDown(cloud.pts as PC.P3[], 0.25).filter((p) => p[2] > 0.25), c = PC.cluster(down, 0.8, 8);
          found = Array.from({ length: c.count }, (_, i) => PC.fitCuboid(down.filter((_, j) => c.labels[j] === i + 1)));
          boxes.current.set(cloud, found);
        }
        g.strokeStyle = dark ? '#fbbf24' : '#d97706'; g.lineWidth = 1.5;
        for (const [bx, by, , L, Wd, , yw] of found) {
          const a2 = (yw * Math.PI) / 180, cs = Math.cos(a2), sn = Math.sin(a2);
          g.beginPath();
          [[L / 2, Wd / 2], [-L / 2, Wd / 2], [-L / 2, -Wd / 2], [L / 2, -Wd / 2]].forEach(([u, v], j) => { const ex = bx + u * cs - v * sn, ey = by + u * sn + v * cs; const [px, py] = P(ego.x + ex * Math.cos(ego.yaw) - ey * Math.sin(ego.yaw), ego.y + ex * Math.sin(ego.yaw) + ey * Math.cos(ego.yaw)); if (j) g.lineTo(px, py); else g.moveTo(px, py); });
          g.closePath(); g.stroke();
        }
      }
      run.poses.forEach((p, i) => {
        const C = S.corners(run.actors[i], p[kk]);
        g.fillStyle = i === egoI ? '#2563eb' : COLOURS[run.actors[i].cls]; g.strokeStyle = dark ? '#09090b' : '#ffffff'; g.lineWidth = 1;
        g.beginPath(); C.forEach(([x, y], j) => { const [px, py] = P(x, y); if (j) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); g.fill(); g.stroke();
      });
      run.detections.filter((d) => Math.abs(d.t - run.t[kk]) < 1e-9).forEach((d) => {
        const se = sp.sensors[d.sensor], m = se.mount ?? [0, 0, 0], ex = m[0] + d.x, ey = m[1] + d.y;
        const [px, py] = P(ego.x + ex * Math.cos(ego.yaw) - ey * Math.sin(ego.yaw), ego.y + ex * Math.sin(ego.yaw) + ey * Math.cos(ego.yaw));
        g.strokeStyle = se.kind === 'radar' ? '#dc2626' : '#16a34a'; g.lineWidth = 1.5; g.beginPath();
        if (se.kind === 'radar') g.arc(px, py, 3.5, 0, 2 * Math.PI); else { g.moveTo(px, py - 4); g.lineTo(px + 3.5, py + 3); g.lineTo(px - 3.5, py + 3); g.closePath(); }
        g.stroke();
      });
      // the confirmed tracks: a square at each, its number, and where it is heading in the next second
      for (const tk of tracks?.steps[kk]?.tracks.filter((x) => x.confirmed) ?? []) {
        const [px, py] = P(tk.x, tk.y), [qx, qy] = P(tk.x + tk.vx, tk.y + tk.vy);
        g.strokeStyle = dark ? '#38bdf8' : '#0284c7'; g.lineWidth = 1.5; g.strokeRect(px - 5, py - 5, 10, 10);
        g.beginPath(); g.moveTo(px, py); g.lineTo(qx, qy); g.stroke();
        g.fillStyle = g.strokeStyle; g.font = '11px Inter, sans-serif'; g.fillText(String(tk.id), px + 7, py - 6);
      }
      g.fillStyle = ink; g.font = '12px Inter, sans-serif'; g.fillText(`${run.t[kk].toFixed(1)} s`, 8, 16);
    }
    // ——— chase camera ———
    const c = setup(chase.current);
    if (c) {
      const sky = c.createLinearGradient(0, 0, 0, H * 0.45); sky.addColorStop(0, dark ? '#0b1220' : '#bcd6f2'); sky.addColorStop(1, dark ? '#1e293b' : '#e8f0fa');
      c.fillStyle = sky; c.fillRect(0, 0, W, H); c.fillStyle = grass; c.fillRect(0, H * 0.42, W, H);
      const cy = Math.cos(ego.yaw), sy = Math.sin(ego.yaw), camX = ego.x - 11 * cy, camY = ego.y - 11 * sy, camZ = 4.2, pitch = 0.16, F = W * 0.9;
      const proj = (x: number, y: number, z: number): [number, number, number] | null => {
        const dx = x - camX, dy = y - camY, fwd = dx * cy + dy * sy, right = dx * sy - dy * cy, up = z - camZ;
        const f2 = fwd * Math.cos(pitch) - up * Math.sin(pitch), u2 = fwd * Math.sin(pitch) + up * Math.cos(pitch);
        if (f2 < 0.5) return null;
        return [W / 2 + (F * right) / f2, H * 0.42 - (F * u2) / f2, f2];
      };
      // each filled shape also outlined in its own colour, so neighbouring strips meet without a hairline between them
      const quad = (pts: ([number, number, number] | null)[], fill: string) => { if (pts.some((p) => !p)) return; c.fillStyle = fill; c.strokeStyle = fill; c.lineWidth = 1; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p![0], p![1]) : c.moveTo(p![0], p![1]))); c.closePath(); c.fill(); c.stroke(); };
      for (const rd of run.roads) {
        const B = S.laneBoundaries(rd), L = B[B.length - 1], R = B[0], near = (i: number) => { const d = (rd.x[i] - ego.x) * cy + (rd.y[i] - ego.y) * sy; return d > -15 && d < 160; };
        for (let i = rd.x.length - 2; i >= 0; i -= 1) if (near(i)) quad([proj(L.x[i], L.y[i], 0), proj(L.x[i + 1], L.y[i + 1], 0), proj(R.x[i + 1], R.y[i + 1], 0), proj(R.x[i], R.y[i], 0)], asphalt);
        for (const bd of B) { c.strokeStyle = paint; c.lineWidth = 1.5; for (let i = 0; i + 1 < bd.x.length; i++) { if (!near(i) || (!bd.solid && Math.floor(i / 6) % 2)) continue; const a = proj(bd.x[i], bd.y[i], 0.01), q = proj(bd.x[i + 1], bd.y[i + 1], 0.01); if (!a || !q) continue; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(q[0], q[1]); c.stroke(); } }
      }
      // cuboids far to near, each face drawn far to near
      const order = run.poses.map((p, i) => ({ i, d: Math.hypot(p[kk].x - camX, p[kk].y - camY) })).sort((a, b) => b.d - a.d);
      for (const { i } of order) {
        const a = run.actors[i], C = S.corners(a, run.poses[i][kk]), base = i === egoI ? '#2563eb' : COLOURS[a.cls];
        const faces = [[0, 1], [1, 2], [2, 3], [3, 0]].map(([p, q]) => ({ pts: [proj(C[p][0], C[p][1], 0), proj(C[q][0], C[q][1], 0), proj(C[q][0], C[q][1], a.H), proj(C[p][0], C[p][1], a.H)], d: Math.hypot((C[p][0] + C[q][0]) / 2 - camX, (C[p][1] + C[q][1]) / 2 - camY) })).sort((x, y) => y.d - x.d);
        faces.forEach((fc, j) => quad(fc.pts, shade(base, 0.75 + 0.08 * j)));
        quad(C.map(([x, y]) => proj(x, y, a.H)), shade(base, 1.08));
      }
    }
  });
  useEffect(() => { draw(); });
  useEffect(() => { const ro = new ResizeObserver(() => draw()); if (box.current) ro.observe(box.current); return () => ro.disconnect(); }, []);

  const onCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode === 'look') return;
    const rect = e.currentTarget.getBoundingClientRect(), v = view.current, x = v.x0 + (e.clientX - rect.left) / v.s, y = v.y0 - (e.clientY - rect.top) / v.s;
    setPreset(-1);
    if (mode === 'road') { setDesign((d) => { const roads = d.roads.length ? [...d.roads] : [{ centers: [] as [number, number][], lanes: 2, laneWidth: 3.6 }]; const last = roads[roads.length - 1]; roads[roads.length - 1] = { ...last, centers: [...last.centers, [x, y]] }; return { ...d, roads }; }); return; }
    // an actor: cars follow the road from the nearest point to its end; people cross it
    setDesign((d) => {
      const rd = d.roads.find((r) => r.centers.length >= 2);
      let path: [number, number][] = [[x, y], [x + 1, y]];
      if (rd) {
        const R = S.makeRoad(rd); let q0 = 0, bd = Infinity; R.x.forEach((rx, q) => { const dd = Math.hypot(rx - x, R.y[q] - y); if (dd < bd) { bd = dd; q0 = q; } });
        if (mode === 'pedestrian') { const nx = -Math.sin(R.h[q0]), ny = Math.cos(R.h[q0]), w = rd.lanes * rd.laneWidth / 2 + 3; path = [[R.x[q0] + nx * w, R.y[q0] + ny * w], [R.x[q0] - nx * w, R.y[q0] - ny * w]]; }
        else { const lat = -(x - R.x[q0]) * Math.sin(R.h[q0]) + (y - R.y[q0]) * Math.cos(R.h[q0]); path = []; for (let q = q0; q < R.x.length; q += 20) path.push([R.x[q] - lat * Math.sin(R.h[q]), R.y[q] + lat * Math.cos(R.h[q])]); if (path.length < 2) path.push([R.x[R.x.length - 1], R.y[R.y.length - 1]]); }
      }
      return { ...d, actors: [...d.actors, { cls: mode, path, speed: mode === 'pedestrian' ? 1.4 : speed, wait: 0 }] };
    });
  };
  const download = () => {
    const roads = design.roads.filter((r) => r.centers.length >= 2);
    if (!roads.length) return;
    const url = URL.createObjectURL(new Blob([S.writeOpenDRIVE(roads, 'Hyperion scenario')], { type: 'application/xml' })), a = document.createElement('a');
    a.href = url; a.download = 'scenario.xodr'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  // M576: roads from a map file (OpenStreetMap or OpenDRIVE), read here in the browser; the actors start afresh
  const [mapError, setMapError] = useState('');
  const loadMap = async (f: File | undefined) => {
    setMapError('');
    if (!f) return;
    try {
      if (f.size > 20_000_000) throw new Error('That file is over 20 MB.');
      const text = await f.text(), roads = /\.xodr$/i.test(f.name) ? S.readOpenDRIVE(text) : readOSM(text).roads.slice(0, 60);
      setPreset(-1); setDesign((d) => ({ ...d, roads: roads.map((r) => ({ centers: r.centers, lanes: r.lanes, laneWidth: r.laneWidth, name: r.name })), actors: [] })); setK(0); setMode('car');
    } catch (e) { setMapError((e as Error).message); }
  };
  const openInCode = async () => router.push(`/hyperion#${await shareFragment({ name: 'scenario.m', view: 'code', code: codeOf(design) })}`);
  const D = run?.detections ?? [], seen = new Set(D.filter((d) => d.truth >= 0).map((d) => d.truth)).size;
  const { label, small } = ui;
  return (
    <div className="flex gap-3">
      <aside className="panel flex w-[19rem] shrink-0 flex-col gap-3 self-start p-4" aria-label="The scenario" data-no-motion>
        <label className={label}>Start from
          <select className="input mt-1 w-full" value={preset} onChange={(e) => { const i = +e.target.value; if (i >= 0) { setPreset(i); setDesign(PRESETS[i].make()); setK(0); } }}>
            {preset < 0 && <option value={-1}>Your own scenario</option>}
            {PRESETS.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
          </select>
        </label>
        <fieldset className="space-y-1.5">
          <legend className={label}>Click the bird&apos;s-eye view to</legend>
          <div className="flex flex-wrap gap-1.5">
            {([['look', 'Just look'], ['road', 'Add road points'], ['car', 'Add a car'], ['truck', 'Add a truck'], ['pedestrian', 'Add a person']] as const).map(([m, t]) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={cn(small, 'border border-zinc-200 dark:border-white/15', mode === m && ui.on)}>{t}</button>)}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={small} onClick={() => { setPreset(-1); setDesign((d) => ({ ...d, roads: [...d.roads, { centers: [], lanes: 2, laneWidth: 3.6 }] })); setMode('road'); }}>New road</button>
            <button type="button" className={small} onClick={() => { setPreset(-1); setDesign((d) => ({ ...d, roads: [], actors: [] })); setK(0); }}><Trash2 className="h-3.5 w-3.5" aria-hidden />Clear all</button>
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="New cars' speed" unit="m/s" value={speed} onChange={setSpeed} min={0} />
          <NumField label="Run for" unit="s" value={design.stop} onChange={(v) => { setDesign((d) => ({ ...d, stop: Math.min(60, Math.max(1, v)) })); }} min={1} />
          {design.roads.length > 0 && <>
            <NumField label="Lanes" value={design.roads[design.roads.length - 1].lanes} onChange={(v) => setDesign((d) => ({ ...d, roads: d.roads.map((r, i) => (i === d.roads.length - 1 ? { ...r, lanes: Math.min(8, Math.max(1, Math.round(v))) } : r)) }))} min={1} />
            <NumField label="Lane width" unit="m" value={design.roads[design.roads.length - 1].laneWidth} onChange={(v) => setDesign((d) => ({ ...d, roads: d.roads.map((r, i) => (i === d.roads.length - 1 ? { ...r, laneWidth: Math.min(6, Math.max(2, v)) } : r)) }))} min={2} />
          </>}
        </div>
        <fieldset className="space-y-1 border-t border-zinc-200/80 pt-3 dark:border-white/10">
          <legend className={label}>Sensors on the ego car (blue)</legend>
          {([['vision', 'Camera (objects and lanes)'], ['radar', 'Radar'], ['lidar', 'Lidar (points, and the boxes it finds)']] as const).map(([key, t]) => <label key={key} className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" className="accent-violet-600" checked={design[key]} onChange={(e) => setDesign((d) => ({ ...d, [key]: e.target.checked }))} />{t}</label>)}
        </fieldset>
        <div className="flex flex-wrap gap-1.5 border-t border-zinc-200/80 pt-3 dark:border-white/10">
          <label className={cn(small, 'cursor-pointer')}>Load a map (.osm, .xodr)<input type="file" accept=".osm,.xodr,.xml" className="sr-only" onChange={(e) => { void loadMap(e.target.files?.[0]); e.target.value = ''; }} /></label>
          <button type="button" className={small} onClick={download} disabled={!design.roads.some((r) => r.centers.length >= 2)}><Download className="h-3.5 w-3.5" aria-hidden />OpenDRIVE (.xodr)</button>
          <button type="button" className={small} onClick={() => void openInCode()}><Code2 className="h-3.5 w-3.5" aria-hidden />Open in Code</button>
        </div>
      </aside>
      <section ref={box} className="panel flex min-w-0 flex-1 flex-col gap-3 p-3" aria-label="The run" data-no-motion>
        {mapError && <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{mapError}</p>}
        {!design.actors.length && <p className="rounded-lg bg-zinc-50 p-2.5 text-xs text-zinc-700 dark:bg-white/[0.04] dark:text-zinc-200">Choose “Add a car” and click on a road: the first car is the ego car, which carries the sensors.</p>}
        {result.error && <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{result.error}</p>}
        <div className="flex items-center gap-2">
          <button type="button" className={cn(small, 'border border-zinc-200 dark:border-white/15')} disabled={!run} onClick={() => setPlaying((p) => !p)}>{playing ? <><Pause className="h-3.5 w-3.5" aria-hidden />Pause</> : <><Play className="h-3.5 w-3.5" aria-hidden />Play</>}</button>
          <input type="range" min={0} max={Math.max(0, n - 1)} value={kk} onChange={(e) => { setPlaying(false); setK(+e.target.value); }} className="min-w-0 flex-1 accent-violet-600" aria-label="Time in the run" aria-valuetext={`${run?.t[kk]?.toFixed(1) ?? 0} seconds`} />
        </div>
        <div className="flex flex-wrap gap-3">
          <canvas ref={top} onClick={onCanvas} className={cn('rounded-xl', mode !== 'look' && 'cursor-crosshair')} role="img" aria-label={`Bird's-eye view at ${run?.t[kk]?.toFixed(1) ?? 0} s: ${run?.actors.length ?? 0} actors, the sensors' coverage and detections`} />
          <canvas ref={chase} className="rounded-xl" role="img" aria-label="Chase camera behind the ego car" />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {[['Actors', String(run?.actors.length ?? 0)], ['Detections', String(D.length)], ['Actors ever seen', String(seen)], ['Tracks now (mean GOSPA)', tracks ? `${tracks.steps[kk]?.tracks.filter((x) => x.confirmed).length ?? 0} (${tracks.mean.toFixed(2)} m)` : '–'], ['Collisions', run ? (run.collisions.length ? run.collisions.map((x) => `${x.t.toFixed(1)} s`).join(', ') : 'none') : '–']].map(([a, b]) => <div key={a} className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-white/[0.04]"><p className="text-xs text-zinc-500 dark:text-zinc-400">{a}</p><p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{b}</p></div>)}
        </div>
      </section>
    </div>
  );
}
/** A colour made lighter or darker (k > 1 lighter). */
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16), f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 1 ? c + (255 - c) * (k - 1) : c * k)));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}
