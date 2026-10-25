'use client';

import { useEffect, useRef, useState } from 'react';
import { GAMES } from '@/lib/play';
import { OBBY_CHECK, OBBY_FALL, OBBY_FINISH, OBBY_GEM, OBBY_PER_SECOND, OBBY_STAGES, obbyCourse, type Pad } from '@/lib/play/worlds';
import { useArena } from './arena';
import type { GameProps } from './game-props';
import { Avatar, Body, Controls, THREE, World, follow, glowSprite, walk } from './world/core';
import { HudChip, WorldFrame } from './world/Stage';

// Skyline Obby (src/lib/play/worlds.ts): a Roblox-style obstacle course in the sky. Run and jump
// pad to pad (moving, crumbling, bouncy, and wide ones with a spinning laser), checkpoints save
// where you start again, gems add points, and the golden finish ends the round early with a bonus.

const HUES = [0x38bdf8, 0xa78bfa, 0xf472b6, 0xfbbf24, 0x34d399];

interface Live { pad: Pad; mesh: THREE.Mesh; box: THREE.Box3; base: THREE.Vector3; touched: number; drop: number; bar?: THREE.Mesh; flag?: THREE.Mesh }

export function SkylineObby({ seed, startsAt, endsAt, clock, onProgress, onDone, onStats }: GameProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controls = useRef<Controls | null>(null);
  const arena = useArena();
  const [hud, setHud] = useState({ stage: 0, gems: 0, falls: 0, score: 0 });
  const out = useRef({ arena, onProgress, onDone, onStats, clock, endsAt, startsAt });
  useEffect(() => { out.current = { arena, onProgress, onDone, onStats, clock, endsAt, startsAt }; });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const w = new World(el, { fov: 68, bg: 0x6aa8ff, fog: [0xc9b6ff, 60, 190] });
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
    const sun = glowSprite(0xfff1b8, 70); sun.position.set(80, 90, -220); w.scene.add(sun);
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const clouds: THREE.Group[] = [];
    const rand = (k: number) => { const x = Math.sin(seed * 0.001 + k * 12.9898) * 43758.5453; return x - Math.floor(x); };
    for (let i = 0; i < 26; i++) {
      const g = new THREE.Group();
      for (let j = 0; j < 4; j++) { const m = new THREE.Mesh(new THREE.BoxGeometry(4 + rand(i * 9 + j) * 6, 2 + rand(i * 7 + j) * 2, 4 + rand(i * 5 + j) * 5), cloudMat); m.position.set(j * 3 - 4, rand(i + j) * 1.5, rand(i * 3 + j) * 3); g.add(m); }
      g.position.set((rand(i) - 0.5) * 160, -14 - rand(i * 2) * 30, 20 - rand(i * 4) * 300);
      w.scene.add(g); clouds.push(g);
    }

    // The pads.
    const live: Live[] = pads.map((p) => {
      const hue = p.kind === 'check' ? 0x22c55e : p.kind === 'finish' ? 0xfbbf24 : p.kind === 'bounce' ? 0xf472b6 : p.kind === 'fall' ? 0xfb923c : HUES[p.stage % HUES.length];
      const mat = new THREE.MeshLambertMaterial({ color: hue, emissive: hue, emissiveIntensity: p.kind === 'finish' ? 0.5 : 0.18 });
      const h = p.kind === 'bounce' ? 0.6 : 0.9;
      const mesh = w.box([p.x, p.y - h / 2, p.z], [p.w, h, p.d], mat, false);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
      mesh.add(edge);
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
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3), new THREE.MeshLambertMaterial({ color: 0xffffff }));
        pole.position.set(p.x + p.w / 2 - 0.6, p.y + 1.5, p.z);
        const flag = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.05), new THREE.MeshLambertMaterial({ color: 0x9ca3af, emissive: 0x111111 }));
        flag.position.set(-0.6, 1.1, 0); pole.add(flag); w.scene.add(pole); l.flag = flag;
      }
      return l;
    });
    const finish = live[live.length - 1];
    const confetti: THREE.Sprite[] = [];
    for (let i = 0; i < 6; i++) { const s = glowSprite([0xfbbf24, 0xf472b6, 0x38bdf8][i % 3], 5); s.position.set(finish.pad.x + Math.cos(i) * 4, finish.pad.y + 3 + (i % 3), finish.pad.z + Math.sin(i) * 4); w.scene.add(s); confetti.push(s); }

    // Gems.
    const gemGeo = new THREE.OctahedronGeometry(0.42);
    const gemMat = new THREE.MeshLambertMaterial({ color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 0.8 });
    const gemLive = gems.map((g) => { const m = new THREE.Mesh(gemGeo, gemMat); m.position.set(g.x, g.y, g.z); m.add(glowSprite(0x22d3ee, 1.6)); w.scene.add(m); return { m, got: false, pop: 0 }; });

    // The player.
    const me = new Avatar(0xec4899);
    me.group.rotation.y = Math.PI; // facing the way ahead
    w.scene.add(me.group);
    const body = new Body([0, 0.1, 1.5]);
    let spawn = new THREE.Vector3(0, 0.1, 1.5), score = 0, stage = 0, gemsGot = 0, falls = 0, done = false, wasGround = true, squash = 0;
    const lowest = Math.min(...pads.map((p) => p.y)) - 22;
    const report = () => {
      setHud({ stage, gems: gemsGot, falls, score });
      out.current.onProgress(score, stage);
      out.current.onStats?.([{ label: 'Checkpoints', value: `${stage} of ${OBBY_STAGES}` }, { label: 'Gems', value: String(gemsGot) }, { label: 'Falls', value: String(falls) }, { label: 'Finished', value: done ? 'Yes' : 'Not yet' }]);
    };
    const respawn = (why: string) => {
      falls++; score = Math.max(0, score - OBBY_FALL);
      body.pos.copy(spawn); body.vel.set(0, 0, 0);
      out.current.arena.announce(why, 'bad'); out.current.arena.sfx('hurt'); out.current.arena.shake(0.6);
      report();
    };
    report();

    w.camera.position.set(0, 4, 10);
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
        if (l.bar) {
          l.bar.rotation.y = t * (1.6 + p.stage * 0.08) + p.phase;
          const rel = body.pos.clone().sub(l.bar.position), a = l.bar.rotation.y;
          const along = rel.x * Math.cos(a) - rel.z * Math.sin(a), across = rel.x * Math.sin(a) + rel.z * Math.cos(a);
          if (Math.abs(along) < p.w * 0.48 && Math.abs(across) < 0.55 && rel.y > -1.2 && rel.y < 0.35 && !done) respawn('Zapped!');
        }
      }
      if (done) { body.vel.x *= 0.9; body.vel.z *= 0.9; } else if (walk(body, c, dt, { speed: 7.5, jump: 10.8 })) out.current.arena.sfx('jump');
      const floor = body.step(dt, w.solids);
      if (body.ground && !wasGround) { squash = 1; out.current.arena.sfx('land'); }
      wasGround = body.ground;
      const on = floor ? live.find((l) => l.box === floor) : undefined;
      if (on) {
        if (on.pad.kind === 'fall' && !on.touched) on.touched = t;
        if (on.pad.kind === 'bounce') { body.vel.y = 19; body.ground = false; squash = 1.4; out.current.arena.sfx('boost'); }
        if ((on.pad.kind === 'check' || on.pad.kind === 'finish') && on.pad.stage > stage) {
          stage = on.pad.stage; score += OBBY_CHECK; spawn = new THREE.Vector3(on.pad.x, on.pad.y + 0.1, on.pad.z);
          if (on.flag) (on.flag.material as THREE.MeshLambertMaterial).color.set(0x22c55e);
          if (on.pad.kind === 'finish') {
            done = true;
            const left = Math.max(0, Math.round((out.current.endsAt - out.current.clock()) / 1000));
            score += OBBY_FINISH + left * OBBY_PER_SECOND;
            out.current.arena.announce('You made it!', 'gold'); out.current.arena.sfx('win');
            setTimeout(() => out.current.onDone(score, stage), 1800);
          } else { out.current.arena.announce(`Checkpoint ${stage}!`, 'good'); out.current.arena.sfx('check'); }
          report();
        }
      }
      if (body.pos.y < lowest && !done) respawn('Oof! Back to the checkpoint');
      // Gems.
      for (const g of gemLive) {
        if (g.got) { if (g.pop < 1) { g.pop += dt * 3; g.m.scale.setScalar(1 + g.pop); (g.m.material as THREE.Material).opacity = 1 - g.pop; if (g.pop >= 1) g.m.visible = false; } continue; }
        g.m.rotation.y = t * 2; g.m.position.y += Math.sin(t * 3 + g.m.position.x) * 0.004;
        if (g.m.position.distanceTo(body.pos.clone().add(new THREE.Vector3(0, 1, 0))) < 1.3) {
          g.got = true; gemsGot++; score += OBBY_GEM; g.m.material = gemMat.clone(); (g.m.material as THREE.Material).transparent = true;
          out.current.arena.sfx('coin', gemsGot % 8); report();
        }
      }
      for (const cl of clouds) { cl.position.x += dt * 0.8; if (cl.position.x > 90) cl.position.x = -90; }
      confetti.forEach((s, i) => { s.position.y = finish.pad.y + 3 + Math.sin(t * 2 + i) * 0.8; });
      // The character and the camera.
      me.group.position.copy(body.pos);
      squash = Math.max(0, squash - dt * 5);
      me.group.scale.set(1 + squash * 0.12, 1 - squash * 0.15, 1 + squash * 0.12);
      me.update(dt, body.vel, body.ground);
      follow(w.camera, body.pos, c, dt, { dist: 8.5, height: 2.6 });
    });
    return () => { c.dispose(); controls.current = null; w.dispose(); };
  }, [seed]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <WorldFrame canvas={canvas} controls={controls} buttons={[{ id: 'jump', label: 'Jump' }]} keys="WASD move · Space jump · Shift run" label="Skyline Obby: a 3D obstacle course in the sky">
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap gap-2">
          <HudChip label="Checkpoint" value={`${hud.stage}/${OBBY_STAGES}`} tone="good" />
          <HudChip label="Gems" value={hud.gems} tone="gold" />
          <HudChip label="Falls" value={hud.falls} tone={hud.falls ? 'bad' : 'white'} />
        </div>
      </WorldFrame>
      <p className="mt-2 text-center text-xs text-zinc-400">{GAMES.obby.how}</p>
    </div>
  );
}
