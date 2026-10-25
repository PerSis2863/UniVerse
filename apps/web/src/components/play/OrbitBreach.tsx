'use client';

import { useEffect, useRef, useState } from 'react';
import { Wind, Wrench } from 'lucide-react';
import { GAMES } from '@/lib/play';
import { ORBIT_ESCAPE, ORBIT_HIT, ORBIT_NAMES, ORBIT_PER_SECOND, ORBIT_REACTOR, ORBIT_REPAIR_S, ORBIT_SECTOR, ORBIT_SECTORS, ORBIT_TANK, ORBIT_TANK_EVERY_S, orbitMeteors, orbitReactors, orbitStation, type Deck } from '@/lib/play/worlds';
import { cn } from '@/lib/utils';
import { useArena } from './arena';
import { lookHex, readLook } from './PlayerCard';
import type { GameProps } from './game-props';
import { Avatar, Body, Controls, THREE, World, follow, glowSprite, walk } from './world/core';
import { HudChip, WorldFrame } from './world/Stage';

// Orbit Breach (12+, src/lib/play/worlds.ts): three broken space stations, each above its own
// planet. Low gravity, and a boost when you jump again in the air. Stand at each broken reactor to
// repair it, grab oxygen tanks, dodge meteors (a red ring warns where each lands), then take the
// pod to the next station (the last one: home).

