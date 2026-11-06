'use client';

import { useEffect, useRef } from 'react';
import { THREE, World, approach, glowSprite, mergeGeometries, worldUv } from './world/core';
import { surface } from './world/textures';

// Type Race's race, in 3D (M104, the owner: "realistic graphics to all of them"): a circuit of asphalt
// with painted lanes and red-and-white kerbs through a park, grandstands and a start gantry under an
// afternoon sky; every racer is a race car in their lane, the camera chasing yours. Letters move the
// cars (a lap is `lap` letters round the whole circuit); the nitro lights flames at the exhaust.

export interface Racer { id: string; name: string; chars: number; me: boolean; color: string }

/** The circuit: a closed curve through the park (an oval with a chicane). */
const TRACK = [[0, 40], [34, 38], [56, 20], [54, -10], [36, -26], [12, -24], [-4, -36], [-30, -32], [-50, -12], [-48, 18], [-28, 38]];
const ROAD = 13;

/** A painted road: dark asphalt with grain, white edges and dashed lanes (u across, v along). */
function roadTexture(lanes: number) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2b2c30'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { const v = 30 + Math.random() * 40; g.fillStyle = `rgb(${v},${v},${v + 3})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5); }
  g.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 6; i++) g.fillRect(40 + i * 33, 0, 12, 256);
  g.fillStyle = '#e9e9e4'; g.fillRect(6, 0, 7, 256); g.fillRect(243, 0, 7, 256);
  for (let k = 1; k < lanes; k++) { const x = 13 + (230 / lanes) * k; for (let y = 0; y < 256; y += 64) g.fillRect(x - 2, y, 4, 34); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function stripes(a: string, b: string, n = 4) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 64;
  const g = c.getContext('2d')!;
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(0, (i * 64) / n, 16, 64 / n); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A ribbon along the curve from `inner` to `outer` (metres from the centre line), its v in metres. */
function ribbon(curve: THREE.CatmullRomCurve3, inner: number, outer: number, y: number, vScale: number, n = 480) {
  const len = curve.getLength(), pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = curve.getPointAt(u % 1), t = curve.getTangentAt(u % 1);
    side.crossVectors(t, up).normalize();
    pos.push(p.x + side.x * inner, y, p.z + side.z * inner, p.x + side.x * outer, y, p.z + side.z * outer);
    uv.push(0, (u * len) / vScale, 1, (u * len) / vScale);
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A race car, 4.2 long, nose along +z: clear-coated paint, dark glass, a wing, wheels that turn,
 *  head and tail lights, and an exhaust where the nitro's flames come out. */
function car(color: string) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.06 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a0f18, roughness: 0.04, metalness: 0.3, clearcoat: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.7 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.25, metalness: 0.9 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, at: [number, number, number], parent: THREE.Object3D = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(...at); m.castShadow = true; parent.add(m); return m; };
  const body = new THREE.CapsuleGeometry(0.5, 3.1, 6, 16).rotateX(Math.PI / 2);
  body.scale(1.9, 0.62, 1);
  add(body, paint, [0, 0.55, 0]);
  const cab = new THREE.SphereGeometry(0.7, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  cab.scale(1.05, 0.62, 1.7);
  add(cab, glass, [0, 0.82, -0.25]);
  add(new THREE.BoxGeometry(1.9, 0.06, 0.42), paint, [0, 1.15, -1.95]);
  for (const x of [-0.6, 0.6]) add(new THREE.BoxGeometry(0.06, 0.4, 0.2), dark, [x, 0.95, -1.9]);
  const wheels: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.92, 1.3], [0.92, 1.3], [-0.92, -1.35], [0.92, -1.35]]) {
    const wg = new THREE.Group(); wg.position.set(x, 0.38, z); g.add(wg);
    add(new THREE.CylinderGeometry(0.38, 0.38, 0.32, 18).rotateZ(Math.PI / 2), dark, [0, 0, 0], wg);
    add(new THREE.CylinderGeometry(0.22, 0.22, 0.34, 10).rotateZ(Math.PI / 2), rim, [0, 0, 0], wg);
    wheels.push(wg);
  }
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff4d6).multiplyScalar(2) }), tail = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2d2d).multiplyScalar(1.6) });
  for (const x of [-0.6, 0.6]) { add(new THREE.BoxGeometry(0.34, 0.08, 0.06), lamp, [x, 0.62, 2.04]); add(new THREE.BoxGeometry(0.4, 0.07, 0.06), tail, [x, 0.66, -2.05]); }
  const flames = [glowSprite(0xffb020, 1.1), glowSprite(0x60a5fa, 0.6)];
  flames.forEach((f, i) => { f.position.set(0, 0.45, -2.3 - i * 0.2); f.visible = false; g.add(f); });
  return { g, wheels, flames };
}

