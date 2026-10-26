'use client';

import { useEffect, useRef, useState } from 'react';
import { GAMES } from '@/lib/play';
import { BLINK_ON, BLINK_OFF, OBBY_BELT, OBBY_CHECK, OBBY_ICE_GRIP, OBBY_FALL, OBBY_FINISH, OBBY_GEM, OBBY_PER_SECOND, OBBY_PER_WORLD, OBBY_STAGES, OBBY_WORLDS, beltDir, blinkOn, obbyCourse, obbyWorld, type Pad } from '@/lib/play/worlds';
import { useArena } from './arena';
import { lookHex, readLook } from './PlayerCard';
import type { GameProps } from './game-props';
import { Avatar, Body, Controls, THREE, World, follow, glowSprite, walk } from './world/core';
import { Crowd } from './world/crowd';
import { cloud, lava, surface } from './world/textures';
import { HudChip, SkillRing, WorldFrame } from './world/Stage';

// Skyline Obby (src/lib/play/worlds.ts): a Roblox-style obstacle course in the sky. Run and jump
// pad to pad (moving, crumbling, bouncy, blinking, and wide ones with a spinning laser), checkpoints
// save where you start again, gems add points, and the golden finish ends the round early with a
// bonus. Its own trick (M38): Rewind. Hold R (or Q) to run time backwards up to three seconds and
// undo a bad jump; the charge refills while you play. In a room, the others run beside you.

