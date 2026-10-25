'use client';

import { useEffect, useRef, useState } from 'react';
import { Battery, Heart, KeyRound } from 'lucide-react';
import { GAMES } from '@/lib/play';
import { NIGHT_CAUGHT, NIGHT_ESCAPE, NIGHT_FLOOR, NIGHT_FLOORS, NIGHT_KEY, NIGHT_LIVES, NIGHT_PER_SECOND, NIGHT_STUN, NIGHT_STUN_COOLDOWN_S, NIGHT_STUN_S, mazeNext, mazeStep, nightKeys, nightMaze } from '@/lib/play/worlds';
import { cn } from '@/lib/utils';
import { useArena } from './arena';
import type { GameProps } from './game-props';
import { Body, Controls, THREE, World, eyes, glowSprite, walk } from './world/core';
import { WorldFrame } from './world/Stage';

// Night Shift (18+, src/lib/play/worlds.ts): first person in a dark school after hours, three
// floors deep. Keys lie in the dead ends of the halls; the stairs (the last floor: the exit) open
// when you have them all. Something walks the halls toward you, faster with every key and every
// floor. Your torch is your only defence: hold it on the thing to drive it back (the battery
// drains; spare batteries lie around). If it reaches you… Each floor is one merged mesh of walls,
// rebuilt when you go down the stairs.

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
  const [hud, setHud] = useState({ keys: 0, need: nightKeys(0), floor: 0, lives: NIGHT_LIVES, battery: 100, stamina: 100, near: 0, scare: 0, open: false });
  const out = useRef({ arena, onProgress, onDone, onStats, clock, endsAt });
  useEffect(() => { out.current = { arena, onProgress, onDone, onStats, clock, endsAt }; });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const w = new World(el, { fov: 75, bg: 0x000000, fog: [0x000000, 1.5, 20] });
    w.renderer.shadowMap.enabled = false;
    const c = new Controls(el, { sensitivity: 0.0022 });
    controls.current = c;
    w.scene.add(new THREE.HemisphereLight(0x223344, 0x000000, 0.12));
    const wallT = lockers(); wallT.repeat.set(2, 1);
    const wallMat = new THREE.MeshLambertMaterial({ map: wallT });
    const floorT = tiles();
    const floorMat = new THREE.MeshLambertMaterial({ map: floorT }), ceilMat = new THREE.MeshLambertMaterial({ color: 0x14130f });
    const keyMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const V = { me: new THREE.Vector3(), toT: new THREE.Vector3(), fwd: new THREE.Vector3(), toG: new THREE.Vector3(), q: new THREE.Vector3(), ray: new THREE.Ray(), flat: new THREE.Vector3() };

    // The thing in the halls: pale, tall, faceless but for two holes.
    const ghost = new THREE.Group();
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.3, 16, 1, true), new THREE.MeshLambertMaterial({ color: 0xd9dde3, emissive: 0x2a2d33, transparent: true, opacity: 0.92, side: THREE.DoubleSide }));
    robe.position.y = 1.15;
    const headG = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshLambertMaterial({ color: 0xe5e7eb, emissive: 0x1f2125 }));
    headG.position.y = 2.35;
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    for (const x of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), holeMat); e.position.set(x, 2.38, 0.26); ghost.add(e); }
    ghost.add(robe, headG);
    w.scene.add(ghost);

    // The torch.
    w.scene.add(w.camera);
    const torch = new THREE.SpotLight(0xfff4d6, 40, 26, Math.PI / 7.5, 0.45, 1.3);
    torch.position.set(0.25, -0.2, 0);
    torch.target.position.set(0, -0.3, -5);
    w.camera.add(torch, torch.target);

    // One floor of the school: its maze, walls, lights, keys, batteries and stairs (or the exit).
    let floor = 0, m = nightMaze(seed, 0), n = m.n, group = new THREE.Group(), walls: THREE.Box3[] = [];
    let flicker: { l: THREE.PointLight; seedV: number }[] = [], keys: { g: THREE.Group; got: boolean }[] = [], cells: { b: THREE.Mesh; got: boolean }[] = [];
    let exitLight = new THREE.PointLight(), gCell = 0, gTo = 0;
    const center = (cell: number, out = new THREE.Vector3()) => out.set((cell % n) * S + S / 2, 0, Math.floor(cell / n) * S + S / 2);
    const cellAt = (p: THREE.Vector3) => Math.max(0, Math.min(n - 1, Math.floor(p.z / S))) * n + Math.max(0, Math.min(n - 1, Math.floor(p.x / S)));
    const body = new Body([S / 2, 0.02, S / 2], new THREE.Vector3(0.3, 0.85, 0.3));
    const build = (f: number) => {
      // Clear the last floor.
      w.scene.remove(group);
      group.traverse((o) => { const mm = o as THREE.Mesh; if (mm.geometry && mm.geometry !== robe.geometry) mm.geometry.dispose(); });
      floor = f; m = nightMaze(seed, f); n = m.n; group = new THREE.Group(); w.scene.add(group);
      w.solids = [];
      floorT.repeat.set(n * 2, n * 2);
      w.boxes([{ at: [n * S / 2, -0.25, n * S / 2], size: [n * S, 0.5, n * S] }], floorMat, true, group);
      w.boxes([{ at: [n * S / 2, H + 0.25, n * S / 2], size: [n * S, 0.5, n * S] }], ceilMat, false, group);
      const list: { at: [number, number, number]; size: [number, number, number] }[] = [
        { at: [n * S / 2, H / 2, 0], size: [n * S, H, 0.4] }, { at: [0, H / 2, n * S / 2], size: [0.4, H, n * S] },
      ];
      const p = new THREE.Vector3();
      for (let cell = 0; cell < n * n; cell++) {
        center(cell, p);
        if (!(cell % n < n - 1 && m.east[cell])) list.push({ at: [p.x + S / 2, H / 2, p.z], size: [0.4, H, S + 0.4] });
        if (!(cell < n * (n - 1) && m.south[cell])) list.push({ at: [p.x, H / 2, p.z + S / 2], size: [S + 0.4, H, 0.4] });
      }
      w.boxes(list, wallMat, true, group);
      walls = w.solids.slice(1);
      flicker = [];
      for (let i = 0; i < 6 + f; i++) {
        center(Math.floor(((Math.sin(seed + i * 91.7 + f * 13) + 1) / 2) * n * n) % (n * n), p);
        const l = new THREE.PointLight(0xfff1c1, 6, 9, 1.6); l.position.set(p.x, H - 0.3, p.z); group.add(l);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.3), new THREE.MeshBasicMaterial({ color: 0xfff6d5 })); lamp.position.set(p.x, H - 0.05, p.z); group.add(lamp);
        flicker.push({ l, seedV: i * 13.1 + f });
      }
      keys = m.keys.map((cell) => {
        const g = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 16), keyMat);
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.4), keyMat); shaft.position.z = 0.32;
        g.add(ring, shaft, glowSprite(0xfacc15, 1.4));
        center(cell, g.position).setY(1.1);
        group.add(g);
        return { g, got: false };
      });
      cells = m.batteries.map((cell) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.32, 10), new THREE.MeshBasicMaterial({ color: 0x4ade80 })); center(cell, b.position).setY(0.9); b.add(glowSprite(0x4ade80, 0.9)); group.add(b); return { b, got: false }; });
      const last = f === NIGHT_FLOORS - 1;
      const sign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.1), new THREE.MeshBasicMaterial({ color: last ? 0xef4444 : 0x22c55e }));
      center(m.exit, sign.position).setY(H - 0.5); sign.add(glowSprite(last ? 0xef4444 : 0x22c55e, 3)); group.add(sign);
      exitLight = new THREE.PointLight(last ? 0xef4444 : 0x22c55e, 4, 8); exitLight.position.copy(sign.position); group.add(exitLight);
      body.pos.set(S / 2, 0.02, S / 2); body.vel.set(0, 0, 0); c.yaw = Math.PI;
      gCell = gTo = Math.floor(n * n / 2) + Math.floor(n / 2);
      center(gCell, ghost.position);
    };
    build(0);

    let keysGot = 0, allKeys = 0, lives = NIGHT_LIVES, battery = 100, stamina = 100, score = 0, stun = 0, stuns = 0, coolUntil = 0, retreatUntil = 0, safeUntil = 2, beat = 0, bob = 0, done = false, caught = 0, lastHud = 0;
    const report = () => {
      out.current.onProgress(score, allKeys);
      out.current.onStats?.([{ label: 'Floors', value: `${Math.min(NIGHT_FLOORS, floor + (done && lives > 0 ? 1 : 0))} of ${NIGHT_FLOORS}` }, { label: 'Keys', value: String(allKeys) }, { label: 'Times caught', value: String(caught) }, { label: 'Drove it back', value: String(stuns) }]);
    };
    report();

    w.start((dt, t) => {
      if (done) return;
      const need = nightKeys(floor);
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
      for (const f of flicker) f.l.intensity = Math.sin(t * 7 + f.seedV) + Math.sin(t * 23 + f.seedV * 2) > 1.6 ? 0.4 : 6;
      // Keys and batteries.
      const me = V.me.copy(body.pos).setY(1.1);
      for (const k of keys) {
        if (k.got) continue;
        k.g.rotation.y = t * 1.8; k.g.position.y = 1.1 + Math.sin(t * 2.5) * 0.08;
        if (k.g.position.distanceTo(me) < 1.2) {
          k.got = true; group.remove(k.g); keysGot++; allKeys++; score += NIGHT_KEY;
          out.current.arena.sfx('coin', keysGot * 2);
          out.current.arena.announce(keysGot === need ? (floor === NIGHT_FLOORS - 1 ? 'All the keys! Find the EXIT' : 'All the keys! Find the STAIRS') : `Key ${keysGot} of ${need}`, keysGot === need ? 'gold' : 'good');
          report();
        }
      }
      for (const b of cells) if (!b.got && b.b.position.distanceTo(me) < 1.1) { b.got = true; group.remove(b.b); battery = Math.min(100, battery + 50); out.current.arena.sfx('power'); }
      // The stairs (or, on the last floor, the exit).
      exitLight.intensity = keysGot === need ? 6 + Math.sin(t * 6) * 3 : 2;
      if (keysGot === need && cellAt(body.pos) === m.exit) {
        if (floor < NIGHT_FLOORS - 1) {
          score += NIGHT_FLOOR; keysGot = 0; battery = Math.min(100, battery + 30);
          out.current.arena.announce(`Floor ${floor + 2} of ${NIGHT_FLOORS}… it’s darker down here`, 'pink'); out.current.arena.sfx('check');
          build(floor + 1); safeUntil = t + 3; report();
          return;
        }
        done = true;
        const left = Math.max(0, Math.round((out.current.endsAt - out.current.clock()) / 1000));
        score += NIGHT_ESCAPE + left * NIGHT_PER_SECOND;
        out.current.arena.announce('You got out!', 'gold'); out.current.arena.sfx('win');
        report();
        setTimeout(() => out.current.onDone(score, allKeys), 1600);
        return;
      }
      // The thing: walks the halls toward you (faster with every key and floor); the torch drives it back.
      const myCell = cellAt(body.pos);
      const speed = retreatUntil > t ? 3.2 : 1.9 + floor * 0.35 + keysGot * 0.3;
      const target = center(gTo, V.toT);
      target.sub(ghost.position).setY(0);
      if (target.length() < 0.15) {
        gCell = gTo;
        if (retreatUntil > t) { const away = mazeNext(m, gCell).sort((a, b) => center(b, V.q).distanceTo(body.pos) - center(a, V.flat).distanceTo(body.pos)); gTo = away[0] ?? gCell; }
        else gTo = mazeStep(m, gCell, myCell);
      } else { const len = target.length(); ghost.position.addScaledVector(target.normalize(), Math.min(len, speed * dt)); }
      ghost.position.y = Math.sin(t * 2) * 0.08;
      ghost.lookAt(body.pos.x, ghost.position.y, body.pos.z);
      const dist = ghost.position.distanceTo(V.flat.copy(body.pos).setY(ghost.position.y));
      // In the torch's beam, with nothing in between?
      const fwd = V.fwd.set(0, 0, -1).applyQuaternion(w.camera.quaternion);
      const toG = V.toG.copy(ghost.position).setY(1.6).sub(w.camera.position);
      const gl = toG.length();
      let lit = battery > 0 && dist < 15 && fwd.angleTo(toG) < 0.26;
      if (lit) { V.ray.set(w.camera.position, V.q.copy(toG).normalize()); const hit = new THREE.Vector3(); lit = !walls.some((s) => V.ray.intersectBox(s, hit) && hit.distanceTo(w.camera.position) < gl - 0.5); }
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
        body.pos.set(S / 2, 0.02, S / 2); body.vel.set(0, 0, 0); c.yaw = Math.PI;
        gCell = gTo = (n * n - 1) - Math.floor(n * 1.5); center(gCell, ghost.position);
        safeUntil = t + 3;
        report();
        if (lives <= 0) { done = true; out.current.arena.announce('It got you', 'bad'); setTimeout(() => out.current.onDone(score, allKeys), 1800); }
      }
      if (t - lastHud > 0.2) {
        lastHud = t;
        setHud((h) => ({ ...h, keys: keysGot, need, floor, lives, battery: Math.round(battery), stamina: Math.round(stamina), near: Math.max(0, Math.min(1, 1 - dist / 14)), open: keysGot === need }));
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
          <div className="rounded-2xl bg-black/60 px-3 py-2 ring-1 ring-white/10"><p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300">Floor</p><p className="text-lg font-black leading-tight text-white tabular-nums">{hud.floor + 1}/{NIGHT_FLOORS}</p></div>
          <div className="flex items-center gap-1 rounded-2xl bg-black/60 px-3 py-2 ring-1 ring-white/10" aria-label={`${hud.keys} of ${hud.need} keys`}>
            {Array.from({ length: hud.need }, (_, i) => <KeyRound key={i} className={cn('h-5 w-5', i < hud.keys ? 'text-amber-300' : 'text-zinc-600')} aria-hidden />)}
          </div>
          <div className="flex items-center gap-1 rounded-2xl bg-black/60 px-3 py-2 ring-1 ring-white/10" aria-label={`${hud.lives} lives`}>
            {Array.from({ length: NIGHT_LIVES }, (_, i) => <Heart key={i} className={cn('h-5 w-5', i < hud.lives ? 'fill-red-500 text-red-500' : 'text-zinc-600')} aria-hidden />)}
          </div>
          <div className="w-36 rounded-2xl bg-black/60 px-3 py-2 ring-1 ring-white/10">
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300"><Battery className="h-3.5 w-3.5" aria-hidden />Torch {hud.battery}%</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={cn('h-full w-full origin-left rounded-full rtl:origin-right', hud.battery > 15 ? 'bg-amber-200' : 'bg-red-500')} style={{ transform: `scaleX(${hud.battery / 100})` }} /></div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full w-full origin-left rounded-full bg-sky-300 rtl:origin-right" style={{ transform: `scaleX(${hud.stamina / 100})` }} /></div>
          </div>
          {hud.open && <span className="self-center rounded-full bg-red-600 px-3 py-1 text-xs font-black uppercase tracking-wider text-white">{hud.floor === NIGHT_FLOORS - 1 ? 'Exit open' : 'Stairs open'}</span>}
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