/** A name over a car (its picture made once per name). */
function tag(text: string, me: boolean) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '700 30px system-ui, sans-serif';
  const w = Math.min(240, g.measureText(text).width + 36);
  g.fillStyle = me ? '#db2777' : 'rgba(10,10,12,0.75)'; g.beginPath(); g.roundRect((256 - w) / 2, 6, w, 52, 26); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(3.6, 0.9, 1); s.renderOrder = 10;
  return s;
}

export function RaceView({ racers, nitro, lap }: { racers: Racer[]; nitro: boolean; lap: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ racers, nitro, lap });
  useEffect(() => { live.current = { racers, nitro, lap }; });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const w = new World(el, { fov: 30, bg: 0x9ec3ea, haze: [0xbcd3ea, 0.006], glow: { strength: 0.5, radius: 0.4, threshold: 0.9 }, env: 0.8 });
    const sun = w.lights({ sky: 0xdbe8ff, ground: 0x4a5a3a, power: 2.6, at: [30, 45, 20], ambient: 0.6 });
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30 });
    w.sky({ elevation: 30, azimuth: 120, turbidity: 2.4, rayleigh: 2.2, gain: 0.5, env: 0.85 });

    // The park, the circuit, its kerbs, the start line and gantry.
    const curve = new THREE.CatmullRomCurve3(TRACK.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
    const L = curve.getLength();
    const grass = new THREE.Mesh(worldUv(new THREE.PlaneGeometry(500, 500).rotateX(-Math.PI / 2), 8), surface('grass', { color: 0xb8cf96 }));
    grass.receiveShadow = true; w.scene.add(grass);
    const road = new THREE.Mesh(ribbon(curve, -ROAD / 2, ROAD / 2, 0.03, 16), new THREE.MeshStandardMaterial({ map: roadTexture(4), roughness: 0.82, metalness: 0 }));
    road.receiveShadow = true; w.scene.add(road);
    const kerb = new THREE.MeshStandardMaterial({ map: stripes('#e11d48', '#f8fafc'), roughness: 0.6 });
    w.scene.add(new THREE.Mesh(ribbon(curve, -ROAD / 2 - 1, -ROAD / 2, 0.05, 2), kerb), new THREE.Mesh(ribbon(curve, ROAD / 2, ROAD / 2 + 1, 0.05, 2), kerb));
    const start = curve.getPointAt(0), dir = curve.getTangentAt(0);
    const chq = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 128; c.height = 16; const g = c.getContext('2d')!; for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f5f5f5'; g.fillRect(x * 8, y * 8, 8, 8); } return c; })());
    chq.colorSpace = THREE.SRGBColorSpace;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, 1.4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: chq, roughness: 0.7 }));
    line.position.copy(start).setY(0.06); line.lookAt(start.clone().add(dir).setY(0.06)); w.scene.add(line);
    const gantry = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.4, metalness: 0.8 });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), steel); p.position.set(s * (ROAD / 2 + 1.8), 3.5, 0); p.castShadow = true; gantry.add(p); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD + 4.2, 1.1, 0.4), new THREE.MeshStandardMaterial({ map: chq, roughness: 0.5 })); beam.position.y = 6.6; beam.castShadow = true; gantry.add(beam);
    gantry.position.copy(start); gantry.lookAt(start.clone().add(dir)); w.scene.add(gantry);
    // Grandstands along the main straight: stepped seats full of colour, a roof.
    const crowd = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!; g.fillStyle = '#3a3d44'; g.fillRect(0, 0, 128, 128); const cols = ['#f87171', '#60a5fa', '#fbbf24', '#f472b6', '#34d399', '#e5e7eb', '#a78bfa']; for (let i = 0; i < 520; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(Math.random() * 126, Math.floor(Math.random() * 16) * 8, 3, 5); } return c; })());
    crowd.wrapS = crowd.wrapT = THREE.RepeatWrapping; crowd.colorSpace = THREE.SRGBColorSpace;
    const seats = new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.9 });
    const stand = new THREE.Group();
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(worldUv(new THREE.BoxGeometry(34, 1.4, 2.2), 6, [0, 0.7 + k * 1.4, -k * 2.2]), seats); b.position.set(0, 0.7 + k * 1.4, -k * 2.2); b.castShadow = b.receiveShadow = true; stand.add(b); }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(36, 0.3, 10), new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.5 })); roof.position.set(0, 8.4, -3.4); roof.rotation.x = 0.08; roof.castShadow = true; stand.add(roof);
    const mid = curve.getPointAt(0.03), mt = curve.getTangentAt(0.03), out = new THREE.Vector3().crossVectors(mt, new THREE.Vector3(0, 1, 0)).normalize();
    stand.position.copy(mid).addScaledVector(out, -(ROAD / 2 + 5)); stand.lookAt(mid); w.scene.add(stand);
    // Trees round the park, kept off the circuit (one mesh for the trunks, one for the leaves).
    const near = (x: number, z: number) => { let d = 1e9; for (let i = 0; i < 120; i++) { const p = curve.getPointAt(i / 120); d = Math.min(d, Math.hypot(p.x - x, p.z - z)); } return d; };
    const trunks: THREE.BufferGeometry[] = [], crowns: THREE.BufferGeometry[] = [];
    for (let i = 0, tries = 0; i < 70 && tries < 600; tries++) {
      const x = (Math.random() - 0.5) * 200, z = (Math.random() - 0.5) * 200;
      if (near(x, z) < ROAD / 2 + 6 || Math.hypot(x - stand.position.x, z - stand.position.z) < 22) continue;
      const h = 3 + Math.random() * 4;
      trunks.push(new THREE.CylinderGeometry(0.18, 0.28, h * 0.4, 6).translate(x, h * 0.2, z));
      crowns.push(new THREE.IcosahedronGeometry(h * 0.32, 1).scale(1, 1.3, 1).translate(x, h * 0.62, z));
      i++;
    }
    const treeT = new THREE.Mesh(mergeGeometries(trunks), new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 0.9 }));
    const treeC = new THREE.Mesh(mergeGeometries(crowns), new THREE.MeshStandardMaterial({ color: 0x3f6b35, roughness: 0.85, flatShading: true }));
    treeT.castShadow = treeC.castShadow = true; w.scene.add(treeT, treeC);

    // The cars: one per racer, in their own lane.
    const cars = new Map<string, ReturnType<typeof car> & { shown: number; tagS: THREE.Sprite; name: string }>();
    const P = new THREE.Vector3(), T = new THREE.Vector3(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), cam = new THREE.Vector3(), look = new THREE.Vector3();
    let camReady = false;
    w.start((dt) => {
      const { racers: rs, nitro: on, lap: per } = live.current;
      const lanes = Math.max(2, rs.length), lane = Math.min(3, (ROAD - 1) / lanes);
      rs.forEach((r, k) => {
        let c = cars.get(r.id);
        if (!c || c.name !== r.name) {
          if (c) { w.scene.remove(c.g); c.tagS.material.dispose(); }
          const made = car(r.color), tg = tag(r.name, r.me);
          tg.position.y = 2.4; made.g.add(tg);
          c = { ...made, shown: (r.chars / per) * L, tagS: tg, name: r.name };
          cars.set(r.id, c); w.scene.add(c.g);
        }
        // Distance round the circuit, eased toward the letters typed (a lap is `lap` letters).
        const before = c.shown;
        c.shown = approach(c.shown, (r.chars / per) * L, 5, dt);
        const u = (((c.shown % L) + L) % L) / L;
        curve.getPointAt(u, P); curve.getTangentAt(u, T);
        S.crossVectors(T, UP).normalize();
        P.addScaledVector(S, (k - (rs.length - 1) / 2) * lane);
        c.g.position.copy(P);
        c.g.lookAt(P.x + T.x, P.y, P.z + T.z);
        const moved = c.shown - before;
        c.wheels.forEach((wh) => { wh.rotation.x += moved / 0.38; });
        c.flames.forEach((f, i) => { f.visible = r.me && on; if (f.visible) f.scale.setScalar((i ? 0.6 : 1.1) * (0.8 + Math.random() * 0.5)); });
        if (r.me) {
          // The chase camera: behind and above, looking down the road ahead.
          cam.copy(P).addScaledVector(T, -9).setY(3.4);
          look.copy(P).addScaledVector(T, 7).setY(0.8);
          if (!camReady) { w.camera.position.copy(cam); camReady = true; }
          w.camera.position.lerp(cam, 1 - Math.exp(-4 * dt));
          w.camera.lookAt(look);
          w.sunOver(P);
          w.fovBy(on ? 7 : 0);
        }
      });
      for (const [id, c] of cars) if (!rs.some((r) => r.id === id)) { w.scene.remove(c.g); c.tagS.material.dispose(); cars.delete(id); }
    });
    return () => w.dispose();
  }, []);

  const me = racers.find((r) => r.me);
  return (
    <div className="relative h-[max(14rem,calc(var(--play-h)-18.5rem))] overflow-hidden rounded-[1.75rem] bg-[#9ec3ea] ring-1 ring-white/10">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" role="img" aria-label={`Race track: ${racers.map((r) => `${r.name} lap ${Math.floor(r.chars / lap) + 1}`).join(', ')}`} />
      {me && <span className="pointer-events-none absolute end-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white ring-1 ring-white/15">Lap {Math.floor(me.chars / lap) + 1} · {Math.round(((me.chars % lap) / lap) * 100)}%</span>}
    </div>
  );
}
