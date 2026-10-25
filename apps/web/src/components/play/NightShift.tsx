'use client';

import { useEffect, useRef, useState } from 'react';
import { Battery, Heart, KeyRound } from 'lucide-react';
import { GAMES } from '@/lib/play';
import { NIGHT_CAUGHT, NIGHT_ESCAPE, NIGHT_KEY, NIGHT_KEYS, NIGHT_LIVES, NIGHT_PER_SECOND, NIGHT_STUN, NIGHT_STUN_COOLDOWN_S, NIGHT_STUN_S, mazeNext, mazeStep, nightMaze } from '@/lib/play/worlds';
import { cn } from '@/lib/utils';
import { useArena } from './arena';
import type { GameProps } from './game-props';
import { Body, Controls, THREE, World, eyes, glowSprite, walk } from './world/core';
import { WorldFrame } from './world/Stage';

// Night Shift (18+, src/lib/play/worlds.ts): first person in a dark school after hours. Five keys
// lie in the dead ends of the halls; the exit opens when you have them all. Something walks the
// halls toward you, faster with every key. Your torch is your only defence: hold it on the thing
// to drive it back (the battery drains; spare batteries lie around). If it reaches you…

const S = 5; // metres per maze cell
const H = 3.4;

function lockers() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3d4a45'; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 ? '#45534d' : '#41504a'; g.fillRect(i * 64 + 3, 6, 58, 112);
    g.fillStyle = '#26302c'; for (let v = 0; v < 4; v++) g.fillRect(i * 64 + 16, 16 + v * 6, 32, 2);
    g.fillStyle = '#9aa5a0'; g.fillRect(i * 64 + 50, 60, 4, 12);
  }
  g.fillStyle = 'rgba(80,20,20,0.35)'; g.fillRect(40, 90, 30, 28); // a stain
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}
function tiles() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#2b2a27' : '#4a4740'; g.fillRect(x * 32, y * 32, 32, 32); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function NightShift({ seed, endsAt, clock, onProgress, onDone, onStats }: GameProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controls = useRef<Controls | null>(null);
  const arena = useArena();
  const [hud, setHud] = useState({ keys: 0, lives: NIGHT_LIVES, battery: 100, stamina: 100, near: 0, scare: 0, open: false });
  const out = useRef({ arena, onProgress, onDone, onStats, clock, endsAt });
  useEffect(() => { out.current = { arena, onProgress, onDone, onStats, clock, endsAt }; });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const w = new World(el, { fov: 75, bg: 0x000000, fog: [0x000000, 1.5, 20] });
    w.renderer.shadowMap.enabled = false;
    const c = new Controls(el, { sensitivity: 0.0022 });
    controls.current = c;
    const m = nightMaze(seed), n = m.n;
    const center = (cell: number) => new THREE.Vector3((cell % n) * S + S / 2, 0, Math.floor(cell / n) * S + S / 2);
    const cellAt = (p: THREE.Vector3) => Math.max(0, Math.min(n - 1, Math.floor(p.z / S))) * n + Math.max(0, Math.min(n - 1, Math.floor(p.x / S)));

    // The building: tiled floor, a low dark ceiling, locker walls.
    w.scene.add(new THREE.HemisphereLight(0x223344, 0x000000, 0.12));
    const floorT = tiles(); floorT.repeat.set(n * 2, n * 2);
    w.box([n * S / 2, -0.25, n * S / 2], [n * S, 0.5, n * S], new THREE.MeshLambertMaterial({ map: floorT }));
    w.box([n * S / 2, H + 0.25, n * S / 2], [n * S, 0.5, n * S], new THREE.MeshLambertMaterial({ color: 0x14130f }), false);
    const wallT = lockers(); wallT.repeat.set(2, 1);
    const wallMat = new THREE.MeshLambertMaterial({ map: wallT });
    const wall = (x: number, z: number, sx: number, sz: number) => w.box([x, H / 2, z], [sx, H, sz], wallMat);
    wall(n * S / 2, 0, n * S, 0.4); wall(0, n * S / 2, 0.4, n * S);
    for (let cell = 0; cell < n * n; cell++) {
      const p = center(cell);
      if (!(cell % n < n - 1 && m.east[cell])) wall(p.x + S / 2, p.z, 0.4, S + 0.4);
      if (!(cell < n * (n - 1) && m.south[cell])) wall(p.x, p.z + S / 2, S + 0.4, 0.4);
    }
    const walls = w.solids.slice(1);

    // A few ceiling lights that flicker.
    const flicker: { l: THREE.PointLight; base: number; seedV: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const cell = Math.floor(((Math.sin(seed + i * 91.7) + 1) / 2) * n * n) % (n * n), p = center(cell);
      const l = new THREE.PointLight(0xfff1c1, 6, 9, 1.6); l.position.set(p.x, H - 0.3, p.z); w.scene.add(l);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.3), new THREE.MeshBasicMaterial({ color: 0xfff6d5 })); lamp.position.set(p.x, H - 0.05, p.z); w.scene.add(lamp);
      flicker.push({ l, base: 6, seedV: i * 13.1 });
    }

    // Keys, batteries, the exit.
    const keyMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const keys = m.keys.map((cell) => {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 16), keyMat);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.4), keyMat); shaft.position.z = 0.32;
      g.add(ring, shaft, glowSprite(0xfacc15, 1.4));
      g.position.copy(center(cell)).setY(1.1);
      w.scene.add(g);
      return { g, got: false };
    });
    const cells = m.batteries.map((cell) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.32, 10), new THREE.MeshBasicMaterial({ color: 0x4ade80 })); b.position.copy(center(cell)).setY(0.9); b.add(glowSprite(0x4ade80, 0.9)); w.scene.add(b); return { b, got: false }; });
    const exitP = center(m.exit);
    const exitSign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.1), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    exitSign.position.set(exitP.x, H - 0.5, exitP.z); exitSign.add(glowSprite(0xef4444, 3)); w.scene.add(exitSign);
    const exitLight = new THREE.PointLight(0xef4444, 4, 8); exitLight.position.copy(exitSign.position); w.scene.add(exitLight);

    // The thing in the halls: pale, tall, faceless but for two holes.
    const ghost = new THREE.Group();
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.3, 16, 1, true), new THREE.MeshLambertMaterial({ color: 0xd9dde3, emissive: 0x2a2d33, transparent: true, opacity: 0.92, side: THREE.DoubleSide }));
    robe.position.y = 1.15;
    const headG = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshLambertMaterial({ color: 0xe5e7eb, emissive: 0x1f2125 }));
    headG.position.y = 2.35;
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    for (const x of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), holeMat); e.position.set(x, 2.38, 0.26); ghost.add(e); }
    ghost.add(robe, headG);
    let gCell = Math.floor(n * n / 2) + Math.floor(n / 2), gTo = gCell;
    ghost.position.copy(center(gCell));
    w.scene.add(ghost);

    // The torch.
    w.scene.add(w.camera);
    const torch = new THREE.SpotLight(0xfff4d6, 40, 26, Math.PI / 7.5, 0.45, 1.3);
    torch.position.set(0.25, -0.2, 0);
    torch.target.position.set(0, -0.3, -5);
    w.camera.add(torch, torch.target);

    const body = new Body([center(0).x, 0.02, center(0).z], new THREE.Vector3(0.3, 0.85, 0.3));
    c.yaw = Math.PI; // facing into the school
    let keysGot = 0, lives = NIGHT_LIVES, battery = 100, stamina = 100, score = 0, stun = 0, stuns = 0, coolUntil = 0, retreatUntil = 0, safeUntil = 2, beat = 0, bob = 0, done = false, caught = 0, lastHud = 0;
    const report = () => {
      out.current.onProgress(score, keysGot);
      out.current.onStats?.([{ label: 'Keys', value: `${keysGot} of ${NIGHT_KEYS}` }, { label: 'Times caught', value: String(caught) }, { label: 'Drove it back', value: String(stuns) }, { label: 'Escaped', value: done && lives > 0 ? 'Yes' : 'No' }]);
    };
    report();

    w.start((dt, t) => {
      if (done) return;
      // Walking, running (stamina), the head bobbing.
      const running = c.running && stamina > 2;
      stamina = Math.max(0, Math.min(100, stamina + (running && body.vel.lengthSq() > 1 ? -22 : 12) * dt));
      if (!running && c.keys.has('shift')) c.keys.delete('shift');
      walk(body, c, dt, { speed: 4.3, run: 1.55, jump: 0 });
      body.step(dt, w.solids);
      const sp = Math.hypot(body.vel.x, body.vel.z);
      bob += dt * sp * 2.1;
      eyes(w.camera, body.pos, c, 1.6, Math.sin(bob) * 0.05 * Math.min(1, sp / 4));
      // The torch: drains, flickers when low.
      battery = Math.max(0, battery - dt * (0.45 + (stun > 0 ? 2.2 : 0)));
      torch.intensity = battery <= 0 ? 4 : battery < 15 ? (Math.sin(t * 40) > 0.2 ? 30 : 6) : 40;
      for (const f of flicker) f.l.intensity = Math.sin(t * 7 + f.seedV) + Math.sin(t * 23 + f.seedV * 2) > 1.6 ? 0.4 : f.base;
      // Keys and batteries.
      const me = body.pos.clone().setY(1.1);
      for (const k of keys) {
        if (k.got) continue;
        k.g.rotation.y = t * 1.8; k.g.position.y = 1.1 + Math.sin(t * 2.5) * 0.08;
        if (k.g.position.distanceTo(me) < 1.2) {
          k.got = true; w.scene.remove(k.g); keysGot++; score += NIGHT_KEY;
          out.current.arena.sfx('coin', keysGot * 2);
          out.current.arena.announce(keysGot === NIGHT_KEYS ? 'All five keys! Find the EXIT' : `Key ${keysGot} of ${NIGHT_KEYS}`, keysGot === NIGHT_KEYS ? 'gold' : 'good');
          report();
        }
      }
      for (const b of cells) if (!b.got && b.b.position.distanceTo(me) < 1.1) { b.got = true; w.scene.remove(b.b); battery = Math.min(100, battery + 50); out.current.arena.sfx('power'); }
      // The exit.
      exitLight.intensity = keysGot === NIGHT_KEYS ? 6 + Math.sin(t * 6) * 3 : 2;
      if (keysGot === NIGHT_KEYS && cellAt(body.pos) === m.exit) {
        done = true;
        const left = Math.max(0, Math.round((out.current.endsAt - out.current.clock()) / 1000));
        score += NIGHT_ESCAPE + left * NIGHT_PER_SECOND;
        out.current.arena.announce('You got out!', 'gold'); out.current.arena.sfx('win');
        report();
        setTimeout(() => out.current.onDone(score, keysGot), 1600);
        return;
      }
      // The thing: walks the halls toward you (faster with every key); the torch drives it back.
      const myCell = cellAt(body.pos);
      const speed = (retreatUntil > t ? 3.2 : 1.9 + keysGot * 0.38);
      const target = center(gTo);
      const toT = target.clone().sub(ghost.position).setY(0);
      if (toT.length() < 0.15) {
        gCell = gTo;
        if (retreatUntil > t) { const away = mazeNext(m, gCell).sort((a, b) => center(b).distanceTo(body.pos) - center(a).distanceTo(body.pos)); gTo = away[0] ?? gCell; }
        else gTo = mazeStep(m, gCell, myCell);
      } else ghost.position.addScaledVector(toT.normalize(), Math.min(toT.length(), speed * dt));
      ghost.position.y = Math.sin(t * 2) * 0.08;
      ghost.lookAt(body.pos.x, ghost.position.y, body.pos.z);
      const dist = ghost.position.distanceTo(body.pos.clone().setY(ghost.position.y));
      // In the torch's beam, with nothing in between?
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(w.camera.quaternion);
      const toG = ghost.position.clone().setY(1.6).sub(w.camera.position);
      const lit = battery > 0 && dist < 15 && fwd.angleTo(toG) < 0.26 && !walls.some((s) => { const q = new THREE.Vector3(); return new THREE.Ray(w.camera.position, toG.clone().normalize()).intersectBox(s, q) && q.distanceTo(w.camera.position) < toG.length() - 0.5; });
      (robe.material as THREE.MeshLambertMaterial).emissive.setHex(lit ? 0x8a8f99 : 0x2a2d33);
      if (lit && t > coolUntil) {
        stun += dt;
        if (stun >= NIGHT_STUN_S) { stun = 0; stuns++; score += NIGHT_STUN; coolUntil = t + NIGHT_STUN_COOLDOWN_S; retreatUntil = t + 5; out.current.arena.sfx('zap'); out.current.arena.announce('It backed away', 'good'); report(); }
      } else stun = Math.max(0, stun - dt * 0.5);
      // Its heartbeat in your ears, faster as it nears.
      beat -= dt;
      if (dist < 16 && beat <= 0) { out.current.arena.sfx('heart'); beat = Math.max(0.35, dist / 11); }
      // Caught.
      if (dist < 1.15 && t > safeUntil) {
        caught++; lives--; score = Math.max(0, score - NIGHT_CAUGHT);
        out.current.arena.sfx('scream'); out.current.arena.shake(2.2);
        setHud((h) => ({ ...h, scare: h.scare + 1 }));
        body.pos.copy(center(0)).setY(0.02); body.vel.set(0, 0, 0); c.yaw = Math.PI;
        gCell = gTo = (n * n - 1) - Math.floor(n * 1.5); ghost.position.copy(center(gCell));
        safeUntil = t + 3;
        report();
        if (lives <= 0) { done = true; out.current.arena.announce('It got you', 'bad'); setTimeout(() => out.current.onDone(score, keysGot), 1800); }
      }
      if (t - lastHud > 0.2) {
        lastHud = t;
        setHud((h) => ({ ...h, keys: keysGot, lives, battery: Math.round(battery), stamina: Math.round(stamina), near: Math.max(0, Math.min(1, 1 - dist / 14)), open: keysGot === NIGHT_KEYS }));
      }
    });
    return () => { c.dispose(); controls.current = null; w.dispose(); };
  }, [seed]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <WorldFrame canvas={canvas} controls={controls} buttons={[]} keys="WASD walk · Shift run · the mouse looks" label="Night Shift: a dark 3D school maze">
        {/* Dread: the edges darken and the picture crawls with static as it nears */}
        <div className="pointer-events-none absolute inset-0 transition-opacity duration-300" style={{ opacity: hud.near, boxShadow: 'inset 0 0 180px 60px rgba(0,0,0,0.95)' }} aria-hidden />
        <div className="play-static pointer-events-none absolute inset-0 mix-blend-screen transition-opacity duration-300" style={{ opacity: hud.near * 0.25 }} aria-hidden />
        {hud.scare > 0 && <Scare key={hud.scare} />}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start gap-2">
          <div className="flex items-center gap-1 rounded-2xl bg-black/60 px-3 py-2 ring-1 ring-white/10" aria-label={`${hud.keys} of ${NIGHT_KEYS} keys`}>
            {Array.from({ length: NIGHT_KEYS }, (_, i) => <KeyRound key={i} className={cn('h-5 w-5', i < hud.keys ? 'text-amber-300' : 'text-zinc-600')} aria-hidden />)}
          </div>
          <div className="flex items-center gap-1 rounded-2xl bg-black/60 px-3 py-2 ring-1 ring-white/10" aria-label={`${hud.lives} lives`}>
            {Array.from({ length: NIGHT_LIVES }, (_, i) => <Heart key={i} className={cn('h-5 w-5', i < hud.lives ? 'fill-red-500 text-red-500' : 'text-zinc-600')} aria-hidden />)}
          </div>
          <div className="w-36 rounded-2xl bg-black/60 px-3 py-2 ring-1 ring-white/10">
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300"><Battery className="h-3.5 w-3.5" aria-hidden />Torch {hud.battery}%</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={cn('h-full w-full origin-left rounded-full rtl:origin-right', hud.battery > 15 ? 'bg-amber-200' : 'bg-red-500')} style={{ transform: `scaleX(${hud.battery / 100})` }} /></div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full w-full origin-left rounded-full bg-sky-300 rtl:origin-right" style={{ transform: `scaleX(${hud.stamina / 100})` }} /></div>
          </div>
          {hud.open && <span className="self-center rounded-full bg-red-600 px-3 py-1 text-xs font-black uppercase tracking-wider text-white">Exit open</span>}
        </div>
      </WorldFrame>
      <p className="mt-2 text-center text-xs text-zinc-400">{GAMES.night.how}</p>
    </div>
  );
}

/** The jump scare: a face rushing at the screen with a red flash. */
function Scare() {
  return (
    <div className="play-scare pointer-events-none absolute inset-0 grid place-items-center bg-red-900/70" aria-hidden>
      <svg viewBox="0 0 200 240" className="h-[90%]">
        <ellipse cx="100" cy="110" rx="78" ry="100" fill="#e5e7eb" />
        <ellipse cx="68" cy="95" rx="20" ry="30" fill="#000" /><ellipse cx="132" cy="95" rx="20" ry="30" fill="#000" />
        <circle cx="68" cy="100" r="4" fill="#ef4444" /><circle cx="132" cy="100" r="4" fill="#ef4444" />
        <ellipse cx="100" cy="175" rx="26" ry="38" fill="#000" />
      </svg>
    </div>
  );
}
