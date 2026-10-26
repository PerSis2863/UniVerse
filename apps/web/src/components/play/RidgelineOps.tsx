'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Backpack, Crosshair, Heart, Map as MapIcon, Shield, Syringe } from 'lucide-react';
import { GAMES } from '@/lib/play';
import {
  FOES, GUNS, OPS_AMMO_MAX, OPS_AMMO_START, OPS_EDGE, OPS_EXTRACT, OPS_EXTRACT_MIN_S, OPS_HEADSHOT, OPS_HEAD_X, OPS_HELI_WAIT_S, OPS_HOSTAGE, OPS_HP, OPS_HQ, OPS_KILL,
  OPS_MEDS, OPS_MED_HEAL, OPS_MED_S, OPS_NADES, OPS_NADE_DMG, OPS_NADE_FUSE_S, OPS_NADE_R, OPS_OUTPOST, OPS_PACK, OPS_PLATE, OPS_PLATES, OPS_REINFORCE_EVERY_S,
  OPS_REINFORCE_FROM_S, OPS_REINFORCE_MAX, OPS_SIZE, OPS_SQUAD, RARITY, falloff, foeDrop, groundAt, gunAt, gunScore, itemName, itemRarity, opsMap, packAdd, packValue, takeHit,
  type FoeKind, type GunId, type OpsItem, type Rarity, type Valuable,
} from '@/lib/play/ops';
import { cn } from '@/lib/utils';
import { useArena } from './arena';
import { lookHex, readLook } from './PlayerCard';
import type { GameProps } from './game-props';
import type { Sfx } from './sound';
import { Avatar, Body, Controls, THREE, World, approach, glowSprite, walk } from './world/core';
import { Crowd } from './world/crowd';
import { CrateMesh, Heli, SolidGrid, aimPose, heldGun, islandImage, markSprite, outposts, scenery, sea, sky, soldier, terrain } from './world/ops-world';
import { WorldFrame } from './world/Stage';

// Ridgeline Ops (16+; rules, island and loot in src/lib/play/ops.ts, the 3D island in
// world/ops-world.ts). An open-world tactical looter shooter inspired by helicopter rescue
// games: pick a landing zone, fly in, raid outposts and search crates and soldiers for loot in five
// rarities, free hostages, then call the helicopter at a landing zone, hold it until it lands and get
// out to bank your backpack. Soldiers notice you ("?" then "!"), take cover behind their walls by
// line of sight, fire bursts, and come looking where they last saw or heard you; squads arrive as
// time goes on. Over-the-shoulder camera, aim down sights (right mouse / Aim), recoil, reloads,
// medkits, armour plates, grenades; a minimap, a compass, and an island map (M). The light goes from
// afternoon to sunset over the round. Per frame only transforms and pooled buffers change; the HUD
// re-renders at most ten times a second and only when something in it changed.

type Phase = 'deploy' | 'flight' | 'play' | 'down' | 'extract';
interface Held { gun: GunId; rarity: Rarity; mag: number }
interface Foe { id: number; kind: FoeKind; av: Avatar; body: Body; hp: number; max: number; post: number; home: THREE.Vector3; state: 'idle' | 'engage' | 'hunt'; aware: number; seen: THREE.Vector3; think: number; fireAt: number; burst: number; dead: number; mark: THREE.Sprite; markKind: '' | '?' | '!'; perch: boolean; wander: THREE.Vector3; active: boolean; lostAt: number; strafe: number; aimAt: number }
interface Drop { id: number; item: OpsItem | null; pack: Valuable[] | null; g: THREE.Group; v: THREE.Vector3; landed: boolean }
interface Hostage { place: number; av: Avatar; body: Body; state: 'held' | 'follow' | 'wait' | 'saved' }
interface Feed { id: number; text: string; color: string }
interface Card { name: string; rarity: Rarity; gun: GunId; rows: [string, number, number][] }

