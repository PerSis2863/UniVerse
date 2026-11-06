'use client';

import { useEffect, useRef, useState } from 'react';
import { BLINK_ON, BLINK_OFF, OBBY_BELT, OBBY_CHECK, OBBY_ICE_GRIP, OBBY_FALL, OBBY_FINISH, OBBY_GEM, OBBY_PER_SECOND, OBBY_PER_WORLD, OBBY_STAGES, OBBY_WORLDS, beltDir, blinkOn, obbyCourse, obbyWorld, type Pad } from '@/lib/play/worlds';
import { useArena } from './arena';
import { lookHex, readLook } from './look';
import type { GameProps } from './game-props';
import { Avatar, Body, Controls, THREE, World, follow, glowSprite, mergeGeometries, walk, worldUv, type SkyLook } from './world/core';
import { Crowd } from './world/crowd';
import { cloudSea, islandRock, lavaSea, milkyWay, rocks, starfield } from './world/nature';
import { glowCracks, neonEdge, surface } from './world/textures';
import { HudChip, SkillRing, WorldFrame } from './world/Stage';

// Skyline Obby (src/lib/play/worlds.ts): a Roblox-style obstacle course in the sky. Run and jump
// pad to pad (moving, crumbling, bouncy, blinking, and wide ones with a spinning laser), checkpoints
// save where you start again, gems add points, and the golden finish ends the round early with a
// bonus. Its own trick (M38): Rewind. Hold R (or Q) to run time backwards up to three seconds and
// undo a bad jump; the charge refills while you play. In a room, the others run beside you.

const HUES = [[0x38bdf8, 0xa78bfa, 0xf472b6, 0xfbbf24, 0x34d399], [0xf97316, 0xef4444, 0xfbbf24, 0xa16207, 0xf43f5e], [0xd946ef, 0x22d3ee, 0xa855f7, 0x818cf8, 0xf0abfc]];
/** Each world's sky (M102): the sun's height and the air (a clear morning, a smoky volcanic dusk, a
 *  night), the haze and the light from above and below. */
const SKY_LOOKS: SkyLook[] = [
  { elevation: 22, azimuth: 55, turbidity: 1.4, rayleigh: 3.2, mie: 0.0025, mieG: 0.86, gain: 0.5, env: 0.8 },
  { elevation: 2.5, azimuth: 160, turbidity: 14, rayleigh: 3.4, mie: 0.025, mieG: 0.93, gain: 0.45, env: 0.6 },
  { elevation: -6, azimuth: 160, turbidity: 2, rayleigh: 0.5, mie: 0.002, mieG: 0.7, gain: 0.1, env: 0.35 },
];
const SKY_AIR = [{ fog: 0x9fb9e2, sky: 0xd6e4ff, ground: 0x55603f }, { fog: 0x5a2416, sky: 0xffb08a, ground: 0x5a1a0a }, { fog: 0x0b0918, sky: 0x8b7cff, ground: 0x1a0b33 }];
const mixLook = (a: SkyLook, b: SkyLook, k: number): SkyLook => Object.fromEntries((Object.keys(b) as (keyof SkyLook)[]).map((key) => [key, (a[key] ?? 0) + ((b[key] ?? 0) - (a[key] ?? 0)) * k]));

interface Live { pad: Pad; mesh: THREE.Mesh; box: THREE.Box3; base: THREE.Vector3; touched: number; drop: number; on?: boolean; bar?: THREE.Mesh; flag?: THREE.Mesh }

const REWIND_S = 3, REWIND_REFILL_S = 9;

/** A belt's rubber with arrows pointing the way it carries you (`dir` 1 = +x). Its offset scrolls. */
function belt(dir: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1f2028'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#2a2c36'; for (let y = 0; y < 128; y += 8) g.fillRect(0, y, 128, 3);
  g.strokeStyle = '#facc15'; g.lineWidth = 10; g.lineJoin = 'round';
  for (const cx of [36, 100]) { g.beginPath(); g.moveTo(cx - 12 * dir, 34); g.lineTo(cx + 12 * dir, 64); g.lineTo(cx - 12 * dir, 94); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { tex, mat: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, emissive: 0xfacc15, emissiveMap: tex, emissiveIntensity: 0.25 }) };
}

