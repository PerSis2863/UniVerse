'use client';

import { useEffect, useRef, useState } from 'react';
import { Heart, Shield, Zap } from 'lucide-react';
import { GAMES } from '@/lib/play';
import { STRIKE_BLAST_DMG, STRIKE_BLAST_R, STRIKE_BOSS, STRIKE_BOT_HP, STRIKE_COMBO_S, isBossWave, strikeBossHp, STRIKE_DOWN, STRIKE_FIRE_S, STRIKE_GRENADES, STRIKE_HIT, STRIKE_SIZE, STRIKE_TAG, STRIKE_WAVE, strikeArena, strikeMultiplier, strikeWave } from '@/lib/play/worlds';
import { cn } from '@/lib/utils';
import { useArena } from './arena';
import { lookHex, readLook } from './PlayerCard';
import type { GameProps } from './game-props';
import { Avatar, Body, Controls, THREE, World, approach, glowSprite, walk } from './world/core';
import { Crowd } from './world/crowd';
import { surface } from './world/textures';
import { HudChip, SkillRing, WorldFrame } from './world/Stage';

// Neon Strike (16+, src/lib/play/worlds.ts): laser tag in a neon arena against waves of sentinel
// drones. Over-the-shoulder camera and a crosshair; hold to fire (a beam, sparks, the drone bursts
// into cubes). Drones roam, then strafe and shoot slow bolts you can dodge or hide from. Tags in a
// row multiply; health, rapid fire and shields drop in. Out of health: tagged out, back in 1.5 s.

interface Bot { g: THREE.Group; eye: THREE.Mesh; hp: number; max: number; boss: boolean; to: THREE.Vector3; next: number; speed: number; flash: number }
interface Bolt { m: THREE.Mesh; v: THREE.Vector3; life: number }
interface Bit { m: THREE.Mesh; v: THREE.Vector3; life: number }
const UP = new THREE.Vector3(0, 1, 0);
type Drop = { m: THREE.Mesh; kind: 'health' | 'rapid' | 'shield'; until: number };
const DROP_COLOR = { health: 0x34d399, rapid: 0xfbbf24, shield: 0x60a5fa } as const;

/** Bullet time (M38): every tag charges it (a boss fills it); Q slows the drones and their bolts. */
const SLOW_S = 5, SLOW_SCALE = 0.28;

