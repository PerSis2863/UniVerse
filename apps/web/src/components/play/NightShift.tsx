'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Battery, FileText, Flame, Heart, KeyRound } from 'lucide-react';
import { GAMES } from '@/lib/play';
import { NIGHT_CAUGHT, NIGHT_ESCAPE, NIGHT_FLOOR, NIGHT_FLOORS, NIGHT_KEY, NIGHT_HIDE_COOLDOWN_S, NIGHT_HIDE_S, NIGHT_LIVES, NIGHT_PER_SECOND, NIGHT_SEEN_M, NIGHT_STUN, NIGHT_STUN_COOLDOWN_S, NIGHT_STUN_S, mazeNext, mazeStep, nightKeys, nightMaze } from '@/lib/play/worlds';
import { NIGHT_CODE, NIGHT_CODE_FLOOR, NIGHT_FLARE_M, NIGHT_FLARE_S, NIGHT_FLOOR_NAMES, NIGHT_NOTE, NIGHT_SHADE, NIGHT_START_FLARES, NIGHT_TRUTH, nightCode, nightEnding, nightKeyName, nightLayout, nightNotes, type NightNote } from '@/lib/play/night-story';
import { cn } from '@/lib/utils';
import { useArena } from './arena';
import type { GameProps } from './game-props';
import { Body, Controls, LightPool, THREE, World, approach, eyes, glowSprite, walk, type LightSource } from './world/core';
import { lookHex, readLook } from './PlayerCard';
import { Crowd } from './world/crowd';
import { surface } from './world/textures';
import { SkillRing, WorldFrame } from './world/Stage';

// Night Shift (18+, M99): our own survival-horror story (src/lib/play/night-story.ts). Your first
// night as caretaker at Ashgrove Academy; three floors down to the service tunnel. Each floor has
// keys named for the rooms they open, two notes from the people who were here before you (the
// library's holds the stairwell code), a safe room with a first-aid kit, flares and batteries. The
// Quiet walks the halls toward any sound, faster with every key; your torch drives it back and burns
// the Shades below the ground floor, but the battery is also your only light. Running is noise.
// Looks: real shadows from the torch, dust in its beam, lamps that flicker, a lamp pool of four
// lights (core.ts LightPool) so the frame rate holds, and a film finish that splits as it nears.

const S = 5; // metres per maze cell
const H = 3.4;
const ECHO_SHOW_S = 2.6, ECHO_REFILL_S = 14, ECHO_RUSH_S = 4;
const SHADE_HP_S = 0.7, SHADE_DRAIN = 22;
/** Each floor's air and lamp colour: cold classrooms, a warm library, the boiler room's orange. */
const FLOOR_LOOK = [{ fog: 0x05070a, lamp: 0xfff1c1 }, { fog: 0x080604, lamp: 0xffd9a0 }, { fog: 0x0a0504, lamp: 0xffb070 }] as const;
type Hud = { keys: number; need: number; floor: number; lives: number; battery: number; stamina: number; near: number; scare: number; open: boolean; hidden: boolean; hideLeft: number; canHide: boolean; canRead: boolean; flares: number; notes: number; safe: boolean; flareHint: boolean };