const HUD0 = { hp: OPS_HP, armour: 0, meds: 2, nades: 2, ammo: OPS_AMMO_START, mag: 30, magMax: 30, gun: 'Carbine', rarity: 0 as Rarity, other: 'Sidearm', otherRarity: 0 as Rarity, reloading: false, healing: false, pack: 0, packValue: 0, prompt: '', objective: '', heli: -1, crouch: false, aim: false, phase: 'deploy' as Phase, kills: 0, runs: 0 };
const PHONE_BUTTONS = [{ id: 'heal', label: 'Heal' }, { id: 'throw', label: 'Nade' }, { id: 'swap', label: 'Swap' }, { id: 'act', label: 'Use' }, { id: 'skill', label: 'Reload' }, { id: 'jump', label: 'Jump' }, { id: 'aim', label: 'Aim' }, { id: 'fire', label: 'Fire' }] as const;
const MAP_PX = 320;
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function RidgelineOps({ seed, endsAt, clock, onProgress, onStats, net }: GameProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const big = useRef<HTMLCanvasElement>(null);
  const compass = useRef<HTMLDivElement>(null);
  const reticle = useRef<HTMLDivElement>(null);
  const controls = useRef<Controls | null>(null);
  const cmd = useRef<{ deploy: (lz: number) => void; map: () => void } | null>(null);
  const arena = useArena();
  const [hud, setHud] = useState(HUD0);
  const [card, setCard] = useState<Card | null>(null);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [flash, setFlash] = useState({ hit: 0, kill: 0, head: false, hurt: 0, angle: 0 });
  const [mapOpen, setMapOpen] = useState(false);
  const [curtain, setCurtain] = useState<{ key: number; title: string; sub?: string } | null>(null);
  const [others, setOthers] = useState(0);
  const out = useRef({ arena, onProgress, onStats, clock, endsAt, net, mapOpen });
  useEffect(() => { out.current = { arena, onProgress, onStats, clock, endsAt, net, mapOpen }; });
  const map = useMemo(() => opsMap(seed), [seed]);
  const lzs = useMemo(() => map.places.filter((p) => p.kind === 'lz').map((p) => ({ id: p.id, name: p.name, x: (p.x + OPS_SIZE / 2) / OPS_SIZE, y: (p.z + OPS_SIZE / 2) / OPS_SIZE })), [map]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const H = map.heights;
    const ground = (x: number, z: number) => groundAt(H, x, z);
    const w = new World(el, { fov: 70, bg: 0xb9d3e4, fog: [0xc9dbe6, 110, 380], glow: { strength: 0.3, radius: 0.4, threshold: 0.88 }, env: 0.5 });
    w.camera.far = 420; w.camera.updateProjectionMatrix();
    const crowd = new Crowd(w, () => out.current.net);
    const c = new Controls(el);
    controls.current = c;
    const say = (t: string, tone: 'pink' | 'good' | 'bad' | 'gold' = 'pink') => out.current.arena.announce(t, tone);
    const sfx = (n: Sfx, level = 0, loud = 1) => out.current.arena.sfx(n, level, loud);
    const grid = new SolidGrid(), near: THREE.Box3[] = [], nearB: THREE.Box3[] = [];

    // The island.
    const sun = w.lights({ sky: 0xcfe4ff, ground: 0x5a4a32, sun: 0xfff1d6, power: 2.7, at: [60, 80, 30], ambient: 1.15 });
    const hemi = w.scene.children.find((o) => o instanceof THREE.HemisphereLight) as THREE.HemisphereLight;
    w.scene.add(terrain(map), sea(), scenery(map, w.phone, grid));
    const { dome, mat: skyMat } = sky();
    w.scene.add(dome);
    const flags = outposts(w, map, grid);
    const crates = map.crates.map((k) => { const m = new CrateMesh(k.x, ground(k.x, k.z), k.z, (k.id * 1.7) % Math.PI); w.scene.add(m.group); return { ...k, m, opened: false }; });
    const islandPic = islandImage(map, MAP_PX);
    const lzPlaces = map.places.filter((p) => p.kind === 'lz');

    // The player: a soldier in their own colours with a gun and a backpack that fills as they loot.
    const look = readLook(), me = new Avatar(lookHex(look), { legs: 0x3b3a2c, hat: look.hat });
    const myGun = heldGun(); me.group.add(myGun);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.75, 0.35), new THREE.MeshStandardMaterial({ color: 0x4d4a33, roughness: 0.95 }));
    pack.position.set(0, 1.35, -0.38); pack.castShadow = true; me.group.add(pack);
    me.group.rotation.order = 'YXZ';
    w.scene.add(me.group);
    const body = new Body([0, 30, 0]);
    let phase: Phase = 'deploy', phaseAt = 0, hp = OPS_HP, armour = 0, meds = 2, nades = 2, ammo = OPS_AMMO_START, crouch = false, aimToggle = false;
    const guns: Held[] = [{ gun: 'carbine', rarity: 0, mag: GUNS.carbine.mag }, { gun: 'pistol', rarity: 0, mag: GUNS.pistol.mag }];
    let slot = 0, cool = 0, reloadUntil = 0, healUntil = 0, recoil = 0, lastShot = -99, cardName = '';
    let bag: Valuable[] = [];
    let banked = 0, combat = 0, kills = 0, heads = 0, shots = 0, hits = 0, posts = 0, saved = 0, extracts = 0, runStart = 0, best: { name: string; rarity: Rarity } | null = null;
    let lz = 0, runs = 0, heading = 0, called = -1, heliAt = 0, reinforced = 0, nextSquad = OPS_REINFORCE_FROM_S, startT = -1, warned = false, feedId = 0;
    const capturedPosts = new Set<number>();
    const gun = () => gunAt(guns[slot].gun, guns[slot].rarity);
    const feedLine = (text: string, color = '#e4e4e7') => { const id = ++feedId; setFeed((f) => [...f.slice(-3), { id, text, color }]); setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), 4200); };

    // The helicopter: brings you in, takes you out.
    const heli = new Heli(); w.scene.add(heli.group); heli.group.visible = false;
    const heliPath = { from: new THREE.Vector3(), to: new THREE.Vector3(), t0: 0, dur: 1, mode: 'none' as 'none' | 'in' | 'hover' | 'leave' | 'call' | 'land' | 'wait' | 'out' };
    let chopAt = 0;

    // Soldiers at every outpost; the ones far away sleep (hidden, not thinking).
    const foes: Foe[] = [];
    const r = (() => { let a = (seed ^ 0x5bd1e995) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    const free = (x: number, z: number, blocks: { x: number; z: number; w: number; d: number }[]) => !blocks.some((b) => Math.abs(b.x - x) < b.w / 2 + 0.8 && Math.abs(b.z - z) < b.d / 2 + 0.8);
    const addFoe = (id: number, kind: FoeKind, x: number, y: number, z: number, post: number, perch: boolean) => {
      const av = soldier(kind, id), mark = markSprite('?');
      mark.position.y = 2.9; mark.visible = false; av.group.add(mark);
      av.group.position.set(x, y, z); av.group.visible = false; w.scene.add(av.group);
      const f: Foe = { id, kind, av, body: new Body([x, y, z]), hp: FOES[kind].hp, max: FOES[kind].hp, post, home: new THREE.Vector3(x, y, z), state: 'idle', aware: 0, seen: new THREE.Vector3(), think: r(), fireAt: 0, burst: 0, dead: 0, mark, markKind: '', perch, wander: new THREE.Vector3(x, y, z), active: false, lostAt: 0, strafe: 0, aimAt: 0 };
      foes.push(f);
      return f;
    };
    for (const p of map.places) {
      const decks = p.blocks.filter((b) => b.kind === 'deck');
      p.foes.forEach((kind, i) => {
        if (kind === 'marksman' && decks.length) { const d = decks[i % decks.length]; addFoe(p.id * 100 + i, kind, d.x, d.y + d.h, d.z, p.id, true); return; }
        for (let k = 0; k < 40; k++) {
          const a = r() * Math.PI * 2, d = 3 + r() * (p.r - 4), x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
          if (k < 39 && !free(x, z, p.blocks)) continue;
          addFoe(p.id * 100 + i, kind, x, ground(x, z), z, p.id, false);
          break;
        }
      });
    }
    // Hostages: in a house (under a roof) at their outpost, hands up.
    const hostages: Hostage[] = map.places.filter((p) => p.hostage).map((p) => {
      const roof = p.blocks.find((b) => b.kind === 'roof') ?? p.blocks.find((b) => b.kind === 'tent');
      const x = roof ? roof.x : p.x, z = roof ? roof.z : p.z;
      const av = new Avatar(0xf97316, { legs: 0xea580c });
      av.group.position.set(x, ground(x, z), z); w.scene.add(av.group);
      return { place: p.id, av, body: new Body([x, ground(x, z), z]), state: 'held' };
    });

    // Drops: loot in the world with a light beam in its rarity's colour.
    const drops: Drop[] = [];
    const beamGeo = new THREE.CylinderGeometry(0.05, 0.12, 7, 8, 1, true).translate(0, 3.5, 0);
    const beamMats = RARITY.map((x) => new THREE.MeshBasicMaterial({ color: x.hex, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    const itemGeo = { gun: new THREE.BoxGeometry(0.16, 0.2, 1), valuable: new THREE.BoxGeometry(0.45, 0.22, 0.3), med: new THREE.BoxGeometry(0.4, 0.3, 0.3), plate: new THREE.BoxGeometry(0.5, 0.65, 0.08), nade: new THREE.SphereGeometry(0.16, 10, 8), ammo: new THREE.BoxGeometry(0.4, 0.25, 0.25), pack: new THREE.BoxGeometry(0.6, 0.7, 0.35) };
    const itemMat = { gun: new THREE.MeshStandardMaterial({ color: 0x1f2124, metalness: 0.7, roughness: 0.4 }), valuable: new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.9, roughness: 0.25 }), med: new THREE.MeshStandardMaterial({ color: 0xf4f4f5, emissive: 0xdc2626, emissiveIntensity: 0.25 }), plate: new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.4, roughness: 0.6 }), nade: new THREE.MeshStandardMaterial({ color: 0x3f6212, roughness: 0.6 }), ammo: new THREE.MeshStandardMaterial({ color: 0xb08d57, metalness: 0.6, roughness: 0.4 }), pack: new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.9, emissive: 0x666666 }) };
    let dropId = 0;
    const spawnDrop = (at: THREE.Vector3, item: OpsItem | null, packItems: Drop['pack'] = null, pop = true) => {
      const kind = packItems ? 'pack' : item!.kind, g = new THREE.Group();
      const m = new THREE.Mesh(itemGeo[kind], itemMat[kind]); m.position.y = 0.3; m.castShadow = true; g.add(m);
      const rar = item ? itemRarity(item) : 0;
      if (packItems || (item && (item.kind === 'gun' || item.kind === 'valuable'))) { const b = new THREE.Mesh(beamGeo, packItems ? beamMats[0] : beamMats[rar]); g.add(b); g.add(glowSprite(packItems ? 0xffffff : RARITY[rar].hex, rar >= 3 ? 2.2 : 1.3)); }
      g.position.copy(at); w.scene.add(g);
      const a = r() * Math.PI * 2, v = pop ? new THREE.Vector3(Math.cos(a) * 1.8, 5 + r() * 2, Math.sin(a) * 1.8) : new THREE.Vector3();
      drops.push({ id: ++dropId, item, pack: packItems, g, v, landed: !pop });
    };
    const removeDrop = (d: Drop) => { w.scene.remove(d.g); drops.splice(drops.indexOf(d), 1); };

    // Shots: pooled tracer lines (one draw for all), a muzzle flash and its light.
    const TR = 48, trPos = new Float32Array(TR * 6), trCol = new Float32Array(TR * 6), trLife = new Float32Array(TR), trBase = new Float32Array(TR * 3);
    const trGeo = new THREE.BufferGeometry();
    trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3)); trGeo.setAttribute('color', new THREE.BufferAttribute(trCol, 3));
    const tracers = new THREE.LineSegments(trGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    tracers.frustumCulled = false; w.scene.add(tracers);
    let trNext = 0, trAlive = 0;
    const tracer = (a: THREE.Vector3, b: THREE.Vector3, color: number) => {
      const i = trNext; trNext = (trNext + 1) % TR;
      trPos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
      const col = new THREE.Color(color);
      trBase.set([col.r, col.g, col.b], i * 3); trLife[i] = 0.08; trAlive = 6;
    };
    const flashS = glowSprite(0xffd27a, 1.6); flashS.visible = false; w.scene.add(flashS);
    const flashL = new THREE.PointLight(0xffb347, 0, 14); w.scene.add(flashL);
    let flashT = 0;

    // Grenades.
    const nadesLive: { m: THREE.Mesh; v: THREE.Vector3; fuse: number }[] = [];
    const nadeGeo = new THREE.SphereGeometry(0.16, 12, 8), nadeMat = itemMat.nade;

    // Reusable vectors (nothing new per frame in the hot paths).
    const V = { shot: new THREE.Vector3(), dir: new THREE.Vector3(), right: new THREE.Vector3(), head: new THREE.Vector3(), cam: new THREE.Vector3(), hit: new THREE.Vector3(), p: new THREE.Vector3(), q: new THREE.Vector3(), ray: new THREE.Ray(), sph: new THREE.Sphere(), look: new THREE.Vector3(), tmp: new THREE.Vector3() };

    /** The first thing a ray meets: solids near its line, the ground, within `max`. */
    const rayWorld = (from: THREE.Vector3, dir: THREE.Vector3, max: number) => {
      let best = max;
      V.ray.set(from, dir);
      for (const b of grid.along(from, dir, max, nearB)) if (V.ray.intersectBox(b, V.q)) { const d = V.q.distanceTo(from); if (d < best && d > 0.05) best = d; }
      // The ground: march in 2 m steps, then halve to find the crossing.
      let prev = 0;
      for (let d = 2; d < best; d += 2) {
        const x = from.x + dir.x * d, y = from.y + dir.y * d, z = from.z + dir.z * d;
        if (y < ground(x, z)) {
          let lo = prev, hi = d;
          for (let k = 0; k < 5; k++) { const m = (lo + hi) / 2; if (from.y + dir.y * m < ground(from.x + dir.x * m, from.z + dir.z * m)) hi = m; else lo = m; }
          best = hi; break;
        }
        prev = d;
      }
      return best;
    };
    /** Whether a soldier at `a` can see a point `b` (nothing solid or ground between). */
    const sight = (a: THREE.Vector3, b: THREE.Vector3) => {
      V.tmp.subVectors(b, a); const d = V.tmp.length(); V.tmp.divideScalar(d);
      return rayWorld(a, V.tmp, d) >= d - 0.6;
    };

    const report = (() => {
      let last = '', at = 0;
      return (force = false) => {
        const now = performance.now();
        if (!force && now - at < 100) return;
        at = now;
        const g = gun(), other = guns[1 - slot];
        const next = { hp: Math.round(hp), armour: Math.round(armour), meds, nades, ammo, mag: guns[slot].mag, magMax: g.mag, gun: g.name, rarity: guns[slot].rarity, other: gunAt(other.gun, other.rarity).name, otherRarity: other.rarity, reloading: reloadUntil > T, healing: healUntil > T, pack: bag.length, packValue: packValue(bag), prompt, objective: objective(), heli: called >= 0 && heliPath.mode === 'call' ? Math.max(0, Math.ceil(heliAt - T)) : -1, crouch, aim: aiming, phase, kills, runs };
        const key = JSON.stringify(next);
        if (key !== last) { last = key; setHud(next); }
      };
    })();
    let lastScore = -1;
    const scored = () => {
      const score = banked + combat;
      if (score !== lastScore) { lastScore = score; out.current.onProgress(score, kills); }
      out.current.onStats?.([
        { label: 'Kills', value: String(kills) }, { label: 'Headshots', value: `${kills ? Math.round((100 * heads) / kills) : 0}%` }, { label: 'Accuracy', value: `${shots ? Math.round((100 * hits) / shots) : 0}%` },
        { label: 'Loot banked', value: banked.toLocaleString() }, { label: 'Hostages saved', value: String(saved) }, { label: 'Outposts taken', value: `${posts} / ${map.places.length - 4}` },
        { label: 'Extractions', value: String(extracts) }, { label: 'Best find', value: best ? `${best.name} (${RARITY[best.rarity].name})` : '—' },
      ]);
    };
    const objective = () => {
      if (phase !== 'play') return '';
      if (called >= 0) return heliPath.mode === 'wait' || heliPath.mode === 'land' ? 'Get to the helicopter!' : `Hold ${map.places[called].name}`;
      if (hostages.some((h) => h.state === 'follow')) return 'Get the hostage to a landing zone (E there)';
      const h = hostages.find((x) => x.state === 'held');
      if (h) return `Free the hostage at ${map.places[h.place].name}`;
      if (bag.length >= OPS_PACK) return 'Backpack full: extract at a landing zone';
      return 'Raid outposts, loot, extract';
    };
    let prompt = '', aiming = false, T = 0;

    // Deploying: fly from the sea to the chosen landing zone, drop off, and the helicopter leaves.
    const deploy = (i: number) => {
      if (phase !== 'deploy') return;
      lz = i; runs++;
      const p = lzPlaces[i], outward = new THREE.Vector3(p.x, 0, p.z).normalize();
      heliPath.from.set(p.x + outward.x * 190, 48, p.z + outward.z * 190);
      heliPath.to.set(p.x - outward.x * 4, p.y + 1.6, p.z - outward.z * 4);
      heliPath.t0 = T; heliPath.dur = 6; heliPath.mode = 'in';
      heli.group.visible = true; heli.group.position.copy(heliPath.from);
      phase = 'flight'; phaseAt = T; setMapOpen(false);
      sfx('whoosh');
      report(true);
    };
    cmd.current = { deploy, map: () => setMapOpen((o) => !o) };

    // Keys this game adds (the rest are Controls'): G grenade, H medkit, X / 1 / 2 swap, C crouch, M map; right mouse aims.
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'g') c.press('throw');
      if (k === 'h') c.press('heal');
      if (k === 'x' || (k === '1' && slot !== 0) || (k === '2' && slot !== 1)) c.press('swap');
      if (k === 'c') crouch = !crouch;
      if (k === 'm') setMapOpen((o) => !o);
      if (phase === 'deploy' && ['1', '2', '3', '4'].includes(k)) deploy(Number(k) - 1);
    };
    const onDown = (e: MouseEvent) => { if (e.button === 2) c.press('aim'); };
    const onUp = (e: MouseEvent) => { if (e.button === 2) c.release('aim'); };
    const noMenu = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', onKey); el.addEventListener('mousedown', onDown); window.addEventListener('mouseup', onUp); el.addEventListener('contextmenu', noMenu);

    // A soldier is hit: hurt, alert, maybe down (score, loot, and the outpost may fall).
    const hurtFoe = (f: Foe, dmg: number, head: boolean, at: THREE.Vector3) => {
      if (f.dead) return;
      f.hp -= dmg; f.aware = 1; f.state = 'engage'; f.seen.copy(body.pos);
      w.say(String(Math.round(dmg)), at.clone().setY(at.y + 0.4), head ? '#fde047' : '#ffffff', head ? 0.8 : 0.6);
      for (const o of foes) if (!o.dead && o.post === f.post && o !== f && o.av.group.position.distanceTo(f.av.group.position) < 28) { o.aware = Math.max(o.aware, 0.7); o.seen.copy(body.pos); }
      if (f.hp > 0) return;
      f.dead = T; kills++; if (head) heads++;
      combat += OPS_KILL + (head ? OPS_HEADSHOT : 0);
      f.mark.visible = false;
      setFlash((x) => ({ ...x, kill: x.kill + 1, head }));
      sfx(head ? 'ding' : 'hit'); w.freeze(head ? 70 : 35);
      feedLine(head ? `Headshot · ${f.kind}  +${OPS_KILL + OPS_HEADSHOT}` : `Enemy down · ${f.kind}  +${OPS_KILL}`, head ? '#fde047' : '#e4e4e7');
      for (const it of foeDrop(seed, f.id, f.kind)) spawnDrop(f.av.group.position.clone().setY(f.av.group.position.y + 1), it);
      if (f.post >= 0 && !capturedPosts.has(f.post) && foes.every((o) => o.post !== f.post || o.dead)) {
        const p = map.places[f.post];
        capturedPosts.add(p.id); posts++;
        const pts = p.kind === 'hq' ? OPS_HQ : OPS_OUTPOST;
        combat += pts;
        flags.get(p.id)?.color.set(0x16a34a); flags.get(p.id)?.emissive.set(0x002200);
        say(`${p.name} taken! +${pts.toLocaleString()}`, 'good'); sfx('check');
      }
      scored(); report(true);
    };
    // The player is hit from `from`.
    const hurtMe = (dmg: number, from: THREE.Vector3) => {
      if (phase !== 'play') return;
      const left = takeHit(hp, armour, dmg);
      hp = left.hp; armour = left.armour;
      // Where it came from, relative to where you look (0 = straight ahead), for the arrow.
      const ang = ((Math.atan2(from.x - body.pos.x, -(from.z - body.pos.z)) - heading) * 180) / Math.PI;
      setFlash((x) => ({ ...x, hurt: x.hurt + 1, angle: ang }));
      sfx('hurt', 0, 0.7); w.shake(0.18);
      if (hp <= 0) goDown();
      report(true);
    };
    const goDown = () => {
      phase = 'down'; phaseAt = T; healUntil = 0; reloadUntil = 0;
      if (bag.length) { spawnDrop(body.pos.clone(), null, bag, false); feedLine(`Backpack dropped (${packValue(bag)})`, '#fca5a5'); }
      bag = [];
      for (const h of hostages) if (h.state === 'follow') h.state = 'wait';
      if (called >= 0) { called = -1; heliPath.mode = 'out'; heliPath.t0 = T; }
      say('You’re down', 'bad'); sfx('end');
      me.group.rotation.x = 0;
      report(true);
    };
    const bank = () => {
      const value = packValue(bag), withMe = hostages.filter((h) => h.state === 'follow' && h.av.group.position.distanceTo(body.pos) < 30);
      const bonus = (value > 0 || withMe.length) && T - runStart >= OPS_EXTRACT_MIN_S ? OPS_EXTRACT : 0;
      banked += value + bonus; combat += withMe.length * OPS_HOSTAGE; saved += withMe.length;
      for (const h of withMe) { h.state = 'saved'; h.av.group.visible = false; }
      extracts++;
      say(`Extracted! +${(value + bonus + withMe.length * OPS_HOSTAGE).toLocaleString()}`, 'gold'); sfx('win');
      bag = [];
      // Back at base: patched up and resupplied.
      hp = OPS_HP; armour = Math.max(armour, OPS_PLATE); ammo = Math.max(ammo, OPS_AMMO_START); meds = Math.max(meds, 2); nades = Math.max(nades, 1);
      scored(); report(true);
    };
    const pickUp = (d: Drop) => {
      const it = d.item;
      if (d.pack) {
        let left = 0;
        for (const v of d.pack) { const res = packAdd(bag, v); bag = res.pack; if (res.dropped) left++; }
        feedLine(left ? `Backpack recovered (${left} left behind)` : 'Backpack recovered', '#a7f3d0'); sfx('power'); removeDrop(d); return;
      }
      if (!it || it.kind === 'gun') return;
      if (it.kind === 'valuable') {
        const res = packAdd(bag, it);
        if (res.dropped === it) { prompt = 'Backpack full of better loot'; return; }
        bag = res.pack;
        if (res.dropped) spawnDrop(body.pos.clone().setY(body.pos.y + 1), res.dropped);
        if (!best || it.rarity > best.rarity) best = { name: it.name, rarity: it.rarity };
      } else if (it.kind === 'ammo') { if (ammo >= OPS_AMMO_MAX) return; ammo = Math.min(OPS_AMMO_MAX, ammo + it.n); }
      else if (it.kind === 'med') { if (meds >= OPS_MEDS) return; meds++; }
      else if (it.kind === 'plate') { if (armour >= OPS_PLATES * OPS_PLATE) return; armour = Math.min(OPS_PLATES * OPS_PLATE, armour + OPS_PLATE); }
      else if (it.kind === 'nade') { if (nades >= OPS_NADES) return; nades++; }
      const rar = itemRarity(it);
      feedLine(`+ ${itemName(it)}${it.kind === 'valuable' ? `  ${it.value}` : ''}`, RARITY[rar].color);
      sfx(rar >= 4 ? 'legend' : 'coin', rar);
      if (rar >= 4) { say(`Legendary! ${itemName(it)}`, 'gold'); w.freeze(90); }
      removeDrop(d); report(true);
    };
    const takeGun = (d: Drop) => {
      const it = d.item;
      if (!it || it.kind !== 'gun') return;
      const old = guns[slot];
      spawnDrop(body.pos.clone().setY(body.pos.y + 1), { kind: 'gun', gun: old.gun, rarity: old.rarity });
      guns[slot] = { gun: it.gun, rarity: it.rarity, mag: gunAt(it.gun, it.rarity).mag };
      if (!best || it.rarity > best.rarity) best = { name: gunAt(it.gun, it.rarity).name, rarity: it.rarity };
      feedLine(`Equipped ${gunAt(it.gun, it.rarity).name}`, RARITY[it.rarity].color);
      sfx(it.rarity >= 4 ? 'legend' : 'reload'); reloadUntil = 0;
      if (it.rarity >= 4) say(`Legendary! ${gunAt(it.gun, it.rarity).name}`, 'gold');
      removeDrop(d); cardName = ''; setCard(null); report(true);
    };

    const fire = () => {
      const held = guns[slot], g = gun();
      if (held.mag <= 0) { if (ammo > 0 || held.gun === 'pistol') startReload(); else sfx('tick'); return; }
      held.mag--; shots++; lastShot = T;
      cool = 60 / g.rpm;
      const moving = Math.hypot(body.vel.x, body.vel.z) > 2;
      const spread = g.spread * (aiming ? 1 : 2.6) * (moving ? 1.6 : 1) * (crouch ? 0.75 : 1) * (body.ground ? 1 : 2);
      const muzzle = myGun.getWorldPosition(V.p).addScaledVector(V.look, 0.6);
      flashS.position.copy(muzzle); flashS.visible = true; flashL.position.copy(muzzle); flashL.intensity = 30; flashT = 0.045;
      sfx('gun', held.gun === 'dmr' ? -6 : held.gun === 'smg' ? 4 : 0);
      const camDist = w.camera.position.distanceTo(V.head);
      let any = false, anyHead = false;
      for (let k = 0; k < g.pellets; k++) {
        const dir = V.shot.copy(V.look).add(V.tmp.set((Math.random() - 0.5) * 2 * spread, (Math.random() - 0.5) * 2 * spread, (Math.random() - 0.5) * 2 * spread)).normalize();
        const origin = V.cam.copy(w.camera.position).addScaledVector(dir, camDist);
        const range = Math.max(250, g.range * 2.2);
        let bestD = rayWorld(origin, dir, range), target: Foe | null = null, head = false;
        V.ray.set(origin, dir);
        for (const f of foes) {
          if (!f.active || f.dead) continue;
          const s = f.av.group.scale.x, fp = f.av.group.position, big = w.phone ? 1.3 : 1;
          for (const [y, rad, isHead] of [[2.0 * s, 0.32 * big, true], [1.3 * s, 0.55 * big, false], [0.6 * s, 0.45 * big, false]] as const) {
            V.sph.center.set(fp.x, fp.y + y, fp.z); V.sph.radius = rad;
            if (V.ray.intersectSphere(V.sph, V.hit)) { const d = V.hit.distanceTo(origin); if (d < bestD) { bestD = d; target = f; head = isHead; } }
          }
        }
        const end = V.q.copy(origin).addScaledVector(dir, bestD);
        if (k < 3) tracer(muzzle, end, 0xfff3b0);
        if (target) {
          any = true; anyHead ||= head;
          hurtFoe(target, g.dmg * falloff(g, bestD) * (head ? OPS_HEAD_X : 1), head, end);
          w.burst(end, 0xfbbf24, 5, 3, 6);
        } else if (bestD < range) w.burst(end, ground(end.x, end.z) > end.y - 0.3 ? 0x8b7355 : 0xd6cfc2, 6, 2.5, 9);
      }
      if (any) { hits++; setFlash((x) => ({ ...x, hit: x.hit + 1, head: anyHead })); }
      // Recoil: the view kicks up (and a little sideways); most of it settles back by itself.
      const kick = g.kick * (aiming ? 0.7 : 1) * (crouch ? 0.8 : 1);
      c.turn((Math.random() - 0.5) * kick * 0.5, -kick); recoil += kick;
      // Soldiers nearby hear it.
      for (const f of foes) if (f.active && !f.dead && f.av.group.position.distanceTo(body.pos) < 80) { f.aware = Math.max(f.aware, 0.55); f.seen.copy(body.pos); }
      if (held.mag === 0 && (ammo > 0 || held.gun === 'pistol')) startReload();
    };
    const startReload = () => {
      const held = guns[slot], g = gun();
      if (reloadUntil > T || held.mag >= g.mag || (ammo <= 0 && held.gun !== 'pistol')) return;
      reloadUntil = T + g.reload; sfx('reload');
    };
    const finishReload = () => {
      const held = guns[slot], g = gun(), need = g.mag - held.mag;
      if (held.gun === 'pistol') held.mag = g.mag;
      else { const n = Math.min(need, ammo); held.mag += n; ammo -= n; }
      reloadUntil = 0;
    };
    const throwNade = () => {
      if (nades <= 0) return;
      nades--;
      const m = new THREE.Mesh(nadeGeo, nadeMat); m.position.copy(V.head).addScaledVector(V.look, 0.8); m.castShadow = true; w.scene.add(m);
      nadesLive.push({ m, v: V.look.clone().multiplyScalar(19).add(V.tmp.set(0, 5, 0)), fuse: OPS_NADE_FUSE_S });
      sfx('whoosh'); report(true);
    };
    const blast = (at: THREE.Vector3) => {
      w.burst(at, 0xff9a3c, 70, 13, 6); w.burst(at, 0x52525b, 40, 5, -1.5); w.shake(0.7); w.freeze(60);
      flashL.position.copy(at).setY(at.y + 1); flashL.intensity = 260; flashT = 0.12;
      sfx('boom', 0, Math.max(0.2, 1 - at.distanceTo(body.pos) / 120));
      for (const f of foes) { if (f.dead || !f.active) continue; const d = f.av.group.position.distanceTo(at); if (d < OPS_NADE_R) hurtFoe(f, OPS_NADE_DMG * (1 - d / OPS_NADE_R) + 20, false, f.av.group.position.clone().setY(f.av.group.position.y + 1.5)); }
      const dm = body.pos.distanceTo(at);
      if (dm < 5) hurtMe(60 * (1 - dm / 5), at);
    };

    // A soldier fires at the player: a hit or a near miss, by distance, movement and cover.
    const foeShoot = (f: Foe, dist: number) => {
      const spec = FOES[f.kind], fp = f.av.group.position;
      const from = V.p.set(fp.x, fp.y + 1.5 * f.av.group.scale.y, fp.z);
      const speed = Math.hypot(body.vel.x, body.vel.z), prog = Math.min(1, Math.max(0, (T - startT) / GAMES.ops.seconds));
      let chance = (f.kind === 'marksman' ? 0.85 : 0.5) * Math.max(0.12, Math.min(1, 1.15 - dist / (spec.sight * 0.9))) * (speed > 5 ? 0.6 : 1) * (crouch ? 0.8 : 1) * (0.85 + 0.3 * prog);
      if (f.kind === 'heavy') chance *= 0.8;
      const hit = Math.random() < chance;
      const to = V.q.set(body.pos.x, body.pos.y + 1.3, body.pos.z);
      if (!hit) to.add(V.tmp.set((Math.random() - 0.5) * 3, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 3));
      tracer(from, to, 0xff7a45);
      sfx('shot', f.kind === 'marksman' ? -5 : 0, Math.max(0.15, 1 - dist / 140));
      if (hit) hurtMe(spec.dmg * (0.85 + Math.random() * 0.3), fp);
    };

    // Squads arrive from out of sight, already hunting where you are.
    const reinforce = (toward: THREE.Vector3) => {
      if (reinforced >= OPS_REINFORCE_MAX) return;
      for (let tries = 0; tries < 20; tries++) {
        const a = Math.random() * Math.PI * 2, d = 85 + Math.random() * 30, x = toward.x + Math.cos(a) * d, z = toward.z + Math.sin(a) * d;
        if (Math.hypot(x, z) > OPS_EDGE - 10 || ground(x, z) < 1.5) continue;
        for (let i = 0; i < OPS_SQUAD && reinforced < OPS_REINFORCE_MAX; i++) {
          const f = addFoe(10_000 + reinforced, i === 0 && reinforced % 9 === 6 ? 'heavy' : 'rifleman', x + i * 1.6, ground(x + i * 1.6, z), z, -1, false);
          f.state = 'hunt'; f.aware = 0.6; f.seen.copy(toward); reinforced++;
        }
        say('Enemy squad inbound', 'bad'); sfx('alarm');
        return;
      }
    };

    let mapAt = 0, compassDeg = 999, todAt = -9;
    const SKY = { top0: new THREE.Color(0x3d7ec9), top1: new THREE.Color(0x283a66), hor0: new THREE.Color(0xcfe1ee), hor1: new THREE.Color(0xf4a46a), sun0: new THREE.Color(0xfff1d6), sun1: new THREE.Color(0xff9d5c) };
    /** The light by the round's progress: afternoon to sunset. */
    const timeOfDay = () => {
      const k = Math.min(1, Math.max(0, 1 - (out.current.endsAt - out.current.clock()) / (GAMES.ops.seconds * 1000)));
      const el2 = (48 - 40 * k) * (Math.PI / 180), az = 0.6 + k * 0.5;
      const dir = V.tmp.set(Math.cos(el2) * Math.cos(az), Math.sin(el2), Math.cos(el2) * Math.sin(az));
      skyMat.uniforms.sunDir.value.copy(dir);
      skyMat.uniforms.top.value.copy(SKY.top0).lerp(SKY.top1, k);
      skyMat.uniforms.horizon.value.copy(SKY.hor0).lerp(SKY.hor1, k * k);
      skyMat.uniforms.sunColor.value.copy(SKY.sun0).lerp(SKY.sun1, k);
      sun.color.copy(SKY.sun0).lerp(SKY.sun1, k); sun.intensity = 2.7 - 1.1 * k;
      hemi.intensity = 1.15 - 0.35 * k;
      (w.scene.fog as THREE.Fog).color.copy(skyMat.uniforms.horizon.value);
      return dir;
    };
    let sunDir = timeOfDay().clone();

    /** The minimap (turned so ahead is up) and, when open, the whole island. */
    const drawMaps = () => {
      const px = body.pos.x, pz = body.pos.z, minimap = mini.current?.getContext('2d');
      if (minimap && mini.current) {
        const S = mini.current.width, k = S / 240; // 240 m across
        const g = minimap;
        g.clearRect(0, 0, S, S);
        g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.clip();
        g.translate(S / 2, S / 2); g.rotate(-heading);
        const ik = (MAP_PX / OPS_SIZE);
        g.drawImage(islandPic, (-(px + OPS_SIZE / 2) * ik) * (k / ik), (-(pz + OPS_SIZE / 2) * ik) * (k / ik), MAP_PX * (k / ik), MAP_PX * (k / ik));
        const dot = (x: number, z: number, color: string, rad: number, square = false) => { g.fillStyle = color; const sx = (x - px) * k, sz = (z - pz) * k; if (square) g.fillRect(sx - rad, sz - rad, rad * 2, rad * 2); else { g.beginPath(); g.arc(sx, sz, rad, 0, Math.PI * 2); g.fill(); } };
        for (const p of map.places) if (p.kind === 'lz') dot(p.x, p.z, called === p.id ? '#facc15' : '#fde68a', S * 0.035, true); else dot(p.x, p.z, capturedPosts.has(p.id) ? '#22c55e' : '#ef4444', S * 0.03, true);
        for (const h of hostages) if (h.state !== 'saved') dot(h.av.group.position.x, h.av.group.position.z, '#fb923c', S * 0.025);
        for (const d of drops) if (d.pack) dot(d.g.position.x, d.g.position.z, '#ffffff', S * 0.028);
        for (const f of foes) if (f.active && !f.dead && (f.aware >= 1 || T - f.fireAt < 2)) dot(f.av.group.position.x, f.av.group.position.z, '#f87171', S * 0.02);
        if (heli.group.visible) dot(heli.group.position.x, heli.group.position.z, '#a3e635', S * 0.03);
        g.restore();
        // Me: an arrow pointing up.
        g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(S / 2, S / 2 - S * 0.06); g.lineTo(S / 2 + S * 0.04, S / 2 + S * 0.04); g.lineTo(S / 2 - S * 0.04, S / 2 + S * 0.04); g.closePath(); g.fill();
      }
      const bg = (out.current.mapOpen || phase === 'deploy') && big.current ? big.current.getContext('2d') : null;
      if (bg && big.current) {
        const S = big.current.width, k = S / OPS_SIZE, at = (v: number) => (v + OPS_SIZE / 2) * k;
        bg.drawImage(islandPic, 0, 0, S, S);
        for (const p of map.places) {
          if (p.kind === 'lz') continue;
          bg.fillStyle = capturedPosts.has(p.id) ? '#22c55e' : '#ef4444'; bg.fillRect(at(p.x) - 5, at(p.z) - 5, 10, 10);
          bg.fillStyle = 'rgba(0,0,0,0.65)'; bg.font = `600 ${Math.round(S / 36)}px system-ui, sans-serif`; bg.textAlign = 'center';
          bg.fillText(p.name, at(p.x), at(p.z) - 9);
        }
        for (const h of hostages) if (h.state !== 'saved') { bg.fillStyle = '#fb923c'; bg.beginPath(); bg.arc(at(h.av.group.position.x), at(h.av.group.position.z), 5, 0, Math.PI * 2); bg.fill(); }
        for (const d of drops) if (d.pack) { bg.fillStyle = '#ffffff'; bg.beginPath(); bg.arc(at(d.g.position.x), at(d.g.position.z), 5, 0, Math.PI * 2); bg.fill(); }
        if (phase !== 'deploy') {
          bg.save(); bg.translate(at(px), at(pz)); bg.rotate(heading);
          bg.fillStyle = '#ffffff'; bg.strokeStyle = '#000'; bg.lineWidth = 2; bg.beginPath(); bg.moveTo(0, -9); bg.lineTo(6, 6); bg.lineTo(-6, 6); bg.closePath(); bg.stroke(); bg.fill();
          bg.restore();
        }
      }
    };

    const camAt = new THREE.Vector3(0, 60, 0);
    w.start((dt, t) => {
      T = t;
      if (startT < 0) { startT = t; phaseAt = t; }
      if (t - todAt > 1) { todAt = t; sunDir = timeOfDay().clone(); }
      const left = out.current.endsAt - out.current.clock();
      if (!warned && left < 60_000 && left > 0) { warned = true; say('60 seconds left! Get out with your loot', 'gold'); sfx('alarm'); }
      aiming = phase === 'play' && healUntil <= t && (w.phone ? aimToggle : c.held.has('aim'));
      if (w.phone && c.take('aim')) aimToggle = !aimToggle;
      prompt = '';

      // The view direction from the controls.
      V.dir.set(Math.sin(c.yaw) * Math.cos(c.pitch), -Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
      V.look.copy(V.dir).negate();
      V.right.set(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
      heading = Math.atan2(V.look.x, -V.look.z);

      // ── Deploy: the island from high up, slowly turning, while the map is open.
      if (phase === 'deploy') {
        me.group.visible = false;
        const a = t * 0.05;
        camAt.set(Math.cos(a) * 150, 120, Math.sin(a) * 150);
        w.camera.position.lerp(camAt, 1 - Math.exp(-2 * dt)); w.camera.lookAt(0, 8, 0);
        if (t - phaseAt > 14) deploy(Math.floor(Math.random() * 4));
      }
      // ── Flight in: chase the helicopter to the pad, then the drop.
      if (phase === 'flight') {
        const k = Math.min(1, (t - heliPath.t0) / heliPath.dur), e = 1 - Math.pow(1 - k, 3);
        heli.group.position.lerpVectors(heliPath.from, heliPath.to, e);
        heli.group.position.y += Math.sin(t * 1.3) * 0.15 * (1 - k);
        heli.group.lookAt(heliPath.to.x, heli.group.position.y, heliPath.to.z);
        heli.group.rotation.x = 0.18 * (1 - k);
        V.p.copy(heliPath.to).sub(heliPath.from).setY(0).normalize();
        camAt.copy(heli.group.position).addScaledVector(V.p, -16).setY(heli.group.position.y + 6);
        w.camera.position.lerp(camAt, 1 - Math.exp(-4 * dt)); w.camera.lookAt(heli.group.position.x, heli.group.position.y + 1, heli.group.position.z);
        if (k >= 1) {
          const p = lzPlaces[lz];
          phase = 'play'; phaseAt = t; runStart = t;
          body.pos.set(heli.group.position.x + V.right.x * 3, ground(heli.group.position.x + V.right.x * 3, heli.group.position.z + V.right.z * 3), heli.group.position.z + V.right.z * 3);
          body.vel.set(0, 0, 0);
          c.yaw = Math.atan2(p.x, p.z); c.pitch = -0.1; // facing inland
          me.group.visible = true; me.group.rotation.x = 0;
          heliPath.mode = 'leave'; heliPath.t0 = t; heliPath.from.copy(heli.group.position); heliPath.to.set(p.x * 2.2, 60, p.z * 2.2);
          setCurtain({ key: Date.now(), title: p.name, sub: 'Loot · free the hostages · get out alive' });
          sfx('go'); report(true);
        }
      }
      // ── Down: the camera rises over where you fell, then back to the map.
      if (phase === 'down') {
        me.group.rotation.x = approach(me.group.rotation.x, -Math.PI / 2, 6, dt);
        camAt.set(body.pos.x + 6, body.pos.y + 14, body.pos.z + 6);
        w.camera.position.lerp(camAt, 1 - Math.exp(-1.5 * dt)); w.camera.lookAt(body.pos);
        if (t - phaseAt > 3.5) { phase = 'deploy'; phaseAt = t; hp = OPS_HP; ammo = Math.max(ammo, OPS_AMMO_START); report(true); }
      }
      // ── Extract: on board, the helicopter lifts off and leaves.
      if (phase === 'extract') {
        const k = Math.min(1, (t - heliPath.t0) / 4);
        heli.group.position.y += dt * (3 + k * 10); heli.group.position.addScaledVector(V.p.copy(heliPath.to).setY(0).normalize(), dt * k * 22);
        heli.group.rotation.x = approach(heli.group.rotation.x, 0.22, 2, dt);
        camAt.copy(heli.group.position).add(V.q.set(14, 3, 14));
        w.camera.position.lerp(camAt, 1 - Math.exp(-2 * dt)); w.camera.lookAt(heli.group.position);
        if (k >= 1) { phase = 'deploy'; phaseAt = t; heli.group.visible = false; heliPath.mode = 'none'; report(true); }
      }

      // ── The helicopter's own moves: leaving after a drop, coming when called, waiting, going.
      if (heliPath.mode === 'leave' || heliPath.mode === 'out') {
        const k = Math.min(1, (t - heliPath.t0) / 5);
        if (heliPath.mode === 'out') heliPath.to.set(heli.group.position.x * 1.05, 60, heli.group.position.z * 1.05);
        heli.group.position.lerp(heliPath.to, dt * (0.15 + k * 0.6));
        heli.group.rotation.x = approach(heli.group.rotation.x, -0.2, 2, dt);
        if (k >= 1) { heli.group.visible = false; heliPath.mode = 'none'; }
      }
      if (heliPath.mode === 'call') {
        const p = map.places[called], k = Math.min(1, Math.max(0, 1 - (heliAt - t) / OPS_HELI_WAIT_S)), e = 1 - Math.pow(1 - k, 2);
        heli.group.visible = k > 0.35;
        heli.group.position.lerpVectors(heliPath.from, V.p.set(p.x, p.y + 12, p.z), e);
        heli.group.lookAt(p.x, heli.group.position.y, p.z);
        if (k >= 1) { heliPath.mode = 'land'; heliPath.t0 = t; say('Helicopter landing!', 'good'); }
      }
      if (heliPath.mode === 'land') {
        const p = map.places[called];
        heli.group.position.y = approach(heli.group.position.y, p.y + 0.1, 1.6, dt);
        if (heli.group.position.y < p.y + 0.4) { heliPath.mode = 'wait'; heliPath.t0 = t; }
      }
      if (heliPath.mode === 'wait' && phase === 'play') {
        prompt = 'Board the helicopter';
        if (body.pos.distanceTo(heli.group.position) < 6) {
          bank(); phase = 'extract'; phaseAt = t; heliPath.t0 = t; heliPath.mode = 'none'; called = -1; me.group.visible = false;
          heliPath.to.set(heli.group.position.x * 2, 0, heli.group.position.z * 2);
        } else if (t - heliPath.t0 > 30) { say('The helicopter couldn’t wait', 'bad'); called = -1; heliPath.mode = 'out'; heliPath.t0 = t; }
      }
      if (heli.group.visible) {
        heli.update(dt);
        const d = heli.group.position.distanceTo(w.camera.position);
        if (t - chopAt > 0.085 && d < 160) { chopAt = t; sfx('chop', 0, Math.max(0.05, 1 - d / 160) * 0.8); }
        // Rotor wash: dust on the ground under it.
        if (heli.group.position.y - ground(heli.group.position.x, heli.group.position.z) < 10 && Math.random() < 0.5) w.burst(V.q.set(heli.group.position.x + (Math.random() - 0.5) * 8, ground(heli.group.position.x, heli.group.position.z) + 0.3, heli.group.position.z + (Math.random() - 0.5) * 8), 0xc8b28a, 3, 4, 1);
      }

      // ── Playing.
      if (phase === 'play') {
        if (c.take('skill')) startReload();
        if (reloadUntil && t >= reloadUntil) finishReload();
        if (c.take('swap')) { slot = 1 - slot; reloadUntil = 0; sfx('pick'); }
        if (c.take('heal') && meds > 0 && hp < OPS_HP && healUntil <= t) { healUntil = t + OPS_MED_S; reloadUntil = 0; }
        if (healUntil && t >= healUntil) { healUntil = 0; meds--; hp = Math.min(OPS_HP, hp + OPS_MED_HEAL); sfx('heal'); feedLine(`+${OPS_MED_HEAL} health`, '#86efac'); }
        if (c.take('throw') && healUntil <= t) throwNade();

        // Moving: slower aiming or crouched, quicker sprinting; the ground under you from the height grid.
        const speed = aiming ? 3.6 : crouch ? 3.4 : 6.2;
        walk(body, c, dt, { speed, run: aiming || crouch ? 1 : 1.5, jump: 8.5 });
        body.step(dt, grid.near(body.pos.x, body.pos.z, 3, near));
        const gy = ground(body.pos.x, body.pos.z);
        if (body.pos.y <= gy + 0.02 && body.vel.y <= 0) { body.pos.y = gy; body.vel.y = 0; body.ground = true; }
        if (gy < -0.9) { body.vel.x *= 0.92; body.vel.z *= 0.92; }
        const fromMid = Math.hypot(body.pos.x, body.pos.z);
        if (fromMid > OPS_EDGE) { body.pos.x *= OPS_EDGE / fromMid; body.pos.z *= OPS_EDGE / fromMid; }
        me.facing = c.yaw + Math.PI;
        me.group.position.copy(body.pos);
        me.group.scale.y = approach(me.group.scale.y, crouch ? 0.78 : 1, 14, dt);
        me.update(dt, body.vel, body.ground);
        aimPose(me, healUntil > t ? 0.3 : 1);
        pack.scale.setScalar(0.8 + Math.min(1, bag.length / OPS_PACK) * 0.45);

        // Firing.
        cool -= dt;
        const g = gun();
        if (healUntil <= t && reloadUntil <= t && cool <= 0 && (g.auto ? c.held.has('fire') || c.take('fire') : c.take('fire'))) fire();
        else if (!g.auto) c.take('fire');
        // Recoil settles: 70% of the kick comes back down over a moment.
        if (recoil > 1e-4) { const back = recoil * (1 - Math.exp(-9 * dt)); recoil -= back; c.turn(0, back * 0.7); }

        // What's near: loot to pick up, a gun to compare, a crate, a hostage, a landing zone.
        let gunNear: Drop | null = null, gunD = 2.2;
        for (const d of drops) {
          if (!d.landed) continue;
          const dist = Math.hypot(d.g.position.x - body.pos.x, d.g.position.z - body.pos.z);
          if (dist < 1.7 && Math.abs(d.g.position.y - body.pos.y) < 2.2 && (!d.item || d.item.kind !== 'gun')) { pickUp(d); break; }
          if (d.item?.kind === 'gun' && dist < gunD) { gunD = dist; gunNear = d; }
        }
        const act = c.take('act');
        let used = false;
        if (gunNear && gunNear.item?.kind === 'gun') {
          const it = gunNear.item, ng = gunAt(it.gun, it.rarity), cur = gun();
          prompt = `E · Take ${ng.name}`;
          if (cardName !== `${gunNear.id}:${slot}:${guns[slot].gun}`) {
            cardName = `${gunNear.id}:${slot}:${guns[slot].gun}`;
            setCard({ name: ng.name, rarity: it.rarity, gun: it.gun, rows: [['Damage', ng.dmg * ng.pellets, cur.dmg * cur.pellets], ['Fire rate', ng.rpm, cur.rpm], ['Magazine', ng.mag, cur.mag], ['Range', ng.range, cur.range], ['Rating', gunScore(ng), gunScore(cur)]] });
          }
          if (act && !used) { takeGun(gunNear); used = true; }
        } else if (cardName) { cardName = ''; setCard(null); }
        for (const k of crates) {
          if (k.opened) continue;
          const dist = Math.hypot(k.x - body.pos.x, k.z - body.pos.z);
          if (dist < 2.3) {
            prompt ||= 'E · Search the crate';
            if (act && !used) {
              used = true; k.opened = true; k.m.open = 0.01; k.m.glow.visible = false; sfx('crate');
              const top = Math.max(...k.items.map(itemRarity));
              w.burst(k.m.group.position.clone().setY(k.m.group.position.y + 1), RARITY[top].hex, 24, 5, 6);
              k.items.forEach((it, i) => setTimeout(() => spawnDrop(k.m.group.position.clone().setY(k.m.group.position.y + 0.9), it), 120 * i));
            }
          }
        }
        for (const h of hostages) {
          const dist = h.av.group.position.distanceTo(body.pos);
          if ((h.state === 'held' || h.state === 'wait') && dist < 2.6) {
            prompt ||= h.state === 'held' ? 'E · Free the hostage' : 'E · “Follow me”';
            if (act && !used) { used = true; if (h.state === 'held') feedLine('Hostage freed: get them to a landing zone', '#fdba74'); h.state = 'follow'; sfx('check'); }
          }
        }
        const atLz = lzPlaces.find((p) => Math.hypot(p.x - body.pos.x, p.z - body.pos.z) < 12);
        if (atLz && called < 0 && heliPath.mode === 'none') {
          prompt ||= 'E · Call the helicopter';
          if (act && !used) {
            used = true; called = atLz.id; heliAt = t + OPS_HELI_WAIT_S; heliPath.mode = 'call'; heliPath.t0 = t;
            const outward = V.p.set(atLz.x, 0, atLz.z).normalize();
            heliPath.from.set(atLz.x + outward.x * 220, 55, atLz.z + outward.z * 220);
            heli.group.position.copy(heliPath.from);
            say(`Helicopter in ${OPS_HELI_WAIT_S} s: hold the landing zone`, 'gold'); sfx('alarm');
            reinforce(V.q.set(atLz.x, atLz.y, atLz.z));
          }
        }

        // Grenades in flight: arc, bounce once off the ground, go off.
        for (let i = nadesLive.length - 1; i >= 0; i--) {
          const n = nadesLive[i];
          n.v.y -= 20 * dt; n.m.position.addScaledVector(n.v, dt); n.fuse -= dt;
          const gy2 = ground(n.m.position.x, n.m.position.z);
          if (n.m.position.y < gy2 + 0.16) { n.m.position.y = gy2 + 0.16; n.v.multiplyScalar(0.45); n.v.y = Math.abs(n.v.y) * 0.5; }
          for (const b of grid.near(n.m.position.x, n.m.position.z, 1, near)) if (b.containsPoint(n.m.position)) { n.v.multiplyScalar(-0.35); break; }
          if (n.fuse <= 0) { blast(n.m.position.clone()); w.scene.remove(n.m); nadesLive.splice(i, 1); }
        }

        // Squads arrive over time.
        if (t - startT > nextSquad && reinforced < OPS_REINFORCE_MAX) { nextSquad += OPS_REINFORCE_EVERY_S; reinforce(body.pos); }
        // Health doesn't come back by itself (medkits do); armour soaks hits first.
      } else {
        c.take('fire'); c.take('act'); c.take('skill'); c.take('swap'); c.take('heal'); c.take('throw'); c.take('jump');
      }

      // ── The camera (playing): over the shoulder, closer and narrower when aiming, kept out of walls and the ground.
      V.head.set(body.pos.x, body.pos.y + (crouch ? 1.6 : 2.05), body.pos.z);
      if (phase === 'play') {
        const g = gun();
        let d = aiming ? 2.3 : 4.4;
        const side = aiming ? 0.75 : 1.05;
        V.ray.set(V.head, V.dir);
        for (const b of grid.near(V.head.x, V.head.z, 6, near)) if (V.ray.intersectBox(b, V.hit)) d = Math.min(d, Math.max(0.9, V.hit.distanceTo(V.head) - 0.3));
        camAt.copy(V.head).addScaledVector(V.dir, d).addScaledVector(V.right, side);
        const cg = ground(camAt.x, camAt.z) + 0.5;
        if (camAt.y < cg) camAt.y = cg;
        w.camera.position.lerp(camAt, 1 - Math.exp(-24 * dt));
        w.camera.lookAt(V.q.copy(V.head).addScaledVector(V.dir, -30).addScaledVector(V.right, side));
        w.fovBy(aiming ? -g.zoom : Math.hypot(body.vel.x, body.vel.z) > 7 ? 5 : 0);
      } else w.fovBy(0);
      dome.position.copy(w.camera.position);
      // The sun (and its shadows) over the player.
      sun.position.set(body.pos.x + sunDir.x * 90, body.pos.y + sunDir.y * 90, body.pos.z + sunDir.z * 90); sun.target.position.copy(body.pos);

      // ── Soldiers.
      const prog = Math.min(1, Math.max(0, (t - startT) / GAMES.ops.seconds));
      for (const f of foes) {
        const fp = f.av.group.position;
        if (f.dead) {
          // Fall back and lie still, then go.
          f.av.group.rotation.x = approach(f.av.group.rotation.x, -Math.PI / 2, 7, dt);
          if (t - f.dead > 14) { f.av.group.visible = false; f.active = false; }
          continue;
        }
        const dist = Math.hypot(fp.x - body.pos.x, fp.z - body.pos.z);
        if ((Math.floor(t * 2) + f.id) % 4 === 0) { const want = dist < 150 || f.post < 0; if (want !== f.active) { f.active = want; f.av.group.visible = want; } }
        if (!f.active) continue;
        const spec = FOES[f.kind], playing = phase === 'play';
        // Perception, five times a second: in view (or very close) with a clear line, the meter fills;
        // when it's full they know where you are.
        f.think -= dt;
        if (f.think <= 0) {
          f.think = 0.2;
          V.p.set(fp.x, fp.y + 1.8 * f.av.group.scale.y, fp.z);
          V.q.set(body.pos.x, body.pos.y + (crouch ? 1 : 1.5), body.pos.z);
          const range = spec.sight * (crouch ? 0.6 : 1) * (T - lastShot < 1 ? 1.4 : 1);
          V.tmp.subVectors(V.q, V.p).setY(0).normalize();
          const facing = V.hit.set(Math.sin(f.av.group.rotation.y), 0, Math.cos(f.av.group.rotation.y));
          const inView = dist < 9 || V.tmp.dot(facing) > 0.35 || f.state !== 'idle';
          const sees = playing && dist < range && inView && sight(V.p, V.q);
          if (sees) {
            f.aware = Math.min(1, f.aware + 0.2 * (1.2 + 30 / Math.max(5, dist)) * (crouch ? 0.6 : 1));
            if (f.aware >= 1) { f.state = 'engage'; f.seen.copy(body.pos); f.lostAt = t; }
          } else {
            if (f.state === 'engage' && t - f.lostAt > 2.5) f.state = 'hunt';
            if (f.state === 'idle') f.aware = Math.max(0, f.aware - 0.03);
          }
          if (f.state === 'hunt' && Math.hypot(fp.x - f.seen.x, fp.z - f.seen.z) < 3 && t - f.lostAt > 10) { f.state = 'idle'; f.aware = 0.3; }
          if (f.aware > 0.5 && f.state === 'idle') { f.state = 'hunt'; f.lostAt = t; }
          f.av.group.userData.sees = sees;
          const mk = f.state === 'engage' ? '!' : f.aware > 0.15 ? '?' : '';
          if (mk !== f.markKind) { f.markKind = mk; f.mark.visible = !!mk; if (mk) (f.mark.material as THREE.SpriteMaterial).map = markSprite(mk).material.map; }
        }
        const sees = !!f.av.group.userData.sees;
        // Moving: patrol slowly, close in while hunting, sidestep while fighting.
        let mx = 0, mz = 0, sp = 0;
        if (!f.perch) {
          if (f.state === 'idle') {
            if (Math.hypot(fp.x - f.wander.x, fp.z - f.wander.z) < 1 || Math.random() < dt * 0.08) f.wander.set(f.home.x + (Math.random() - 0.5) * 16, 0, f.home.z + (Math.random() - 0.5) * 16);
            mx = f.wander.x - fp.x; mz = f.wander.z - fp.z; sp = 1.5;
          } else if (f.state === 'hunt') { mx = f.seen.x - fp.x; mz = f.seen.z - fp.z; sp = spec.speed * 1.2; }
          else if (sees) {
            if (t > f.strafe) f.strafe = t + 1.2 + Math.random() * 1.6;
            const side = Math.sin(f.strafe * 7.3) > 0 ? 1 : -1;
            mx = -(body.pos.z - fp.z) * side; mz = (body.pos.x - fp.x) * side; sp = dist > 30 ? spec.speed * 0.6 : 1.6;
            if (dist > spec.sight * 0.7) { mx += body.pos.x - fp.x; mz += body.pos.z - fp.z; }
          }
          const len = Math.hypot(mx, mz);
          f.body.vel.x = approach(f.body.vel.x, len > 0.5 ? (mx / len) * sp : 0, 8, dt);
          f.body.vel.z = approach(f.body.vel.z, len > 0.5 ? (mz / len) * sp : 0, 8, dt);
          f.body.step(dt, grid.near(f.body.pos.x, f.body.pos.z, 3, near));
          const fg = ground(f.body.pos.x, f.body.pos.z);
          if (f.body.pos.y <= fg + 0.02 && f.body.vel.y <= 0) { f.body.pos.y = fg; f.body.vel.y = 0; f.body.ground = true; }
          fp.copy(f.body.pos);
        }
        // Facing: toward you when they know, else where they walk.
        const faceTo = f.state === 'engage' ? Math.atan2(body.pos.x - fp.x, body.pos.z - fp.z) : f.state === 'hunt' ? Math.atan2(f.seen.x - fp.x, f.seen.z - fp.z) : f.perch ? f.av.group.rotation.y + dt * 0.3 : null;
        f.av.facing = faceTo;
        if (faceTo !== null) { const dd = Math.atan2(Math.sin(faceTo - f.av.group.rotation.y), Math.cos(faceTo - f.av.group.rotation.y)); f.av.group.rotation.y += dd * (1 - Math.exp(-8 * dt)); f.av.facing = f.av.group.rotation.y; }
        f.av.update(dt, f.body.vel, true);
        aimPose(f.av, f.state === 'idle' ? 0.45 : 1);
        // Shooting: bursts while they can see you; a marksman takes aim first (a glint).
        if (f.state === 'engage' && sees && playing) {
          if (!f.aimAt) f.aimAt = t + (f.kind === 'marksman' ? 1.4 : 0.35 + Math.random() * 0.4) * (1.1 - prog * 0.3);
          if (t >= f.aimAt && t >= f.fireAt) {
            if (f.burst <= 0) f.burst = spec.burst;
            foeShoot(f, dist);
            f.burst--;
            f.fireAt = t + (f.burst > 0 ? (f.kind === 'heavy' ? 0.09 : 0.12) : spec.gap * (0.8 + Math.random() * 0.6));
            if (f.burst <= 0 && f.kind === 'marksman') f.aimAt = 0;
          }
          if (f.kind === 'marksman' && f.aimAt && t < f.aimAt && Math.random() < dt * 8) w.burst(V.p.set(fp.x, fp.y + 1.9, fp.z), 0xffffff, 1, 0.2, 0);
        } else f.aimAt = 0;
      }

      // ── Hostages: hands up until freed, then follow a few steps behind (and keep up).
      for (const h of hostages) {
        if (h.state === 'saved') continue;
        const hp2 = h.av.group.position;
        if (h.state === 'follow') {
          const dx = body.pos.x - hp2.x, dz = body.pos.z - hp2.z, d = Math.hypot(dx, dz);
          if (d > 28 && phase === 'play') { h.body.pos.set(body.pos.x - V.look.x * 3, ground(body.pos.x - V.look.x * 3, body.pos.z - V.look.z * 3), body.pos.z - V.look.z * 3); }
          const sp = d > 3 ? Math.min(7.5, d * 1.4) : 0;
          h.body.vel.x = approach(h.body.vel.x, d > 0.1 ? (dx / d) * sp : 0, 8, dt); h.body.vel.z = approach(h.body.vel.z, d > 0.1 ? (dz / d) * sp : 0, 8, dt);
          h.body.step(dt, grid.near(h.body.pos.x, h.body.pos.z, 3, near));
          const hg = ground(h.body.pos.x, h.body.pos.z);
          if (h.body.pos.y <= hg + 0.02 && h.body.vel.y <= 0) { h.body.pos.y = hg; h.body.vel.y = 0; h.body.ground = true; }
          hp2.copy(h.body.pos);
          h.av.update(dt, h.body.vel, true);
        } else {
          h.av.update(dt, V.tmp.set(0, 0, 0), true);
          if (h.state === 'held') { h.av.limbs[0].rotation.set(-2.9, 0, 0.2); h.av.limbs[1].rotation.set(-2.9, 0, -0.2); }
        }
      }

      // ── Drops: pop out and land, then bob and turn (only the ones near enough to see).
      for (const d of drops) {
        if (!d.landed) {
          d.v.y -= 18 * dt; d.g.position.addScaledVector(d.v, dt);
          const gy = ground(d.g.position.x, d.g.position.z);
          if (d.g.position.y <= gy && d.v.y < 0) { d.g.position.y = gy; d.landed = true; }
        } else if (Math.abs(d.g.position.x - body.pos.x) < 60 && Math.abs(d.g.position.z - body.pos.z) < 60) {
          const m = d.g.children[0];
          m.rotation.y += dt * 1.6; m.position.y = 0.35 + Math.sin(t * 2.4 + d.id) * 0.08;
        }
      }
      for (const k of crates) k.m.update(dt);

      // ── Tracers fade; the muzzle flash goes out.
      if (trAlive > 0) {
        let any = false;
        for (let i = 0; i < TR; i++) {
          if (trLife[i] <= 0) { if (trCol[i * 6] !== 0 || trCol[i * 6 + 3] !== 0) trCol.fill(0, i * 6, i * 6 + 6); continue; }
          trLife[i] -= dt; any = true;
          const k = Math.max(0, trLife[i] / 0.08);
          trCol.set([trBase[i * 3] * k * 0.4, trBase[i * 3 + 1] * k * 0.4, trBase[i * 3 + 2] * k * 0.4, trBase[i * 3] * k, trBase[i * 3 + 1] * k, trBase[i * 3 + 2] * k], i * 6);
        }
        trGeo.attributes.position.needsUpdate = true; trGeo.attributes.color.needsUpdate = true;
        if (!any) trAlive--;
      }
      if (flashT > 0) { flashT -= dt; if (flashT <= 0) { flashS.visible = false; flashL.intensity = 0; } }

      // ── The HUD's moving parts, straight on the page (no re-render): the compass and the crosshair's spread.
      const deg = ((heading * 180) / Math.PI + 360) % 360;
      if (Math.abs(deg - compassDeg) > 0.15 && compass.current) { compassDeg = deg; compass.current.style.setProperty('transform', `translate3d(${-(720 + deg * 2)}px, 0, 0)`); }
      if (reticle.current && phase === 'play') {
        const g = gun(), moving = Math.hypot(body.vel.x, body.vel.z) > 2;
        const gap = 6 + g.spread * (aiming ? 1 : 2.6) * (moving ? 1.6 : 1) * (crouch ? 0.75 : 1) * 900 + recoil * 300;
        reticle.current.style.setProperty('--gap', `${Math.min(46, gap).toFixed(1)}px`);
      }
      if (t - mapAt > 0.1) { mapAt = t; drawMaps(); }
      crowd.update(dt, { pos: body.pos, ry: me.group.rotation.y, air: !body.ground, part: 0, color: lookHex(look), hat: look.hat });
      if (Math.floor(t) !== Math.floor(t - dt)) setOthers(crowd.count);
      w.focus.copy(body.pos);
      report();
    });
    scored();
    return () => {
      window.removeEventListener('keydown', onKey); el.removeEventListener('mousedown', onDown); window.removeEventListener('mouseup', onUp); el.removeEventListener('contextmenu', noMenu);
      c.dispose(); controls.current = null; cmd.current = null; w.dispose();
    };
  }, [map, seed]);

  const rar = RARITY[hud.rarity];
  const deploying = hud.phase === 'deploy';
  return (
    <div className="mx-auto w-full max-w-6xl">
      <WorldFrame net={net} canvas={canvas} controls={controls} buttons={PHONE_BUTTONS.map((b) => ({ ...b }))} curtain={curtain} others={others}
        keys="WASD move · Shift sprint · C crouch · hold the mouse to fire · right mouse aims · Q/R reload · E use · G grenade · H medkit · X swap · M map"
        label="Ridgeline Ops: an open-world island with enemy outposts">
        {/* Cinematic bars while flying in and out */}
        <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 top-0 h-[11%] origin-top bg-black transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]', hud.phase === 'flight' || hud.phase === 'extract' ? 'scale-y-100' : 'scale-y-0')} />
        <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 bottom-0 h-[11%] origin-bottom bg-black transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]', hud.phase === 'flight' || hud.phase === 'extract' ? 'scale-y-100' : 'scale-y-0')} />

        {hud.phase === 'play' && (
          <>
            {/* Crosshair: four ticks whose gap follows the spread; a hit marker; a red edge and an arrow when hit */}
            <div ref={reticle} className={cn('pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-150', hud.healing && 'opacity-30')} style={{ '--gap': '10px' } as React.CSSProperties} aria-hidden>
              <span className="absolute left-0 top-0 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90" />
              {!hud.aim || hud.gun !== GUNS.dmr.name ? (
                <>
                  <span className="absolute h-2.5 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_2px_#000]" style={{ top: 'calc(-1 * var(--gap) - 10px)' }} />
                  <span className="absolute h-2.5 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_2px_#000]" style={{ top: 'var(--gap)' }} />
                  <span className="absolute h-0.5 w-2.5 -translate-y-1/2 bg-white shadow-[0_0_2px_#000]" style={{ left: 'calc(-1 * var(--gap) - 10px)' }} />
                  <span className="absolute h-0.5 w-2.5 -translate-y-1/2 bg-white shadow-[0_0_2px_#000]" style={{ left: 'var(--gap)' }} />
                </>
              ) : null}
              {flash.hit > 0 && <span key={`h${flash.hit}`} className={cn('ops-hit absolute left-0 top-0 h-7 w-7 -translate-x-1/2 -translate-y-1/2', flash.head ? 'text-yellow-300' : 'text-white')} />}
              {flash.kill > 0 && <span key={`k${flash.kill}`} className="ops-kill absolute left-0 top-0 h-9 w-9 -translate-x-1/2 -translate-y-1/2 text-red-400" />}
            </div>
            {hud.aim && hud.gun === GUNS.dmr.name && <div className="ops-scope pointer-events-none absolute inset-0" aria-hidden />}
            {flash.hurt > 0 && (
              <>
                <span key={`v${flash.hurt}`} className="pointer-events-none absolute inset-0 animate-[rm-fade_600ms_reverse_forwards] shadow-[inset_0_0_140px_rgba(220,38,38,0.65)]" aria-hidden />
                <span key={`a${flash.hurt}`} className="ops-dir pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2" style={{ '--a': `${flash.angle}deg` } as React.CSSProperties} aria-hidden />
              </>
            )}
            {hud.hp <= 30 && <span className="ops-low pointer-events-none absolute inset-0" aria-hidden />}
            {(hud.prompt || hud.reloading || hud.healing) && (
              <p className="pointer-events-none absolute left-1/2 top-[58%] -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white ring-1 ring-white/15">
                {hud.healing ? 'Using a medkit…' : hud.reloading ? 'Reloading…' : hud.prompt}
              </p>
            )}
            {card && (
              <div className="pointer-events-none absolute left-1/2 top-[64%] w-60 -translate-x-1/2 rounded-2xl bg-black/75 p-3 text-xs text-white ring-1 animate-[rm-fade_200ms]" style={{ boxShadow: `0 0 0 1px ${RARITY[card.rarity].color}66, 0 0 30px ${RARITY[card.rarity].color}33` }}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: RARITY[card.rarity].color }}>{RARITY[card.rarity].name} · {GUNS[card.gun].name}</p>
                <p className="text-base font-black">{card.name}</p>
                <dl className="mt-1.5 grid grid-cols-[1fr_auto_auto] gap-x-2 gap-y-0.5 tabular-nums">
                  {card.rows.map(([label, v, cur]) => (
                    <div key={label} className="contents">
                      <dt className="text-zinc-400">{label}</dt><dd className="text-end font-bold">{v}</dd>
                      <dd className={cn('w-10 text-end font-bold', v > cur ? 'text-emerald-400' : v < cur ? 'text-red-400' : 'text-zinc-500')}>{v === cur ? '=' : `${v > cur ? '+' : ''}${v - cur}`}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </>
        )}

        {/* Top: health, armour and kit (left); the compass and the objective (middle); the minimap (right) */}
        {!deploying && (
          <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start gap-2">
            <div className="w-36 shrink-0 space-y-1.5 rounded-2xl bg-black/55 px-3 py-2 ring-1 ring-white/15 sm:w-48">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-300"><Heart className="h-3.5 w-3.5 text-red-400" aria-hidden />{hud.hp}</p>
              <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className={cn('h-full w-full origin-left rounded-full transition-transform duration-200 rtl:origin-right', hud.hp > 30 ? 'bg-emerald-400' : 'bg-red-500')} style={{ transform: `scaleX(${hud.hp / OPS_HP})` }} /></div>
              <div className="flex gap-1" aria-label={`Armour ${hud.armour}`}>
                {Array.from({ length: OPS_PLATES }, (_, i) => <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full w-full origin-left bg-sky-400 transition-transform duration-200 rtl:origin-right" style={{ transform: `scaleX(${Math.max(0, Math.min(1, (hud.armour - i * OPS_PLATE) / OPS_PLATE))})` }} /></span>)}
              </div>
              <p className="flex items-center gap-2.5 text-[11px] font-bold text-zinc-200">
                <span className="inline-flex items-center gap-0.5"><Syringe className="h-3 w-3 text-emerald-300" aria-hidden />{hud.meds}</span>
                <span className="inline-flex items-center gap-0.5"><span className="h-2.5 w-2.5 rounded-full bg-lime-700 ring-1 ring-lime-400" aria-hidden />{hud.nades}</span>
                <span className="inline-flex items-center gap-0.5"><Shield className="h-3 w-3 text-sky-300" aria-hidden />{Math.ceil(hud.armour / OPS_PLATE)}</span>
                {hud.crouch && <span className="rounded bg-white/15 px-1 text-[10px]">CROUCH</span>}
              </p>
              <p className="flex items-center gap-1.5 border-t border-white/10 pt-1.5 text-[11px] font-bold text-amber-200"><Backpack className="h-3.5 w-3.5" aria-hidden />{hud.pack}/{OPS_PACK} · {hud.packValue.toLocaleString()}</p>
            </div>
            <div className="min-w-0 flex-1 text-center">
              <div className="relative mx-auto hidden h-7 w-full max-w-[240px] overflow-hidden rounded-full bg-black/45 ring-1 ring-white/10 [mask-image:linear-gradient(90deg,transparent,#000_20%,#000_80%,transparent)] sm:block" aria-hidden>
                <div ref={compass} className="absolute left-1/2 top-0 h-full w-[2160px] will-change-transform">
                  {[0, 1, 2].flatMap((n) => DIRS.map((d, i) => <span key={`${n}${d}`} className={cn('absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[11px] font-black', d.length === 1 ? 'text-white' : 'text-zinc-400')} style={{ left: n * 720 + i * 90 }}>{d}</span>))}
                </div>
                <span className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-amber-300" />
              </div>
              {hud.objective && <p className="mx-auto w-fit max-w-full rounded-2xl bg-black/55 px-3 py-1 text-[10px] font-bold leading-tight text-white ring-1 ring-white/10 line-clamp-2 sm:mt-1.5 sm:truncate sm:rounded-full sm:text-[11px]">{hud.heli >= 0 ? `Helicopter in ${hud.heli} s · ` : ''}{hud.objective}</p>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <button type="button" onClick={() => cmd.current?.map()} className="pointer-events-auto relative block h-24 w-24 overflow-hidden rounded-full ring-2 ring-white/25 sm:h-32 sm:w-32" aria-label="Open the island map (M)">
                <canvas ref={mini} width={256} height={256} className="h-full w-full" />
                <MapIcon className="absolute bottom-1 left-1/2 h-3 w-3 -translate-x-1/2 text-white/70" aria-hidden />
              </button>
            </div>
          </div>
        )}

        {/* Kill and loot feed */}
        <div className="pointer-events-none absolute end-3 top-[11.5rem] flex w-56 flex-col items-end gap-1 sm:top-56" aria-live="polite">
          {feed.map((f) => <p key={f.id} className="ops-feed rounded-lg bg-black/55 px-2 py-0.5 text-end text-[11px] font-bold" style={{ color: f.color }}>{f.text}</p>)}
        </div>

        {/* The gun: name in its rarity's colour, magazine and reserve, the other gun */}
        {hud.phase === 'play' && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 w-36 -translate-x-1/2 rounded-2xl bg-black/60 px-3 py-2 text-center ring-1 [@media(pointer:fine)]:bottom-6 [@media(pointer:fine)]:left-auto [@media(pointer:fine)]:end-4 [@media(pointer:fine)]:w-52 [@media(pointer:fine)]:translate-x-0 [@media(pointer:fine)]:text-end" style={{ boxShadow: `inset 0 0 0 1px ${rar.color}55` }}>
            <p className="truncate text-[10px] font-bold uppercase tracking-widest" style={{ color: rar.color }}>{rar.name}</p>
            <p className="truncate text-sm font-black text-white">{hud.gun}</p>
            <p className="font-black tabular-nums text-white"><span className={cn('text-2xl', hud.mag === 0 && 'text-red-400')}>{hud.mag}</span><span className="text-xs text-zinc-400"> / {hud.gun === GUNS.pistol.name ? '∞' : hud.ammo}</span></p>
            <p className="truncate text-[10px] text-zinc-400"><Crosshair className="me-1 inline h-3 w-3" aria-hidden />X · <span style={{ color: RARITY[hud.otherRarity].color }}>{hud.other}</span></p>
          </div>
        )}

        {/* The island map: to pick where to land (deploy), or to look (M / the minimap) */}
        {(deploying || mapOpen) && (
          <div className={cn('absolute inset-0 z-10 grid place-items-center p-3', deploying ? 'bg-black/55' : 'bg-black/40')} onClick={() => !deploying && setMapOpen(false)}>
            <div className="ops-map-in w-full max-w-[min(92vw,560px)] text-center" onClick={(e) => e.stopPropagation()}>
              {deploying && <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-lime-300">{hud.runs === 0 ? 'Choose where to land' : 'Back at base · choose your next landing'}</p>}
              <div className="relative mx-auto aspect-square w-full max-w-[min(70vh,520px)] overflow-hidden rounded-3xl ring-2 ring-white/20">
                <canvas ref={big} width={640} height={640} className="h-full w-full" />
                {deploying && lzs.map((p, i) => (
                  <button key={p.id} type="button" onClick={() => cmd.current?.deploy(i)} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300 px-2.5 py-1 text-[11px] font-black text-amber-950 shadow-lg ring-2 ring-black/30 transition-transform duration-150 hover:scale-110 active:scale-95" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
                    {i + 1} · {p.name.replace('LZ ', '')}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-zinc-300">{deploying ? 'Red: enemy outposts · orange: hostages · white: your dropped backpack. Tap a landing zone (1–4).' : 'Tap anywhere or press M to close'}</p>
            </div>
          </div>
        )}
        {hud.phase === 'down' && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-red-950/40 backdrop-grayscale"><p className="text-4xl font-black text-white">You’re down</p></div>}
      </WorldFrame>
      <p className="mt-2 text-center text-xs text-zinc-400">{GAMES.ops.how}</p>
    </div>
  );
}