export function SkylineObby({ seed, startsAt, endsAt, clock, onProgress, onDone, onStats, net }: GameProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controls = useRef<Controls | null>(null);
  const arena = useArena();
  const [hud, setHud] = useState({ stage: 0, gems: 0, falls: 0, score: 0, world: 0 });
  const [skill, setSkill] = useState({ charge: 1, active: false, others: 0 });
  const [curtain, setCurtain] = useState<{ key: number; title: string; sub?: string } | null>(null);
  const out = useRef({ arena, onProgress, onDone, onStats, clock, endsAt, startsAt, net });
  useEffect(() => { out.current = { arena, onProgress, onDone, onStats, clock, endsAt, startsAt, net }; });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const w = new World(el, { fov: 68, bg: 0x9db8e6, haze: [0x9fb9e2, 0.0032], glow: { strength: 0.4, radius: 0.5, threshold: 0.92 }, env: 0.75, ao: 0.7 });
    w.look({ saturation: 1.16, contrast: 1.08 });
    const crowd = new Crowd(w, () => out.current.net);
    const c = new Controls(el);
    controls.current = c;
    const { pads, gems } = obbyCourse(seed);

    // The sky (M102): the physical daylight sky, which also lights the world (its colour in every
    // reflection). Each world has its own: a clear morning, a smoky volcanic dusk, a night.
    w.lights({ sky: 0xd6e4ff, ground: 0x55603f, power: 2.6, at: [40, 70, 30], ambient: 0.55 });
    const hemi = w.scene.children.find((o) => o instanceof THREE.HemisphereLight) as THREE.HemisphereLight;
    let skyNow = 0, skyFrom = SKY_LOOKS[0], skyK = 1;
    const sunDir = w.sky(SKY_LOOKS[0]);
    // Where each world starts and ends along the course (its first and last checkpoints).
    const zOf = (stage: number) => pads.find((p) => p.stage === stage && (p.kind === 'check' || p.kind === 'finish'))!.z;
    const worldZ = [0, 1, 2].map((k) => [k === 0 ? 30 : zOf(k * OBBY_PER_WORLD), zOf(Math.min(OBBY_STAGES, (k + 1) * OBBY_PER_WORLD))]);
    const worldY = [0, 1, 2].map((k) => Math.min(...pads.filter((p) => obbyWorld(Math.max(1, p.stage)) === k).map((p) => p.y)));
    // Sky Islands: two layers of cloud far below, lit by the sun, and big islands in the distance.
    const clouds = [cloudSea({ y: worldY[0] - 15, cover: 0.58, scale: 0.024, sun: sunDir, opacity: 0.85, horizon: 0x9fb9e2, shade: 0x8496c0 }), cloudSea({ y: worldY[0] - 34, cover: 0.4, sun: sunDir, shade: 0x6d80ad, horizon: 0x9fb9e2 })];
    clouds.forEach((cl) => w.scene.add(cl.mesh));
    const rand = (k: number) => { const x = Math.sin(seed * 0.001 + k * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const grass = surface('grass', { color: 0xc9dcae }), soil = surface('rock', { color: 0xa89884 });
    const far = Array.from({ length: 9 }, (_, i) => {
      const side = i % 2 ? 1 : -1, size = 18 + rand(i * 5) * 26;
      return { w: size, d: size * (0.7 + rand(i * 3) * 0.5), depth: size * (1 + rand(i * 7)), at: [side * (55 + rand(i) * 70), worldY[0] - 8 + rand(i * 2) * 30, 10 - rand(i * 4) * (Math.abs(worldZ[0][1]) + 60)] as [number, number, number], seed: i + seed % 50 };
    });
    const farRock = rocks(far, soil);
    if (farRock) w.scene.add(farRock);
    const lawns = mergeGeometries(far.map((f) => new THREE.CylinderGeometry(0.5, 0.5, 1.2, 14).scale(f.w * 0.94, 1, f.d * 0.94).translate(f.at[0], f.at[1] + 0.6, f.at[2])));
    w.scene.add(new THREE.Mesh(worldUv(lawns, 6), grass));
    const pines = mergeGeometries(far.flatMap((f, i) => Array.from({ length: 5 }, (_, k) => new THREE.ConeGeometry(1.2 + rand(i * 9 + k) * 0.8, 4 + rand(i * 11 + k) * 3, 7).translate(f.at[0] + (rand(i * 13 + k) - 0.5) * f.w * 0.7, f.at[1] + 3.2, f.at[2] + (rand(i * 17 + k) - 0.5) * f.d * 0.7))));
    w.scene.add(new THREE.Mesh(pines, new THREE.MeshStandardMaterial({ color: 0x2f4a2a, roughness: 0.9 })));
    // Lava Peaks: a glowing sea far below and embers rising. Neon Void: stars, the galaxy and a grid.
    const magma = lavaSea({ y: worldY[1] - 26, haze: 0x5a2416 });
    magma.mesh.visible = false;
    w.scene.add(magma.mesh);
    const embers: THREE.Sprite[] = [];
    for (let i = 0; i < 30; i++) { const e = glowSprite(i % 2 ? 0xff7a1a : 0xfbbf24, 1.2); e.position.set((Math.sin(i * 7.1) * 0.5) * 70, worldY[1] - 20 + (i * 1.7) % 30, worldZ[1][0] - ((i * 37) % 100) / 100 * Math.abs(worldZ[1][1] - worldZ[1][0])); w.scene.add(e); embers.push(e); }
    const stars = starfield(2400, 300, seed), galaxy = milkyWay(330, 0.5, 0xa78bfa);
    stars.visible = galaxy.visible = false;
    w.scene.add(stars);
    if (!w.phone) w.scene.add(galaxy);
    const grid = new THREE.GridHelper(400, 80, 0xd946ef, 0x6d28d9);
    grid.position.set(0, worldY[2] - 30, (worldZ[2][0] + worldZ[2][1]) / 2); w.scene.add(grid);
    const want = { fog: new THREE.Color(), sky: new THREE.Color(), ground: new THREE.Color() };
    const sun = glowSprite(0xfff1c8, 46);
    (sun.material as THREE.SpriteMaterial).opacity = 0.55;
    w.scene.add(sun);

    // The pads: grassy floating islands on craggy rock (Sky Islands), cooling basalt with glowing
    // cracks (Lava Peaks), black glass with neon edges (Neon Void). The special pads keep their
    // colour as a material: pink jelly to bounce on, crumbling sandstone, glowing crystal that
    // blinks, clear ice, rubber belts, a stone plaza with a flag at each checkpoint, gold at the end.
    const iceMat = new THREE.MeshPhysicalMaterial({ color: 0xcdefff, roughness: 0.05, metalness: 0, clearcoat: 1, emissive: 0x7dd3fc, emissiveIntensity: 0.12, transparent: true, opacity: 0.88 });
    const jelly = new THREE.MeshPhysicalMaterial({ color: 0xff6fb5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 1, sheenColor: new THREE.Color(0xffc6e4), emissive: 0xff4fa0, emissiveIntensity: 0.22 });
    const crystal = new THREE.MeshPhysicalMaterial({ color: 0x8ef2ff, roughness: 0.06, clearcoat: 1, iridescence: 0.7, emissive: 0x22d3ee, emissiveIntensity: 0.55, transparent: true, opacity: 0.84 });
    const gold = surface('stone', { color: 0xffd36b, metal: 0.85, rough: 0.4, emissive: 0xffb020, glow: 0.3 });
    const plaza = [surface('stone', { color: 0xece6da }), surface('stone', { color: 0x5c534d }), new THREE.MeshStandardMaterial({ color: 0x07070c, roughness: 0.16, metalness: 0.7, emissive: 0x22c55e, emissiveMap: neonEdge(), emissiveIntensity: 1.8 })];
    const crumble = [surface('rock', { color: 0xdc8f50 }), surface('rock', { color: 0x6b3a22, emissive: 0xff7a1a, emissiveMap: glowCracks(), glow: 2.2 }), new THREE.MeshStandardMaterial({ color: 0x07070c, roughness: 0.16, metalness: 0.7, emissive: 0xfb923c, emissiveMap: neonEdge(), emissiveIntensity: 1.8 })];
    const basalt = surface('rock', { color: 0x463d38, emissive: 0xff5a1a, emissiveMap: glowCracks(), glow: 1.6 });
    const neon = new Map<number, THREE.Material>();
    const glass = (hue: number) => { let m = neon.get(hue); if (!m) { m = new THREE.MeshStandardMaterial({ color: 0x07070c, roughness: 0.16, metalness: 0.7, emissive: hue, emissiveMap: neonEdge(), emissiveIntensity: 1.6 }); neon.set(hue, m); } return m; };
    const islandTop = [soil, soil, grass, soil, soil, soil];
    const beltR = belt(1), beltL = belt(-1);
    const rockStatic: Parameters<typeof rocks>[0][] = [[], []];
    const live: Live[] = pads.map((p, i) => {
      const wk = obbyWorld(Math.max(1, p.stage)), hue = HUES[wk][p.stage % 5];
      const mat: THREE.Material | THREE.Material[] = p.kind === 'ice' ? iceMat : p.kind === 'belt' ? (beltDir(p) > 0 ? beltR.mat : beltL.mat)
        : p.kind === 'bounce' ? jelly : p.kind === 'blink' ? crystal : p.kind === 'finish' ? gold : p.kind === 'check' ? plaza[wk] : p.kind === 'fall' ? crumble[wk]
        : wk === 0 ? islandTop : wk === 1 ? basalt : glass(hue);
      const h = p.kind === 'bounce' ? 0.6 : 0.9;
      // Neon blocks keep each face's own corners (their edges glow); the rest wear grain in world units.
      const neonish = wk === 2 && (p.kind === 'pad' || p.kind === 'move' || p.kind === 'spin' || p.kind === 'check' || p.kind === 'fall');
      const mesh = w.box([p.x, p.y - h / 2, p.z], [p.w, h, p.d], mat, false, { tile: neonish ? 0 : p.kind === 'belt' ? 2 : 3, round: p.kind === 'belt' ? 0.05 : 0.18 });
      const box = new THREE.Box3().setFromObject(mesh);
      w.solids.push(box);
      const l: Live = { pad: p, mesh, box, base: mesh.position.clone(), touched: 0, drop: 0 };
      // Rock under the islands (not in the void): one mesh for all the still ones, its own for the
      // ones that move, crumble or blink (it goes with them).
      if (wk < 2) {
        const depth = Math.min(7, 1.6 + Math.max(p.w, p.d) * (0.6 + rand(i) * 0.5));
        if (p.kind === 'move' || p.kind === 'fall' || p.kind === 'blink') {
          const r = new THREE.Mesh(islandRock(p.w, p.d, depth, i), wk === 0 ? soil : basalt);
          r.position.y = -h / 2 + 0.05; mesh.add(r);
        } else rockStatic[wk].push({ w: p.w, d: p.d, depth, at: [p.x, p.y - h + 0.05, p.z], seed: i });
      }
      if (p.kind === 'spin') {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(p.w * 0.95, 0.32, 0.32), new THREE.MeshBasicMaterial({ color: 0xff2d55 }));
        bar.position.set(p.x, p.y + 0.75, p.z);
        bar.add(glowSprite(0xff2d55, 3));
        w.scene.add(bar); l.bar = bar;
      }
      if (p.kind === 'check' && p.stage > 0) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.8, roughness: 0.25 }));
        pole.position.set(p.x + p.w / 2 - 0.6, p.y + 1.5, p.z);
        const flag = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.05), new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.7, side: THREE.DoubleSide }));
        flag.position.set(-0.6, 1.1, 0); pole.add(flag); w.scene.add(pole); l.flag = flag;
      }
      return l;
    });
    rockStatic.forEach((list, k) => { const m = rocks(list, k === 0 ? soil : basalt); if (m) w.scene.add(m); });
    const finish = live[live.length - 1];
    const confetti: THREE.Sprite[] = [];
    for (let i = 0; i < 6; i++) { const s = glowSprite([0xfbbf24, 0xf472b6, 0x38bdf8][i % 3], 5); s.position.set(finish.pad.x + Math.cos(i) * 4, finish.pad.y + 3 + (i % 3), finish.pad.z + Math.sin(i) * 4); w.scene.add(s); confetti.push(s); }

    // Gems.
    const gemGeo = new THREE.OctahedronGeometry(0.42);
    const gemMat = new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.08, flatShading: true });
    const chest = new THREE.Vector3();
    const gemLive = gems.map((g) => { const m = new THREE.Mesh(gemGeo, gemMat); m.position.set(g.x, g.y, g.z); m.add(glowSprite(0x22d3ee, 1.6)); w.scene.add(m); return { m, got: false, pop: 0 }; });

    // The player.
    const look = readLook(), me = new Avatar(lookHex(look), { hat: look.hat });
    me.group.rotation.y = Math.PI; // facing the way ahead
    w.scene.add(me.group);
    const body = new Body([0, 0.1, 1.5]);
    let spawn = new THREE.Vector3(0, 0.1, 1.5), score = 0, stage = 0, gemsGot = 0, falls = 0, done = false, wasGround = true, squash = 0;
    const lowest = Math.min(...pads.map((p) => p.y)) - 22;
    const report = () => {
      setHud({ stage, gems: gemsGot, falls, score, world: obbyWorld(Math.min(OBBY_STAGES, stage + 1)) });
      out.current.onProgress(score, stage);
      out.current.onStats?.([{ label: 'Checkpoints', value: `${stage} of ${OBBY_STAGES}` }, { label: 'Gems', value: String(gemsGot) }, { label: 'Falls', value: String(falls) }, { label: 'Finished', value: done ? 'Yes' : 'Not yet' }]);
    };
    // Rewind: where you were each frame for the last few seconds.
    const trail: THREE.Vector3[] = [];
    let charge = 1, rewinding = false, skillAt = 0, lastRun = 0, onKind: Pad['kind'] | null = null;
    const respawn = (why: string) => {
      falls++; score = Math.max(0, score - OBBY_FALL);
      w.burst(body.pos.clone().setY(body.pos.y + 1), 0xff2d55, 26, 7);
      body.pos.copy(spawn); body.vel.set(0, 0, 0); trail.length = 0;
      out.current.arena.announce(why, 'bad'); out.current.arena.sfx('hurt'); w.shake(0.5);
      report();
    };
    report();

    w.camera.position.set(0, 4, 10);
    w.flyIn(new THREE.Vector3(18, 34, 46), 1.9);
    w.start((dt, t) => {
      // Pads that move, crumble, or spin.
      for (const l of live) {
        const p = l.pad;
        if (p.kind === 'move') {
          const dx = Math.sin(t * 1.1 + p.phase) * 3.2;
          const before = l.mesh.position.x;
          l.mesh.position.x = l.base.x + dx;
          l.box.setFromObject(l.mesh);
          if (body.ground && Math.abs(body.pos.y - l.box.max.y) < 0.05 && body.pos.x > l.box.min.x - 0.3 && body.pos.x < l.box.max.x + 0.3 && body.pos.z > l.box.min.z - 0.3 && body.pos.z < l.box.max.z + 0.3) body.pos.x += l.mesh.position.x - before;
        }
        if (p.kind === 'fall' && l.touched) {
          const since = t - l.touched;
          if (since < 0.55) l.mesh.position.set(l.base.x + Math.sin(t * 60) * 0.06, l.base.y, l.base.z + Math.cos(t * 50) * 0.06);
          else if (since < 3.2) { l.drop += dt * 18; l.mesh.position.y -= l.drop * dt; l.box.makeEmpty(); }
          else { l.touched = 0; l.drop = 0; l.mesh.position.copy(l.base); l.box.setFromObject(l.mesh); }
        }
        if (p.kind === 'blink') {
          const on = blinkOn(t, p.phase), late = ((t + p.phase) % (BLINK_ON + BLINK_OFF)) > BLINK_ON - 0.5;
          l.mesh.visible = on && !(late && Math.sin(t * 60) > 0);
          if (on !== l.on) { l.on = on; if (on) l.box.setFromObject(l.mesh); else l.box.makeEmpty(); }
        }
        if (l.bar) {
          l.bar.rotation.y = t * (1.6 + p.stage * 0.08) + p.phase;
          const rel = body.pos.clone().sub(l.bar.position), a = l.bar.rotation.y;
          const along = rel.x * Math.cos(a) - rel.z * Math.sin(a), across = rel.x * Math.sin(a) + rel.z * Math.cos(a);
          if (Math.abs(along) < p.w * 0.48 && Math.abs(across) < 0.55 && rel.y > -1.2 && rel.y < 0.35 && !done) respawn('Zapped!');
        }
      }
      // Rewind (hold R/Q): step back along the trail instead of moving.
      const wantRewind = c.held.has('skill') && charge > 0.02 && trail.length > 2 && !done;
      if (wantRewind && !rewinding) { out.current.arena.sfx('whoosh'); w.fovBy(-8); }
      if (!wantRewind && rewinding) w.fovBy(0);
      rewinding = wantRewind;
      let floor: THREE.Box3 | null = null;
      if (rewinding) {
        for (let k = 0; k < 2 && trail.length > 1; k++) body.pos.copy(trail.pop()!);
        body.vel.set(0, 0, 0);
        charge = Math.max(0, charge - dt / REWIND_S);
        if (Math.random() < dt * 30) w.burst(body.pos.clone().setY(body.pos.y + 1), 0x67e8f9, 2, 1.5, 0);
      } else {
        if (done) { body.vel.x *= 0.9; body.vel.z *= 0.9; } else if (walk(body, c, dt, { speed: 7.5, jump: 10.8, grip: onKind === 'ice' ? OBBY_ICE_GRIP : 14 })) { out.current.arena.sfx('jump'); w.burst(body.pos, 0xffffff, 6, 2, 4); }
        floor = body.step(dt, w.solids);
        trail.push(body.pos.clone());
        if (trail.length > REWIND_S * 60) trail.shift();
        charge = Math.min(1, charge + dt / REWIND_REFILL_S);
      }
      if (body.ground && !wasGround) { squash = 1; out.current.arena.sfx('land'); w.burst(body.pos, 0xffffff, 10, 3, 8); }
      // Running kicks up a little dust; falling fast widens the view.
      const hs = Math.hypot(body.vel.x, body.vel.z);
      if (body.ground && hs > 8 && t - lastRun > 0.12) { lastRun = t; w.burst(body.pos, 0xe2e8f0, 2, 1.5, 4); }
      if (!rewinding) w.fovBy((hs > 8.5 ? 6 : 0) + (body.vel.y < -14 ? 9 : 0));
      wasGround = body.ground;
      if (t - skillAt > 0.15) { skillAt = t; setSkill((p) => (Math.abs(p.charge - charge) < 0.02 && p.active === rewinding && p.others === crowd.count ? p : { charge, active: rewinding, others: crowd.count })); }
      const on = floor ? live.find((l) => l.box === floor) : undefined;
      onKind = on?.pad.kind ?? (body.ground ? onKind : null);
      if (on) {
        if (on.pad.kind === 'belt') body.pos.x += beltDir(on.pad) * OBBY_BELT * dt;
        if (on.pad.kind === 'fall' && !on.touched) on.touched = t;
        if (on.pad.kind === 'bounce') { body.vel.y = 19; body.ground = false; squash = 1.4; out.current.arena.sfx('boost'); w.burst(body.pos, 0xf472b6, 20, 6, 6); w.shake(0.15); }
        if ((on.pad.kind === 'check' || on.pad.kind === 'finish') && on.pad.stage > stage) {
          stage = on.pad.stage; score += OBBY_CHECK; spawn = new THREE.Vector3(on.pad.x, on.pad.y + 0.1, on.pad.z);
          w.burst(spawn.clone().setY(spawn.y + 0.5), on.pad.kind === 'finish' ? 0xfbbf24 : 0x4ade80, 40, 8, 6);
          w.say(`+${OBBY_CHECK}`, spawn.clone().setY(spawn.y + 2.5), '#86efac');
          if (on.flag) (on.flag.material as THREE.MeshStandardMaterial).color.set(0x22c55e);
          if (on.pad.kind === 'finish') {
            done = true;
            const left = Math.max(0, Math.round((out.current.endsAt - out.current.clock()) / 1000));
            score += OBBY_FINISH + left * OBBY_PER_SECOND;
            out.current.arena.announce('You made it!', 'gold'); out.current.arena.sfx('win'); w.shake(0.4);
            for (let k = 0; k < 4; k++) setTimeout(() => w.burst(spawn.clone().setY(spawn.y + 3 + k), [0xfbbf24, 0xf472b6, 0x38bdf8, 0x4ade80][k], 50, 10, 5), k * 220);
            setTimeout(() => out.current.onDone(score, stage), 1800);
          } else if (stage % OBBY_PER_WORLD === 0) { setCurtain({ key: stage, title: `World ${stage / OBBY_PER_WORLD + 1}`, sub: OBBY_WORLDS[stage / OBBY_PER_WORLD] }); out.current.arena.sfx('win'); }
          else { out.current.arena.announce(`Checkpoint ${stage}!`, 'good'); out.current.arena.sfx('check'); }
          report();
        }
      }
      if ((body.pos.y < lowest || body.pos.y < spawn.y - 30) && !done) respawn('Oof! Back to the checkpoint');
      // The sky turns as you cross into the next world: over two seconds, then its light is made again.
      const wk = obbyWorld(Math.min(OBBY_STAGES, stage + 1)), k = 1 - Math.exp(-1.6 * dt);
      if (wk !== skyNow) { skyFrom = mixLook(skyFrom, SKY_LOOKS[skyNow], skyK); skyNow = wk; skyK = 0; stars.visible = galaxy.visible = wk === 2; }
      if (skyK < 1) {
        skyK = Math.min(1, skyK + dt / 2);
        const dir = w.sky(mixLook(skyFrom, SKY_LOOKS[wk], skyK), skyK >= 1);
        clouds.forEach((cl) => { cl.mat.uniforms.sunDir.value.set(dir.x, dir.z).normalize(); });
        sunDir.copy(dir);
      }
      const air = SKY_AIR[wk];
      want.fog.set(air.fog); want.sky.set(air.sky); want.ground.set(air.ground);
      (w.scene.fog as THREE.FogExp2).color.lerp(want.fog, k); hemi.color.lerp(want.sky, k); hemi.groundColor.lerp(want.ground, k);
      for (const cl of clouds) { const u = cl.mat.uniforms.amount; u.value += ((wk === 0 ? 1 : 0) - u.value) * k; cl.mesh.visible = u.value > 0.01; cl.follow(w.camera.position, t); }
      for (const e of embers) { e.position.y += dt * 2.5; if (e.position.y > worldY[1] + 6) e.position.y = worldY[1] - 22; }
      w.sunOver(body.pos);
      sun.position.copy(w.camera.position).addScaledVector(sunDir, 260);
      sun.visible = sunDir.y > -0.02;
      stars.position.copy(w.camera.position); galaxy.position.copy(w.camera.position);
      (stars.material as THREE.ShaderMaterial).uniforms.time.value = t;
      // Gems.
      chest.set(body.pos.x, body.pos.y + 1, body.pos.z);
      for (const g of gemLive) {
        if (g.got) { if (g.pop < 1) { g.pop += dt * 3; g.m.scale.setScalar(1 + g.pop); (g.m.material as THREE.Material).opacity = 1 - g.pop; if (g.pop >= 1) g.m.visible = false; } continue; }
        g.m.rotation.y = t * 2; g.m.position.y += Math.sin(t * 3 + g.m.position.x) * 0.004;
        if (g.m.position.distanceTo(chest) < 1.3) {
          g.got = true; gemsGot++; score += OBBY_GEM; g.m.material = gemMat.clone(); (g.m.material as THREE.Material).transparent = true;
          w.burst(g.m.position, 0x67e8f9, 18, 5, 2); w.say(`+${OBBY_GEM}`, g.m.position.clone().setY(g.m.position.y + 0.8), '#a5f3fc', 0.8);
          out.current.arena.sfx('coin', gemsGot % 8); report();
        }
      }
      beltR.tex.offset.x -= dt * OBBY_BELT / 2; beltL.tex.offset.x += dt * OBBY_BELT / 2;
      magma.mesh.visible = wk === 1 || (wk === 2 && skyK < 1); if (magma.mesh.visible) magma.follow(w.camera.position, t);
      confetti.forEach((s, i) => { s.position.y = finish.pad.y + 3 + Math.sin(t * 2 + i) * 0.8; });
      // The character and the camera.
      me.group.position.copy(body.pos);
      squash = Math.max(0, squash - dt * 5);
      me.group.scale.set(1 + squash * 0.12, 1 - squash * 0.15, 1 + squash * 0.12);
      me.update(dt, body.vel, body.ground);
      follow(w.camera, body.pos, c, dt, { dist: 8.5, height: 2.6 });
      w.focus.copy(body.pos);
      crowd.update(dt, { pos: body.pos, ry: me.group.rotation.y, air: !body.ground, part: obbyWorld(Math.min(OBBY_STAGES, stage + 1)), color: lookHex(look), hat: look.hat });
    });
    return () => { c.dispose(); controls.current = null; w.dispose(); };
  }, [seed]);

  return (
    <div className="mx-auto w-full">
      <WorldFrame net={net} canvas={canvas} controls={controls} buttons={[{ id: 'skill', label: 'Rewind' }, { id: 'jump', label: 'Jump' }]} keys="WASD move · Space jump · Shift run · hold R to rewind" label="Skyline Obby: a 3D obstacle course in the sky" curtain={curtain} others={skill.others}>
        {skill.active && <div className="play-rewind pointer-events-none absolute inset-0" aria-hidden />}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap gap-2">
          <SkillRing label="Rewind" keyName="R" charge={skill.charge} active={skill.active} />
          <HudChip label={OBBY_WORLDS[hud.world]} value={`Stage ${hud.stage}/${OBBY_STAGES}`} tone="good" />
          <HudChip label="Gems" value={hud.gems} tone="gold" />
          <HudChip label="Falls" value={hud.falls} tone={hud.falls ? 'bad' : 'white'} />
        </div>
      </WorldFrame>
    </div>
  );
}