export function NightShift({ seed, endsAt, clock, onProgress, onDone, onStats, net }: GameProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controls = useRef<Controls | null>(null);
  const arena = useArena();
  const calm = useReducedMotion();
  const [hud, setHud] = useState<Hud>({ keys: 0, need: nightKeys(0), floor: 0, lives: NIGHT_LIVES, battery: 100, stamina: 100, near: 0, scare: 0, open: false, hidden: false, hideLeft: 0, canHide: false, canRead: false, flares: NIGHT_START_FLARES, notes: 0, safe: false, flareHint: false });
  const [skill, setSkill] = useState({ charge: 1, active: false, others: 0, pulse: 0 });
  const [curtain, setCurtain] = useState<{ key: number; title: string; sub?: string } | null>(null);
  const [note, setNote] = useState<NightNote | null>(null);
  const [keypad, setKeypad] = useState(false);
  const [fly, setFly] = useState<{ id: number; name: string } | null>(null);
  const [intro, setIntro] = useState(true);
  const [ending, setEnding] = useState<{ title: string; body: string } | null>(null);
  // What the screen tells the game: the right code was typed.
  const events = useRef<string[]>([]);
  const code = nightCode(seed);
  const out = useRef({ arena, onProgress, onDone, onStats, clock, endsAt, net });
  useEffect(() => { out.current = { arena, onProgress, onDone, onStats, clock, endsAt, net }; });
  useEffect(() => { const t = setTimeout(() => setIntro(false), 6500); return () => clearTimeout(t); }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const w = new World(el, { fov: 75, bg: 0x000000, fog: [0x000000, 1.5, 22], glow: { strength: 0.7, radius: 0.6, threshold: 0.6 }, env: 0.06 });
    const crowd = new Crowd(w, () => out.current.net), look = readLook(), notesText = nightNotes(nightCode(seed));
    w.look({ vignette: 0.55, grain: 0.065, saturation: 0.8, contrast: 1.12 });
    let echoLines: THREE.LineSegments | null = null;
    // Only the torch casts shadows (computers): the Quiet's shape stretches down the hall in its beam.
    w.renderer.shadowMap.enabled = !w.phone;
    const c = new Controls(el, { sensitivity: 0.0022 });
    controls.current = c;
    w.scene.add(new THREE.HemisphereLight(0x223344, 0x000000, 0.1));
    const walls3 = [surface('lockers', { metal: 0.35, rough: 0.9 }), surface('wood', { color: 0x8a6a4a, rough: 0.8 }), surface('concrete', { color: 0x6b625a, rough: 0.95, bump: 1.2 })];
    const floors3 = [surface('tiles', { rough: 0.85, bump: 0.8 }), surface('tiles', { color: 0xb8a890, rough: 0.7, bump: 0.8 }), surface('concrete', { color: 0x4a4440, rough: 0.45, metal: 0.1, bump: 1.4 })];
    const ceilMat = surface('concrete', { color: 0x3a3832, rough: 1 }), doorMat = surface('wood', { color: 0x5b4030, rough: 0.7 });
    const keyMat = new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.9, roughness: 0.3, emissive: 0x3a2a00 });
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xe9e0c9, emissive: 0x2a2618, roughness: 0.9, side: THREE.DoubleSide });
    const V = { me: new THREE.Vector3(), toT: new THREE.Vector3(), fwd: new THREE.Vector3(), toG: new THREE.Vector3(), q: new THREE.Vector3(), ray: new THREE.Ray(), flat: new THREE.Vector3(), hit: new THREE.Vector3() };

    // The Quiet: very tall and thin, hunched, arms bent at the elbow that hang past its knees with
    // long fingers, a small tilted head with empty eyes and an open mouth, a ragged robe.
    const ghost = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0x8f9490, emissive: 0x0d0e10, roughness: 0.85 });
    const rag = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.2, 6, 12), skin); torso.position.set(0, 1.75, 0.04); torso.rotation.x = 0.12;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), skin); head.position.set(0, 2.62, 0.16); head.scale.set(0.86, 1.22, 0.95);
    const hem = new THREE.CylinderGeometry(0.3, 0.64, 1.7, 18, 4, true), hp = hem.attributes.position;
    // A ragged hem: the bottom ring's points pulled up by different amounts.
    for (let i = 0; i < hp.count; i++) if (hp.getY(i) < -0.8) hp.setY(i, hp.getY(i) + Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.35);
    hem.computeVertexNormals();
    const robe = new THREE.Mesh(hem, rag); robe.position.y = 0.95;
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 }), eyeGlow = new THREE.MeshBasicMaterial({ color: 0x330000 });
    for (const x of [-0.07, 0.07]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), holeMat); e.position.set(x, 0.03, 0.165); head.add(e); const g = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), eyeGlow); g.position.set(x, 0.03, 0.2); head.add(g); }
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), holeMat); mouth.scale.set(0.8, 1.6, 0.6); mouth.position.set(0, -0.11, 0.17); head.add(mouth);
    const arms = [-1, 1].map((side) => {
      const pivot = new THREE.Group(); pivot.position.set(side * 0.3, 2.28, 0.06);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.62, 4, 8), skin); upper.position.y = -0.36; pivot.add(upper);
      const elbow = new THREE.Group(); elbow.position.y = -0.72; elbow.rotation.x = -0.35; pivot.add(elbow);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.66, 4, 8), skin); fore.position.y = -0.38; elbow.add(fore);
      for (const k of [-1, 0, 1]) { const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.24, 3, 5), skin); f.position.set(k * 0.03, -0.86, 0.01 * k); f.rotation.z = k * 0.12; elbow.add(f); }
      ghost.add(pivot); return pivot;
    });
    ghost.add(torso, head, robe);
    ghost.traverse((o) => { o.castShadow = true; });
    w.scene.add(ghost);
    const body3: THREE.Mesh[] = [];
    ghost.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material !== holeMat && (o as THREE.Mesh).material !== eyeGlow) body3.push(o as THREE.Mesh); });

    // The torch: a cone of light with a lens pattern (computers), shadows, and dust in the beam.
    w.scene.add(w.camera);
    const torch = new THREE.SpotLight(0xfff4d6, 42, 26, Math.PI / 7.5, 0.4, 1.3);
    torch.position.set(0.25, -0.2, 0);
    torch.target.position.set(0, -0.3, -5);
    if (!w.phone) {
      // A plain filtered shadow at 512 px is plenty for a torch at arm's length (soft filtering cost
      // more than all the halls' lamps together).
      w.renderer.shadowMap.type = THREE.PCFShadowMap;
      torch.castShadow = true; torch.shadow.mapSize.set(512, 512); torch.shadow.bias = -0.0008; torch.shadow.normalBias = 0.03;
      torch.shadow.camera.near = 0.3; torch.shadow.camera.far = 26; torch.map = lensPattern();
    }
    w.camera.add(torch, torch.target);
    const DUST = 220, dustPos = new Float32Array(DUST * 3), dustCol = new Float32Array(DUST * 3), dustVel = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) { dustPos.set([(Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3, -0.6 - Math.random() * 6], i * 3); dustVel.set([(Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.06], i * 3); }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3)); dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.025, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: glowSprite(0xffffff).material.map, fog: false }));
    dust.frustumCulled = false;
    w.camera.add(dust);

    // Four lights handed round the lamps, signs, the safe room and flares (the frame rate holds).
    const pool = new LightPool(w.scene, 4);
    let sources: LightSource[] = [];

    // One floor of the school: its maze, walls, doors, lamps, keys, notes, safe room, pickups, stairs.
    let floor = 0, m = nightMaze(seed, 0), n = m.n, lay = nightLayout(seed, 0, m), group = new THREE.Group(), walls: THREE.Box3[] = [];
    let lamps: { at: THREE.Vector3; mesh: THREE.Mesh; src: LightSource; seedV: number; broken: boolean }[] = [];
    let keys: { g: THREE.Group; got: boolean; name: string }[] = [], cells: { b: THREE.Object3D; got: boolean; kind: 'battery' | 'flare' }[] = [];
    let notesHere: { g: THREE.Group; glow: THREE.Sprite; text: NightNote; read: boolean; at: THREE.Vector3 }[] = [];
    let shades: { g: THREE.Group; smoke: THREE.Sprite; pos: THREE.Vector3; cell: number; to: number; hp: number; alive: boolean }[] = [];
    let medkit: THREE.Group | null = null, exitSrc: LightSource = { at: new THREE.Vector3(), color: 0, power: 0, reach: 8 }, safeSrc: LightSource = exitSrc;
    let gCell = 0, gTo = 0, unlocked = false;
    const center = (cell: number, o = new THREE.Vector3()) => o.set((cell % n) * S + S / 2, 0, Math.floor(cell / n) * S + S / 2);
    const cellAt = (p: THREE.Vector3) => Math.max(0, Math.min(n - 1, Math.floor(p.z / S))) * n + Math.max(0, Math.min(n - 1, Math.floor(p.x / S)));
    const body = new Body([S / 2, 0.02, S / 2], new THREE.Vector3(0.3, 0.85, 0.3));
    const shadeTex = smokeTexture();
    const build = (f: number) => {
      w.scene.remove(group);
      group.traverse((o) => { const mm = o as THREE.Mesh; if (mm.geometry && !body3.includes(mm)) mm.geometry.dispose(); });
      for (const l of lamps) (l.mesh.material as THREE.Material).dispose();
      floor = f; m = nightMaze(seed, f); n = m.n; lay = nightLayout(seed, f, m); group = new THREE.Group(); w.scene.add(group);
      const fl = FLOOR_LOOK[f];
      (w.scene.fog as THREE.Fog).color.setHex(fl.fog); (w.scene.background as THREE.Color).setHex(fl.fog);
      w.solids = [];
      w.boxes([{ at: [n * S / 2, -0.25, n * S / 2], size: [n * S, 0.5, n * S] }], floors3[f], true, group, { tile: 4 });
      w.boxes([{ at: [n * S / 2, H + 0.25, n * S / 2], size: [n * S, 0.5, n * S] }], ceilMat, false, group, { tile: 5 });
      const list: { at: [number, number, number]; size: [number, number, number] }[] = [
        { at: [n * S / 2, H / 2, 0], size: [n * S, H, 0.4] }, { at: [0, H / 2, n * S / 2], size: [0.4, H, n * S] },
      ];
      const doors: { at: [number, number, number]; size: [number, number, number] }[] = [];
      const p = new THREE.Vector3(), r = (i: number) => (Math.sin(seed * 0.37 + i * 12.9898 + f * 78.233) * 43758.5453) % 1;
      for (let cell = 0; cell < n * n; cell++) {
        center(cell, p);
        if (!(cell % n < n - 1 && m.east[cell])) { list.push({ at: [p.x + S / 2, H / 2, p.z], size: [0.4, H, S + 0.4] }); if (Math.abs(r(cell)) < 0.22) doors.push({ at: [p.x + S / 2 - 0.22, 1.1, p.z], size: [0.06, 2.2, 1.15] }); }
        if (!(cell < n * (n - 1) && m.south[cell])) { list.push({ at: [p.x, H / 2, p.z + S / 2], size: [S + 0.4, H, 0.4] }); if (Math.abs(r(cell + 999)) < 0.22) doors.push({ at: [p.x, 1.1, p.z + S / 2 - 0.22], size: [1.15, 2.2, 0.06] }); }
      }
      const wallMesh = w.boxes(list, walls3[f], true, group, { tile: H });
      w.boxes(doors, doorMat, false, group, { round: 0.02 });
      echoLines = wallMesh ? new THREE.LineSegments(new THREE.EdgesGeometry(wallMesh.geometry, 30), new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0, depthTest: false, fog: false })) : null;
      if (echoLines) { echoLines.renderOrder = 5; echoLines.visible = false; group.add(echoLines); }
      walls = w.solids.slice(1);
      // Strip lights: many more than before (the pool lights only the nearest few); some are broken.
      lamps = [];
      const lampGeo = new THREE.BoxGeometry(1.4, 0.06, 0.24);
      for (let i = 0; i < 12 + f * 3; i++) {
        center(Math.floor(Math.abs(r(i * 7 + 3)) * n * n) % (n * n), p);
        // Each lamp its own copy of one material: switching it off changes a colour, not the shader.
        const mesh = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xfff6d5 })); mesh.position.set(p.x, H - 0.04, p.z); group.add(mesh);
        const at = new THREE.Vector3(p.x, H - 0.3, p.z);
        lamps.push({ at, mesh, src: { at, color: fl.lamp, power: 6, reach: 9 }, seedV: i * 13.1 + f, broken: Math.abs(r(i + 50)) < 0.3 });
      }
      keys = m.keys.map((cell, i) => {
        const g = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 8, 16), keyMat);
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.36), keyMat); shaft.position.z = 0.28;
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.06), keyMat); tooth.position.set(0, -0.05, 0.42);
        g.add(ring, shaft, tooth, glowSprite(0xfacc15, 1.2));
        center(cell, g.position).setY(1.1);
        group.add(g);
        return { g, got: false, name: nightKeyName(f, i) };
      });
      cells = [
        ...m.batteries.slice(0, 4).map((cell) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.32, 10), new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x0f5a2a, roughness: 0.4 })); center(cell, b.position).setY(0.9); b.add(glowSprite(0x4ade80, 0.9)); group.add(b); return { b: b as THREE.Object3D, got: false, kind: 'battery' as const }; }),
        ...lay.flares.map((cell) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 8), new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0x4a0a0a, roughness: 0.5 })); b.rotation.z = Math.PI / 2.4; center(cell, b.position).setY(0.85); b.add(glowSprite(0xff5533, 0.8)); group.add(b); return { b: b as THREE.Object3D, got: false, kind: 'flare' as const }; }),
      ];
      // Notes: a page on a small desk, faintly glowing so you can find it from down the hall.
      notesHere = lay.notes.map((cell, i) => {
        const g = new THREE.Group(); center(cell, g.position);
        const desk = new THREE.Mesh(new THREE.BoxGeometry(1, 0.75, 0.6), doorMat); desk.position.y = 0.375; desk.castShadow = desk.receiveShadow = !w.phone;
        const page = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.42), paperMat); page.rotation.set(-Math.PI / 2, 0, 0.3); page.position.y = 0.76;
        const glow = glowSprite(0xfff2c0, 0.9); glow.position.y = 0.9;
        g.add(desk, page, glow); group.add(g);
        return { g, glow, text: notesText[f][i], read: false, at: g.position.clone().setY(1) };
      });
      // The safe room: a warm lamp, a green cross, a first-aid kit; the Quiet and the Shades stay out.
      center(lay.safe, p);
      const cross = new THREE.Group(), green = new THREE.MeshBasicMaterial({ color: 0x22c55e });
      cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.05), green), new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.05), green));
      cross.position.set(p.x, H - 0.6, p.z); cross.add(glowSprite(0x22c55e, 1.6)); group.add(cross);
      safeSrc = { at: new THREE.Vector3(p.x, H - 0.5, p.z), color: 0xffc98a, power: 5, reach: 7, weight: 3 };
      medkit = new THREE.Group();
      medkit.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.28), new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.5 })));
      const red = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
      for (const [a, b] of [[0.2, 0.06], [0.06, 0.2]]) { const x = new THREE.Mesh(new THREE.BoxGeometry(a, b, 0.01), red); x.position.z = 0.145; medkit.add(x); }
      medkit.position.set(p.x, 0.9, p.z); group.add(medkit);
      // Shades: smoke with two embers for eyes.
      shades = lay.shades.map((cell) => {
        const g = new THREE.Group(), smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: shadeTex, color: 0x1a1a1e, transparent: true, depthWrite: false }));
        smoke.scale.set(1.7, 2.1, 1); g.add(smoke);
        for (const x of [-0.12, 0.12]) { const e = glowSprite(0xff2a1a, 0.16); e.position.set(x, 0.25, 0.05); g.add(e); }
        const pos = center(cell, new THREE.Vector3()).setY(1.3); g.position.copy(pos); group.add(g);
        return { g, smoke, pos, cell, to: cell, hp: SHADE_HP_S, alive: true };
      });
      const last = f === NIGHT_FLOORS - 1;
      const sign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.1), new THREE.MeshBasicMaterial({ color: last ? 0xef4444 : 0x22c55e }));
      center(m.exit, sign.position).setY(H - 0.5); sign.add(glowSprite(last ? 0xef4444 : 0x22c55e, 3)); group.add(sign);
      exitSrc = { at: sign.position.clone(), color: last ? 0xef4444 : 0x22c55e, power: 4, reach: 8, weight: 1.5 };
      sources = [...lamps.map((l) => l.src), exitSrc, safeSrc];
      flares.length = 0;
      unlocked = f !== NIGHT_CODE_FLOOR;
      body.pos.set(S / 2, 0.02, S / 2); body.vel.set(0, 0, 0); c.yaw = Math.PI;
      gCell = gTo = Math.floor(n * n / 2) + Math.floor(n / 2);
      center(gCell, ghost.position);
    };
    const flares: { g: THREE.Group; src: LightSource; until: number; spark: number }[] = [];
    build(0);
    // The lower floors' walls and floors, hidden, so their shaders are built with this floor's before
    // play starts (World.start), not when you go down the stairs.
    for (const mat of [...walls3, ...floors3]) { const x = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), mat); x.visible = false; x.castShadow = x.receiveShadow = !w.phone; w.scene.add(x); }

    let keysGot = 0, allKeys = 0, lives = NIGHT_LIVES, battery = 100, stamina = 100, score = 0, stun = 0, stuns = 0, coolUntil = 0, retreatUntil = 0, safeUntil = 6, beat = 0, bob = 0, done = false, caught = 0, lastHud = 0;
    let flareCount = NIGHT_START_FLARES, notesRead = 0, burned = 0, padShown = false, noteOpen = -1;
    let hidden = false, hideUntil = 0, hideCool = 0, lostUntil = 0, wander = 0, canHide = false, inSafe = false;
    let swayX = 0, swayY = 0, lastYaw = c.yaw, lastPitch = c.pitch, twitchAt = 0, twitch = 0, aberr = 0, scareAt = -9;
    const hideRay = new THREE.Ray(), hideHit = new THREE.Vector3(), flatFwd = new THREE.Vector3(), threat = new THREE.Vector3();
    const report = () => {
      out.current.onProgress(score, allKeys);
      out.current.onStats?.([{ label: 'Floors', value: `${Math.min(NIGHT_FLOORS, floor + (done && lives > 0 ? 1 : 0))} of ${NIGHT_FLOORS}` }, { label: 'Keys', value: String(allKeys) }, { label: 'Notes found', value: `${notesRead} of ${NIGHT_FLOORS * 2}` }, { label: 'Shades burned', value: String(burned) }, { label: 'Drove it back', value: String(stuns) }, { label: 'Times caught', value: String(caught) }]);
    };
    report();
    const blocked = (p: THREE.Vector3) => flares.some((fl) => fl.g.position.distanceTo(p) < NIGHT_FLARE_M);
    /** Something in the torch's beam (and nothing in between)? */
    const inBeam = (at: THREE.Vector3, range: number, angle: number) => {
      const fwd = V.fwd.set(0, 0, -1).applyQuaternion(w.camera.quaternion);
      const to = V.toG.copy(at).sub(w.camera.position), len = to.length();
      if (len > range || fwd.angleTo(to) > angle) return false;
      V.ray.set(w.camera.position, V.q.copy(to).normalize());
      return !walls.some((s) => V.ray.intersectBox(s, V.hit) && V.hit.distanceTo(w.camera.position) < len - 0.5);
    };

    let echo = 1, echoAt = -99, rushUntil = 0, skillAt = 0;
    w.start((dt, t) => {
      if (done) return;
      const need = nightKeys(floor);
      // What the screen sent: the right code on the keypad.
      for (const e of events.current.splice(0)) if (e === 'unlock' && !unlocked) { unlocked = true; score += NIGHT_CODE; out.current.arena.sfx('check'); out.current.arena.announce('Stairwell B unlocked', 'gold'); report(); }
      const running = c.running && stamina > 2;
      const myCell = cellAt(body.pos);
      inSafe = myCell === lay.safe;
      stamina = Math.max(0, Math.min(100, stamina + (running && body.vel.lengthSq() > 1 ? -22 : inSafe ? 30 : 12) * dt));
      if (!running && c.keys.has('shift')) c.keys.delete('shift');
      flatFwd.set(0, 0, -1).applyQuaternion(w.camera.quaternion).setY(0).normalize();
      hideRay.set(w.camera.position, flatFwd);
      canHide = !hidden && t > hideCool && walls.some((s) => hideRay.intersectBox(s, hideHit) && hideHit.distanceTo(w.camera.position) < 1.4);
      // E: put a note down, read one in reach, or hide.
      const me = V.me.copy(body.pos).setY(1);
      const near = notesHere.findIndex((x) => x.at.distanceTo(me) < 1.7);
      if (noteOpen >= 0 && notesHere[noteOpen].at.distanceTo(me) > 2.6) { noteOpen = -1; setNote(null); }
      if (c.take('act')) {
        if (noteOpen >= 0) { noteOpen = -1; setNote(null); }
        else if (near >= 0 && !hidden) {
          const x = notesHere[near];
          noteOpen = near; setNote(x.text); out.current.arena.sfx('pick');
          if (!x.read) { x.read = true; notesRead++; score += NIGHT_NOTE; x.glow.visible = false; report(); }
        } else if (hidden) { hidden = false; hideCool = t + NIGHT_HIDE_COOLDOWN_S; lostUntil = t + 3; out.current.arena.sfx('land'); }
        else if (canHide) {
          if (ghost.position.distanceTo(V.flat.copy(body.pos).setY(ghost.position.y)) < NIGHT_SEEN_M) out.current.arena.announce('It saw you!', 'bad');
          else { hidden = true; hideUntil = t + NIGHT_HIDE_S; wander = Math.floor(Math.random() * n * n); out.current.arena.sfx('land'); }
        }
      }
      if (hidden && t > hideUntil) { hidden = false; hideCool = t + NIGHT_HIDE_COOLDOWN_S; lostUntil = t + 3; }
      // G: a flare, thrown a few steps ahead (it stops short of a wall).
      if (c.take('throw') && !hidden) {
        if (flareCount > 0) {
          flareCount--;
          hideRay.set(w.camera.position, flatFwd);
          let d = 5;
          for (const s of walls) if (hideRay.intersectBox(s, hideHit)) d = Math.min(d, hideHit.distanceTo(w.camera.position) - 0.6);
          const g = new THREE.Group();
          const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.34, 8), new THREE.MeshBasicMaterial({ color: 0xff6040 }));
          stick.rotation.z = Math.PI / 2; g.add(stick, glowSprite(0xff3a1a, 2.6));
          g.position.copy(body.pos).addScaledVector(flatFwd, Math.max(0.8, d)).setY(0.1);
          group.add(g);
          const src = { at: g.position.clone().setY(0.6), color: 0xff4a2a, power: 9, reach: 11, weight: 4 };
          flares.push({ g, src, until: t + NIGHT_FLARE_S, spark: 0 }); sources.push(src);
          out.current.arena.sfx('whoosh'); out.current.arena.sfx('zap');
        } else out.current.arena.announce('No flares left', 'bad');
      }
      if (hidden) body.vel.set(0, body.vel.y, 0); else walk(body, c, dt, { speed: 4.3, run: 1.55, jump: 0 });
      body.step(dt, w.solids);
      const sp = Math.hypot(body.vel.x, body.vel.z);
      bob += dt * sp * 2.1;
      // Breathing: a slow heave when you're out of breath.
      const heave = stamina < 35 ? Math.sin(t * 2.4) * 0.025 * (1 - stamina / 35) : 0;
      eyes(w.camera, body.pos, c, 1.6, Math.sin(bob) * 0.05 * Math.min(1, sp / 4) + heave);
      // The torch lags a little behind where you look, and shakes when it's close.
      swayX = approach(swayX, Math.max(-1.2, Math.min(1.2, (c.yaw - lastYaw) * 14)), 8, dt);
      swayY = approach(swayY, Math.max(-0.8, Math.min(0.8, (c.pitch - lastPitch) * -10)), 8, dt);
      lastYaw = c.yaw; lastPitch = c.pitch;
      const dread = Math.max(0, Math.min(1, 1 - ghost.position.distanceTo(V.flat.copy(body.pos).setY(ghost.position.y)) / 14));
      const jitter = dread > 0.5 ? (Math.random() - 0.5) * 0.12 * dread : 0;
      torch.target.position.set(swayX + jitter, -0.3 + swayY + jitter, -5);
      // The battery: drains, faster while burning something; the safe room charges it to 60%.
      if (!hidden) battery = Math.max(0, battery - dt * (0.45 + (stun > 0 ? 2.2 : 0)));
      if (inSafe && battery < 60) battery = Math.min(60, battery + dt * 4);
      const torchOn = hidden ? 0 : battery <= 0 ? 4 : battery < 15 ? (Math.sin(t * 40) > 0.2 ? 32 : 6) : 42;
      torch.intensity = torchOn;
      // Lamps flicker (the broken ones badly); flares sputter and burn out.
      for (const l of lamps) {
        const flick = Math.sin(t * 7 + l.seedV) + Math.sin(t * 23 + l.seedV * 2);
        const on = l.broken ? flick < 0.4 : flick < 1.75;
        l.src.power = on ? 6 : 0.3;
        (l.mesh.material as THREE.MeshBasicMaterial).color.setHex(on ? 0xfff6d5 : 0x2a2924);
      }
      for (let i = flares.length - 1; i >= 0; i--) {
        const fl = flares[i];
        fl.src.power = t > fl.until ? 0 : 7 + Math.sin(t * 31 + i) * 1.5 + Math.sin(t * 17) * 1.2;
        if (t > fl.until) { group.remove(fl.g); const k = sources.indexOf(fl.src); if (k >= 0) sources.splice(k, 1); flares.splice(i, 1); continue; }
        if ((fl.spark -= dt) < 0) { fl.spark = 0.12; w.burst(fl.g.position, 0xff5a2a, 2, 2.2, 5); }
      }
      exitSrc.power = keysGot === need && unlocked ? 6 + Math.sin(t * 6) * 3 : 2.5;
      pool.update(body.pos, sources);
      // Dust in the beam: bright inside the cone, gone outside it or when the torch is off.
      const beamPower = torchOn / 42;
      for (let i = 0; i < DUST; i++) {
        const j = i * 3;
        for (let k = 0; k < 3; k++) dustPos[j + k] += dustVel[j + k] * dt * 6;
        if (dustPos[j + 2] > -0.5) dustPos[j + 2] = -6.5; else if (dustPos[j + 2] < -6.6) dustPos[j + 2] = -0.6;
        if (Math.abs(dustPos[j]) > 2) dustPos[j] *= -0.98; if (Math.abs(dustPos[j + 1]) > 1.5) dustPos[j + 1] *= -0.98;
        const off = Math.hypot(dustPos[j] - swayX * 0.3, dustPos[j + 1] + 0.3 - swayY * 0.3) / (-dustPos[j + 2] * 0.45 + 0.2);
        const v = Math.max(0, 1 - off) * beamPower * 0.9;
        dustCol[j] = v; dustCol[j + 1] = v * 0.95; dustCol[j + 2] = v * 0.85;
      }
      dustGeo.attributes.position.needsUpdate = true; dustGeo.attributes.color.needsUpdate = true;
      // Keys, batteries, flares and the first-aid kit.
      me.copy(body.pos).setY(1.1);
      keys.forEach((k, i) => {
        if (k.got) return;
        k.g.rotation.y = t * 1.8 + i; k.g.position.y = 1.1 + Math.sin(t * 2.5 + i) * 0.08;
        if (k.g.position.distanceTo(me) < 1.2) {
          k.got = true; group.remove(k.g); keysGot++; allKeys++; score += NIGHT_KEY;
          out.current.arena.sfx('coin', keysGot * 2);
          setFly({ id: allKeys, name: k.name });
          if (keysGot === need) out.current.arena.announce(floor === NIGHT_FLOORS - 1 ? 'All the keys. Find the tunnel' : floor === NIGHT_CODE_FLOOR ? 'All the keys. Now the code' : 'All the keys. Find the stairs', 'gold');
          report();
        }
      });
      for (const b of cells) if (!b.got && b.b.position.distanceTo(me) < 1.1) {
        b.got = true; group.remove(b.b);
        if (b.kind === 'battery') { battery = Math.min(100, battery + 50); out.current.arena.sfx('power'); }
        else { flareCount++; out.current.arena.sfx('pick'); out.current.arena.announce('A flare (G to throw)', 'good'); }
      }
      if (medkit && medkit.position.distanceTo(me) < 1.1 && lives < NIGHT_LIVES) { lives++; group.remove(medkit); medkit = null; out.current.arena.sfx('power'); out.current.arena.announce('First aid: +1 life', 'good'); }
      if (medkit) medkit.rotation.y = t * 0.6;
      // The stairs (or the tunnel). The library's stairwell also needs the code.
      const atExit = myCell === m.exit;
      if (atExit && keysGot === need && !unlocked) { if (!padShown) { padShown = true; setKeypad(true); out.current.arena.sfx('tick'); } }
      else if (padShown && !atExit) { padShown = false; setKeypad(false); }
      if (keysGot === need && unlocked && atExit) {
        if (padShown) { padShown = false; setKeypad(false); }
        if (floor < NIGHT_FLOORS - 1) {
          score += NIGHT_FLOOR; keysGot = 0; battery = Math.min(100, battery + 30);
          if (noteOpen >= 0) { noteOpen = -1; setNote(null); }
          out.current.arena.sfx('check');
          build(floor + 1); safeUntil = t + 3; report();
          setCurtain({ key: floor, title: `Floor ${floor + 1}`, sub: NIGHT_FLOOR_NAMES[floor] });
          return;
        }
        done = true;
        const left = Math.max(0, Math.round((out.current.endsAt - out.current.clock()) / 1000));
        if (notesRead >= NIGHT_FLOORS * 2) score += NIGHT_TRUTH;
        score += NIGHT_ESCAPE + left * NIGHT_PER_SECOND;
        out.current.arena.sfx('win');
        setNote(null); setEnding(nightEnding(notesRead, NIGHT_FLOORS * 2));
        report();
        setTimeout(() => out.current.onDone(score, allKeys), 5200);
        return;
      }
      // Echo: a pulse shows the halls, the notes and everything that moves, through the walls… and it hears it.
      if (c.take('skill') && echo >= 1) { echo = 0; echoAt = t; rushUntil = t + ECHO_RUSH_S; out.current.arena.sfx('zap'); out.current.arena.sfx('heart'); setSkill((p) => ({ ...p, pulse: p.pulse + 1 })); }
      echo = Math.min(1, echo + dt / ECHO_REFILL_S);
      const showing = t - echoAt < ECHO_SHOW_S, fade = showing ? Math.max(0, 1 - (t - echoAt) / ECHO_SHOW_S) : 0;
      if (echoLines) { echoLines.visible = showing; (echoLines.material as THREE.LineBasicMaterial).opacity = fade * 0.9; }
      for (const part of body3) { const mt = part.material as THREE.Material; mt.depthTest = !showing; part.renderOrder = showing ? 6 : 0; }
      for (const x of notesHere) { (x.glow.material as THREE.SpriteMaterial).depthTest = !showing; x.glow.renderOrder = showing ? 6 : 0; }
      if (t - skillAt > 0.15) { skillAt = t; setSkill((p) => (Math.abs(p.charge - echo) < 0.02 && p.active === showing && p.others === crowd.count ? p : { ...p, charge: echo, active: showing, others: crowd.count })); }
      // The Quiet: walks toward you through the halls; noise (running, Echo) makes it hurry; it backs
      // away from the torch and won't come near a flare or into the safe room.
      const noisy = running && sp > 3;
      const nearFlare = flares.find((fl) => fl.g.position.distanceTo(ghost.position) < NIGHT_FLARE_M);
      const speed = retreatUntil > t || nearFlare ? 3.2 : (1.9 + floor * 0.35 + keysGot * 0.3) * (t < rushUntil ? 1.6 : noisy ? 1.25 : 1);
      const target = center(gTo, V.toT);
      target.sub(ghost.position).setY(0);
      if (target.length() < 0.15) {
        gCell = gTo;
        if (retreatUntil > t || nearFlare) {
          threat.copy(nearFlare ? nearFlare.g.position : body.pos);
          const away = mazeNext(m, gCell).filter((x) => x !== lay.safe).sort((a, b) => center(b, V.q).distanceTo(threat) - center(a, V.flat).distanceTo(threat));
          gTo = away[0] ?? gCell;
        } else {
          let next = mazeStep(m, gCell, hidden || lostUntil > t || inSafe ? wander : myCell);
          if (next === lay.safe || blocked(center(next, V.q))) next = gCell;
          gTo = next;
          if (gTo === gCell && (hidden || inSafe)) wander = Math.floor(Math.random() * n * n);
        }
      } else { const len = target.length(); ghost.position.addScaledVector(target.normalize(), Math.min(len, speed * dt)); }
      // Its walk: a slow sway, arms swinging out of step, the head twitching now and then.
      ghost.position.y = Math.sin(t * 2) * 0.05;
      ghost.lookAt(body.pos.x, ghost.position.y, body.pos.z);
      ghost.rotateX(dread > 0.3 ? 0.12 : 0.04);
      arms[0].rotation.x = Math.sin(t * 1.7) * 0.35 - 0.1; arms[1].rotation.x = Math.sin(t * 1.7 + 2.4) * 0.35 - 0.1;
      arms[0].rotation.z = -0.08 + Math.sin(t * 0.9) * 0.05; arms[1].rotation.z = 0.08 - Math.sin(t * 1.1) * 0.05;
      if (t > twitchAt) { twitchAt = t + 0.8 + Math.random() * 2.2; twitch = (Math.random() - 0.5) * 1.1; }
      head.rotation.z = approach(head.rotation.z, 0.35 + twitch * 0.5, 22, dt); head.rotation.y = approach(head.rotation.y, twitch, 18, dt);
      torso.scale.set(1, 1 + Math.sin(t * 1.3) * 0.02, 1);
      const dist = ghost.position.distanceTo(V.flat.copy(body.pos).setY(ghost.position.y));
      const lit = !hidden && battery > 0 && dist < 15 && inBeam(V.q.copy(ghost.position).setY(1.8), 15, 0.26);
      skin.emissive.setHex(showing ? 0xb91c1c : lit ? 0x3a3d42 : 0x0d0e10);
      eyeGlow.color.setHex(showing || dist < 5 ? 0xff2020 : 0x330000);
      if (lit && t > coolUntil) {
        stun += dt;
        if (stun >= NIGHT_STUN_S) { stun = 0; stuns++; score += NIGHT_STUN; coolUntil = t + NIGHT_STUN_COOLDOWN_S; retreatUntil = t + 5; out.current.arena.sfx('zap'); out.current.arena.announce('It backed away', 'good'); report(); }
      } else stun = Math.max(0, stun - dt * 0.5);
      // Shades: drift toward you when you're near (noise carries further); the beam or a flare burns
      // them away; one that reaches you drinks your battery.
      for (const s of shades) {
        if (!s.alive) continue;
        const d = s.pos.distanceTo(me);
        const aware = d < (noisy ? 22 : 14);
        const goal = center(s.to, V.toT).setY(1.3), gd = s.pos.distanceTo(goal);
        if (gd < 0.12) { s.cell = s.to; if (aware) { const nx = mazeStep(m, s.cell, myCell); s.to = nx === lay.safe ? s.cell : nx; } }
        else s.pos.addScaledVector(goal.sub(s.pos).divideScalar(gd), Math.min(gd, (1.3 + floor * 0.25) * dt));
        s.g.position.set(s.pos.x, s.pos.y + Math.sin(t * 1.9 + s.cell) * 0.12, s.pos.z);
        const burning = (!hidden && battery > 0 && inBeam(s.pos, 12, 0.3)) || flares.some((fl) => fl.g.position.distanceTo(s.pos) < 3);
        (s.smoke.material as THREE.SpriteMaterial).color.setHex(burning ? 0x8a8a92 : showing ? 0x6b1d1d : 0x1a1a1e);
        (s.smoke.material as THREE.SpriteMaterial).depthTest = !showing;
        s.smoke.material.rotation = t * 0.4 + s.cell;
        if (burning) { s.hp -= dt; battery = Math.max(0, battery - dt * 1.5); if (Math.random() < 0.3) w.burst(s.pos, 0x9ca3af, 1, 1.5, -1); }
        if (s.hp <= 0) { s.alive = false; group.remove(s.g); burned++; score += NIGHT_SHADE; w.burst(s.pos, 0xd1d5db, 26, 3, -2); out.current.arena.sfx('zap'); report(); continue; }
        if (d < 0.9 && !inSafe) { s.alive = false; group.remove(s.g); battery = Math.max(0, battery - SHADE_DRAIN); w.burst(s.pos, 0x111111, 30, 2.5, -1); out.current.arena.sfx('hurt'); out.current.arena.shake(0.6); w.shake(0.4); out.current.arena.announce('It drank your torch', 'bad'); }
      }
      // Its heartbeat in your ears, faster as it nears.
      beat -= dt;
      if (dist < 16 && beat <= 0) { out.current.arena.sfx('heart'); beat = Math.max(0.35, dist / 11); }
      // Caught.
      if (dist < 1.15 && t > safeUntil && !hidden && !inSafe) {
        caught++; lives--; score = Math.max(0, score - NIGHT_CAUGHT); scareAt = t;
        out.current.arena.sfx('scream'); out.current.arena.shake(1.6); w.shake(1);
        setHud((h) => ({ ...h, scare: h.scare + 1 }));
        body.pos.set(S / 2, 0.02, S / 2); body.vel.set(0, 0, 0); c.yaw = Math.PI;
        gCell = gTo = (n * n - 1) - Math.floor(n * 1.5); center(gCell, ghost.position);
        safeUntil = t + 3;
        report();
        if (lives <= 0) { done = true; out.current.arena.announce('It got you', 'bad'); setTimeout(() => out.current.onDone(score, allKeys), 1800); }
      }
      // The film finish splits as it nears, and tears for a moment when it catches you.
      aberr = approach(aberr, dread * 0.011 + (t - scareAt < 0.6 ? 0.03 : 0), 6, dt);
      w.look({ aberr: aberr < 0.0005 ? 0 : aberr }); // 0 skips the fringe's extra reads
      crowd.update(dt, { pos: body.pos, ry: c.yaw + Math.PI, air: false, part: floor, color: lookHex(look), hat: look.hat });
      if (t - lastHud > 0.2) {
        lastHud = t;
        setHud((h) => ({ ...h, keys: keysGot, need, floor, lives, battery: Math.round(battery), stamina: Math.round(stamina), near: dread, open: keysGot === need && unlocked, hidden, hideLeft: hidden ? Math.max(0, (hideUntil - t) / NIGHT_HIDE_S) : 0, canHide: canHide && near < 0, canRead: near >= 0 && noteOpen < 0 && !hidden, flares: flareCount, notes: notesRead, safe: inSafe, flareHint: flareCount > 0 && dist < 9 && !inSafe }));
      }
    });
    return () => { c.dispose(); controls.current = null; w.dispose(); };
  }, [seed]);

  const unlock = () => { events.current.push('unlock'); setKeypad(false); };
  return (
    <div className="mx-auto w-full max-w-6xl">
      <WorldFrame net={net} canvas={canvas} controls={controls} buttons={[{ id: 'skill', label: 'Echo' }, { id: 'act', label: 'Use' }, { id: 'throw', label: 'Flare' }]} keys="WASD walk · Shift run (it hears you) · E read, hide · G flare · Q echo" label="Night Shift: Ashgrove Academy after dark, in 3D" curtain={curtain} others={skill.others}>
        {skill.pulse > 0 && <span key={skill.pulse} className="play-echo pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full" aria-hidden />}
        {/* Dread: the edges darken and the picture crawls with static as it nears */}
        <div className="pointer-events-none absolute inset-0 transition-opacity duration-300" style={{ opacity: hud.near, boxShadow: 'inset 0 0 180px 60px rgba(0,0,0,0.95)' }} aria-hidden />
        <div className="play-static pointer-events-none absolute inset-0 mix-blend-screen transition-opacity duration-300" style={{ opacity: hud.near * 0.25 }} aria-hidden />
        {hud.scare > 0 && <Scare key={hud.scare} />}
        {hud.hidden && (
          <div className="play-locker pointer-events-none absolute inset-0 grid place-items-center" aria-live="polite">
            <div className="rounded-2xl bg-black/70 px-4 py-2 text-center ring-1 ring-white/10">
              <p className="text-sm font-bold text-white">Hiding… <span className="text-zinc-300">E to come out</span></p>
              <div className="mx-auto mt-1.5 h-1.5 w-40 overflow-hidden rounded-full bg-white/10"><div className="h-full w-full origin-left rounded-full bg-emerald-400 transition-transform duration-200 rtl:origin-right" style={{ transform: `scaleX(${hud.hideLeft})` }} /></div>
            </div>
          </div>
        )}
        {hud.safe && <p className="pointer-events-none absolute left-1/2 top-20 -translate-x-1/2 rounded-full bg-emerald-950/80 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/30">Safe room · it can’t come in here</p>}
        {(hud.canRead || (hud.canHide && !hud.hidden) || hud.flareHint) && !note && (
          <p className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/15">
            {/* Keys on a computer, the buttons' names on a phone */}
            <span className="[@media(pointer:coarse)]:hidden">{hud.canRead || (hud.canHide && !hud.hidden) ? 'E' : 'G'} · </span>
            <span className="hidden [@media(pointer:coarse)]:inline">{hud.canRead || (hud.canHide && !hud.hidden) ? 'Use' : 'Flare'} · </span>
            {hud.canRead ? 'read it' : hud.canHide && !hud.hidden ? 'hide in the locker' : 'throw a flare'}
          </p>
        )}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start gap-2">
          <SkillRing label="Echo" keyName="Q" charge={skill.charge} active={skill.active} />
          <div className="rounded-2xl bg-black/60 px-3 py-2 ring-1 ring-white/10"><p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300">Floor {hud.floor + 1}/{NIGHT_FLOORS}</p><p className="text-sm font-bold leading-tight text-white">{NIGHT_FLOOR_NAMES[hud.floor]}</p></div>
          <div className="flex items-center gap-1 rounded-2xl bg-black/60 px-3 py-2 ring-1 ring-white/10" aria-label={`${hud.keys} of ${hud.need} keys`}>
            {Array.from({ length: hud.need }, (_, i) => <KeyRound key={i} className={cn('h-5 w-5 transition-colors duration-300', i < hud.keys ? 'text-amber-300' : 'text-zinc-600')} aria-hidden />)}
          </div>
          <div className="flex items-center gap-1 rounded-2xl bg-black/60 px-3 py-2 ring-1 ring-white/10" aria-label={`${hud.lives} lives`}>
            {Array.from({ length: NIGHT_LIVES }, (_, i) => <Heart key={i} className={cn('h-5 w-5', i < hud.lives ? 'fill-red-500 text-red-500' : 'text-zinc-600')} aria-hidden />)}
          </div>
          <div className={cn('w-36 rounded-2xl bg-black/60 px-3 py-2 ring-1 ring-white/10', hud.stamina < 35 && 'play-breath')}>
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300"><Battery className="h-3.5 w-3.5" aria-hidden />Torch {hud.battery}%</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={cn('h-full w-full origin-left rounded-full rtl:origin-right', hud.battery > 15 ? 'bg-amber-200' : 'bg-red-500')} style={{ transform: `scaleX(${hud.battery / 100})` }} /></div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full w-full origin-left rounded-full bg-sky-300 rtl:origin-right" style={{ transform: `scaleX(${hud.stamina / 100})` }} /></div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-black/60 px-3 py-2 text-sm font-bold text-white ring-1 ring-white/10 tabular-nums">
            <span className="inline-flex items-center gap-1" aria-label={`${hud.flares} flares`}><Flame className="h-4 w-4 text-orange-400" aria-hidden />{hud.flares}</span>
            <span className="inline-flex items-center gap-1" aria-label={`${hud.notes} of ${NIGHT_FLOORS * 2} notes`}><FileText className="h-4 w-4 text-amber-100" aria-hidden />{hud.notes}/{NIGHT_FLOORS * 2}</span>
          </div>
          {hud.open && <span className="self-center rounded-full bg-red-600 px-3 py-1 text-xs font-black uppercase tracking-wider text-white">{hud.floor === NIGHT_FLOORS - 1 ? 'Tunnel open' : 'Stairs open'}</span>}
        </div>
        {/* A key you pick up flies up to the key ring */}
        <AnimatePresence>
          {fly && (
            <motion.div key={fly.id} className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2"
              initial={{ opacity: 0, scale: 0.85, y: 10 }} animate={calm ? { opacity: [0, 1, 1, 0] } : { opacity: [0, 1, 1, 0], scale: [0.85, 1.1, 1, 0.5], y: [10, 0, 0, -220], x: [0, 0, 0, -160] }}
              transition={{ duration: 1.6, times: [0, 0.18, 0.6, 1], ease: 'easeOut' }} onAnimationComplete={() => setFly(null)}>
              <KeyRound className="h-12 w-12 text-amber-300 drop-shadow-[0_0_18px_rgba(252,211,77,0.7)]" aria-hidden />
              <span className="rounded-full bg-black/70 px-3 py-1 text-sm font-bold text-amber-100 ring-1 ring-amber-300/30">{fly.name}</span>
            </motion.div>
          )}
        </AnimatePresence>
        {/* A note: an old page, held up to the torch */}
        <AnimatePresence>
          {note && (
            <motion.div key={note.title} className="pointer-events-none absolute inset-x-4 bottom-24 mx-auto max-w-md rounded-sm bg-[#ece3cc] p-5 text-[#2a2118] shadow-[0_24px_60px_-10px_rgba(0,0,0,0.9)]"
              initial={{ opacity: 0, y: calm ? 0 : 40, rotate: calm ? 0 : -4 }} animate={{ opacity: 1, y: 0, rotate: calm ? 0 : -1.2 }} exit={{ opacity: 0, y: calm ? 0 : 24, transition: { duration: 0.18 } }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              role="status" aria-live="polite">
              <p className="font-serif text-base font-bold leading-snug">{note.title}</p>
              <p className="mt-2 font-serif text-sm leading-relaxed">{note.body}</p>
              <p className="mt-3 text-xs font-semibold text-[#6b5a44]"><span className="[@media(pointer:coarse)]:hidden">E</span><span className="hidden [@media(pointer:coarse)]:inline">Use</span> · put it down</p>
            </motion.div>
          )}
        </AnimatePresence>
        {keypad && <Keypad code={code} onUnlock={unlock} calm={!!calm} />}
        {/* The start: where you are and what to do */}
        <AnimatePresence>
          {intro && (
            <motion.div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-6 pb-20 pt-24 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.8 } }} transition={{ duration: 0.8 }}>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">Ashgrove Academy · 11:52 pm</p>
              <p className="mx-auto mt-3 max-w-xl text-lg font-semibold leading-snug text-white">Your first night shift. The boiler is humming again, the lights are failing, and the halls are not empty.</p>
              <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-300">Find the keys, read what the others left behind, and get down to the service tunnel before dawn. Don’t run.</p>
            </motion.div>
          )}
        </AnimatePresence>
        {/* The ending */}
        <AnimatePresence>
          {ending && (
            <motion.div className="absolute inset-0 grid place-items-center bg-black/85 p-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2 }} role="status" aria-live="polite">
              <div className="max-w-lg">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-200/80">Dawn</p>
                <p className="mt-3 text-3xl font-black text-white sm:text-4xl">{ending.title}</p>
                <p className="mt-4 text-sm leading-relaxed text-zinc-300">{ending.body}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </WorldFrame>
      <p className="mt-2 text-center text-xs text-zinc-400">{GAMES.night.how}</p>
    </div>
  );
}