export function OrbitBreach({ seed, endsAt, clock, onProgress, onDone, onStats }: GameProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controls = useRef<Controls | null>(null);
  const arena = useArena();
  const [hud, setHud] = useState({ air: 100, fixed: 0, need: orbitReactors(0), sector: 0, repair: 0, boost: 1, podOpen: false });
  const out = useRef({ arena, onProgress, onDone, onStats, clock, endsAt });
  useEffect(() => { out.current = { arena, onProgress, onDone, onStats, clock, endsAt }; });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const w = new World(el, { fov: 70, bg: 0x02030a });
    const c = new Controls(el);
    controls.current = c;
    const say = out.current.arena.announce;

    // Space: stars, a planet with its glow, a nebula.
    const starPos = new Float32Array(1800 * 3);
    for (let i = 0; i < 1800; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(180 + Math.random() * 60); starPos.set([v.x, v.y, v.z], i * 3); }
    const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPos, 3)), new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, sizeAttenuation: true }));
    w.scene.add(stars);
    const planet = new THREE.Mesh(new THREE.SphereGeometry(70, 48, 32), new THREE.MeshLambertMaterial({ color: 0x1d4ed8, emissive: 0x0b1a4a }));
    planet.position.set(-50, -55, -150); w.scene.add(planet);
    const atmo = glowSprite(0x60a5fa, 190); atmo.position.copy(planet.position); w.scene.add(atmo);
    const rings = new THREE.Mesh(new THREE.RingGeometry(90, 125, 64), new THREE.MeshBasicMaterial({ color: 0xc4b5fd, side: THREE.DoubleSide, transparent: true, opacity: 0.35 }));
    rings.position.copy(planet.position); rings.rotation.set(Math.PI / 2.4, 0.3, 0); rings.visible = false; w.scene.add(rings);
    // Each station's planet: blue, a red moon, a ringed giant.
    const PLANETS = [{ c: 0x1d4ed8, e: 0x0b1a4a, glow: 0x60a5fa }, { c: 0xb45309, e: 0x451a03, glow: 0xf97316 }, { c: 0x7c3aed, e: 0x2e1065, glow: 0xc4b5fd }];
    for (const [x, y, z, col, s] of [[90, 40, -160, 0xa855f7, 120], [-120, 70, -120, 0x22d3ee, 90]] as const) { const neb = glowSprite(col, s); neb.position.set(x, y, z); (neb.material as THREE.SpriteMaterial).opacity = 0.35; w.scene.add(neb); }
    w.lights({ sky: 0x9fc5ff, ground: 0x141b33, sun: 0xffffff, power: 2.6, at: [-40, 60, 30], ambient: 0.8 });

    // The decks (metal plates with lit trim), bridges to some of them.
    const pc = document.createElement('canvas'); pc.width = pc.height = 128;
    const pg = pc.getContext('2d')!;
    pg.fillStyle = '#7d879b'; pg.fillRect(0, 0, 128, 128);
    pg.strokeStyle = '#5b6477'; pg.lineWidth = 3; pg.strokeRect(2, 2, 124, 124); pg.strokeRect(34, 34, 60, 60);
    pg.fillStyle = '#22d3ee'; pg.fillRect(60, 4, 8, 4); pg.fillRect(60, 120, 8, 4);
    const ptex = new THREE.CanvasTexture(pc); ptex.wrapS = ptex.wrapT = THREE.RepeatWrapping; ptex.colorSpace = THREE.SRGBColorSpace; ptex.repeat.set(5, 5);
    const plate = new THREE.MeshLambertMaterial({ map: ptex });
    const trim = new THREE.LineBasicMaterial({ color: 0x22d3ee });
    const bridgeMat = new THREE.MeshLambertMaterial({ color: 0x475569, emissive: 0x0e7490, emissiveIntensity: 0.25 });
    const rock = new THREE.DodecahedronGeometry(0.9, 0), rockMat = new THREE.MeshLambertMaterial({ color: 0x7c2d12, emissive: 0xf97316, emissiveIntensity: 0.6 });
    const allMeteors = orbitMeteors(seed, GAMES.orbit.seconds);
    type Fix = { g: THREE.Group; core: THREE.Mesh; ring: THREE.Mesh; zone: THREE.Mesh; glow: THREE.Sprite; p: number; done: boolean };
    let sector = 0, group = new THREE.Group(), decks: Deck[] = [], fixes: Fix[] = [], need = 0;
    let podG = new THREE.Group(), door = new THREE.Mesh(), podGlow = glowSprite(0x22d3ee, 6);
    const live: { at: number; x: number; z: number; y: number; ring: THREE.Mesh; rock: THREE.Mesh; hit: boolean }[] = [];
    const booms: { s: THREE.Sprite; life: number }[] = [];
    const tanks: THREE.Mesh[] = [];
    let mi = 0, nextTank = 4;
    const buildStation = (k: number) => {
      w.scene.remove(group);
      group.traverse((o) => { const mm = o as THREE.Mesh; if (mm.geometry && mm.geometry !== rock) mm.geometry.dispose(); });
      for (const m of live) { w.scene.remove(m.ring); w.scene.remove(m.rock); }
      live.length = 0;
      for (const tk of tanks) w.scene.remove(tk);
      tanks.length = 0;
      sector = k; group = new THREE.Group(); w.scene.add(group); w.solids = [];
      const st = orbitStation(seed, k);
      decks = st.decks; need = orbitReactors(k);
      decks.forEach((d, i) => {
        const sz = d.r * 1.6;
        const m = new THREE.Mesh(new THREE.BoxGeometry(sz, 1, sz), plate);
        m.position.set(d.x, d.y - 0.5, d.z); m.castShadow = m.receiveShadow = !w.phone; group.add(m);
        m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), trim));
        w.solids.push(new THREE.Box3().setFromObject(m));
        if (i > 0 && i <= 6 && i % 2 === 1) {
          // A bridge from the centre (the others need a boosted jump).
          const from = new THREE.Vector3(0, 0, 0), to = new THREE.Vector3(d.x, d.y, d.z), mid = from.clone().lerp(to, 0.5), len = from.distanceTo(to);
          const br = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, len), bridgeMat);
          br.position.set(mid.x, Math.min(0, d.y) - 0.2, mid.z); br.lookAt(to.x, br.position.y, to.z); group.add(br);
          for (let q = 0; q <= 10; q++) { const p = from.clone().lerp(to, q / 10); w.solids.push(new THREE.Box3(new THREE.Vector3(p.x - 1, Math.min(0, d.y) - 0.4, p.z - 1), new THREE.Vector3(p.x + 1, Math.min(0, d.y), p.z + 1))); }
        }
      });
      fixes = st.reactors.map((i) => {
        const d = decks[i], g = new THREE.Group();
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 2.6, 18), new THREE.MeshLambertMaterial({ color: 0x334155, emissive: 0x991b1b, emissiveIntensity: 0.8 }));
        core.position.y = 1.3;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.09, 8, 36), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
        ring.position.y = 1.4; ring.rotation.x = Math.PI / 2;
        const zone = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.3, 40), new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
        zone.rotation.x = -Math.PI / 2; zone.position.y = 0.03;
        const glow = glowSprite(0xef4444, 4); glow.position.y = 1.5;
        g.add(core, ring, zone, glow);
        g.position.set(d.x, d.y, d.z);
        group.add(g);
        return { g, core, ring, zone, glow, p: 0, done: false };
      });
      const podDeck = decks[st.pod];
      podG = new THREE.Group();
      const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(1, 1.6, 6, 16), new THREE.MeshLambertMaterial({ color: 0xe2e8f0, emissive: 0x1e293b }));
      capsule.position.y = 1.9;
      door = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), new THREE.MeshBasicMaterial({ color: 0x475569 }));
      door.position.set(0, 1.9, 1.02);
      podGlow = glowSprite(0x22d3ee, 6); podGlow.position.y = 2; podGlow.visible = false;
      podG.add(capsule, door, podGlow); podG.position.set(podDeck.x, podDeck.y, podDeck.z); group.add(podG);
      const pl = PLANETS[k];
      (planet.material as THREE.MeshLambertMaterial).color.setHex(pl.c); (planet.material as THREE.MeshLambertMaterial).emissive.setHex(pl.e);
      (atmo.material as THREE.SpriteMaterial).color.setHex(pl.glow); rings.visible = k === 2;
      body.pos.set(0, 0.05, 2); body.vel.set(0, 0, 0);
    };

    const look = readLook(), me = new Avatar(lookHex(look), { legs: 0x334155, hat: look.hat });
    me.group.rotation.y = Math.PI; // facing the way ahead
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshLambertMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.35 }));
    helmet.position.y = 1.98; me.group.add(helmet);
    w.scene.add(me.group);
    const body = new Body([0, 0.05, 2]);
    buildStation(0);
    let air = 100, score = 0, fixed = 0, fixedAll = 0, boost = 1, hits = 0, tanksGot = 0, done = false, lastHud = 0, t0 = -1, launching = -1;
    const report = () => {
      out.current.onProgress(score, fixedAll);
      out.current.onStats?.([{ label: 'Stations', value: `${sector + (done ? 1 : 0)} of ${ORBIT_SECTORS}` }, { label: 'Reactors fixed', value: String(fixedAll) }, { label: 'Oxygen tanks', value: String(tanksGot) }, { label: 'Meteor hits', value: String(hits) }]);
    };
    const hurt = (lose: number, why: string) => { air = Math.max(0, air - lose); score = Math.max(0, score - ORBIT_HIT); hits++; say(why, 'bad'); out.current.arena.sfx('hurt'); out.current.arena.shake(0.9); report(); };
    report();

    w.camera.position.set(0, 5, 12);
    w.start((dt, t) => {
      if (t0 < 0) t0 = t;
      const T = t - t0;
      if (done) { podG.position.y += dt * 9; podG.rotation.y += dt; follow(w.camera, podG.position, c, dt, { dist: 14, height: 2 }); return; }
      // The pod carries you to the next station.
      if (launching >= 0) {
        podG.position.y += dt * 12; podG.rotation.y += dt * 1.5;
        follow(w.camera, podG.position, c, dt, { dist: 14, height: 2 });
        if (T - launching > 1.8) { launching = -1; fixed = 0; buildStation(sector + 1); me.group.visible = true; air = Math.min(100, air + 40); say(`Station ${sector + 1}: ${ORBIT_NAMES[sector]}`, 'gold'); out.current.arena.sfx('check'); report(); }
        return;
      }
      // Low gravity, a boost in the air.
      walk(body, c, dt, { speed: 7, jump: 8.5, air: 0.6 });
      if (!body.ground && c.take('jump') && boost > 0) { boost = 0; body.vel.y = 9.5; const f = c.wish(); body.vel.x += f.x * 5; body.vel.z += f.y * 5; out.current.arena.sfx('boost'); }
      body.step(dt, w.solids, 14);
      if (body.ground) boost = 1;
      me.group.position.copy(body.pos);
      me.update(dt, body.vel, body.ground);
      follow(w.camera, body.pos, c, dt, { dist: 9, height: 2.6 });
      stars.rotation.y += dt * 0.004; planet.rotation.y += dt * 0.02;
      // Air runs out slowly.
      air = Math.max(0, air - dt * 0.45);
      if (air <= 0) { body.pos.set(0, 0.05, 2); body.vel.set(0, 0, 0); air = 50; score = Math.max(0, score - ORBIT_HIT * 2); say('Out of air! Back to the hub', 'bad'); report(); }
      if (body.pos.y < -30) { body.pos.set(0, 0.05, 2); body.vel.set(0, 0, 0); hurt(20, 'Lost in space! −20 air'); }
      // Repairs.
      let repairing = 0;
      for (const f of fixes) {
        f.ring.rotation.z += dt * (f.done ? 2.2 : 0.4);
        if (f.done) continue;
        (f.core.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 9)) * 0.6;
        const near = Math.hypot(body.pos.x - f.g.position.x, body.pos.z - f.g.position.z) < 2.3 && Math.abs(body.pos.y - f.g.position.y) < 1.5;
        if (near) {
          f.p = Math.min(1, f.p + dt / ORBIT_REPAIR_S); repairing = f.p;
          if (Math.floor(f.p * 12) !== Math.floor((f.p - dt / ORBIT_REPAIR_S) * 12)) out.current.arena.sfx('repair', Math.floor(f.p * 12));
          if (f.p >= 1) {
            f.done = true; fixed++; score += ORBIT_REACTOR;
            (f.core.material as THREE.MeshLambertMaterial).emissive.setHex(0x0891b2);
            (f.ring.material as THREE.MeshBasicMaterial).color.setHex(0x22d3ee); (f.zone.material as THREE.MeshBasicMaterial).color.setHex(0x22d3ee);
            (f.glow.material as THREE.SpriteMaterial).color.setHex(0x22d3ee);
            fixedAll++;
            say(fixed === need ? 'Station online! Get to the pod' : `Reactor ${fixed} of ${need} online`, fixed === need ? 'gold' : 'good');
            out.current.arena.sfx(fixed === need ? 'win' : 'check');
            if (fixed === need) { (door.material as THREE.MeshBasicMaterial).color.setHex(0x22d3ee); podGlow.visible = true; }
            report();
          }
        } else f.p = Math.max(0, f.p - dt * 0.15);
      }
      // The pod.
      if (fixed === need && body.pos.distanceTo(podG.position) < 2.6 && sector < ORBIT_SECTORS - 1) {
        launching = T; me.group.visible = false; score += ORBIT_SECTOR;
        say(`Station ${sector + 1} cleared! +${ORBIT_SECTOR}`, 'good'); out.current.arena.sfx('boost'); report();
        return;
      }
      if (fixed === need && body.pos.distanceTo(podG.position) < 2.6) {
        done = true; me.group.visible = false;
        const left = Math.max(0, Math.round((out.current.endsAt - out.current.clock()) / 1000));
        score += ORBIT_ESCAPE + left * ORBIT_PER_SECOND;
        say('Escaped!', 'gold'); out.current.arena.sfx('boost'); report();
        setTimeout(() => out.current.onDone(score, fixedAll), 2000);
      }
      // Meteors: a warning ring, then the rock comes down.
      while (mi < allMeteors.length && allMeteors[mi].at - 1.6 <= T) {
        const x = allMeteors[mi++], deck = decks.find((d) => Math.abs(x.x - d.x) < d.r * 0.8 && Math.abs(x.z - d.z) < d.r * 0.8);
        if (!deck) continue;
        const y = deck.y;
        const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3, 32), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(x.x, y + 0.04, x.z); w.scene.add(ring);
        const r = new THREE.Mesh(rock, rockMat); r.position.set(x.x + 8, y + 40, x.z - 6); r.add(glowSprite(0xf97316, 4)); w.scene.add(r);
        live.push({ at: x.at, x: x.x, z: x.z, y, ring, rock: r, hit: false });
      }
      for (const m of live) {
        const k = 1 - Math.max(0, (m.at - T) / 1.6);
        m.ring.scale.setScalar(1.15 - k * 0.3); (m.ring.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.abs(Math.sin(t * 14)) * 0.5;
        m.rock.position.set(m.x + 8 * (1 - k), m.y + 40 * (1 - k) + 0.6, m.z - 6 * (1 - k)); m.rock.rotation.x += dt * 4;
        if (k >= 1 && !m.hit) {
          m.hit = true; w.scene.remove(m.ring); w.scene.remove(m.rock);
          const b = glowSprite(0xfb923c, 9); b.position.set(m.x, m.y + 1, m.z); w.scene.add(b); booms.push({ s: b, life: 0.6 });
          const d = Math.hypot(body.pos.x - m.x, body.pos.z - m.z);
          if (d < 3 && Math.abs(body.pos.y - m.y) < 2.5) { hurt(15, 'Meteor hit! −15 air'); body.vel.set((body.pos.x - m.x) * 3, 7, (body.pos.z - m.z) * 3); }
          if (d < 14) { out.current.arena.sfx('boom'); out.current.arena.shake(Math.max(0.2, 1 - d / 14)); }
        }
      }
      for (let i = live.length - 1; i >= 0; i--) if (live[i].hit) live.splice(i, 1);
      for (const b of booms) { b.life -= dt; b.s.scale.setScalar(9 + (0.6 - b.life) * 14); (b.s.material as THREE.SpriteMaterial).opacity = Math.max(0, b.life / 0.6); if (b.life <= 0) w.scene.remove(b.s); }
      for (let i = booms.length - 1; i >= 0; i--) if (booms[i].life <= 0) booms.splice(i, 1);
      // Oxygen tanks drop in every few seconds.
      if (T > nextTank) {
        nextTank = T + ORBIT_TANK_EVERY_S;
        const d = decks[1 + Math.floor(((Math.sin(T * 12.9898 + seed) + 1) / 2) * (decks.length - 1)) % (decks.length - 1)];
        const tk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 12), new THREE.MeshLambertMaterial({ color: 0x22c55e, emissive: 0x166534 }));
        tk.position.set(d.x + Math.sin(T) * d.r * 0.4, d.y + 0.9, d.z + Math.cos(T) * d.r * 0.4); tk.add(glowSprite(0x4ade80, 1.8)); w.scene.add(tk); tanks.push(tk);
      }
      for (const tk of tanks) {
        tk.rotation.y += dt * 2;
        if (tk.visible && tk.position.distanceTo(body.pos.clone().setY(body.pos.y + 0.9)) < 1.4) { tk.visible = false; w.scene.remove(tk); air = Math.min(100, air + 25); score += ORBIT_TANK; tanksGot++; out.current.arena.sfx('coin', tanksGot % 6); report(); }
      }
      w.sunOver(body.pos);
      if (t - lastHud > 0.15) { lastHud = t; setHud({ air: Math.round(air), fixed, need, sector, repair: repairing, boost, podOpen: fixed === need }); }
    });
    return () => { c.dispose(); controls.current = null; w.dispose(); };
  }, [seed]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <WorldFrame canvas={canvas} controls={controls} buttons={[{ id: 'jump', label: 'Jump' }]} keys="WASD move · Space jump, again to boost" label="Orbit Breach: a 3D space station">
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start gap-2">
          <div className="w-44 rounded-2xl bg-black/55 px-3.5 py-2 ring-1 ring-white/15">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-300"><Wind className="h-3.5 w-3.5 text-sky-300" aria-hidden />Oxygen {hud.air}%</p>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/10"><div className={cn('h-full w-full origin-left rounded-full transition-transform duration-200 rtl:origin-right', hud.air > 30 ? 'bg-sky-400' : 'bg-red-500')} style={{ transform: `scaleX(${hud.air / 100})` }} /></div>
          </div>
          <HudChip label={ORBIT_NAMES[hud.sector]} value={`Reactors ${hud.fixed}/${hud.need}`} tone="good" />
          <HudChip label="Boost" value={hud.boost ? 'Ready' : '…'} tone={hud.boost ? 'gold' : 'white'} />
          {hud.podOpen && <span className="self-center rounded-full bg-cyan-400 px-3 py-1 text-xs font-black uppercase tracking-wider text-cyan-950">Escape pod open</span>}
        </div>
        {hud.repair > 0 && hud.repair < 1 && (
          <div className="pointer-events-none absolute left-1/2 top-[58%] w-56 -translate-x-1/2 rounded-2xl bg-black/65 px-4 py-3 text-center ring-1 ring-cyan-300/40">
            <p className="flex items-center justify-center gap-1.5 text-sm font-bold text-white"><Wrench className="h-4 w-4 text-cyan-300" aria-hidden />Repairing…</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-full origin-left rounded-full bg-cyan-400 rtl:origin-right" style={{ transform: `scaleX(${hud.repair})` }} /></div>
          </div>
        )}
      </WorldFrame>
      <p className="mt-2 text-center text-xs text-zinc-400">{GAMES.orbit.how}</p>
    </div>
  );
}
