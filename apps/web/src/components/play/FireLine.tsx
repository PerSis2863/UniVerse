'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Droplets, Flame, Home, Trees, Wind } from 'lucide-react';
import { GAMES } from '@/lib/play';
import {
  BURN_TICKS, DIRS, FIRE_COLS, FIRE_OUT, FIRE_REFILL_MS, FIRE_ROWS, FIRE_TANK, FIRE_TICK_MS, FIRE_LOST, FOREST, MEADOW, ROCK, VILLAGE, WATER, WET_TICKS, WIND_NAMES,
  dropCells, fireFinal, fireMap, fireTick, windAt,
} from '@/lib/play/wildfire';
import { hash, seeded } from '@/lib/seeded-shuffle';
import { cn } from '@/lib/utils';
import { useArena } from './arena';
import { calmMotion, steerBody, useSteer } from './steer';
import type { GameProps } from './game-props';
import { THREE, World, glowSprite } from './world/core';
import { Board, waterNormals } from './world/board';
import { part, whole } from './world/props';
import { surface } from './world/textures';
import { haptic } from '@/lib/haptics';

// Fire Line (UniVerse Play M105, a Relief game; rules in src/lib/play/wildfire.ts): a dry forest valley
// seen from the air. Lightning starts fires and the wind drives them toward three villages. Fly the
// water bomber (steer like the other action games) over the lake to fill its tank, then drop the
// water (Space or the button) on the flames. Every flame put out scores; the villages still standing
// and the forest still green score at the end. Drawn in 3D on world/board.ts: thousands of trees that
// catch, blaze and leave black ash, smoke drifting with the wind, steam where water hits fire.

/** A tree's colours: alive (two greens), burning, ash. */
const LEAF = [new THREE.Color(0x2f5a2a), new THREE.Color(0x3d6b31)], BURNING = new THREE.Color(0xff6a1a), ASH = new THREE.Color(0x1d1b1a);

/** A flame: a hot teardrop (white-yellow core, orange, red edge); a puff of smoke, soft and grey. */
function flameTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 92, 2, 32, 80, 52);
  grad.addColorStop(0, 'rgba(255,250,220,1)'); grad.addColorStop(0.25, 'rgba(255,200,80,0.95)'); grad.addColorStop(0.6, 'rgba(255,90,20,0.6)'); grad.addColorStop(1, 'rgba(120,20,0,0)');
  g.fillStyle = grad; g.beginPath(); g.moveTo(32, 2); g.bezierCurveTo(58, 50, 62, 96, 32, 126); g.bezierCurveTo(2, 96, 6, 50, 32, 2); g.fill();
  return new THREE.CanvasTexture(c);
}
function smokeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 6; i++) { const x = 20 + Math.random() * 24, y = 20 + Math.random() * 24, grad = g.createRadialGradient(x, y, 1, x, y, 22); grad.addColorStop(0, 'rgba(255,255,255,0.5)'); grad.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grad; g.fillRect(0, 0, 64, 64); }
  return new THREE.CanvasTexture(c);
}

/** The water bomber, 2.4 long, nose along −z: a yellow hull with a red band, high wings, two engines
 *  with propellers, a tail. */
function bomber() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(whole([
    part(new THREE.CapsuleGeometry(0.22, 1.6, 6, 14), 0xfacc15, [0, 0, 0], [Math.PI / 2, 0, 0], [1, 0.9, 1]),
    part(new THREE.CapsuleGeometry(0.225, 0.5, 6, 14), 0xdc2626, [0, -0.02, -0.15], [Math.PI / 2, 0, 0], [1.01, 0.91, 1]),
    part(new THREE.BoxGeometry(2.6, 0.05, 0.36), 0xfacc15, [0, 0.2, -0.1]),
    part(new THREE.BoxGeometry(0.9, 0.04, 0.22), 0xfacc15, [0, 0.12, 1.0]),
    part(new THREE.BoxGeometry(0.04, 0.42, 0.32), 0xdc2626, [0, 0.3, 1.0]),
    part(new THREE.SphereGeometry(0.16, 12, 8), 0x0f172a, [0, 0.1, -0.78], [0, 0, 0], [1, 0.7, 1.2]),
    ...[-0.62, 0.62].map((x) => part(new THREE.CapsuleGeometry(0.09, 0.42, 4, 10), 0xe5e7eb, [x, 0.14, -0.22], [Math.PI / 2, 0, 0])),
  ]), new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, clearcoat: 0.8 }));
  body.castShadow = true; g.add(body);
  const props = [-0.62, 0.62].map((x) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.05), new THREE.MeshStandardMaterial({ color: 0x18181b }));
    p.position.set(x, 0.14, -0.52); g.add(p); return p;
  });
  return { g, props };
}