/** The stairwell keypad: type the code from the bursar's memo (number keys or taps). */
function Keypad({ code, onUnlock, calm }: { code: string; onUnlock: () => void; calm: boolean }) {
  const arena = useArena();
  const [entry, setEntry] = useState('');
  const [wrong, setWrong] = useState(0);
  const press = (k: string) => {
    if (k === '⌫') { setEntry(entry.slice(0, -1)); return; }
    const next = (entry + k).slice(0, 4);
    arena.sfx('key');
    if (next.length < 4) { setEntry(next); return; }
    if (next === code) { setEntry(next); setTimeout(onUnlock, 250); return; }
    setEntry(''); setWrong((x) => x + 1); arena.sfx('wrong');
  };
  const pressRef = useRef(press);
  useEffect(() => { pressRef.current = press; });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (/^[0-9]$/.test(e.key)) pressRef.current(e.key);
      else if (e.key === 'Backspace') pressRef.current('⌫');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  return (
    <motion.div className="absolute left-1/2 top-1/2 w-60 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-zinc-900/95 p-4 ring-1 ring-white/15 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]"
      initial={false} animate={wrong && !calm ? { x: wrong % 2 ? [0, -10, 10, -6, 6, 0] : [0, 10, -10, 6, -6, 0] } : { x: 0 }} transition={{ duration: 0.35 }}>
      <p className="text-center text-xs font-semibold uppercase tracking-wider text-zinc-400">Stairwell B · code</p>
      <p className={cn('mt-2 rounded-lg bg-black py-2 text-center font-mono text-2xl tracking-[0.5em] tabular-nums', wrong ? 'text-red-400' : 'text-emerald-300')} aria-live="polite">{entry.padEnd(4, '·')}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0'].map((k) => (
          <button key={k} type="button" onClick={(e) => { e.stopPropagation(); press(k); }} className="rounded-lg bg-zinc-800 py-2.5 text-lg font-bold text-white ring-1 ring-white/10 transition-transform duration-100 active:scale-95" aria-label={k === '⌫' ? 'Delete' : k}>{k}</button>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-zinc-400">The bursar’s memo is somewhere on this floor</p>
    </motion.div>
  );
}

