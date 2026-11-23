'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Maximize } from 'lucide-react';
import { frames, origin, parentOf, type Arm, type V3 } from '@/lib/lab/robot';

// Hyperion Simulate → Machines → Arm (M482): the arm in three.js, set up as Simulate's 3D parts view (M413): lit
// links between the joints, a ball at each joint, the tool's axes, the target, a floor grid. Drag turns it, the wheel
// zooms, right-drag moves it. three.js is loaded only when the arm is shown. Arms that move in a vertical plane
// (gravity along −y) are turned so that "down" is down.

type Three = typeof import('three');
interface Scene3 {
  T: Three; renderer: import('three').WebGLRenderer; scene: import('three').Scene; camera: import('three').PerspectiveCamera;
  controls: { update(): void; target: import('three').Vector3; dispose(): void; addEventListener(t: string, f: () => void): void };
  group: import('three').Group; floor: import('three').GridHelper; render: () => void; fitted: string;
}

export function ArmView({ arm, q, target, dark, label, hot, ball }: { arm: Arm; q: number[]; target: V3 | null; dark: boolean; label: string; hot?: Set<number>; ball?: number[] | null }) {
  const box = useRef<HTMLDivElement>(null), s3 = useRef<Scene3 | null>(null);
  const latest = useRef({ arm, q, target, dark, hot, ball });
  useEffect(() => { latest.current = { arm, q, target, dark, hot, ball }; });
  const [refit, setRefit] = useState(0);

  const build = useEffectEvent(() => {
    const st = s3.current;
    if (!st) return;
    const { T, group } = st, { arm: a, q: qq, target: tg, dark: dk, hot: hl, ball: bl } = latest.current;
    for (const c of [...group.children]) { group.remove(c); (c as import('three').Mesh).geometry?.dispose(); ((c as import('three').Mesh).material as import('three').Material | undefined)?.dispose(); }
    const F = frames(a, qq), P = F.map(origin), reach = a.links.reduce((s, l) => s + Math.abs(l.a) + Math.abs(l.d) + (l.type === 'P' ? l.limits[1] : 0), 0) || 1;
    const r = reach * 0.025;
    const linkMat = (red = false) => new T.MeshStandardMaterial({ color: red ? 0xdc2626 : dk ? 0xa1a1aa : 0x9ca3af, metalness: 0.35, roughness: 0.45 });
    const jointMat = () => new T.MeshStandardMaterial({ color: 0x7c3aed, metalness: 0.2, roughness: 0.4 });
    // A pedestal under the base.
    const base = new T.Mesh(new T.CylinderGeometry(r * 2.4, r * 2.8, r * 1.2, 32), linkMat());
    base.rotation.x = Math.PI / 2; base.position.set(0, 0, -r * 0.6); group.add(base);
    // Each link from where it hangs (its parent's end: arms that branch draw every branch).
    for (let i = 0; i < P.length - 1; i++) {
      const pf = parentOf(a, i) + 1, A = new T.Vector3(...P[pf]), B = new T.Vector3(...P[i + 1]), len = A.distanceTo(B);
      if (len > 1e-6) {
        const cyl = new T.Mesh(new T.CylinderGeometry(r, r, len, 24), linkMat(!!hl?.has(i)));
        cyl.position.copy(A.clone().add(B).multiplyScalar(0.5));
        cyl.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), B.clone().sub(A).normalize());
        group.add(cyl);
      }
      // The joint: a short drum along its axis (z of the frame before it).
      const z = new T.Vector3(F[pf][2], F[pf][6], F[pf][10]);
      const drum = new T.Mesh(a.links[i].type === 'R' ? new T.CylinderGeometry(r * 1.5, r * 1.5, r * 2.6, 28) : new T.BoxGeometry(r * 2.4, r * 3, r * 2.4), jointMat());
      drum.position.copy(A); drum.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), z); group.add(drum);
    }
    // Each tip's axes (a link nothing hangs from): x red, y green, z blue.
    a.links.forEach((_, i) => {
      if (a.links.some((__, j) => parentOf(a, j) === i)) return;
      const tool = F[i + 1], o = new T.Vector3(...P[i + 1]);
      [0xdc2626, 0x16a34a, 0x2563eb].forEach((c, k) => group.add(new T.ArrowHelper(new T.Vector3(tool[k], tool[4 + k], tool[8 + k]), o, reach * 0.14, c, reach * 0.04, reach * 0.025)));
    });
    if (bl) { const b = new T.Mesh(new T.SphereGeometry(bl[3], 28, 18), new T.MeshStandardMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.55 })); b.position.set(bl[0], bl[1], bl[2]); group.add(b); }
    if (tg) { const s = new T.Mesh(new T.SphereGeometry(r * 1.3, 20, 14), new T.MeshStandardMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.8 })); s.position.set(...tg); group.add(s); }
    // Planar arms: their gravity is along −y, so turn the world for "down" to be down.
    const planar = a.gravity[2] === 0 && a.gravity[1] !== 0;
    group.rotation.set(planar ? Math.PI / 2 : 0, 0, 0);
    st.floor.position.set(0, 0, planar ? -reach * 1.05 : -r * 1.2);
    st.floor.scale.setScalar(reach * 1.2);
    if (st.fitted !== a.name) {
      st.controls.target.set(0, 0, planar ? 0 : reach * 0.35);
      st.camera.position.set(reach * 1.6, -reach * 2.2, reach * 1.3);
      st.camera.near = reach / 200; st.camera.far = reach * 50; st.camera.updateProjectionMatrix();
      st.controls.update(); st.fitted = a.name;
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
      const scene = new T.Scene(), camera = new T.PerspectiveCamera(35, el.clientWidth / Math.max(1, el.clientHeight), 0.01, 1e4);
      camera.up.set(0, 0, 1);
      scene.add(new T.AmbientLight(0xffffff, 1.0));
      const sun = new T.DirectionalLight(0xffffff, 1.8); sun.position.set(2, -3, 5); scene.add(sun);
      const back = new T.DirectionalLight(0xffffff, 0.5); back.position.set(-3, 2, -1); scene.add(back);
      const floor = new T.GridHelper(2, 20, 0x8b8b94, 0xc4c4cc); floor.rotation.x = Math.PI / 2; scene.add(floor);
      const group = new T.Group(); scene.add(group);
      const controls = new OrbitControls(camera, renderer.domElement);
      const render = () => renderer.render(scene, camera);
      controls.addEventListener('change', render);
      s3.current = { T, renderer, scene, camera, controls, group, floor, render, fitted: '' };
      ro = new ResizeObserver(() => { renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / Math.max(1, el.clientHeight); camera.updateProjectionMatrix(); render(); });
      ro.observe(el);
      build();
    })();
    return () => {
      gone = true; ro?.disconnect();
      const st = s3.current;
      if (st) { for (const c of st.group.children) (c as import('three').Mesh).geometry?.dispose(); st.floor.geometry.dispose(); st.controls.dispose(); st.renderer.dispose(); st.renderer.domElement.remove(); }
      s3.current = null;
    };
  }, []);
  useEffect(() => { void refit; build(); });

  return (
    <div className="relative h-full min-h-[18rem] w-full overflow-hidden" data-no-arrange data-no-motion>
      <div ref={box} className="absolute inset-0 [&>canvas]:block" role="img" aria-label={label} />
      <p className="pointer-events-none absolute bottom-2 start-2 rounded-md bg-white/85 px-2 py-1 text-[11px] text-zinc-600 dark:bg-zinc-900/85 dark:text-zinc-300">Drag to turn · wheel to zoom · right-drag to move</p>
      <button type="button" aria-label="Back to the first view" className="absolute end-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-zinc-700 shadow-sm ring-1 ring-zinc-200 hover:bg-white dark:bg-zinc-800/90 dark:text-zinc-100 dark:ring-white/10" onClick={() => { if (s3.current) { s3.current.fitted = ''; setRefit((n) => n + 1); } }}><Maximize className="h-4 w-4" aria-hidden /></button>
    </div>
  );
}