export function FireLine({ seed, startsAt, endsAt, clock, onProgress, onStats }: GameProps) {
  const map = useMemo(() => fireMap(seed, GAMES.fire.seconds), [seed]);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const steer = useSteer(box);
  const arena = useArena();
  const [hud, setHud] = useState({ tank: FIRE_TANK, wind: 0, burning: 0, green: 100, lost: [] as boolean[] });
  const dropAsk = useRef(false);
  const out = useRef({ arena, onProgress, onStats, clock, startsAt, endsAt });
  useEffect(() => { out.current = { arena, onProgress, onStats, clock, startsAt, endsAt }; });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const w = new World(el, { fov: 34, bg: 0x9b8f7a, haze: [0xb9a98e, 0.012], glow: { strength: 0.85, radius: 0.55, threshold: 0.75 }, env: 0.7 });
    const board = new Board(w, 'top', 16, 34);
    const calm = calmMotion();
    const sun = w.lights({ sky: 0xffe2c0, ground: 0x4a3a2a, power: 2.8, at: [-16, 28, -8], ambient: 0.55 });
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26 });
    w.sky({ elevation: 30, azimuth: 300, turbidity: 9, rayleigh: 1.4, mie: 0.012, mieG: 0.9, gain: 0.48, env: 0.75 });
    w.look({ saturation: 1.05, contrast: 1.08 });

    const N = FIRE_COLS * FIRE_ROWS;
    const cells = map.cells, burn = new Uint8Array(N), wet = new Uint8Array(N), ash = new Uint8Array(N), saved = new Uint8Array(N);
    const startGreen = Array.from(cells).filter((k) => k === FOREST || k === MEADOW).length;
    // The ground: one vertex per cell corner on the box's own grid, coloured by what grows there.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, FIRE_COLS, FIRE_ROWS), new THREE.MeshStandardMaterial({ vertexColors: true, map: surface('grass').map, roughness: 0.95 }));
    ground.receiveShadow = true; w.scene.add(ground);
    const below = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), surface('grass', { color: 0x6f7a4a }));
    below.position.y = -0.05; w.scene.add(below);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x2b6f86, roughness: 0.05, normalMap: waterNormals(), normalScale: new THREE.Vector2(0.3, 0.3), clearcoat: 0.8 }));
    w.scene.add(water);
    // Trees: two on each forest cell, one on some meadow (one mesh for the trunks, one for the crowns).
    const spots: { cell: number; fx: number; fy: number; s: number; v: number }[] = [];
    const tr = seeded(hash(`${seed}:trees`));
    for (let i = 0; i < N; i++) {
      const k = cells[i];
      const n = k === FOREST ? 2 : k === MEADOW && tr() < 0.25 ? 1 : 0;
      for (let j = 0; j < n; j++) spots.push({ cell: i, fx: 0.15 + tr() * 0.7, fy: 0.15 + tr() * 0.7, s: 0.75 + tr() * 0.5, v: tr() < 0.5 ? 0 : 1 });
    }
    const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1.5, 7).translate(0, 1.15, 0), new THREE.MeshStandardMaterial({ roughness: 0.85 }), spots.length);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 0.5, 5).translate(0, 0.25, 0), new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.9 }), spots.length);
    crowns.castShadow = trunks.castShadow = !w.phone; crowns.receiveShadow = true;
    w.scene.add(crowns, trunks);
    // Villages: little houses with roofs and a chapel spire each.
    const villageMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
    villageMesh.castShadow = villageMesh.receiveShadow = true; w.scene.add(villageMesh);
    const vGlow = map.villages.map(() => { const s = glowSprite(0xff5a1a, 4); s.visible = false; w.scene.add(s); return s; });
    // Fire, smoke and steam: instanced quads facing the camera.
    const MAXF = 700, MAXS = 260;
    const flames = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 1.5).translate(0, 0.7, 0), new THREE.MeshBasicMaterial({ map: flameTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.6, 1.2, 1) }), MAXF);
    const smoke = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: smokeTexture(), transparent: true, depthWrite: false, opacity: 0.55 }), MAXS);
    flames.instanceMatrix.setUsage(THREE.DynamicDrawUsage); smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    flames.frustumCulled = smoke.frustumCulled = false; flames.renderOrder = 4; smoke.renderOrder = 5;
    w.scene.add(flames, smoke);
    const puffs = Array.from({ length: MAXS }, () => ({ x: 0, y: 0, z: 0, age: 9, life: 1, size: 1, steam: false }));
    let nextPuff = 0;
    const plane = bomber(); w.scene.add(plane.g);
    const curtain = glowSprite(0xbfe6ff, 3); curtain.visible = false; w.scene.add(curtain);
    // Where the water will land: a thin ring on the ground under the bomber.
    const aim = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.6, depthWrite: false }));
    w.scene.add(aim);

    let unit = 0.03, cellW = 0.4;
    const cellPx = (i: number): [number, number] => [((i % FIRE_COLS) + 0.5) / FIRE_COLS * board.W, (Math.floor(i / FIRE_COLS) + 0.5) / FIRE_ROWS * board.H];
    const cellAt = (i: number, out = new THREE.Vector3()) => { const [px, py] = cellPx(i); return board.at(px, py, out); };
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), P2 = new THREE.Vector3(), C = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);
    /** Colours of the ground (by cell) and of every tree, after the fire moves. */
    const paint = () => {
      const col = ground.geometry.attributes.color as THREE.BufferAttribute;
      for (let vy = 0; vy <= FIRE_ROWS; vy++) for (let vx = 0; vx <= FIRE_COLS; vx++) {
        // A corner takes the average of the cells round it.
        let r = 0, g = 0, b = 0, n = 0;
        for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
          const cx = vx + dx, cy = vy + dy;
          if (cx < 0 || cy < 0 || cx >= FIRE_COLS || cy >= FIRE_ROWS) continue;
          const i = cy * FIRE_COLS + cx, k = cells[i];
          C.setHex(ash[i] ? 0x2a2522 : k === MEADOW ? 0xb6b06a : k === ROCK ? 0x9a8f80 : k === WATER ? 0x3d5a4a : k === VILLAGE ? 0x8f8a74 : 0x5a6b3a);
          if (wet[i] && !ash[i]) C.multiplyScalar(0.72);
          if (burn[i]) C.lerp(BURNING, 0.35);
          r += C.r; g += C.g; b += C.b; n++;
        }
        col.setXYZ(vy * (FIRE_COLS + 1) + vx, r / n, g / n, b / n);
      }
      col.needsUpdate = true;
      spots.forEach((t, k) => crowns.setColorAt(k, ash[t.cell] ? ASH : burn[t.cell] ? C.copy(BURNING).lerp(ASH, 1 - burn[t.cell] / BURN_TICKS) : LEAF[t.v]));
      if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    };
    /** Everything laid on the box's grid again (when it changes size). */
    const layout = () => {
      unit = board.scale(board.W / 2, board.H / 2);
      cellW = (board.W / FIRE_COLS) * unit;
      // The ground's corners onto the plan's grid.
      const pos = ground.geometry.attributes.position as THREE.BufferAttribute;
      if (!ground.geometry.attributes.color) ground.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
      for (let vy = 0; vy <= FIRE_ROWS; vy++) for (let vx = 0; vx <= FIRE_COLS; vx++) {
        const p = board.at((vx / FIRE_COLS) * board.W, (vy / FIRE_ROWS) * board.H, P);
        pos.setXYZ(vy * (FIRE_COLS + 1) + vx, p.x, 0, p.z);
      }
      pos.needsUpdate = true; ground.geometry.computeVertexNormals(); ground.geometry.computeBoundingSphere();
      // UVs in world units for the grass grain.
      const uv = ground.geometry.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 3, pos.getZ(i) / 3);
      uv.needsUpdate = true;
      // The lake.
      const lc = board.at(((map.lake.x) / FIRE_COLS) * board.W, ((map.lake.y) / FIRE_ROWS) * board.H);
      water.position.set(lc.x, 0.03, lc.z); water.scale.set(map.lake.rx * cellW, 1, map.lake.ry * cellW * (board.H / FIRE_ROWS) / (board.W / FIRE_COLS));
      // Trees.
      spots.forEach((t, k) => {
        const x = t.cell % FIRE_COLS, y = Math.floor(t.cell / FIRE_COLS);
        board.at(((x + t.fx) / FIRE_COLS) * board.W, ((y + t.fy) / FIRE_ROWS) * board.H, P);
        M.compose(P, Q.identity(), S.setScalar(cellW * 0.5 * t.s)); crowns.setMatrixAt(k, M); trunks.setMatrixAt(k, M);
      });
      crowns.instanceMatrix.needsUpdate = true; trunks.instanceMatrix.needsUpdate = true;
      // Villages.
      const parts: THREE.BufferGeometry[] = [];
      map.villages.forEach((v, k) => {
        const c0 = board.at(((v.x + 1) / FIRE_COLS) * board.W, ((v.y + 1) / FIRE_ROWS) * board.H);
        vGlow[k].position.set(c0.x, cellW * 1.5, c0.z); vGlow[k].scale.setScalar(cellW * 5);
        for (let h = 0; h < 6; h++) {
          const a = (h / 6) * Math.PI * 2 + k, d = cellW * (0.35 + (h % 2) * 0.4), hw = cellW * 0.38, hh = cellW * 0.32;
          const px = c0.x + Math.cos(a) * d, pz = c0.z + Math.sin(a) * d;
          parts.push(part(new THREE.BoxGeometry(hw, hh, hw * 0.8), [0xf1ece2, 0xe7dccb, 0xd9c8b0][h % 3], [px, hh / 2, pz], [0, a, 0]));
          parts.push(part(new THREE.CylinderGeometry(hw * 0.5, hw * 0.5, hw * 1.02, 3).rotateZ(Math.PI / 2), [0x9a3b2b, 0x7a4a36][h % 2], [px, hh + hw * 0.18, pz], [0, a, 0], [1, 0.7, 1]));
        }
        parts.push(part(new THREE.BoxGeometry(cellW * 0.3, cellW * 0.9, cellW * 0.3), 0xf5f5f4, [c0.x, cellW * 0.45, c0.z]), part(new THREE.ConeGeometry(cellW * 0.22, cellW * 0.6, 4), 0x475569, [c0.x, cellW * 1.2, c0.z]));
      });
      villageMesh.geometry.dispose(); villageMesh.geometry = whole(parts);
      paint();
    };

    // The round's state (the plane in the box's pixels, like the other action games).
    const s = {
      plane: { x: -1, y: 0, vx: 0, vy: 0 }, tank: FIRE_TANK, refill: 0, tick: 0, nextTick: 0, nextStrike: 0, score: 0, outs: 0, drops: 0, lost: map.villages.map(() => false),
      reported: -1, hudAt: 0, finale: false, flash: 0, yaw: 0, alt: 1, dropT: -1,
    };
    const report = () => {
      if (s.score === s.reported) return;
      s.reported = s.score;
      out.current.onProgress(s.score, s.outs);
      const green = Array.from(cells).filter((k, i) => (k === FOREST || k === MEADOW) && !ash[i]).length;
      out.current.onStats?.([{ label: 'Flames put out', value: String(s.outs) }, { label: 'Drops', value: String(s.drops) }, { label: 'Villages standing', value: `${s.lost.filter((x) => !x).length} of ${map.villages.length}` }, { label: 'Forest still green', value: `${Math.round((100 * green) / Math.max(1, startGreen))}%` }]);
    };
    const pop = (at: THREE.Vector3, color: number, n: number, speed = 3, g = 6) => w.burst(at, color, calm ? Math.min(3, n) : n, speed, g);
    report();

    w.start((dt, now) => {
      if (board.fit()) layout();
      const W = board.W, H = board.H;
      if (!W) return;
      const { arena, clock, startsAt, endsAt } = out.current;
      const t = clock() - startsAt, pl = s.plane;
      if (pl.x < 0) { pl.x = W * 0.5; pl.y = H * 0.85; }
      steerBody(pl, steer.current, dt, 380, { x0: 20, x1: W - 20, y0: 20, y1: H - 20 });
      const cx = (pl.x / W) * FIRE_COLS, cy = (pl.y / H) * FIRE_ROWS, here = Math.floor(cy) * FIRE_COLS + Math.floor(cx);
      const wind = windAt(map, Math.max(0, t));
      // Over the lake: skim and fill the tank.
      const overLake = cells[here] === WATER;
      if (overLake && s.tank < FIRE_TANK) {
        s.refill += dt * 1000;
        if (s.refill >= FIRE_REFILL_MS) { s.refill = 0; s.tank++; arena.sfx('splash'); if (s.tank === FIRE_TANK) arena.announce('Tank full!', 'good'); }
      } else s.refill = 0;
      // The fire moves a tick at a time (the same random numbers for the same tick in every room).
      let changed = false;
      while (t >= s.nextTick && t > 0) {
        const lit = fireTick(cells, burn, wet, ash, windAt(map, s.nextTick), seeded(hash(`${seed}:tick:${s.tick}`)));
        s.tick++; s.nextTick += FIRE_TICK_MS; changed = true;
        map.villages.forEach((v, k) => {
          if (s.lost[k]) return;
          const hit = [[0, 0], [1, 0], [0, 1], [1, 1]].some(([dx, dy]) => lit.includes((v.y + dy) * FIRE_COLS + v.x + dx));
          if (hit) { s.lost[k] = true; s.score = Math.max(0, s.score - FIRE_LOST); arena.announce(`${v.name} is burning!`, 'bad'); arena.sfx('hurt'); arena.shake(0.5); }
        });
      }
      while (s.nextStrike < map.strikes.length && map.strikes[s.nextStrike].at <= t) {
        const st = map.strikes[s.nextStrike++];
        if (!ash[st.cell] && !wet[st.cell]) { burn[st.cell] = BURN_TICKS; changed = true; }
        s.flash = 1; arena.sfx('thunder'); arena.announce('Lightning strike! New fire', 'bad');
        pop(cellAt(st.cell).setY(1), 0xfde68a, 14, 4);
      }
      // A drop: the water reaches the cells round the plane; flames go out, the ground stays wet.
      if (dropAsk.current) {
        dropAsk.current = false;
        if (s.tank > 0) {
          s.tank--; s.drops++; s.dropT = 0; changed = true;
          let n = 0;
          for (const c of dropCells(cx, cy)) {
            if (burn[c]) {
              burn[c] = 0; n++;
              if (!saved[c]) { saved[c] = 1; s.score += FIRE_OUT; s.outs++; }
              nextPuff = (nextPuff + 1) % MAXS; cellAt(c, P2);
              Object.assign(puffs[nextPuff], { x: P2.x, y: cellW, z: P2.z, age: 0, life: 2.2, size: cellW * 2.2, steam: true });
            }
            if (cells[c] !== WATER) wet[c] = WET_TICKS;
          }
          arena.sfx(n ? 'right' : 'whoosh', Math.min(8, n));
          if (n) { w.say(`+${n * FIRE_OUT}`, board.at(pl.x, pl.y - 30).setY(2), '#bae6fd', 0.7); haptic('tap', false); }
          if (n >= 8) arena.announce(`${n} flames out!`, 'good');
        } else arena.announce('Tank empty: skim the lake', 'pink');
      }
      // The end: villages still standing and the green forest count.
      if (!s.finale && clock() > endsAt - 1500) {
        s.finale = true;
        const green = Array.from(cells).filter((k, i) => (k === FOREST || k === MEADOW) && !ash[i]).length, standing = s.lost.filter((x) => !x).length;
        const bonus = fireFinal(standing, green, startGreen);
        s.score += bonus;
        arena.announce(`${standing} village${standing === 1 ? '' : 's'} saved · +${bonus.toLocaleString()}`, 'gold'); arena.sfx('win');
      }
      if (changed) paint();
      report();
      if (t - s.hudAt > 200) {
        s.hudAt = t;
        let burning = 0, green = 0;
        for (let i = 0; i < N; i++) { if (burn[i]) burning++; if ((cells[i] === FOREST || cells[i] === MEADOW) && !ash[i]) green++; }
        const next = { tank: s.tank, wind, burning, green: Math.round((100 * green) / Math.max(1, startGreen)), lost: [...s.lost] };
        setHud((p) => (p.tank === next.tank && p.wind === next.wind && p.burning === next.burning && p.green === next.green && p.lost.join() === next.lost.join() ? p : next));
      }

      // ── The picture ──
      // Flames on every burning cell, flickering; smoke puffs rising and drifting with the wind.
      let f = 0;
      const [wx, wy] = DIRS[wind];
      for (let i = 0; i < N && f < MAXF; i++) {
        if (!burn[i]) continue;
        cellAt(i, P2);
        const life = burn[i] / BURN_TICKS;
        for (let k = 0; k < 2 && f < MAXF; k++) {
          const flick = calm ? 1 : 0.75 + Math.sin(now * 14 + i * 3.1 + k * 2) * 0.25;
          P.copy(P2); P.x += (k - 0.5) * cellW * 0.45;
          M.compose(P, w.camera.quaternion, S.set(cellW * (0.9 + life * 0.6) * flick, cellW * (1 + life) * flick, 1));
          flames.setMatrixAt(f++, M);
        }
        if (!calm && Math.random() < dt * 1.6) { const p = puffs[nextPuff = (nextPuff + 1) % MAXS]; Object.assign(p, { x: P2.x, y: cellW * 1.4, z: P2.z, age: 0, life: 3.5 + Math.random() * 2, size: cellW * (1.2 + Math.random()), steam: false }); }
      }
      flames.count = f; flames.instanceMatrix.needsUpdate = true;
      puffs.forEach((p, k) => {
        p.age += dt;
        const a = Math.min(1, p.age / p.life);
        if (a >= 1) { M.makeScale(0, 0, 0); smoke.setMatrixAt(k, M); return; }
        p.y += dt * cellW * (p.steam ? 2 : 1.2); p.x += wx * dt * cellW * 0.9; p.z += wy * dt * cellW * 0.9;
        M.compose(P.set(p.x, p.y, p.z), w.camera.quaternion, S.setScalar(p.size * (1 + a * 1.6)));
        smoke.setMatrixAt(k, M);
        smoke.setColorAt(k, C.setRGB(1, 1, 1).multiplyScalar(p.steam ? 1 - a * 0.6 : (0.32 + a * 0.3) * (1 - a)));
      });
      smoke.instanceMatrix.needsUpdate = true; if (smoke.instanceColor) smoke.instanceColor.needsUpdate = true;
      map.villages.forEach((_, k) => { vGlow[k].visible = s.lost[k]; (vGlow[k].material as THREE.SpriteMaterial).opacity = 0.5 + Math.sin(now * 9 + k) * 0.2; });
      // Lightning lights the whole valley for a moment.
      s.flash = Math.max(0, s.flash - dt * 3);
      sun.intensity = 2.8 + s.flash * 4;
      // The bomber: lower over the lake, banking into turns; its water falls as a white curtain.
      s.alt += ((overLake ? 0.35 : 1) - s.alt) * (1 - Math.exp(-3 * dt));
      board.at(pl.x, pl.y, P);
      plane.g.position.set(P.x, cellW * (1.2 + s.alt * 3), P.z);
      plane.g.scale.setScalar(cellW * 1.3);
      s.yaw += (-Math.max(-0.6, Math.min(0.6, pl.vx / 900)) - s.yaw) * (1 - Math.exp(-4 * dt));
      plane.g.quaternion.setFromAxisAngle(UP, s.yaw);
      plane.g.rotateZ(-pl.vx / 1400);
      plane.props.forEach((p) => { p.rotation.z += dt * 40; });
      if (overLake && !calm && Math.random() < dt * 25) pop(P.clone().setY(0.1), 0xe0f2fe, 2, 2, 5);
      if (s.dropT >= 0) {
        s.dropT += dt;
        curtain.visible = s.dropT < 0.6;
        curtain.position.set(P.x, cellW * 1.2 * (1 - s.dropT), P.z); curtain.scale.set(cellW * 4, cellW * 6 * (0.5 + s.dropT), 1);
        if (s.dropT < 0.15 && !calm) pop(P.clone().setY(cellW * 2), 0xdbeafe, 6, 2.5, 14);
        if (s.dropT > 0.7) s.dropT = -1;
      }
      aim.position.set(P.x, 0.06, P.z); aim.scale.setScalar(cellW * 2.4);
      w.sunOver(P.setY(0));
    });

    // Space (or the Drop button) lets the water go.
    const key = (e: KeyboardEvent) => { if (e.key === ' ' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); dropAsk.current = true; } };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); w.dispose(); };
  }, [seed, map, steer]);

  const windDir = DIRS[hud.wind];
  return (
    <div className="mx-auto w-full">
      <div ref={box} className="relative h-[calc(var(--play-h)-1.5rem)] min-h-80 w-full touch-none select-none overflow-hidden rounded-[1.75rem] bg-[#7d7360] ring-1 ring-white/10">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" role="img" aria-label="Fire Line: a forest valley from the air, with a lake and three villages. Steer the water bomber with the mouse, a finger or the arrow keys; Space drops water." />
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/15" role="img" aria-label={`Tank: ${hud.tank} of ${FIRE_TANK} drops`}>
            <Droplets className="h-4 w-4 text-sky-300" aria-hidden />{Array.from({ length: FIRE_TANK }, (_, i) => <span key={i} className={cn('h-2.5 w-2.5 rounded-full', i < hud.tank ? 'bg-sky-300' : 'bg-white/20')} aria-hidden />)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/15">
            <Wind className="h-4 w-4" aria-hidden /><span className="inline-block" style={{ transform: `rotate(${Math.atan2(windDir[1], windDir[0])}rad)` }} aria-hidden>→</span>Wind {WIND_NAMES[hud.wind]}
          </span>
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ring-1', hud.burning ? 'bg-orange-700 text-white ring-orange-300/40' : 'bg-black/65 text-white ring-white/15')}><Flame className="h-4 w-4" aria-hidden />{hud.burning} burning</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/15"><Trees className="h-4 w-4 text-emerald-300" aria-hidden />{hud.green}% green</span>
          <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-black/65 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/15" role="img" aria-label={`${hud.lost.filter((x) => !x).length} of ${hud.lost.length} villages standing`}>
            {hud.lost.map((x, i) => <Home key={i} className={cn('h-4 w-4', x ? 'text-red-400' : 'text-emerald-300')} aria-hidden />)}
          </span>
        </div>
        <button type="button" onClick={() => { dropAsk.current = true; }} disabled={!hud.tank}
          className="absolute bottom-4 end-4 z-10 inline-flex h-12 items-center gap-1.5 rounded-full bg-sky-300 px-4 text-sm font-black text-sky-950 shadow-[0_5px_0_rgba(0,0,0,0.35)] active:translate-y-1 active:shadow-none disabled:opacity-40">
          <Droplets className="h-4 w-4" aria-hidden />Drop<kbd className="hidden rounded bg-black/15 px-1 text-[11px] font-medium [@media(pointer:fine)]:inline">Space</kbd>
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-zinc-400">Steer over the lake to fill the tank · Space (or Drop) lets the water go on the flames · the wind pushes the fire: get ahead of it and keep it away from the villages.</p>
    </div>
  );
}