/** The jump scare: a face rushing at the screen with a red flash. */
function Scare() {
  return (
    <div className="play-scare pointer-events-none absolute inset-0 grid place-items-center bg-red-900/70" aria-hidden>
      <svg viewBox="0 0 200 240" className="h-[90%]">
        <ellipse cx="100" cy="110" rx="70" ry="104" fill="#d4d6da" />
        <ellipse cx="70" cy="95" rx="18" ry="30" fill="#000" /><ellipse cx="130" cy="95" rx="18" ry="30" fill="#000" />
        <circle cx="70" cy="100" r="4" fill="#ef4444" /><circle cx="130" cy="100" r="4" fill="#ef4444" />
        <ellipse cx="100" cy="178" rx="22" ry="40" fill="#000" />
      </svg>
    </div>
  );
}

/** The torch's lens pattern: a hot centre, a bright ring, a soft halo, a few scratches. */
function lensPattern() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.18, '#f4f1ea'); grad.addColorStop(0.42, '#9a968e'); grad.addColorStop(0.55, '#c9c5bc');
  grad.addColorStop(0.62, '#6e6b65'); grad.addColorStop(0.85, '#2a2927'); grad.addColorStop(1, '#000000');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
  for (let i = 0; i < 9; i++) { g.beginPath(); const a = i * 0.7; g.moveTo(64 + Math.cos(a) * 10, 64 + Math.sin(a) * 10); g.lineTo(64 + Math.cos(a + 0.3) * 50, 64 + Math.sin(a + 0.3) * 50); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A Shade's smoke: dark at the heart, ragged at the edge. */
function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 26; i++) {
    const x = 64 + Math.sin(i * 2.4) * 18, y = 64 + Math.cos(i * 1.7) * 22, r = 18 + (i % 5) * 6;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.22)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(c);
}
