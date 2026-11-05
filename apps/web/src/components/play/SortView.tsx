'use client';

import { useEffect, useRef } from 'react';
import { BINS, BIN_COLOR, type BeltItem, type Bin } from '@/lib/play/sort';
import { THREE, World, glowSprite } from './world/core';
import { Board } from './world/board';
import { sortables } from './world/props';
import { surface } from './world/textures';

// Recycle Rush's sorting line, in 3D (M104, the owner: "realistic graphics to all of them"): a rubber
// conveyor belt through a recycling plant, the things on it modelled (bottles, cartons, peel, phones…),
// and four wheelie bins below it, laid out under the game's own bin buttons (world/board.ts: the
// buttons are the bins' four columns). A sorted thing flies into its bin and the lid pops; a wrong one
// bounces off; e-waste in the wrong bin starts a small fire; a missed one drops off the end.

export type Done = 'ok' | 'wrong' | 'missed';
export interface SortFeed { belt: BeltItem[]; startsAt: number; clock: () => number; done: Record<number, Done>; bins: Record<number, Bin>; front: number; last: { bin: Bin; ok: boolean; n: number; gained: number; golden: boolean; hazard: boolean } | null; exitMs: number }

/** A rubber belt with cleats (it scrolls along). */
function beltTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1c1d21'; g.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 500; i++) { const v = 22 + Math.random() * 18; g.fillStyle = `rgb(${v},${v},${v + 2})`; g.fillRect(Math.random() * 128, Math.random() * 64, 1.5, 1.5); }
  g.fillStyle = '#2c2d33'; for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 6, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** A bin's front sticker: its stream's symbol in white. */
function sticker(bin: Bin) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = g.fillStyle = '#ffffff'; g.lineWidth = 12; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.lineWidth = 6; g.stroke(); g.lineWidth = 12;
  if (bin === 'recycle') { for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 - Math.PI / 2, b = a + 1.5; g.beginPath(); g.arc(64, 64, 30, a, b); g.stroke(); g.beginPath(); g.moveTo(64 + Math.cos(b) * 30, 64 + Math.sin(b) * 30); g.lineTo(64 + Math.cos(b - 0.35) * 42, 64 + Math.sin(b - 0.35) * 42); g.stroke(); } }
  if (bin === 'compost') { g.beginPath(); g.moveTo(40, 90); g.quadraticCurveTo(40, 40, 92, 36); g.quadraticCurveTo(90, 88, 40, 90); g.fill(); }
  if (bin === 'landfill') { g.beginPath(); g.moveTo(40, 52); g.lineTo(88, 52); g.moveTo(40, 76); g.lineTo(88, 76); g.stroke(); }
  if (bin === 'ewaste') { g.beginPath(); g.moveTo(72, 28); g.lineTo(48, 70); g.lineTo(68, 70); g.lineTo(56, 102); g.lineTo(84, 56); g.lineTo(64, 56); g.closePath(); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A wheelie bin about 1.2 tall: a tapered body in its colour, wheels, a hinged lid, the sticker. */
function wheelieBin(bin: Bin) {
  const g = new THREE.Group(), color = new THREE.Color(BIN_COLOR[bin]);
  const plastic = new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.42, 1.1, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.9), plastic);
  body.position.y = 0.62; body.castShadow = body.receiveShadow = true; g.add(body);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.06, 0.7), plastic); rim.position.y = 1.18; g.add(rim);
  for (const x of [-0.3, 0.3]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 14).rotateZ(Math.PI / 2), dark); w.position.set(x, 0.11, -0.28); g.add(w); }
  const hinge = new THREE.Group(); hinge.position.set(0, 1.21, -0.36); g.add(hinge);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.07, 0.74), plastic); lid.position.set(0, 0.035, 0.37); lid.castShadow = true; hinge.add(lid);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.06), plastic); handle.position.set(0, 0.07, 0.72); hinge.add(handle);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: sticker(bin), transparent: true, depthWrite: false }));
  label.position.set(0, 0.68, 0.43); label.rotation.x = -0.09; g.add(label);
  const flash = new THREE.PointLight(0xff3b3b, 0, 3, 2); flash.position.set(0, 1.4, 0.5); g.add(flash);
  return { g, hinge, flash };
}