export function NeonStrike({ seed, endsAt, clock, onProgress, onStats, net }: GameProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controls = useRef<Controls | null>(null);
  const arena = useArena();
  const [hud, setHud] = useState({ boss: 0, nades: STRIKE_GRENADES, hp: 100, wave: 1, left: 0, combo: 0, shield: 0, rapid: false, hurt: 0, down: false, hitmark: 0 });
  const [skill, setSkill] = useState({ charge: 0, active: false, others: 0 });
  const out = useRef({ arena, onProgress, onStats, clock, endsAt, net });
  useEffect(() => { out.current = { arena, onProgress, onStats, clock, endsAt, net }; });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const w = new World(el, { fov: 72, bg: 0x120a22, fog: [0x1a0f2e, 30, 110], glow: { strength: 0.85, radius: 0.55, threshold: 0.55 }, env: 0.45 });
    const crowd = new Crowd(w, () => out.current.net);
    const c = new Controls(el);
    controls.current = c;
    const say = (t: string, tone: 'pink' | 'good' | 'bad' | 'gold' = 'pink') => out.current.arena.announce(t, tone);

    // The arena: a glowing grid floor, neon walls, cover blocks with lit edges, light pillars.
    w.lights({ sky: 0xc4b5fd, ground: 0x3b1d5e, sun: 0xf5d0fe, power: 2, at: [20, 40, 10], ambient: 1.6 });
    // Glossy concrete with a glowing grid set into it (the grid is the light, the concrete reflects).
    const grid = document.createElement('canvas');
    grid.width = grid.height = 256;
    const g2 = grid.getContext('2d')!;
    g2.fillStyle = '#000'; g2.fillRect(0, 0, 256, 256);
    g2.strokeStyle = 'rgba(192,132,252,0.95)'; g2.lineWidth = 3; g2.strokeRect(0, 0, 256, 256);
    g2.strokeStyle = 'rgba(236,72,153,0.3)'; g2.lineWidth = 1; g2.beginPath(); g2.moveTo(128, 0); g2.lineTo(128, 256); g2.moveTo(0, 128); g2.lineTo(256, 128); g2.stroke();
    const tex = new THREE.CanvasTexture(grid);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    w.box([0, -0.5, 0], [STRIKE_SIZE, 1, STRIKE_SIZE], surface('concrete', { color: 0x3a3450, rough: 0.55, emissive: 0xffffff, glow: 1.4, emissiveMap: tex }), true, { tile: 4 });
    const half = STRIKE_SIZE / 2;
    const wallMat = surface('panels', { color: 0x6d4fa8, metal: 0.65, rough: 0.9, emissive: 0x4c1d95, glow: 0.35 });
    for (const [x, z, sx, sz] of [[0, -half, STRIKE_SIZE, 1], [0, half, STRIKE_SIZE, 1], [-half, 0, 1, STRIKE_SIZE], [half, 0, 1, STRIKE_SIZE]] as const) {
      const m = w.box([x, 3, z], [sx, 6, sz], wallMat, true, { tile: 3 });
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0xd946ef })));
    }
    const coverMat = surface('panels', { color: 0x5b4a86, metal: 0.55, rough: 0.85, emissive: 0x1e1040, glow: 0.4 });
    const edgeA = new THREE.LineBasicMaterial({ color: 0xa855f7 }), edgeB = new THREE.LineBasicMaterial({ color: 0x22d3ee });
    // The cover blocks: two merged meshes (one per edge colour), so they cost two draws, not fifty.
    const covers = strikeArena(seed).map((k) => ({ at: [k.x, k.h / 2, k.z] as [number, number, number], size: [k.w, k.h, k.d] as [number, number, number] }));
    for (const [part, edge] of [[covers.filter((_, i) => i % 2), edgeA], [covers.filter((_, i) => !(i % 2)), edgeB]] as const) {
      const m = w.boxes([...part], coverMat, true, w.scene, { tile: 2 });
      if (m) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), edge));
    }
    for (const [x, z] of [[-half + 3, -half + 3], [half - 3, -half + 3], [-half + 3, half - 3], [half - 3, half - 3]]) {
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 10), new THREE.MeshBasicMaterial({ color: 0xf0abfc }));
      pil.position.set(x, 5, z); w.scene.add(pil);
      const l = new THREE.PointLight(0xd946ef, 120, 45); l.position.set(x, 6, z); w.scene.add(l);
    }
    const solidsNoFloor = w.solids.slice(1);

    // The player.
    const look = readLook(), me = new Avatar(lookHex(look), { legs: 0x111827, hat: look.hat });
    w.scene.add(me.group);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.8), new THREE.MeshStandardMaterial({ color: 0x1e293b, emissive: 0x22d3ee, emissiveIntensity: 0.35, metalness: 0.85, roughness: 0.3 }));
    gun.position.set(0.62, 1.2, 0.45); me.group.add(gun);
    const body = new Body([0, 0.05, 0]);
    let hp = 100, shield = 0, rapidUntil = 0, cool = 0, downUntil = 0, safeUntil = 0, score = 0, tags = 0, shots = 0, hits = 0, combo = 0, lastTag = -99, best = 0, wave = 0, nextWaveAt = 1, hurtAt = -9;

    // Drones, bolts, debris, drops.
    const bots: Bot[] = [], bolts: Bolt[] = [], bits: Bit[] = [], drops: Drop[] = [];
    const botBody = new THREE.SphereGeometry(0.7, 20, 14), ringGeo = new THREE.TorusGeometry(1.05, 0.08, 8, 32), eyeGeo = new THREE.SphereGeometry(0.26, 12, 10);
    const boltGeo = new THREE.SphereGeometry(0.2, 10, 8), boltMat = new THREE.MeshBasicMaterial({ color: 0xff3b6b });
    const bitGeo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    const r = (() => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    const spot = () => new THREE.Vector3((r() - 0.5) * (STRIKE_SIZE - 10), 1.6 + r() * 2.5, (r() - 0.5) * (STRIKE_SIZE - 10));
    const spawnWave = () => {
      wave++;
      const boss = isBossWave(wave), count = boss ? Math.ceil(strikeWave(wave - 1) / 2) + 1 : strikeWave(wave - 1);
      for (let i = 0; i < count; i++) {
        const big = boss && i === 0;
        const g = new THREE.Group();
        const shell = new THREE.Mesh(botBody, new THREE.MeshStandardMaterial({ color: 0x2a1f40, emissive: 0x3b0764, metalness: 0.8, roughness: 0.28 }));
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: big ? 0xfbbf24 : 0xec4899 })); ring.rotation.x = Math.PI / 2;
        const eye = new THREE.Mesh(eyeGeo, new THREE.MeshBasicMaterial({ color: 0xff2d55 })); eye.position.z = 0.55;
        g.add(shell, ring, eye, glowSprite(big ? 0xfbbf24 : 0xec4899, 2.6));
        if (big) { g.scale.setScalar(2.4); const ring2 = ring.clone(); ring2.rotation.set(0, 0, 0); g.add(ring2); }
        const at = spot(); if (at.length() < 14) at.setLength(18);
        if (big) at.y += 2.5;
        g.position.copy(at);
        w.scene.add(g);
        const hpMax = big ? strikeBossHp(wave) : STRIKE_BOT_HP;
        bots.push({ g, eye, hp: hpMax, max: hpMax, boss: big, to: spot(), next: 1.5 + r() * 2, speed: big ? 2.2 : 3 + wave * 0.35, flash: 0 });
      }
      if (boss) { say(`BOSS WAVE ${wave}!`, 'gold'); out.current.arena.sfx('thunder'); out.current.arena.shake(0.8); } else say(`Wave ${wave}`, 'pink');
      out.current.arena.sfx('alarm');
      report();
    };
    const report = () => {
      const bossNow = bots.find((b) => b.boss);
      setHud((h) => ({ ...h, hp: Math.max(0, Math.round(hp)), nades: grenades, wave, left: bots.length, combo, shield, rapid: rapidUntil > now, down: downUntil > now, boss: bossNow ? bossNow.hp / bossNow.max : 0 }));
      out.current.onProgress(score, tags);
      out.current.onStats?.([{ label: 'Tags', value: String(tags) }, { label: 'Accuracy', value: `${shots ? Math.round((100 * hits) / shots) : 0}%` }, { label: 'Best combo', value: `×${strikeMultiplier(best)}` }, { label: 'Waves cleared', value: String(Math.max(0, wave - (bots.length ? 1 : 0))) }]);
    };
    let now = 0;
    const ray = new THREE.Raycaster();
    const beamMat = new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true });
    const beams: { l: THREE.Line; life: number }[] = [];
    const flash = glowSprite(0x67e8f9, 1.4); flash.visible = false; w.scene.add(flash);

    let slowMeter = 0, slowUntil = 0, skillAt = 0;
    // Pulse grenades: thrown in an arc, they burst on what they hit (or after 1.6 s) and hurt every
    // drone in reach, through cover. A ring of light shows the blast.
    let grenades = STRIKE_GRENADES;
    const nades: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [], rings: { m: THREE.Mesh; life: number }[] = [];
    const nadeGeo = new THREE.SphereGeometry(0.22, 14, 10), nadeMat = new THREE.MeshStandardMaterial({ color: 0x14532d, emissive: 0x4ade80, emissiveIntensity: 1.2, metalness: 0.6, roughness: 0.3 });
    const ringGeo2 = new THREE.RingGeometry(0.85, 1, 48);
    const blast = (at: THREE.Vector3, t: number) => {
      w.burst(at, 0x4ade80, 70, 12, 6); w.burst(at, 0xffffff, 20, 6, 2); w.shake(0.6); w.freeze(70);
      out.current.arena.sfx('boom');
      const ring = new THREE.Mesh(ringGeo2, new THREE.MeshBasicMaterial({ color: 0x86efac, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(at.x, Math.max(0.1, at.y), at.z); w.scene.add(ring); rings.push({ m: ring, life: 0.5 });
      let n = 0;
      for (const b of [...bots]) if (b.g.position.distanceTo(at) < STRIKE_BLAST_R + (b.boss ? 1.5 : 0)) { hurt(b, STRIKE_BLAST_DMG, t); n++; }
      if (n > 1) say(`${n} in one blast!`, 'gold');
      report();
    };
    // A drone takes damage (a beam or a blast); at zero it bursts, scores, and may drop a power-up.
    const hurt = (target: Bot, n: number, t: number) => {
      target.hp -= n; target.flash = 0.12;
      if (target.hp <= 0) {
        combo = t - lastTag < STRIKE_COMBO_S ? combo + 1 : 1; lastTag = t; best = Math.max(best, combo);
        const mult = strikeMultiplier(combo); score += STRIKE_TAG * mult + (target.boss ? STRIKE_BOSS : 0); tags++;
        if (target.boss) { say(`Boss down! +${STRIKE_BOSS}`, 'gold'); w.shake(0.9); }
        slowMeter = Math.min(1, slowMeter + (target.boss ? 1 : 0.2));
        w.freeze(target.boss ? 240 : 55);
        w.burst(target.g.position, 0xec4899, target.boss ? 90 : 30, target.boss ? 14 : 9, 8);
        w.say(`+${STRIKE_TAG * mult}`, target.g.position.clone().setY(target.g.position.y + 1.2), mult > 1 ? '#fde68a' : '#f9a8d4');
        for (let i = 0; i < (target.boss ? 40 : 14); i++) {
          const m = new THREE.Mesh(bitGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? 0xec4899 : 0xa855f7 }));
          m.position.copy(target.g.position);
          w.scene.add(m);
          bits.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 12, Math.random() * 9, (Math.random() - 0.5) * 12), life: 1.2 });
        }
        w.scene.remove(target.g); bots.splice(bots.indexOf(target), 1);
        out.current.arena.sfx('boom'); w.shake(0.25);
        if (mult > 1) say(`Combo ×${mult}!`, 'gold');
        if (!bots.length) nextWaveAt = t + 3;
        if (r() < 0.3) { const kind = (['health', 'rapid', 'shield'] as const)[Math.floor(r() * 3)]; const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshBasicMaterial({ color: DROP_COLOR[kind] })); m.position.set(target.g.position.x, 1, target.g.position.z); m.add(glowSprite(DROP_COLOR[kind], 2.4)); w.scene.add(m); drops.push({ m, kind, until: t + 12 }); }
      }
    };

    w.camera.position.set(0, 3, 6);
    w.flyIn(new THREE.Vector3(0, 34, 40), 1.8);
    w.start((dt, t) => {
      now = t;
      const down = downUntil > t;
      // Bullet time: the drones' world runs slow; you don't.
      if (c.take('skill') && slowMeter >= 1 && !down) { slowMeter = 0; slowUntil = t + SLOW_S; say('Bullet time!', 'gold'); out.current.arena.sfx('whoosh'); w.fovBy(-7); }
      const slow = t < slowUntil;
      if (!slow && slowUntil && t - slowUntil < 0.1) w.fovBy(0);
      const dtw = dt * (slow ? SLOW_SCALE : 1);
      if (t - skillAt > 0.15) { skillAt = t; setSkill((p) => (Math.abs(p.charge - slowMeter) < 0.02 && p.active === slow && p.others === crowd.count ? p : { charge: slowMeter, active: slow, others: crowd.count })); }
      if (wave === 0 || (!bots.length && t > nextWaveAt)) { if (wave > 0) { score += STRIKE_WAVE; grenades = Math.min(STRIKE_GRENADES + 2, grenades + 1); say(`Wave ${wave} cleared! +${STRIKE_WAVE}`, 'good'); out.current.arena.sfx('win'); } spawnWave(); }
      // Moving and aiming.
      if (!down) walk(body, c, dt, { speed: 8, jump: 9.5 }); else { body.vel.x = 0; body.vel.z = 0; }
      body.step(dt, w.solids);
      me.facing = c.yaw + Math.PI;
      me.group.position.copy(body.pos);
      me.update(dt, body.vel, body.ground);
      me.group.visible = !down;
      const dir = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), -Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
      const right = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
      const head = body.pos.clone().add(new THREE.Vector3(0, 2.1, 0));
      let d = 4.6;
      const back = new THREE.Ray(head, dir), hitP = new THREE.Vector3();
      for (const s of solidsNoFloor) if (back.intersectBox(s, hitP)) d = Math.min(d, Math.max(1, hitP.distanceTo(head) - 0.3));
      w.camera.position.lerp(head.clone().addScaledVector(dir, d).addScaledVector(right, 1.1), 1 - Math.exp(-22 * dt));
      w.camera.lookAt(head.clone().addScaledVector(dir, -20).addScaledVector(right, 1.1));
      // Firing: a beam from the gun to whatever the crosshair is on.
      cool -= dt;
      const firing = c.held.has('fire') || c.take('fire');
      if (firing && cool <= 0 && !down) {
        cool = STRIKE_FIRE_S / (rapidUntil > t ? 2 : 1);
        shots++;
        ray.setFromCamera(new THREE.Vector2(0, 0), w.camera);
        let best2 = 80, target: Bot | null = null;
        const p = new THREE.Vector3();
        for (const s of solidsNoFloor) if (ray.ray.intersectBox(s, p)) best2 = Math.min(best2, p.distanceTo(ray.ray.origin));
        for (const b of bots) {
          const sph = new THREE.Sphere(b.g.position, b.boss ? 2.4 : 1.0);
          if (ray.ray.intersectSphere(sph, p)) { const dd = p.distanceTo(ray.ray.origin); if (dd < best2) { best2 = dd; target = b; } }
        }
        const end = ray.ray.at(best2, new THREE.Vector3());
        const from = gun.getWorldPosition(new THREE.Vector3()).add(dir.clone().multiplyScalar(-0.5));
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, end]), beamMat.clone());
        w.scene.add(l); beams.push({ l, life: 0.09 });
        flash.position.copy(end); flash.visible = true;
        out.current.arena.sfx('laser', combo);
        if (target) {
          hits++; score += STRIKE_HIT; out.current.arena.sfx('hit');
          w.burst(end, 0x67e8f9, 6, 4, 6);
          setHud((h) => ({ ...h, hitmark: h.hitmark + 1 }));
          hurt(target, 1, t);
          report();
        }
      }
      for (const bm of beams) { bm.life -= dt; (bm.l.material as THREE.LineBasicMaterial).opacity = Math.max(0, bm.life / 0.09); if (bm.life <= 0) { w.scene.remove(bm.l); bm.l.geometry.dispose(); } }
      for (let i = beams.length - 1; i >= 0; i--) if (beams[i].life <= 0) beams.splice(i, 1);
      if (flash.visible && cool < STRIKE_FIRE_S * 0.4) flash.visible = false;
      if (c.take('act') && grenades > 0 && !down) {
        grenades--;
        const m = new THREE.Mesh(nadeGeo, nadeMat); m.add(glowSprite(0x4ade80, 1.2));
        m.position.copy(head).addScaledVector(dir, -1.2);
        w.scene.add(m); nades.push({ m, v: dir.clone().multiplyScalar(-17).setY(-dir.y * 17 + 5), life: 1.6 });
        out.current.arena.sfx('whoosh'); report();
      }
      for (let i = nades.length - 1; i >= 0; i--) {
        const g = nades[i];
        g.v.y -= 20 * dt; g.m.position.addScaledVector(g.v, dt); g.life -= dt;
        const p = g.m.position;
        if (g.life <= 0 || p.y < 0.2 || solidsNoFloor.some((s) => s.containsPoint(p))) { blast(p.clone(), t); w.scene.remove(g.m); nades.splice(i, 1); }
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const g = rings[i];
        g.life -= dt; g.m.scale.setScalar(1 + (1 - g.life / 0.5) * STRIKE_BLAST_R); (g.m.material as THREE.MeshBasicMaterial).opacity = g.life / 0.5;
        if (g.life <= 0) { w.scene.remove(g.m); (g.m.material as THREE.Material).dispose(); rings.splice(i, 1); }
      }
      // Drones: roam, then face you and fire when they can see you.
      for (const b of bots) {
        const toMe = body.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(b.g.position);
        const dist = toMe.length();
        if (b.g.position.distanceTo(b.to) < 1 || r() < dt * 0.15) b.to = spot();
        const step = b.to.clone().sub(b.g.position).setLength(b.speed * dtw);
        b.g.position.add(step);
        b.g.position.y += Math.sin(t * 3 + b.speed) * 0.01;
        b.g.lookAt(body.pos.x, body.pos.y + 1.2, body.pos.z);
        b.flash = Math.max(0, b.flash - dt);
        (b.eye.material as THREE.MeshBasicMaterial).color.set(b.flash ? 0xffffff : 0xff2d55);
        b.next -= dtw;
        if (b.next <= 0 && dist < 34 && !down) {
          b.next = b.boss ? 1.3 : Math.max(0.7, 2.2 - wave * 0.12) + r();
          const sight = new THREE.Ray(b.g.position, toMe.clone().normalize());
          if (!solidsNoFloor.some((s) => { const q = new THREE.Vector3(); return sight.intersectBox(s, q) && q.distanceTo(b.g.position) < dist; })) {
            const aim = toMe.normalize().multiplyScalar(17 + Math.min(wave, 14));
            for (const turn of b.boss ? [-0.2, 0, 0.2] : [0]) {
              const m = new THREE.Mesh(boltGeo, boltMat); m.position.copy(b.g.position); m.add(glowSprite(0xff3b6b, 1.3)); w.scene.add(m);
              bolts.push({ m, v: aim.clone().applyAxisAngle(UP, turn), life: 4 });
            }
            out.current.arena.sfx('zap');
          }
        }
      }
      // Bolts.
      for (const bo of bolts) {
        bo.m.position.addScaledVector(bo.v, dtw); bo.life -= dtw;
        if (solidsNoFloor.some((s) => s.containsPoint(bo.m.position)) || bo.m.position.y < 0) bo.life = 0;
        else if (!down && t > safeUntil && bo.m.position.distanceTo(body.pos.clone().add(new THREE.Vector3(0, 1.1, 0))) < 0.9) {
          bo.life = 0;
          if (shield > 0) { shield--; out.current.arena.sfx('hit'); w.burst(bo.m.position, 0x60a5fa, 14, 5, 2); } else { hp -= 12; hurtAt = t; out.current.arena.sfx('hurt'); w.shake(0.35); }
          if (hp <= 0) {
            downUntil = t + 1.5; safeUntil = t + 3.5; score = Math.max(0, score - STRIKE_DOWN); combo = 0;
            say(`Tagged out! −${STRIKE_DOWN}`, 'bad');
          }
          setHud((h) => ({ ...h, hurt: h.hurt + 1 })); report();
        }
        if (bo.life <= 0) w.scene.remove(bo.m);
      }
      for (let i = bolts.length - 1; i >= 0; i--) if (bolts[i].life <= 0) bolts.splice(i, 1);
      if (downUntil && t > downUntil && hp <= 0) { hp = 100; body.pos.set(0, 0.05, 0); report(); }
      if (t - hurtAt > 4 && hp < 100 && hp > 0) { hp = Math.min(100, approach(hp, 101, 0.5, dt)); if (Math.round(hp) % 10 === 0) report(); }
      // Debris and drops.
      for (const b of bits) { b.v.y -= 22 * dtw; b.m.position.addScaledVector(b.v, dtw); b.m.rotation.x += dtw * 8; b.life -= dtw; if (b.m.position.y < 0.12) { b.m.position.y = 0.12; b.v.multiplyScalar(0.5); b.v.y *= -0.4; } if (b.life <= 0) w.scene.remove(b.m); }
      for (let i = bits.length - 1; i >= 0; i--) if (bits[i].life <= 0) bits.splice(i, 1);
      for (const dr of drops) {
        dr.m.rotation.y = t * 2; dr.m.position.y = 1 + Math.sin(t * 3) * 0.2;
        if (dr.m.position.distanceTo(body.pos.clone().add(new THREE.Vector3(0, 1, 0))) < 1.4) {
          dr.until = 0;
          if (dr.kind === 'health') { hp = Math.min(100, hp + 40); say('+40 health', 'good'); }
          if (dr.kind === 'rapid') { rapidUntil = t + 6; say('Rapid fire!', 'gold'); }
          if (dr.kind === 'shield') { shield = 3; say('Shield ×3', 'good'); }
          out.current.arena.sfx('power'); report();
        }
        if (t > dr.until) w.scene.remove(dr.m);
      }
      for (let i = drops.length - 1; i >= 0; i--) if (t > drops[i].until) drops.splice(i, 1);
      w.focus.copy(body.pos);
      crowd.update(dt, { pos: body.pos, ry: c.yaw + Math.PI, air: !body.ground, part: 0, color: lookHex(look), hat: look.hat });
    });
    return () => { c.dispose(); controls.current = null; w.dispose(); };
  }, [seed]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <WorldFrame net={net} canvas={canvas} controls={controls} buttons={[{ id: 'skill', label: 'Slow' }, { id: 'act', label: 'Pulse' }, { id: 'fire', label: 'Fire' }, { id: 'jump', label: 'Jump' }]} keys="WASD move · hold the mouse to fire · Space jump · E pulse grenade · Q bullet time" label="Neon Strike: a 3D laser tag arena" others={skill.others}>
        {skill.active && <div className="play-slowmo pointer-events-none absolute inset-0" aria-hidden />}
        {/* The crosshair, a hit tick, and a red edge when hurt */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2" aria-hidden>
          <span className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-white" /><span className="absolute bottom-0 left-1/2 h-2 w-0.5 -translate-x-1/2 bg-white" />
          <span className="absolute left-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-white" /><span className="absolute right-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-white" />
          {hud.hitmark > 0 && <span key={hud.hitmark} className="play-float absolute -top-6 left-1/2 text-sm font-black text-pink-300">✕</span>}
        </div>
        {hud.hurt > 0 && <span key={hud.hurt} className="pointer-events-none absolute inset-0 animate-[rm-fade_500ms_reverse_forwards] shadow-[inset_0_0_120px_rgba(239,68,68,0.7)]" aria-hidden />}
        {hud.boss > 0 && (
          <div className="pointer-events-none absolute left-1/2 top-20 w-[min(80%,420px)] -translate-x-1/2 text-center">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-300">Sentinel Prime</p>
            <div className="mt-1 h-3 overflow-hidden rounded-full bg-black/60 ring-1 ring-amber-300/40"><div className="h-full w-full origin-left rounded-full bg-gradient-to-r from-amber-300 to-red-500 transition-transform duration-150 rtl:origin-right" style={{ transform: `scaleX(${hud.boss})` }} /></div>
          </div>
        )}
        {hud.down && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-red-950/50"><p className="text-4xl font-black text-white">Tagged out</p></div>}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start gap-2">
          <div className="w-44 rounded-2xl bg-black/55 px-3.5 py-2 ring-1 ring-white/15">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-300"><Heart className="h-3.5 w-3.5 text-red-400" aria-hidden />Health {hud.shield > 0 && <span className="ms-auto inline-flex items-center gap-0.5 text-sky-300"><Shield className="h-3.5 w-3.5" aria-hidden />{hud.shield}</span>}</p>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/10"><div className={cn('h-full w-full origin-left rounded-full transition-transform duration-200 rtl:origin-right', hud.hp > 35 ? 'bg-emerald-400' : 'bg-red-500')} style={{ transform: `scaleX(${hud.hp / 100})` }} /></div>
          </div>
          <SkillRing label="Bullet time" keyName="Q" charge={skill.charge} active={skill.active} />
          <HudChip label="Pulse · E" value={`×${hud.nades}`} tone={hud.nades ? 'good' : 'white'} />
          <HudChip label="Wave" value={hud.wave} />
          <HudChip label="Drones left" value={hud.left} tone="bad" />
          {hud.combo > 1 && <HudChip label="Combo" value={`×${strikeMultiplier(hud.combo)}`} tone="gold" />}
          {hud.rapid && <span className="inline-flex items-center gap-1 self-center rounded-full bg-amber-300 px-3 py-1 text-xs font-black text-amber-950"><Zap className="h-3.5 w-3.5" aria-hidden />RAPID</span>}
        </div>
      </WorldFrame>
      <p className="mt-2 text-center text-xs text-zinc-400">{GAMES.strike.how}</p>
    </div>
  );
}
