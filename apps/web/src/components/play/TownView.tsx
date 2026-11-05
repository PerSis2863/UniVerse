'use client';

import { useEffect, useRef } from 'react';
import { GRID, type SupplyKind } from '@/lib/play/supply';
import { THREE, World, glowSprite, mergeGeometries } from './world/core';
import { Board, rainField, waterNormals } from './world/board';
import { part, whole } from './world/props';
import { surface } from './world/textures';

// Supply Run's town, in 3D (M104, the owner: "realistic graphics to all of them"): an aerial view of
// a riverside town (streets, bridges, houses with tiled roofs, parks, the depot in the middle) under
// a real sky, and the relief trucks driving the streets to each need and back (the airdrop flies
// straight over the roofs). The game's own markers and buttons sit on top, where they always were:
// the town is laid out in the same 600 × 400 plan the flat map used (world/board.ts maps it).

export interface TownTrip { id: number; x: number; y: number; kind: SupplyKind; depart: number; arrive: number; back: number; air?: boolean }
export interface TownFeed { trips: TownTrip[]; rain: boolean; clock: () => number; colors: Record<SupplyKind, string> }

/** The river's course in the plan: two curves. */
const RIVER: [number, number][][] = [[[-20, 70], [120, 60], [180, 170], [300, 160]], [[300, 160], [420, 150], [470, 300], [620, 330]]];
const bez = (p: [number, number][], t: number): [number, number] => {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]) as [number, number];
};
const PARK = (k: number) => (k * 7) % 5 === 0;

/** A small truck, 1 long, nose along +z: a white cab, a cargo box in its supply's colour, wheels. */
function truck(color: string) {
  return whole([
    part(new THREE.BoxGeometry(0.42, 0.34, 0.3), 0xf1f5f9, [0, 0.24, 0.32]),
    part(new THREE.BoxGeometry(0.4, 0.16, 0.02), 0x0f172a, [0, 0.3, 0.475]),
    part(new THREE.BoxGeometry(0.46, 0.44, 0.66), new THREE.Color(color).getHex(), [0, 0.3, -0.18]),
    part(new THREE.BoxGeometry(0.47, 0.06, 0.67), 0xffffff, [0, 0.4, -0.18]),
    ...[[-0.2, 0.3], [0.2, 0.3], [-0.2, -0.3], [0.2, -0.3]].map(([x, z]) => part(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10), 0x111827, [x, 0.08, z], [0, 0, Math.PI / 2])),
  ]);
}