const HUES = [[0x38bdf8, 0xa78bfa, 0xf472b6, 0xfbbf24, 0x34d399], [0xf97316, 0xef4444, 0xfbbf24, 0xa16207, 0xf43f5e], [0xd946ef, 0x22d3ee, 0xa855f7, 0x818cf8, 0xf0abfc]];
/** Each world's sky (top, middle, low), fog and light. */
const SKIES = [
  { top: 0x2b59ff, mid: 0x9b8cff, low: 0xffb3d9, fog: 0xc9b6ff, sky: 0xdfe8ff, ground: 0x6b4f8f },
  { top: 0x2a0a0a, mid: 0xb4381f, low: 0xff8a3d, fog: 0x8a2c18, sky: 0xffc9a3, ground: 0x5a1a0a },
  { top: 0x05010f, mid: 0x2a0b4a, low: 0x7c1d8f, fog: 0x1b0933, sky: 0xc4b5fd, ground: 0x2a0b4a },
];

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
    const w = new World(el, { fov: 68, bg: 0x6aa8ff, fog: [0xc9b6ff, 60, 190], glow: { strength: 0.35, radius: 0.4, threshold: 0.9 }, env: 0.9 });
    const crowd = new Crowd(w, () => out.current.net);
    const c = new Controls(el);
    controls.current = c;
    const { pads, gems } = obbyCourse(seed);

    // The sky: a gradient dome, a sun, drifting clouds and far islands below.
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x2b59ff) }, mid: { value: new THREE.Color(0x9b8cff) }, low: { value: new THREE.Color(0xffb3d9) } },
      vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 p; void main(){ float h = normalize(p).y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.6, h)) : mix(mid, low, smoothstep(0.0, -0.4, h)); gl_FragColor = vec4(c, 1.0); }',
    }));
    w.scene.add(sky);
    w.lights({ sky: 0xdfe8ff, ground: 0x6b4f8f, power: 2.4, at: [40, 70, 30], ambient: 1.1 });
    const hemi = w.scene.children.find((o) => o instanceof THREE.HemisphereLight) as THREE.HemisphereLight;
    const skyU = (sky.material as THREE.ShaderMaterial).uniforms;
    // Where each world starts and ends along the course (its first and last checkpoints).
    const zOf = (stage: number) => pads.find((p) => p.stage === stage && (p.kind === 'check' || p.kind === 'finish'))!.z;
    const worldZ = [0, 1, 2].map((k) => [k === 0 ? 30 : zOf(k * OBBY_PER_WORLD), zOf(Math.min(OBBY_STAGES, (k + 1) * OBBY_PER_WORLD))]);
    const worldY = [0, 1, 2].map((k) => Math.min(...pads.filter((p) => obbyWorld(Math.max(1, p.stage)) === k).map((p) => p.y)));
    // Lava Peaks: a glowing sea far below and embers rising. Neon Void: stars and a grid.
    const lavaMap = lava().clone(); lavaMap.repeat.set(10, 10); lavaMap.needsUpdate = true;
    const lavaSea = new THREE.Mesh(new THREE.PlaneGeometry(260, Math.abs(worldZ[1][1] - worldZ[1][0]) + 120), new THREE.MeshBasicMaterial({ map: lavaMap, color: 0xffffff, fog: false }));
    lavaSea.rotation.x = -Math.PI / 2; lavaSea.position.set(0, worldY[1] - 26, (worldZ[1][0] + worldZ[1][1]) / 2); w.scene.add(lavaSea);
    const embers: THREE.Sprite[] = [];
    for (let i = 0; i < 30; i++) { const e = glowSprite(i % 2 ? 0xff7a1a : 0xfbbf24, 1.2); e.position.set((Math.sin(i * 7.1) * 0.5) * 70, worldY[1] - 20 + (i * 1.7) % 30, worldZ[1][0] - ((i * 37) % 100) / 100 * Math.abs(worldZ[1][1] - worldZ[1][0])); w.scene.add(e); embers.push(e); }
    const starPos = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) starPos.set([(Math.sin(i * 12.9) * 0.5) * 300, worldY[2] - 40 + ((i * 7.31) % 1) * 160 + Math.cos(i) * 60, worldZ[2][0] - ((i * 0.618) % 1) * (Math.abs(worldZ[2][1] - worldZ[2][0]) + 80)], i * 3);
    w.scene.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPos, 3)), new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, fog: false })));
    const grid = new THREE.GridHelper(400, 80, 0xd946ef, 0x6d28d9);
    grid.position.set(0, worldY[2] - 30, (worldZ[2][0] + worldZ[2][1]) / 2); w.scene.add(grid);
    const want = { top: new THREE.Color(), mid: new THREE.Color(), low: new THREE.Color(), fog: new THREE.Color(), sky: new THREE.Color(), ground: new THREE.Color() };
    const sun = glowSprite(0xfff1b8, 70); sun.position.set(80, 90, -220); w.scene.add(sun);
    const clouds: THREE.Sprite[] = [];
    const rand = (k: number) => { const x = Math.sin(seed * 0.001 + k * 12.9898) * 43758.5453; return x - Math.floor(x); };
    for (let i = 0; i < 34; i++) {
      const g = cloud(14 + rand(i * 9) * 22, 0.55 + rand(i * 7) * 0.4);
      g.position.set((rand(i) - 0.5) * 170, -10 - rand(i * 2) * 34, 20 - rand(i * 4) * (Math.abs(worldZ[0][1]) + 40));
      w.scene.add(g); clouds.push(g);
    }

    // The pads.
    const iceMat = new THREE.MeshStandardMaterial({ color: 0xcdefff, roughness: 0.04, metalness: 0.1, emissive: 0x7dd3fc, emissiveIntensity: 0.18, transparent: true, opacity: 0.9 });
    const beltR = belt(1), beltL = belt(-1);
    const live: Live[] = pads.map((p) => {
      const hue = p.kind === 'check' ? 0x22c55e : p.kind === 'finish' ? 0xfbbf24 : p.kind === 'bounce' ? 0xf472b6 : p.kind === 'fall' ? 0xfb923c : p.kind === 'blink' ? 0x22d3ee : HUES[obbyWorld(Math.max(1, p.stage))][p.stage % 5];
      // Weathered stone tinted in the pad's colour, with rounded edges that catch the sun; clear
      // glossy ice; belts of dark rubber with arrows that run the way they carry you.
      const mat = p.kind === 'ice' ? iceMat : p.kind === 'belt' ? (beltDir(p) > 0 ? beltR.mat : beltL.mat) : surface('stone', { color: hue, emissive: hue, glow: p.kind === 'finish' ? 0.45 : p.kind === 'blink' || p.kind === 'bounce' ? 0.3 : 0.08 });
      const h = p.kind === 'bounce' ? 0.6 : 0.9;
      const mesh = w.box([p.x, p.y - h / 2, p.z], [p.w, h, p.d], mat, false, { tile: p.kind === 'belt' ? 2 : 3, round: p.kind === 'belt' ? 0.05 : 0.18 });
      const box = new THREE.Box3().setFromObject(mesh);
      w.solids.push(box);
      const l: Live = { pad: p, mesh, box, base: mesh.position.clone(), touched: 0, drop: 0 };
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
      // The sky turns as you cross into the next world.
      const sk = SKIES[obbyWorld(Math.min(OBBY_STAGES, stage + 1))], k = 1 - Math.exp(-1.6 * dt);
      want.top.set(sk.top); want.mid.set(sk.mid); want.low.set(sk.low); want.fog.set(sk.fog); want.sky.set(sk.sky); want.ground.set(sk.ground);
      skyU.top.value.lerp(want.top, k); skyU.mid.value.lerp(want.mid, k); skyU.low.value.lerp(want.low, k);
      (w.scene.fog as THREE.Fog).color.lerp(want.fog, k); hemi.color.lerp(want.sky, k); hemi.groundColor.lerp(want.ground, k);
      for (const e of embers) { e.position.y += dt * 2.5; if (e.position.y > worldY[1] + 6) e.position.y = worldY[1] - 22; }
      w.sunOver(body.pos);
      sky.position.copy(w.camera.position);
      sun.position.set(w.camera.position.x + 80, w.camera.position.y + 90, w.camera.position.z - 220);
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
      for (const cl of clouds) { cl.position.x += dt * 0.8; if (cl.position.x > 90) cl.position.x = -90; }
      beltR.tex.offset.x -= dt * OBBY_BELT / 2; beltL.tex.offset.x += dt * OBBY_BELT / 2;
      lavaMap.offset.y += dt * 0.012; lavaMap.offset.x = Math.sin(t * 0.1) * 0.05;
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
    <div className="mx-auto w-full max-w-6xl">
      <WorldFrame net={net} canvas={canvas} controls={controls} buttons={[{ id: 'skill', label: 'Rewind' }, { id: 'jump', label: 'Jump' }]} keys="WASD move · Space jump · Shift run · hold R to rewind" label="Skyline Obby: a 3D obstacle course in the sky" curtain={curtain} others={skill.others}>
        {skill.active && <div className="play-rewind pointer-events-none absolute inset-0" aria-hidden />}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap gap-2">
          <SkillRing label="Rewind" keyName="R" charge={skill.charge} active={skill.active} />
          <HudChip label={OBBY_WORLDS[hud.world]} value={`Stage ${hud.stage}/${OBBY_STAGES}`} tone="good" />
          <HudChip label="Gems" value={hud.gems} tone="gold" />
          <HudChip label="Falls" value={hud.falls} tone={hud.falls ? 'bad' : 'white'} />
        </div>
      </WorldFrame>
      <p className="mt-2 text-center text-xs text-zinc-400">{GAMES.obby.how}</p>
    </div>
  );
}
