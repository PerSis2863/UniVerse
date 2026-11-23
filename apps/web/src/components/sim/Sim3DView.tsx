'use client';

import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Maximize } from 'lucide-react';
import { BANDS, bandColors, levels, legendNum } from '@/lib/sim/contour';
import type { SolidOut } from './sim.worker';
import type { SimView } from './SimCanvas';

// Hyperion Simulate → 3D parts (M413): the solid in three.js, coloured in the same 9 bands as the flat view (a 9-pixel
// texture with nearest sampling keeps the band edges crisp), lit so its shape reads, bent by the result (shown ×N,
// breathing when animated), the undeformed outline in thin lines, the mesh on request. Drag turns it, the wheel zooms,
// right-drag moves it. three.js is loaded only when a 3D part is shown.

interface Props {
  solid: SolidOut;
  shown: { ux: Float64Array; uy: Float64Array; uz: Float64Array; values: Float64Array; name: string; unit: string; reverse?: boolean } | null;
  showMesh: boolean; playing: boolean; dark: boolean; label: string; deform: 'auto' | 'true' | 'none';
  ref?: Ref<SimView>;
}
type Three = typeof import('three');
interface Scene3 {
  T: Three; renderer: import('three').WebGLRenderer; scene: import('three').Scene; camera: import('three').PerspectiveCamera;
  controls: { update(): void; target: import('three').Vector3; dispose(): void; addEventListener(t: string, f: () => void): void };
  group: import('three').Group; tex: import('three').DataTexture; render: () => void; fitted: boolean;
}

// The 4 small triangles of a 6-node face (corners 0–2, middles 3 = 01, 4 = 12, 5 = 20).
const SUB = [[0, 3, 5], [3, 1, 4], [5, 4, 2], [3, 4, 5]];