export function SortView({ feed, label }: { feed: React.RefObject<SortFeed>; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const w = new World(el, { fov: 30, bg: 0x17181c, haze: [0x17181c, 0.02], glow: { strength: 0.6, radius: 0.5, threshold: 0.85 }, env: 0.7 });
    const board = new Board(w, 'side', 9, 16);
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The plant: a concrete floor, a corrugated wall, warm work lamps.
    w.scene.add(new THREE.HemisphereLight(0xdfe6f0, 0x2a2622, 0.7));
    const key = new THREE.SpotLight(0xffe9c8, 60, 30, 0.75, 0.6, 1.4);
    key.position.set(-3, 8, 7); key.target.position.set(0, -1, 0); key.castShadow = !w.phone; key.shadow.mapSize.set(1024, 1024);
    w.scene.add(key, key.target);
    const fill = new THREE.PointLight(0xcfe0ff, 18, 26, 1.6); fill.position.set(6, 5, 5); w.scene.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 40).rotateX(-Math.PI / 2), surface('concrete', { color: 0x8a8780, rough: 0.6 }));
    floor.receiveShadow = true; w.scene.add(floor);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 24), surface('corrugated', { color: 0x9aa3ad, metal: 0.5, rough: 0.55 }));
    wall.position.z = -7; w.scene.add(wall);
    // The belt, its rails, rollers and legs (laid out to the box whenever it changes size).
    const rubber = beltTexture();
    const beltMat = new THREE.MeshStandardMaterial({ map: rubber, roughness: 0.85 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x8b929c, roughness: 0.35, metalness: 0.85 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5, metalness: 0.3 });
    const line = new THREE.Group(); w.scene.add(line);
    const warn = glowSprite(0xff3b30, 2.2); w.scene.add(warn);
    const bins = BINS.map((b) => { const x = wheelieBin(b); w.scene.add(x.g); return { ...x, bin: b, open: 0, shake: 0, fire: 0, red: 0 }; });
    let unit = 0.02, beltY = 0, left = 0, right = 0, rtl = false;
    const binAt = (i: number) => { const col = rtl ? 3 - i : i; return board.at(((col + 0.5) / 4) * board.W, board.H * 0.94); };
    const layout = () => {
      line.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
      line.clear();
      const W = board.W, H = board.H;
      rtl = getComputedStyle(el).direction === 'rtl';
      unit = board.scale(W / 2, H * 0.36);
      const a = board.at(-W * 0.1, H * 0.36), b = board.at(W * 1.1, H * 0.36);
      beltY = a.y; left = board.at(W * 0.04, H * 0.36).x; right = board.at(W * 0.96, H * 0.36).x;
      const len = b.x - a.x, mid = (a.x + b.x) / 2;
      const top = new THREE.Mesh(new THREE.BoxGeometry(len, 0.22, 1.5), beltMat); top.position.set(mid, beltY - 0.11, 0); top.receiveShadow = true; line.add(top);
      rubber.repeat.set(len / 3, 1);
      for (const z of [-0.82, 0.82]) { const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, 0.12), steel); r.position.set(mid, beltY - 0.02, z); r.castShadow = true; line.add(r); }
      const frame = new THREE.Mesh(new THREE.BoxGeometry(len, 0.35, 1.4), yellow); frame.position.set(mid, beltY - 0.42, 0); line.add(frame);
      // The floor is where the bins stand; the legs reach down to it.
      const ground = binAt(0).y;
      floor.position.y = ground; wall.position.y = ground + 12;
      for (let x = a.x + 1; x < b.x; x += 3.2) for (const z of [-0.55, 0.55]) { const h = beltY - 0.6 - ground; const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, 0.12), steel); leg.position.set(x, ground + h / 2, z); leg.castShadow = true; line.add(leg); }
      warn.position.set((rtl ? left - 0.6 : right + 0.6), beltY + 0.9, -0.2);
      bins.forEach((bn, i) => { bn.g.position.copy(binAt(i)).setZ(1.5); bn.g.scale.setScalar((H * 0.4 * unit) / 1.25); });
    };

    // The things on the belt, made as they come on and dropped when they're gone.
    const geos = sortables();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 });
    const goldMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffd36b, roughness: 0.25, metalness: 0.75, emissive: 0x7a5200, emissiveIntensity: 0.4 });
    const live = new Map<number, { m: THREE.Mesh; sparkle?: THREE.Sprite; sortedAt: number; from: THREE.Vector3; spin: number }>();
    const halo = glowSprite(0xff9fdc, 2.4); halo.visible = false; w.scene.add(halo);
    const fire = Array.from({ length: 4 }, () => glowSprite(0xff7a1a, 1.6));
    fire.forEach((f) => { f.visible = false; w.scene.add(f); });
    let lastN = 0;
    const V = new THREE.Vector3();

    w.start((dt, now) => {
      if (board.fit()) layout();
      if (!board.W) return;
      const f = feed.current;
      const t = f.clock() - f.startsAt;
      rubber.offset.x -= dt * 0.35;
      // Feedback on the bin that was just used: the lid pops (right), it shakes red (wrong), fire.
      if (f.last && f.last.n !== lastN) {
        lastN = f.last.n;
        const bn = bins.find((b) => b.bin === f.last!.bin)!;
        if (f.last.ok) bn.open = 1; else { bn.shake = 1; bn.red = 1; }
        if (f.last.hazard) bn.fire = 2.2;
        w.say(f.last.ok ? `+${f.last.gained}` : '✗', V.copy(bn.g.position).setY(bn.g.position.y + bn.g.scale.y * 1.6), f.last.ok ? (f.last.golden ? '#fde68a' : '#86efac') : '#f87171', 0.7);
        if (f.last.ok) w.burst(V, f.last.golden ? 0xfbbf24 : new THREE.Color(BIN_COLOR[bn.bin]).getHex(), calm ? 4 : 18, 3, 6);
      }
      bins.forEach((bn, i) => {
        bn.open = Math.max(0, bn.open - dt * 2.2); bn.shake = Math.max(0, bn.shake - dt * 2.5); bn.red = Math.max(0, bn.red - dt * 2);
        bn.hinge.rotation.x = -Math.sin(Math.min(1, bn.open) * Math.PI) * 1.2;
        const home = binAt(i);
        bn.g.position.x = home.x + (calm ? 0 : Math.sin(now * 60) * bn.shake * 0.06);
        bn.flash.intensity = bn.red * 6;
        bn.fire = Math.max(0, bn.fire - dt);
      });
      const burning = bins.find((b) => b.fire > 0);
      fire.forEach((s2, k) => {
        s2.visible = !!burning;
        if (burning) { s2.position.copy(burning.g.position).add(V.set(Math.sin(now * 9 + k) * 0.15, burning.g.scale.y * (1.3 + ((now * 1.6 + k * 0.25) % 1) * 0.8), 0.2)); s2.scale.setScalar((1.1 - ((now * 1.6 + k * 0.25) % 1)) * 1.4); }
      });
      // Each thing: along the belt by its time, then into a bin, off a rim, or off the end.
      let frontMesh: THREE.Mesh | null = null;
      const seen = new Set<number>();
      for (const b of f.belt) {
        const done = f.done[b.id];
        if (b.at > t || t >= b.at + b.travel + (done ? f.exitMs : 0)) continue;
        seen.add(b.id);
        let it = live.get(b.id);
        if (!it) {
          const m = new THREE.Mesh(geos[b.item], b.golden ? goldMat : mat);
          m.castShadow = true; w.scene.add(m);
          it = { m, sortedAt: -1, from: new THREE.Vector3(), spin: (b.id * 1.7) % 6.28 };
          if (b.golden) { it.sparkle = glowSprite(0xfde68a, 1.2); m.add(it.sparkle); }
          live.set(b.id, it);
        }
        const m = it.m, size = unit * 100;
        m.scale.setScalar(size);
        const along = Math.min(1, Math.max(0, (t - b.at) / b.travel));
        const x = rtl ? right - (right - left) * along : left + (right - left) * along;
        if (!done || done === 'missed') {
          if (done === 'missed') {
            // Over the end and down.
            const past = (t - b.at - b.travel) / 1000;
            m.position.set((rtl ? left - past * 2 : right + past * 2), beltY - past * past * 9, 0);
            m.rotation.z += dt * 4;
          } else {
            m.position.set(x, beltY + (b.id === f.front && !calm ? 0.06 + Math.sin(now * 6) * 0.03 : 0), 0);
            m.rotation.set(0, it.spin, 0);
            if (b.id === f.front) frontMesh = m;
          }
          if (it.sparkle) it.sparkle.visible = !calm && Math.sin(now * 7 + b.id) > 0.2;
          continue;
        }
        // Sorted: an arc into the chosen bin (wrong ones bounce off the rim and fall away).
        if (it.sortedAt < 0) { it.sortedAt = now; it.from.copy(m.position); }
        const k = Math.min(1, (now - it.sortedAt) / 0.48), bi = BINS.indexOf(f.bins[b.id] ?? 'landfill'), bn = bins[bi];
        const to = V.copy(bn.g.position).setY(bn.g.position.y + bn.g.scale.y * (done === 'ok' ? 1.0 : 1.35));
        const e = 1 - Math.pow(1 - k, 2);
        m.position.lerpVectors(it.from, to, e);
        m.position.y += Math.sin(Math.PI * k) * 1.4;
        m.rotation.x += dt * 9; m.rotation.z += dt * 5;
        if (done === 'ok') m.scale.setScalar(size * (1 - k * 0.7));
        else if (k >= 1) { const after = now - it.sortedAt - 0.48; m.position.set(to.x + after * 2.2, to.y + after * 2 - after * after * 12, 0.4); }
      }
      for (const [id, it] of live) if (!seen.has(id)) { w.scene.remove(it.m); it.sparkle?.material.dispose(); live.delete(id); }
      halo.visible = !!frontMesh;
      if (frontMesh) halo.position.copy(frontMesh.position).setY(beltY + 0.05);
      (warn.material as THREE.SpriteMaterial).opacity = 0.5 + Math.sin(now * 5) * 0.3;
    });
    return () => w.dispose();
  }, [feed]);
  return <canvas ref={canvas} className="absolute inset-0 h-full w-full" role="img" aria-label={label} />;
}