export function TownView({ feed }: { feed: React.RefObject<TownFeed> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const w = new World(el, { fov: 30, bg: 0x6f8f5f, glow: { strength: 0.4, radius: 0.4, threshold: 0.9 }, env: 0.8, ao: 0.6 });
    const board = new Board(w, 'top', 10, 26);
    const sun = w.lights({ sky: 0xdbe8ff, ground: 0x4a5a3a, power: 2.6, at: [-14, 30, 10], ambient: 0.6 });
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
    w.sky({ elevation: 42, azimuth: 230, turbidity: 2.6, rayleigh: 1.6, gain: 0.5, env: 0.85 });
    const hemi = w.scene.children.find((o) => o instanceof THREE.HemisphereLight) as THREE.HemisphereLight;
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), surface('grass', { color: 0xaec48a }));
    grass.receiveShadow = true; w.scene.add(grass);
    const rain = rainField(w.phone ? 600 : 1400, new THREE.Vector3(30, 18, 26), new THREE.Vector3(0, 8, 2), { opacity: 0.35, speed: 24 });
    rain.lines.visible = false; w.scene.add(rain.lines);

    const asphalt = surface('asphalt', { color: 0x8a8a90, rough: 0.7 });
    const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x1d5a73, roughness: 0.06, metalness: 0, normalMap: waterNormals(), normalScale: new THREE.Vector2(0.35, 0.35), clearcoat: 0.6 });
    const town = new THREE.Group(); w.scene.add(town);
    const depotMark = glowSprite(0xfe81d1, 2); w.scene.add(depotMark);
    let unit = 0.02;
    /** A plan point (600 × 400) on the ground. */
    const P = (x: number, y: number, out = new THREE.Vector3()) => board.at((x / 600) * board.W, (y / 400) * board.H, out);
    const layout = () => {
      town.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
      town.clear();
      unit = board.scale(board.W / 2, board.H / 2) * (board.W / 600);
      // The river: banks of mud, then the water, along the plan's curve.
      const ribbon = (width: number, y: number) => {
        const pos: number[] = [], idx: number[] = [], uv: number[] = [];
        const pts = RIVER.flatMap((seg, s) => Array.from({ length: 40 }, (_, i) => bez(seg, (i + (s ? 1 : 0)) / 40)));
        pts.forEach(([x, z], i) => {
          const a = P(x, z), next = pts[Math.min(pts.length - 1, i + 1)], prev = pts[Math.max(0, i - 1)];
          const d = P(next[0], next[1]).sub(P(prev[0], prev[1])).normalize(), side = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar((width / 2) * unit);
          pos.push(a.x + side.x, y, a.z + side.z, a.x - side.x, y, a.z - side.z);
          uv.push(0, i / 6, 1, i / 6);
          if (i < pts.length - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
        return g;
      };
      const bank = new THREE.Mesh(ribbon(44, 0.004), surface('mud', { color: 0x9a8a70 })); bank.receiveShadow = true; town.add(bank);
      const water = new THREE.Mesh(ribbon(30, 0.015), waterMat); town.add(water);
      // Streets on the plan's grid lines, a little raised where they bridge the river.
      // (Each street is the plan's own quad on the ground, so it lines up with the markers exactly.)
      const quad = (x0: number, y0: number, x1: number, y1: number, h: number) => {
        const c = [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(c.flatMap((v) => [v.x, h, v.z]), 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(c.flatMap((v) => [v.x / 2, v.z / 2]), 2));
        g.setIndex([0, 3, 1, 1, 3, 2]); g.computeVertexNormals();
        return g;
      };
      const streets: THREE.BufferGeometry[] = [];
      for (const y of [100, 200, 300]) streets.push(quad(-20, y - 3.5, 620, y + 3.5, 0.12));
      for (const x of [100, 200, 300, 400, 500]) streets.push(quad(x - 3.5, -20, x + 3.5, 420, 0.13));
      const roads = new THREE.Mesh(mergeGeometries(streets), asphalt); roads.receiveShadow = true; town.add(roads);
      // Houses (three to a block) with pitched roofs; parks full of trees; the depot in the middle.
      const walls = [0xf1ece2, 0xe7dccb, 0xc9a98a, 0xd9d4cc, 0xb7c4c9], roofs = [0x9a3b2b, 0x7a4a36, 0x55606b, 0x8a6a4a];
      const homes: THREE.BufferGeometry[] = [], greens: THREE.BufferGeometry[] = [];
      for (let k = 0; k < GRID.cols * GRID.rows; k++) {
        const cx = (k % GRID.cols) * 100, cy = Math.floor(k / GRID.cols) * 100;
        if (k === 14 || k === 15 || k === 8 || k === 9) continue; // the depot's blocks stay open round it
        if (PARK(k)) {
          for (let j = 0; j < 7; j++) {
            const p = P(cx + 18 + ((j * 23 + k * 11) % 64), cy + 18 + ((j * 31 + k * 7) % 62)), r = (6 + ((j + k) % 3) * 2) * unit;
            greens.push(part(new THREE.CylinderGeometry(r * 0.12, r * 0.18, r * 1.2, 5), 0x5b4636, [p.x, r * 0.6, p.z]), part(new THREE.IcosahedronGeometry(r, 1), j % 2 ? 0x3f6b35 : 0x4b7a3c, [p.x, r * 1.5, p.z], [0, 0, 0], [1, 0.9, 1]));
          }
          continue;
        }
        for (let j = 0; j < 3; j++) {
          const sx = cx + 18 + ((j * 29 + k * 13) % 50), sy = cy + 22 + ((j * 23 + k * 17) % 44), hw = (16 + ((j + k) % 3) * 4) * unit, hd = hw * 0.8, hh = hw * (0.55 + ((j * k) % 3) * 0.15);
          const c = P(sx + 8, sy + 6);
          homes.push(part(new THREE.BoxGeometry(hw, hh, hd), walls[(j + k) % walls.length], [c.x, hh / 2, c.z]));
          homes.push(part(new THREE.CylinderGeometry(hd * 0.62, hd * 0.62, hw * 1.04, 3, 1).rotateZ(Math.PI / 2), roofs[(j * 3 + k) % roofs.length], [c.x, hh + hd * 0.28, c.z], [0, 0, 0], [1, 0.75, 1]));
        }
      }
      const homeMesh = new THREE.Mesh(whole(homes), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
      const parkMesh = new THREE.Mesh(whole(greens), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }));
      homeMesh.castShadow = homeMesh.receiveShadow = parkMesh.castShadow = true;
      town.add(homeMesh, parkMesh);
      const dc = P(300, 200), dw = 70 * unit, dd = 42 * unit;
      const depot = new THREE.Mesh(whole([part(new THREE.BoxGeometry(dw, 9 * unit, dd), 0xe5e7eb, [0, 4.5 * unit, 0]), part(new THREE.BoxGeometry(dw * 1.04, 1.5 * unit, dd * 1.06), 0xfe81d1, [0, 9.6 * unit, 0]), part(new THREE.BoxGeometry(dw * 0.3, 0.6 * unit, dd * 0.4), 0xffffff, [0, 10.6 * unit, 0])]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
      depot.position.set(dc.x, 0, dc.z); depot.castShadow = depot.receiveShadow = true; town.add(depot);
      depotMark.position.set(dc.x, 12 * unit, dc.z);
    };

    // Trucks and the airdrop, made per trip; they drive the streets (the airdrop flies over).
    const geos = new Map<string, THREE.BufferGeometry>();
    const truckMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1 });
    const live = new Map<number, THREE.Object3D>();
    const plane = () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(whole([part(new THREE.CapsuleGeometry(0.12, 0.7, 4, 10), 0xfbbf24, [0, 0, 0], [Math.PI / 2, 0, 0]), part(new THREE.BoxGeometry(1.1, 0.03, 0.22), 0xf59e0b, [0, 0, 0.05]), part(new THREE.BoxGeometry(0.4, 0.03, 0.12), 0xf59e0b, [0, 0.02, -0.4]), part(new THREE.BoxGeometry(0.03, 0.18, 0.14), 0xf59e0b, [0, 0.1, -0.4])]), truckMat));
      return g;
    };
    /** The street route from the depot to a district, in plan points: along the middle street, up or down a cross street, into the block. */
    const route = (x: number, y: number): [number, number][] => {
      const sx = (x + 0.5) * 100, sy = (y + 0.5) * 100, col = Math.max(100, Math.min(500, sx < 300 ? (x + 1) * 100 : x * 100));
      return [[300, 200], [col, 200], [col, sy], [sx, sy]];
    };
    const along = (pts: [number, number][], k: number, out: THREE.Vector3, dir: THREE.Vector3) => {
      const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1])), total = seg.reduce((a, b) => a + b, 0) || 1;
      let d = Math.max(0, Math.min(1, k)) * total, i = 0;
      while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
      const a = pts[i], b = pts[i + 1], f = seg[i] ? d / seg[i] : 0;
      P(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, out);
      const nb = P(b[0], b[1]), na = P(a[0], a[1]);
      dir.copy(nb).sub(na).setY(0).normalize();
    };
    const pos = new THREE.Vector3(), dir = new THREE.Vector3();

    w.start((dt, now) => {
      if (board.fit()) layout();
      if (!board.W) return;
      const f = feed.current, t = f.clock();
      (waterMat.normalMap as THREE.Texture).offset.set(now * 0.02, now * 0.012);
      rain.lines.visible = f.rain; rain.mat.uniforms.time.value = now;
      sun.intensity += ((f.rain ? 0.9 : 2.6) - sun.intensity) * (1 - Math.exp(-dt * 1.5));
      hemi.intensity += ((f.rain ? 0.45 : 0.6) - hemi.intensity) * (1 - Math.exp(-dt * 1.5));
      (depotMark.material as THREE.SpriteMaterial).opacity = 0.5 + Math.sin(now * 3) * 0.25;
      const seen = new Set<number>();
      for (const trip of f.trips) {
        if (t >= trip.back) continue;
        seen.add(trip.id);
        let o = live.get(trip.id);
        if (!o) {
          if (trip.air) o = plane();
          else {
            const color = f.colors[trip.kind];
            if (!geos.has(color)) geos.set(color, truck(color));
            o = new THREE.Mesh(geos.get(color)!, truckMat);
            o.castShadow = true;
          }
          w.scene.add(o); live.set(trip.id, o);
        }
        const size = 22 * unit;
        o.scale.setScalar(size);
        if (trip.air) {
          // Straight over the roofs, low, and away.
          const k = (t - trip.depart) / Math.max(1, trip.back - trip.depart);
          const a = P(300, 200), b = P((trip.x + 0.5) * 100, (trip.y + 0.5) * 100);
          o.position.lerpVectors(a, b, Math.min(1, k * 1.4)).setY(6 * unit * 6);
          o.lookAt(b.x, o.position.y, b.z);
          if (k > 0.72) o.position.addScaledVector(dir.copy(b).sub(a).normalize(), (k - 0.72) * 40 * unit * 6);
          continue;
        }
        const pts = route(trip.x, trip.y);
        if (t < trip.arrive) along(pts, (t - trip.depart) / Math.max(1, trip.arrive - trip.depart), pos, dir);
        else if (t < trip.arrive + 200) along(pts, 1, pos, dir);
        else { along([...pts].reverse(), (t - trip.arrive - 200) / Math.max(1, trip.back - trip.arrive - 200), pos, dir); }
        o.position.copy(pos).setY(0.08);
        if (dir.lengthSq() > 0) o.lookAt(pos.x + dir.x, 0.08, pos.z + dir.z);
      }
      for (const [id, o] of live) if (!seen.has(id)) { w.scene.remove(o); live.delete(id); }
    });
    return () => w.dispose();
  }, [feed]);
  return <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden />;
}