export function Sim3DView({ solid, shown, showMesh, playing, dark, label, deform, ref }: Props) {
  const box = useRef<HTMLDivElement>(null), s3 = useRef<Scene3 | null>(null), phase = useRef(1);
  const latest = useRef({ solid, shown, showMesh, dark, deform });
  useEffect(() => { latest.current = { solid, shown, showMesh, dark, deform }; });

  const [refit, setRefit] = useState(0);
  // Rebuilds the part (on new data, or each frame while animating).
  const build = useEffectEvent(() => {
    const st = s3.current;
    if (!st) return;
    const { T, group } = st, { solid: sd, shown: sh, showMesh: mesh, dark: dk, deform: df } = latest.current;
    for (const c of [...group.children]) { group.remove(c); (c as import('three').Mesh).geometry?.dispose(); ((c as import('three').Mesh).material as import('three').Material | undefined)?.dispose(); }
    let maxU = 0;
    if (sh) for (let i = 0; i < sh.ux.length; i++) maxU = Math.max(maxU, Math.hypot(sh.ux[i], sh.uy[i], sh.uz[i]));
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < sd.x.length; i++) { lo = Math.min(lo, sd.x[i], sd.y[i], sd.z[i]); hi = Math.max(hi, sd.x[i], sd.y[i], sd.z[i]); }
    const span = hi - lo || 1, k = !sh || df === 'none' ? 0 : (df === 'true' ? 1 : maxU > 0 ? (0.07 * span) / maxU : 0) * phase.current;
    const P = (n: number) => [sd.x[n] + (sh ? k * sh.ux[n] : 0), sd.y[n] + (sh ? k * sh.uy[n] : 0), sd.z[n] + (sh ? k * sh.uz[n] : 0)];
    const vMin = sh ? Math.min(...sh.values) : 0, vMax = sh ? Math.max(...sh.values) : 1, vSpan = vMax - vMin || 1;
    const faces = sd.surface.length / 6, pos = new Float32Array(faces * 4 * 9), uv = new Float32Array(faces * 4 * 6);
    let p = 0, q = 0;
    for (let f = 0; f < faces; f++) for (const t of SUB) for (const loc of t) {
      const n = sd.surface[f * 6 + loc], xyz = P(n);
      pos[p++] = xyz[0]; pos[p++] = xyz[1]; pos[p++] = xyz[2];
      // Each value lands inside its band's pixel (the edges of the texture are the band limits).
      uv[q++] = sh ? Math.min(0.9999, Math.max(0.0001, (sh.values[n] - vMin) / vSpan)) : 0.5; uv[q++] = 0.5;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const body = new T.Mesh(g, sh ? new T.MeshLambertMaterial({ map: st.tex, side: T.DoubleSide }) : new T.MeshLambertMaterial({ color: dk ? 0x71717a : 0xb8bcc6, side: T.DoubleSide }));
    group.add(body);
    // Lines: the mesh (each face's sides through their middles) or, bent, the shape as it was.
    const lines: number[] = [];
    if (mesh) for (let f = 0; f < faces; f++) for (const [a, m, b] of [[0, 3, 1], [1, 4, 2], [2, 5, 0]]) { const A = P(sd.surface[f * 6 + a]), M = P(sd.surface[f * 6 + m]), B = P(sd.surface[f * 6 + b]); lines.push(...A, ...M, ...M, ...B); }
    if (lines.length) { const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.BufferAttribute(new Float32Array(lines), 3)); group.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: dk ? 0xffffff : 0x000000, transparent: true, opacity: 0.25 }))); }
    if (k > 0) {
      const flat = new T.BufferGeometry(), fp: number[] = [];
      for (let f = 0; f < faces; f++) for (const loc of [0, 1, 2]) { const n = sd.surface[f * 6 + loc]; fp.push(sd.x[n], sd.y[n], sd.z[n]); }
      flat.setAttribute('position', new T.BufferAttribute(new Float32Array(fp), 3));
      group.add(new T.LineSegments(new T.EdgesGeometry(flat, 25), new T.LineBasicMaterial({ color: dk ? 0xa1a1aa : 0x52525b, transparent: true, opacity: 0.7 })));
      flat.dispose();
    }
    if (!st.fitted) {
      // A first view from the front, a little above and to the side.
      const cx = (Math.min(...sd.x) + Math.max(...sd.x)) / 2, cy = (Math.min(...sd.y) + Math.max(...sd.y)) / 2;
      st.controls.target.set(cx, cy, 0);
      st.camera.position.set(cx + span * 0.55, cy + span * 0.45, span * 2.1);
      st.camera.near = span / 200; st.camera.far = span * 20; st.camera.updateProjectionMatrix();
      st.controls.update(); st.fitted = true;
    }
    st.scene.background = new T.Color(dk ? 0x18181b : 0xffffff);
    st.render();
  });

  useEffect(() => {
    let gone = false, ro: ResizeObserver | null = null;
    void (async () => {
      const T = await import('three'), { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      const el = box.current;
      if (gone || !el) return;
      const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(el.clientWidth, el.clientHeight);
      el.appendChild(renderer.domElement);
      renderer.domElement.setAttribute('aria-hidden', 'true');
      const scene = new T.Scene(), camera = new T.PerspectiveCamera(35, el.clientWidth / Math.max(1, el.clientHeight), 0.1, 1e6);
      scene.add(new T.AmbientLight(0xffffff, 1.1));
      const sun = new T.DirectionalLight(0xffffff, 1.6); sun.position.set(1, 2, 3); scene.add(sun);
      const back = new T.DirectionalLight(0xffffff, 0.5); back.position.set(-2, -1, -2); scene.add(back);
      const group = new T.Group(); scene.add(group);
      const cols = bandColors(latest.current.shown?.reverse), data = new Uint8Array(BANDS * 4);
      cols.forEach((c, i) => { const [r, g, b] = c.match(/\d+/g)!.map(Number); data.set([r, g, b, 255], i * 4); });
      const tex = new T.DataTexture(data, BANDS, 1); tex.magFilter = T.NearestFilter; tex.minFilter = T.NearestFilter; tex.colorSpace = T.SRGBColorSpace; tex.needsUpdate = true;
      const controls = new OrbitControls(camera, renderer.domElement);
      const render = () => renderer.render(scene, camera);
      controls.addEventListener('change', render);
      s3.current = { T, renderer, scene, camera, controls, group, tex, render, fitted: false };
      ro = new ResizeObserver(() => { renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / Math.max(1, el.clientHeight); camera.updateProjectionMatrix(); render(); });
      ro.observe(el);
      build();
    })();
    return () => {
      gone = true; ro?.disconnect();
      const st = s3.current;
      if (st) { for (const c of st.group.children) (c as import('three').Mesh).geometry?.dispose(); st.tex.dispose(); st.controls.dispose(); st.renderer.dispose(); st.renderer.domElement.remove(); }
      s3.current = null;
    };
  }, []);
  useEffect(() => {
    void refit;
    const st = s3.current;
    if (st) {
      // The safety factor's colours turn round.
      const cols = bandColors(shown?.reverse), data = st.tex.image.data as Uint8Array;
      cols.forEach((c, i) => { const [r, g, b] = c.match(/\d+/g)!.map(Number); data.set([r, g, b, 255], i * 4); });
      st.tex.needsUpdate = true;
    }
    build();
  });
  useEffect(() => {
    if (!playing) { phase.current = 1; return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => { phase.current = 0.5 - 0.5 * Math.cos(((t - t0) / 1400) * Math.PI * 2); build(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  useImperativeHandle(ref, () => ({ png: () => new Promise((res) => { const c = s3.current?.renderer.domElement; if (!c) { res(null); return; } s3.current!.render(); c.toBlob((b) => res(b), 'image/png'); }) }), []);

  const values = shown?.values ?? null, lv = values ? levels(Math.min(...values), Math.max(...values)) : null, cols = bandColors(shown?.reverse);
  return (
    <div className="relative h-full min-h-[18rem] w-full overflow-hidden" data-no-arrange data-no-motion>
      <div ref={box} className="absolute inset-0 [&>canvas]:block" role="img" aria-label={label} />
      {values && lv && shown && (
        <div className="pointer-events-none absolute start-2 top-2 rounded-lg bg-white/90 p-2 text-[11px] leading-tight text-zinc-800 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900/90 dark:text-zinc-100 dark:ring-white/10">
          <p className="mb-1 max-w-[11rem] font-semibold">{shown.name}{shown.unit && <span className="font-normal text-zinc-500 dark:text-zinc-400"> ({shown.unit})</span>}</p>
          <ul className="font-mono tabular-nums">
            {Array.from({ length: BANDS + 1 }, (_, i) => BANDS - i).map((i) => (
              <li key={i} className="flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm" style={{ background: cols[Math.min(BANDS - 1, i)], opacity: i === BANDS ? 0 : 1 }} aria-hidden /><span>{legendNum(lv[i])}{i === BANDS ? ' Max' : i === 0 ? ' Min' : ''}</span></li>
            ))}
          </ul>
        </div>
      )}
      <p className="pointer-events-none absolute bottom-2 start-2 rounded-md bg-white/85 px-2 py-1 text-[11px] text-zinc-600 dark:bg-zinc-900/85 dark:text-zinc-300">Drag to turn · wheel to zoom · right-drag to move · {solid.tets.toLocaleString()} tetrahedra</p>
      <button type="button" aria-label="Back to the first view" className="absolute end-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-zinc-700 shadow-sm ring-1 ring-zinc-200 hover:bg-white dark:bg-zinc-800/90 dark:text-zinc-100 dark:ring-white/10" onClick={() => { if (s3.current) { s3.current.fitted = false; setRefit((n) => n + 1); } }}><Maximize className="h-4 w-4" aria-hidden /></button>
    </div>
  );
}
