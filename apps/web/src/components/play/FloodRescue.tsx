'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Fuel, Package, Wind } from 'lucide-react';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { GAMES } from '@/lib/play';
import { CAPACITY, CRATE_MS, CRATE_PTS, CRATES, FUEL_SECONDS, HELIPAD, RESCUE_LOST, STRIKE_TAKES, STRIKE_WARN_MS, rescuePoints, rescueSchedule, rescueStorm, rescueTown, waterLevel, type Stranded } from '@/lib/play/rescue';
import { cn } from '@/lib/utils';
import { useArena } from './arena';
import { calmMotion, steerBody, useSteer } from './steer';
import type { GameProps } from './game-props';
import { THREE, World, glowSprite, worldUv } from './world/core';
import { Board, label, rainField, stormSky, timerRing, waterNormals } from './world/board';
import { lightBeam } from './world/nature';
import { surface } from './world/textures';
import { HudChip } from './world/Stage';
import { haptic } from '@/lib/haptics';

// Flood Rescue (src/lib/play/rescue.ts): a storm, a town going under, people (some with pets)
// waving from rooftops. Fly low and slow over a roof to winch them up, four at a time, then set
// down on the hospital's pad, which also refuels. Lightning strikes roofs after a warning (people
// there have less time); gusts push the helicopter; an empty tank makes it limp.
// Drawn in 3D since M103 (the rules still work in the box's pixels, world/board.ts): a town of lit
// windows under a rolling storm, flood water that mirrors it, rain that slants with the gusts, real
// lightning, a modelled helicopter with a searchlight, people who wave and rise up the winch line.

const WINCH_S = 0.55;
const UNLOAD_S = 0.3;
const SLOW = 190;
/** Clothes for the people on the roofs (their skin from SKIN). */
const CLOTHES = [0xef4444, 0x3b82f6, 0xf59e0b, 0x10b981, 0xa855f7, 0xf97316, 0x0ea5e9, 0xe11d48];
const SKIN = [0xf1c27d, 0xc68642, 0x8d5524, 0xe0ac69, 0xffdbac];

/** Facades: a grid of windows, some lit warm, some cold, most dark (colour and glow pictures).
 *  The hospital's are white with more of them lit, a cool white. */
function facade(hospital = false) {
  const N = 16, S = 512, c = document.createElement('canvas'), e = document.createElement('canvas');
  c.width = c.height = e.width = e.height = S;
  const g = c.getContext('2d')!, h = e.getContext('2d')!;
  g.fillStyle = hospital ? '#d7dce2' : '#3d3b38'; g.fillRect(0, 0, S, S);
  h.fillStyle = '#000'; h.fillRect(0, 0, S, S);
  let r = 7;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const cx = x * (S / N), cy = y * (S / N), cw = S / N;
    g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.12})`; g.fillRect(cx, cy, cw, cw);
    g.fillStyle = hospital ? '#9aa3ad' : '#2f3134'; g.fillRect(cx + 7, cy + 5, cw - 14, cw - 9);
    const lit = hospital ? rnd() * 0.25 : rnd(), warm = !hospital && rnd() < 0.75;
    const glass = lit < 0.09 ? (warm ? '#ffcf86' : '#cfe3ff') : lit < 0.14 ? '#5a4330' : '#101318';
    g.fillStyle = glass; g.fillRect(cx + 9, cy + 7, cw - 18, cw - 13);
    if (lit < 0.09) { h.fillStyle = warm ? `rgb(255,${170 + rnd() * 40},${90 + rnd() * 40})` : 'rgb(190,215,255)'; h.fillRect(cx + 9, cy + 7, cw - 18, cw - 13); }
    if (lit < 0.09 && rnd() < 0.5) { const cur = cx + 9 + (cw - 18) * rnd(); g.fillStyle = 'rgba(80,40,30,0.7)'; g.fillRect(cur, cy + 7, (cw - 18) * 0.3, cw - 13); h.fillStyle = 'rgba(0,0,0,0.6)'; h.fillRect(cur, cy + 7, (cw - 18) * 0.3, cw - 13); }
    g.fillStyle = hospital ? '#eef1f4' : '#77726b'; g.fillRect(cx + 5, cy + cw - 6, cw - 10, 3);
  }
  const tex = (cv: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  return new THREE.MeshStandardMaterial({ map: tex(c), emissiveMap: tex(e), emissive: 0xffffff, emissiveIntensity: 1.25, roughness: 0.5, metalness: 0.05 });
}

/** The landing pad's paint: a dark disc, a white ring and a big H. */
function padTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#22252a'; g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#f5f5f5'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#f5f5f5'; g.fillRect(84, 66, 22, 124); g.fillRect(150, 66, 22, 124); g.fillRect(84, 117, 88, 22);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** A parachute's canopy: red and white panels. */
function canopyTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 8;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f8fafc' : '#dc2626'; g.fillRect(i * 16, 0, 16, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The rescue helicopter, 2.6 long, nose along +x: pink paint with a white belly, a tinted canopy,
 *  skids, a tail with its rotor, the main rotor and its blur, navigation lights, a searchlight and the
 *  winch line (`line`: set its length with scale.y). */
function helicopter(phone: boolean) {
  const g = new THREE.Group(), tip = new THREE.Group();
  g.add(tip);
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xfe81d1, roughness: 0.34, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.1 });
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf3f4f6, roughness: 0.38, clearcoat: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d2026, roughness: 0.45, metalness: 0.7 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0b1622, roughness: 0.03, metalness: 0.2, clearcoat: 1, transparent: true, opacity: 0.88 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, at: [number, number, number], rot: [number, number, number] = [0, 0, 0], parent: THREE.Object3D = tip) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(...at); m.rotation.set(...rot); m.castShadow = !phone; parent.add(m); return m;
  };
  const body = add(new THREE.CapsuleGeometry(0.36, 0.72, 8, 20), paint, [0, 0, 0], [0, 0, Math.PI / 2]);
  body.scale.set(1, 1, 0.92);
  add(new THREE.CapsuleGeometry(0.365, 0.62, 8, 20, 0.5), white, [-0.04, -0.06, 0], [0, 0, Math.PI / 2]).scale.set(1, 1, 0.94);
  add(new THREE.SphereGeometry(0.33, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), glass, [0.42, 0.06, 0], [0, 0, -Math.PI / 2.3]);
  add(new THREE.BoxGeometry(0.62, 0.2, 0.42), paint, [-0.08, 0.38, 0]);
  add(new THREE.CylinderGeometry(0.05, 0.13, 1.45, 12), paint, [-1.12, 0.1, 0], [0, 0, Math.PI / 2 - 0.06]);
  add(new THREE.BoxGeometry(0.3, 0.46, 0.04), paint, [-1.8, 0.3, 0], [0, 0, -0.35]);
  add(new THREE.BoxGeometry(0.1, 0.03, 0.46), paint, [-1.7, 0.12, 0]);
  for (const z of [-0.27, 0.27]) {
    add(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 8), dark, [0.02, -0.5, z], [0, 0, Math.PI / 2]);
    for (const x of [-0.3, 0.3]) add(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 6), dark, [x, -0.38, z * 0.85], [z > 0 ? -0.35 : 0.35, 0, 0]);
  }
  add(new THREE.CylinderGeometry(0.05, 0.06, 0.18, 10), dark, [-0.06, 0.55, 0]);
  const rotor = new THREE.Group(); rotor.position.set(-0.06, 0.65, 0); tip.add(rotor);
  const blade = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.6, metalness: 0.4 });
  for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(1.32, 0.014, 0.085).translate(0.66, 0, 0), blade, [0, 0, 0], [0, (i * Math.PI) / 2, 0], rotor);
  const blur = new THREE.Mesh(new THREE.CircleGeometry(1.32, 48), new THREE.MeshBasicMaterial({ color: 0x9aa3b2, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
  blur.rotation.x = -Math.PI / 2; rotor.add(blur);
  const tail = new THREE.Group(); tail.position.set(-1.84, 0.34, 0.06); tip.add(tail);
  for (let i = 0; i < 2; i++) add(new THREE.BoxGeometry(0.03, 0.42, 0.012), blade, [0, 0, 0], [0, 0, i * Math.PI / 2], tail);
  // Lights: green on the right side (the one we see), a white strobe on the tail, the searchlight.
  const green = glowSprite(0x4ade80, 0.35); green.position.set(0.1, 0.05, 0.36); tip.add(green);
  const strobe = glowSprite(0xffffff, 0.6); strobe.position.set(-1.9, 0.5, 0); tip.add(strobe);
  const lamp = new THREE.SpotLight(0xfff1d6, 40, 22, 0.36, 0.55, 1.4);
  lamp.position.set(0.45, -0.32, 0); lamp.target.position.set(0.7, -6, 0);
  if (!phone) { lamp.castShadow = true; lamp.shadow.mapSize.set(512, 512); lamp.shadow.bias = -0.0006; }
  tip.add(lamp, lamp.target);
  const beam = lightBeam(7, 0.36, 0xfff1d6);
  beam.mesh.position.copy(lamp.position); beam.mesh.rotation.x = Math.PI / 2; beam.mat.uniforms.power.value = 0.08;
  tip.add(beam.mesh);
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: 0xffc0e6, roughness: 0.5 }));
  line.position.set(0.15, -0.3, 0.3); line.visible = false; tip.add(line);
  return { g, tip, rotor, tail, blur, strobe, lamp, beam, line };
}

/** Little people who wave (one instanced mesh per part, so a crowd costs a few draws). */
class People {
  readonly group = new THREE.Group();
  private parts: THREE.InstancedMesh[];
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private v = new THREE.Vector3(); private s = new THREE.Vector3(); private c = new THREE.Color();
  private n = 0;
  constructor(private max: number) {
    const mk = (geo: THREE.BufferGeometry, rough = 0.8) => {
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: rough }), max);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.count = 0; im.castShadow = true; im.frustumCulled = false;
      this.group.add(im); return im;
    };
    // Body (shirt and trousers in one), head, a waving arm, the other arm.
    this.parts = [mk(new THREE.CapsuleGeometry(0.17, 0.42, 4, 10).translate(0, 0.38, 0)), mk(new THREE.SphereGeometry(0.15, 14, 10).translate(0, 0.86, 0), 0.6),
      mk(new THREE.CapsuleGeometry(0.05, 0.3, 3, 6).translate(0, 0.18, 0)), mk(new THREE.CapsuleGeometry(0.05, 0.3, 3, 6).translate(0, -0.18, 0))];
    for (const p of this.parts) p.setColorAt(0, this.c.setHex(0xffffff));
  }
  begin() { this.n = 0; }
  /** One person standing at `at` (feet), `size` tall, an arm waving by `wave` (radians), colours by `id`. */
  add(at: THREE.Vector3, size: number, wave: number, id: number, lean = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.s.setScalar(size);
    const put = (k: number, x: number, y: number, rz: number) => {
      this.e.set(0, 0, rz + lean); this.q.setFromEuler(this.e);
      this.v.set(at.x + x * size, at.y + y * size, at.z);
      this.m.compose(this.v, this.q, this.s); this.parts[k].setMatrixAt(i, this.m);
    };
    put(0, 0, 0, 0); put(1, 0, 0, 0); put(2, 0.2, 0.62, -0.5 + wave); put(3, -0.2, 0.62, 0.15);
    this.c.setHex(CLOTHES[id % CLOTHES.length]);
    this.parts[0].setColorAt(i, this.c); this.parts[2].setColorAt(i, this.c); this.parts[3].setColorAt(i, this.c);
    this.parts[1].setColorAt(i, this.c.setHex(SKIN[(id * 7) % SKIN.length]));
  }
  end() { for (const p of this.parts) { p.count = this.n; p.instanceMatrix.needsUpdate = true; if (p.instanceColor) p.instanceColor.needsUpdate = true; } }
}

export function FloodRescue({ seed, startsAt, clock, onProgress, onStats }: GameProps) {
  const roofs = useMemo(() => rescueTown(seed), [seed]);
  const people = useMemo(() => rescueSchedule(seed, GAMES.rescue.seconds, roofs), [seed, roofs]);
  const storm = useMemo(() => rescueStorm(seed, GAMES.rescue.seconds, roofs), [seed, roofs]);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const steer = useSteer(box);
  const arena = useArena();
  const [hud, setHud] = useState({ fuel: 1, gust: 0, crates: CRATES, aboard: 0, saved: 0, lost: 0, pets: 0 });
  const dropAsk = useRef(false);
  const out = useRef({ arena, onProgress, onStats, clock, startsAt });
  useEffect(() => { out.current = { arena, onProgress, onStats, clock, startsAt }; });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const w = new World(el, { fov: 34, bg: 0x04060a, haze: [0x0a0f17, 0.016], glow: { strength: 0.85, radius: 0.55, threshold: 0.72 }, env: 0.3 });
    const board = new Board(w, 'side', 16, 9);
    const calm = calmMotion();

    // Night light: a cold sky glow, faint moonlight through the cloud, a flash for lightning.
    const hemi = new THREE.HemisphereLight(0x5b6c8c, 0x0b0d12, 0.6); w.scene.add(hemi);
    const moon = new THREE.DirectionalLight(0x9fb4d8, 0.45); moon.position.set(-20, 30, 25); w.scene.add(moon);
    const flashLight = new THREE.DirectionalLight(0xe4ecff, 0); flashLight.position.set(8, 40, 14); w.scene.add(flashLight);
    const sky = stormSky(520, 260); sky.mesh.position.set(0, 0, -170); w.scene.add(sky.mesh);

    // The far town: two rows of lit blocks standing in the flood, fading into the rain.
    const windows = facade();
    let r = seed % 997 + 3;
    const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    for (const [z, n, spread, low, high] of [[-36, 22, 90, -4, 6], [-78, 30, 170, -1, 13]] as const) {
      w.boxes(Array.from({ length: n }, (_, i) => {
        const wd = 3 + rnd() * 4, top = low + rnd() * (high - low);
        return { at: [-spread / 2 + (i + rnd() * 0.6) * (spread / n), (top - 20) / 2, z - rnd() * 8] as [number, number, number], size: [wd, top + 20, 3 + rnd() * 3] as [number, number, number] };
      }), windows, false, w.scene, { tile: 9 });
    }

    // The water: it mirrors the town and the helicopter (smaller mirror on phones).
    const water = new Water(new THREE.PlaneGeometry(420, 240), {
      textureWidth: w.phone ? 256 : 512, textureHeight: w.phone ? 256 : 512, waterNormals: waterNormals(), sunDirection: new THREE.Vector3(-0.4, 0.6, 0.5).normalize(),
      sunColor: 0x8fa6c8, waterColor: 0x10201c, distortionScale: 5, fog: true,
    });
    water.rotation.x = -Math.PI / 2; water.position.z = -90;
    // Murky flood water: a dimmer, rougher mirror than a clear lake.
    const wm = water.material as THREE.ShaderMaterial;
    wm.fragmentShader = wm.fragmentShader.replace('( vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight )', '( vec3( 0.015 ) + reflectionSample * 0.5 + reflectionSample * specularLight * 0.6 )');
    const wu = wm.uniforms;
    wu.size.value = 0.55;
    w.scene.add(water);
    // Rings, counts and the warning are markers, not things: they stay out of the reflection.
    const markers: THREE.Object3D[] = [], shown: boolean[] = [];
    const mirror = water.onBeforeRender.bind(water);
    water.onBeforeRender = (...args) => {
      markers.forEach((o, i) => { shown[i] = o.visible; o.visible = false; });
      mirror(...args);
      markers.forEach((o, i) => { o.visible = shown[i]; });
    };
    const rain = rainField(w.phone ? 900 : 2200, new THREE.Vector3(64, 36, 34), new THREE.Vector3(0, 4, 2));
    w.scene.add(rain.lines);

    // The play town, the hill and the hospital: laid out again whenever the box changes size.
    const tar = surface('asphalt', { color: 0x6b6b70, rough: 0.4 }), trim = surface('concrete', { color: 0x9a968e, rough: 0.6 });
    const grass = surface('grass', { color: 0x7d9a6a, rough: 0.7 }), bank = surface('grass', { color: 0x4f6446, rough: 0.8, bump: 2 });
    const hospitalMat = facade(true);
    hospitalMat.emissiveIntensity = 1.1;
    const crossMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3b3b).multiplyScalar(2.2) });
    const padMat = new THREE.MeshStandardMaterial({ map: padTexture(), roughness: 0.6, transparent: true });
    const padLights = Array.from({ length: 8 }, () => glowSprite(0xffffff, 0.5)), crossGlow = glowSprite(0xff4040, 3.2);
    const town = new THREE.Group(); w.scene.add(town);
    let pad = { x0: 0, x1: 0, top: 0 }, padAt = new THREE.Vector3(), unit = 0.03;
    const layout = () => {
      town.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
      town.clear();
      const W = board.W, H = board.H;
      unit = board.scale(W / 2, H / 2);
      const bodies: { at: [number, number, number]; size: [number, number, number] }[] = [], tops: typeof bodies = [], rims: typeof bodies = [];
      roofs.forEach((rf, k) => {
        const L = board.at(rf.x * W, rf.top * H), R = board.at((rf.x + rf.w) * W, rf.top * H), wd = R.x - L.x, cx = (L.x + R.x) / 2, y = L.y;
        bodies.push({ at: [cx, (y - 30) / 2, -1.1], size: [wd, y + 30, 3.4] });
        tops.push({ at: [cx, y + 0.03, -1.1], size: [wd + 0.08, 0.08, 3.48] });
        for (const [dx, dz, sx, sz] of [[0, 0.62, wd + 0.1, 0.1], [0, -2.82, wd + 0.1, 0.1], [-wd / 2, -1.1, 0.1, 3.5], [wd / 2, -1.1, 0.1, 3.5]] as const) rims.push({ at: [cx + dx, y + 0.18, dz], size: [sx, 0.3, sz] });
        if (k % 2 === 0) rims.push({ at: [cx + wd * 0.18, y + 0.45, -2.2], size: [wd * 0.34, 0.8, 0.9] });
      });
      w.boxes(bodies, windows, false, town, { tile: 9 });
      w.boxes(tops, tar, false, town, { tile: 3 });
      w.boxes(rims, trim, false, town, { tile: 2 });
      // The hill: the same outline as the flat game's, pushed back into the dark.
      pad = { x0: (HELIPAD.x - HELIPAD.w / 2) * W, x1: (HELIPAD.x + HELIPAD.w / 2) * W, top: HELIPAD.top * H };
      const P = (x: number, y: number) => board.at(x, y);
      const a = P(pad.x0 - W * 0.08, H * 1.2), cpt = P(pad.x0 - 10, pad.top - 4), b = P(pad.x0, pad.top), c = P(W * 1.15, pad.top), d = P(W * 1.15, H * 1.2);
      const shape = new THREE.Shape();
      shape.moveTo(a.x, a.y - 8); shape.lineTo(a.x, a.y); shape.quadraticCurveTo(cpt.x, cpt.y, b.x, b.y); shape.lineTo(c.x, c.y); shape.lineTo(d.x, d.y - 8); shape.closePath();
      const hill = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 18, bevelEnabled: false, curveSegments: 16 }).translate(0, 0, -14), [bank, grass]);
      worldUv(hill.geometry, 3);
      hill.receiveShadow = true; town.add(hill);
      padAt = P((pad.x0 + pad.x1) / 2, pad.top);
      const pr = (P(pad.x1, pad.top).x - P(pad.x0, pad.top).x) / 2;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(pr * 0.82, 40), padMat);
      disc.rotation.x = -Math.PI / 2; disc.position.set(padAt.x, padAt.y + 0.03, 0); disc.receiveShadow = true; town.add(disc);
      padLights.forEach((s, i) => { const t = (i / padLights.length) * Math.PI * 2; s.position.set(padAt.x + Math.cos(t) * pr * 0.92, padAt.y + 0.08, Math.sin(t) * pr * 0.92); town.add(s); });
      // The hospital behind the pad: white, lit, a red cross.
      const hw = Math.max(4, pr * 2.6), hh = 5.5;
      const hosp = new THREE.Mesh(worldUv(new THREE.BoxGeometry(hw, hh, 3), 6, [padAt.x + pr * 0.6, padAt.y + hh / 2, -6]), hospitalMat);
      hosp.position.set(padAt.x + pr * 0.6, padAt.y + hh / 2, -6); hosp.castShadow = hosp.receiveShadow = !w.phone; town.add(hosp);
      const cross = new THREE.Group();
      cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.3, 0.08), crossMat), new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.42, 0.08), crossMat));
      cross.position.set(hosp.position.x, padAt.y + hh + 0.9, -4.5); crossGlow.position.copy(cross.position); town.add(cross, crossGlow);
    };

    // The helicopter, the people, timer rings, crates and the bolt.
    const heli = helicopter(w.phone);
    w.scene.add(heli.g);
    const crowd = new People(40);
    w.scene.add(crowd.group);
    const dogMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.85 });
    const dogs = Array.from({ length: 8 }, () => {
      const d = new THREE.Group();
      const add = (g: THREE.BufferGeometry, at: [number, number, number]) => { const m = new THREE.Mesh(g, dogMat); m.position.set(...at); m.castShadow = true; d.add(m); };
      add(new THREE.BoxGeometry(0.5, 0.22, 0.2), [0, 0.3, 0]); add(new THREE.BoxGeometry(0.2, 0.2, 0.18), [0.3, 0.45, 0]);
      for (const x of [-0.18, 0.18]) for (const z of [-0.07, 0.07]) add(new THREE.BoxGeometry(0.06, 0.2, 0.06), [x, 0.1, z]);
      add(new THREE.BoxGeometry(0.2, 0.05, 0.05), [-0.32, 0.42, 0]);
      d.visible = false; w.scene.add(d); return d;
    });
    const rings = roofs.map(() => { const t = timerRing(); t.mesh.visible = false; w.scene.add(t.mesh); return t; });
    const counts = roofs.map(() => null as THREE.Sprite | null);
    const drop = (sp: THREE.Sprite) => { w.scene.remove(sp); sp.material.dispose(); markers.splice(markers.indexOf(sp), 1); };
    const warnIcon = label('⚡', { color: '#fde047', bg: 'rgba(120,53,15,0.85)' }); warnIcon.visible = false; w.scene.add(warnIcon);
    markers.push(warnIcon, ...rings.map((r2) => r2.mesh));
    const crateMat = surface('wood', { color: 0xc08a50 }), canopy = new THREE.MeshStandardMaterial({ map: canopyTexture(), roughness: 0.7, side: THREE.DoubleSide });
    const crates: { g: THREE.Group; used: boolean }[] = Array.from({ length: CRATES + 2 }, () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), crateMat));
      const chute = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), canopy); chute.position.y = 1.0; chute.scale.y = 0.6; g.add(chute);
      g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([-0.5, 0.5].flatMap((x) => [-0.4, 0.4].flatMap((z) => [new THREE.Vector3(x, 1.0, z), new THREE.Vector3(x * 0.4, 0.2, z * 0.4)]))), new THREE.LineBasicMaterial({ color: 0xe5e7eb })));
      g.visible = false; w.scene.add(g); return { g, used: false };
    });
    const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdbe7ff).multiplyScalar(3), transparent: true });
    const bolt = new THREE.Mesh(new THREE.BufferGeometry(), boltMat); bolt.visible = false; w.scene.add(bolt);
    const strikeGlow = glowSprite(0xdbe7ff, 6); strikeGlow.visible = false; w.scene.add(strikeGlow);

    // The round's state (the same as the flat game's: positions in the box's pixels).
    const s = {
      heli: { x: -1, y: 0, vx: 0, vy: 0 }, aboard: [] as (Stranded & { pickedAt: number })[], gone: new Set<number>(), cut: new Map<number, number>(), winch: 0, unload: 0,
      score: 0, saved: 0, pets: 0, trips: 0, lost: 0, reported: -1, fuel: FUEL_SECONDS, lowSaid: false, emptySaid: false, flash: 0, bolt: 0, nextStrike: 0, nextGust: 0,
      gust: null as null | { dir: number; until: number }, hudAt: 0, crates: CRATES, drops: [] as { x: number; y: number; vy: number; g: { g: THREE.Group; used: boolean } }[], helped: 0, face: 0,
    };
    const deadline = (p: Stranded) => p.at + p.ttl - (s.cut.get(p.id) ?? 0);
    const V = { a: new THREE.Vector3(), b: new THREE.Vector3() };
    const pop = (px: number, py: number, color: number, n: number, speedPx = 160, gravity = 10) => w.burst(board.at(px, py), color, calm ? Math.min(n, 3) : n, speedPx * unit, gravity);
    const say = (px: number, py: number, text: string, color: string) => w.say(text, board.at(px, py, V.a).clone(), color, 0.55);

    w.start((dt, now) => {
      if (board.fit()) layout();
      const W = board.W, H = board.H;
      if (!W) return;
      const { arena, onProgress, onStats, clock, startsAt } = out.current;
      const t = clock() - startsAt, hl = s.heli, time = t / 1000;
      if (hl.x < 0) { hl.x = HELIPAD.x * W; hl.y = HELIPAD.top * H - 70; }
      const waterPx = waterLevel(t, GAMES.rescue.seconds) * H;
      const roofPx = roofs.map((rf) => ({ x0: rf.x * W, x1: (rf.x + rf.w) * W, top: rf.top * H }));

      // Fuel: burns in the air, fills on the pad; an empty tank limps.
      const speed0 = Math.hypot(hl.vx, hl.vy);
      const onPad = hl.x > pad.x0 && hl.x < pad.x1 && hl.y > pad.top - 110 && hl.y < pad.top - 15 && speed0 < SLOW;
      s.fuel = onPad ? Math.min(FUEL_SECONDS, s.fuel + dt * 14) : Math.max(0, s.fuel - dt);
      if (onPad && s.crates < CRATES) s.crates = CRATES;
      if (s.fuel / FUEL_SECONDS < 0.25 && !s.lowSaid) { s.lowSaid = true; arena.announce('Low fuel! Land on the H', 'bad'); arena.sfx('alarm'); }
      if (s.fuel <= 0 && !s.emptySaid) { s.emptySaid = true; arena.announce('Out of fuel!', 'bad'); }
      if (s.fuel / FUEL_SECONDS > 0.6) { s.lowSaid = false; s.emptySaid = false; }
      // Gusts push it sideways.
      while (s.nextGust < storm.gusts.length && storm.gusts[s.nextGust].at <= t) {
        const gu = storm.gusts[s.nextGust++];
        s.gust = { dir: gu.dir, until: t + gu.dur };
        arena.announce(gu.dir > 0 ? 'Gust → hold on!' : '← Gust! hold on', 'pink'); arena.sfx('whoosh');
      }
      if (s.gust && t > s.gust.until) s.gust = null;
      if (s.gust) hl.vx += s.gust.dir * 300 * dt;
      steerBody(hl, steer.current, dt, s.fuel > 0 ? 420 : 150, { x0: 30, x1: W - 30, y0: 40, y1: waterPx - 26 });
      const speed = Math.hypot(hl.vx, hl.vy);

      // Lightning: a warning over a roof, then the strike takes time from everyone there.
      while (s.nextStrike < storm.strikes.length && storm.strikes[s.nextStrike].at <= t) {
        const st = storm.strikes[s.nextStrike++], rp = roofPx[st.roof];
        for (const p of people) if (p.roof === st.roof && p.at <= t && !s.gone.has(p.id)) s.cut.set(p.id, (s.cut.get(p.id) ?? 0) + Math.max(0, deadline(p) - t) * STRIKE_TAKES);
        const hit = board.at((rp.x0 + rp.x1) / 2, rp.top - 6);
        const pts: THREE.Vector3[] = [];
        let bx = hit.x + (Math.random() - 0.5) * 6;
        for (let y = 26; y > hit.y; y -= 1.4) { bx += (Math.random() - 0.5) * 1.6; pts.push(new THREE.Vector3(bx, y, hit.z - 2 + (Math.random() - 0.5))); }
        pts.push(hit.clone());
        bolt.geometry.dispose();
        bolt.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), pts.length * 3, 0.07, 5, false);
        bolt.visible = true; strikeGlow.visible = true; strikeGlow.position.copy(hit);
        sky.mat.uniforms.at.value.set(0.5 + hit.x / 520, 0.5 + hit.y / 260);
        s.bolt = 0.3; s.flash = 1; arena.sfx('thunder'); arena.shake(0.7); w.shake(calm ? 0 : 0.35);
        pop((rp.x0 + rp.x1) / 2, rp.top - 10, 0xfde68a, 18, 200);
      }
      const warn = storm.strikes[s.nextStrike];
      const warnRoof = warn && warn.at - t < STRIKE_WARN_MS ? warn.roof : -1;

      // Who's waiting now, and who was lost to the water or to time.
      const waiting = people.filter((p) => p.at <= t && !s.gone.has(p.id));
      for (const p of waiting) {
        if (t > deadline(p) || roofs[p.roof].top * H > waterPx) {
          s.gone.add(p.id); s.lost++;
          s.score = Math.max(0, s.score - RESCUE_LOST);
          const rp = roofPx[p.roof];
          say((rp.x0 + rp.x1) / 2, rp.top - 24, `−${RESCUE_LOST}`, '#f87171');
          pop((rp.x0 + rp.x1) / 2, rp.top, 0x7dd3fc, 10, 120);
          arena.sfx('wrong');
        }
      }

      // Winch: low and slow over a roof with someone on it.
      const over = roofPx.findIndex((rp) => hl.x > rp.x0 - 6 && hl.x < rp.x1 + 6 && hl.y > rp.top - 130 && hl.y < rp.top - 20);
      const here = over >= 0 ? waiting.filter((p) => p.roof === over && !s.gone.has(p.id)) : [];
      const winching = here.length > 0 && speed < SLOW && s.aboard.length < CAPACITY;
      let rising: Stranded | null = null;
      if (winching) {
        s.winch += dt;
        rising = here[0];
        if (s.winch >= WINCH_S) {
          const p = here[0];
          s.gone.add(p.id); s.aboard.push({ ...p, pickedAt: t }); s.winch = 0; rising = null;
          pop(hl.x, hl.y + 20, 0xffc0e6, 8, 90);
          arena.sfx('pick', s.aboard.length * 2);
          if (s.aboard.length === CAPACITY) arena.announce('Full! Fly to the hospital', 'gold');
          haptic('tap', false);
        }
      } else s.winch = Math.max(0, s.winch - dt * 2);

      // Supply crates: fall from the helicopter; on a roof they buy everyone there more time.
      if (dropAsk.current) {
        dropAsk.current = false;
        const free = crates.find((c) => !c.used);
        if (s.crates > 0 && free) { s.crates--; free.used = true; free.g.visible = true; s.drops.push({ x: hl.x, y: hl.y + 16, vy: hl.vy * 0.3, g: free }); arena.sfx('whoosh'); }
        else arena.announce('No crates: refill on the H', 'pink');
      }
      for (let k = s.drops.length - 1; k >= 0; k--) {
        const d = s.drops[k];
        d.vy += 900 * dt; d.y += d.vy * dt;
        d.g.g.position.copy(board.at(d.x, d.y, V.a)); d.g.g.scale.setScalar(unit * 44); d.g.g.rotation.z = Math.sin(time * 3 + k) * 0.12;
        const ri = roofPx.findIndex((rp) => d.x > rp.x0 && d.x < rp.x1 && d.y >= rp.top - 6 && d.y - d.vy * dt < rp.top);
        const done = (here2: boolean) => { d.g.used = false; d.g.g.visible = false; s.drops.splice(k, 1); return here2; };
        if (ri >= 0) {
          const there = people.filter((p) => p.roof === ri && p.at <= t && !s.gone.has(p.id));
          for (const p of there) s.cut.set(p.id, (s.cut.get(p.id) ?? 0) - CRATE_MS);
          s.score += CRATE_PTS * there.length; s.helped += there.length;
          say(d.x, roofPx[ri].top - 30, there.length ? `+${CRATE_MS / 1000}s ×${there.length}` : 'No one here', there.length ? '#fde68a' : '#cbd5e1');
          pop(d.x, roofPx[ri].top - 4, 0xf59e0b, 10, 110);
          arena.sfx(there.length ? 'coin' : 'land', there.length);
          done(true);
        } else if (d.y > waterPx) { pop(d.x, waterPx, 0x7dd3fc, 10, 120); arena.sfx('splash'); done(false); }
      }

      // Land at the hospital: everyone aboard gets off, one by one.
      if (onPad && s.aboard.length) {
        s.unload += dt;
        if (s.unload >= UNLOAD_S) {
          const p = s.aboard.shift()!;
          const pts = rescuePoints(p.pickedAt - p.at, p.ttl, p.pet);
          s.score += pts; s.saved++; s.unload = 0;
          if (p.pet) { s.pets++; say(hl.x + 20, hl.y - 44, '🐕 +50', '#fde68a'); }
          if (!s.aboard.length) s.trips++;
          say(hl.x, hl.y - 26, `+${pts}`, '#86efac');
          pop(hl.x, pad.top, 0x86efac, 12);
          arena.sfx('right', s.saved % 10);
          if (s.saved % 10 === 0) arena.announce(`${s.saved} people rescued!`, 'good');
          haptic('tap', false);
        }
      } else s.unload = 0;
      if (s.score !== s.reported) {
        s.reported = s.score; onProgress(s.score, s.saved);
        onStats?.([{ label: 'Rescued', value: String(s.saved) }, { label: 'Lost', value: String(s.lost) }, { label: 'Pets saved', value: String(s.pets) }, { label: 'Trips', value: String(s.trips) }, { label: 'Helped by crates', value: String(s.helped) }]);
      }
      if (t - s.hudAt > 200) {
        s.hudAt = t;
        const next = { fuel: Math.round((s.fuel / FUEL_SECONDS) * 50) / 50, gust: s.gust ? s.gust.dir : 0, crates: s.crates, aboard: s.aboard.length, saved: s.saved, lost: s.lost, pets: s.pets };
        setHud((p) => (Object.keys(next) as (keyof typeof next)[]).every((key) => p[key] === next[key]) ? p : next);
      }

      // ── The picture ──
      // Water rises; the storm rolls; rain slants harder in a gust.
      water.position.y = board.at(W / 2, waterPx, V.a).y;
      wu.time.value = now * 0.55;
      sky.mat.uniforms.time.value = now;
      rain.mat.uniforms.time.value = now;
      rain.mat.uniforms.wind.value = s.gust ? s.gust.dir * 16 : -5;
      // Lightning: the bolt fades, the flash lights the clouds, the town and the water.
      s.flash = Math.max(0, s.flash - dt * 2.4);
      s.bolt = Math.max(0, s.bolt - dt);
      bolt.visible = strikeGlow.visible = s.bolt > 0;
      boltMat.opacity = Math.min(1, s.bolt * 6);
      sky.mat.uniforms.flash.value = s.flash;
      flashLight.intensity = s.flash * 4.5; hemi.intensity = 0.6 + s.flash * 1.4;
      // The pad's lights pulse green while it's helping.
      const glow = onPad && (s.aboard.length > 0 || s.fuel < FUEL_SECONDS);
      padLights.forEach((p, i) => { (p.material as THREE.SpriteMaterial).color.setHex(glow ? 0x4ade80 : (Math.floor(now * 2) + i) % 2 ? 0xfacc15 : 0xffffff); p.scale.setScalar(glow ? 0.7 : 0.45); });
      // People on the roofs (up to three shown, a count above more), the wait ring, the warning.
      crowd.begin();
      dogs.forEach((d) => { d.visible = false; });
      let dogN = 0;
      roofs.forEach((_, k) => {
        const rp = roofPx[k], on = waiting.filter((x) => x.roof === k && !s.gone.has(x.id)), mid = (rp.x0 + rp.x1) / 2;
        on.slice(0, 3).forEach((x, n) => {
          const px = mid + (n - (Math.min(3, on.length) - 1) / 2) * 16;
          if (x === rising) return;
          const at = board.at(px, rp.top, V.a);
          crowd.add(at, unit * 26, calm ? 0 : Math.sin(time * 7 + x.id) * 0.45, x.id);
          if (x.pet && dogN < dogs.length) { const d = dogs[dogN++]; d.visible = true; d.position.set(at.x + unit * 11, at.y, 0.25); d.scale.setScalar(unit * 22); }
        });
        const ring = rings[k];
        ring.mesh.visible = on.length > 0;
        if (on.length) {
          const left = Math.max(0, (deadline(on[0]) - t) / on[0].ttl);
          ring.mat.uniforms.left.value = left; ring.mat.uniforms.color.value.setHex(left > 0.5 ? 0x4ade80 : left > 0.25 ? 0xfbbf24 : 0xf87171);
          ring.mesh.position.copy(board.at(mid, rp.top - 52, V.a)); ring.mesh.scale.setScalar(unit * 24); ring.mesh.quaternion.copy(w.camera.quaternion);
        }
        if (on.length > 1) {
          if (!counts[k] || counts[k]!.userData.n !== on.length) { if (counts[k]) drop(counts[k]!); counts[k] = label(String(on.length)); counts[k]!.userData.n = on.length; w.scene.add(counts[k]!); markers.push(counts[k]!); }
          counts[k]!.position.copy(board.at(mid, rp.top - 52, V.a)); counts[k]!.scale.setScalar(unit * 15);
        } else if (counts[k]) { drop(counts[k]!); counts[k] = null; }
      });
      warnIcon.visible = warnRoof >= 0 && Math.floor(time * 6) % 2 === 0;
      if (warnRoof >= 0) { const rp = roofPx[warnRoof]; warnIcon.position.copy(board.at((rp.x0 + rp.x1) / 2, rp.top - 86, V.a)); warnIcon.scale.setScalar(unit * 30); }

      // The helicopter: turns to face its way, dips its nose with speed, sputters on an empty tank.
      const want = hl.vx > 40 ? 0 : hl.vx < -40 ? Math.PI : s.face;
      s.face += (want - s.face) * (1 - Math.exp(-6 * dt));
      const at = board.at(hl.x, hl.y + (s.fuel <= 0 && !calm ? Math.sin(time * 9) * 3 : 0), V.b);
      heli.g.position.copy(at);
      heli.g.scale.setScalar((unit * 88) / 2.6);
      heli.g.rotation.y = s.face;
      const fwd = hl.vx * Math.cos(s.face);
      heli.tip.rotation.z = Math.max(-0.32, Math.min(0.32, -fwd / 1300));
      heli.tip.rotation.x = Math.max(-0.2, Math.min(0.2, hl.vy / 2400));
      heli.rotor.rotation.y += dt * (s.fuel > 0 ? 34 : 12);
      heli.tail.rotation.z += dt * (s.fuel > 0 ? 60 : 20);
      (heli.blur.material as THREE.MeshBasicMaterial).opacity = s.fuel > 0 ? 0.16 : 0.07;
      heli.strobe.visible = Math.floor(now * 1.6) % 2 === 0 && (now * 1.6) % 1 < 0.12;
      // The searchlight sweeps a little; the winch line goes down to whoever is coming up.
      heli.lamp.target.position.set(0.7 + Math.sin(now * 0.9) * 0.6, -6, 0);
      heli.beam.mesh.lookAt(heli.lamp.target.getWorldPosition(V.a));
      heli.line.visible = winching && over >= 0;
      if (heli.line.visible) {
        const rp = roofPx[over], k = Math.min(1, s.winch / WINCH_S);
        const roofTop = board.at(hl.x, rp.top, V.a).y;
        const reach = (at.y - roofTop) / heli.g.scale.x;
        heli.line.scale.y = Math.max(0.1, reach * (0.25 + 0.75 * Math.min(1, k * 2.2)) - 0.3);
        if (rising) {
          // The person comes up the line, swinging a little.
          const y = roofTop + (at.y - roofTop - unit * 30) * Math.max(0, (k - 0.35) / 0.65);
          crowd.add(V.a.set(at.x + Math.sin(now * 5) * unit * 2, y, 0.3), unit * 26, 2.4, rising.id, Math.sin(now * 4) * 0.12);
        }
      }
      crowd.end();
      // Spray kicked up off the water under a low helicopter.
      if (waterPx - hl.y < 120 && !calm && Math.random() < dt * 30) pop(hl.x + (Math.random() - 0.5) * 50, waterPx, 0xdbeafe, 2, 110, 6);
    });

    // D (or the Drop button) lets a crate go.
    const key = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey) dropAsk.current = true; };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); w.dispose(); };
  }, [seed, roofs, people, storm, steer]);

  return (
    <div className="mx-auto w-full">
      <div ref={box} className="relative h-[var(--play-h)] min-h-80 w-full touch-none select-none overflow-hidden rounded-[1.75rem] bg-black ring-1 ring-white/10">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" role="img" aria-label="Flood Rescue: a flooded town at night with people on rooftops and a hospital on a hill. Steer the helicopter with the mouse, a finger or the arrow keys." />
        <div className="pointer-events-none absolute start-3 top-3 hidden flex-wrap gap-2 md:flex">
          <HudChip label="Aboard" value={`${hud.aboard}/${CAPACITY}`} tone={hud.aboard === CAPACITY ? 'gold' : 'white'} />
          <HudChip label="Saved" value={hud.saved} tone="good" />
          <HudChip label="Lost" value={hud.lost} tone={hud.lost ? 'bad' : 'white'} />
          <HudChip label="Pets" value={hud.pets} tone="gold" />
        </div>
        <p className="pointer-events-none absolute start-3 top-[4.25rem] rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/15 md:hidden">
          <span className={hud.aboard === CAPACITY ? 'text-amber-300' : ''}>{hud.aboard}/{CAPACITY} aboard</span> · <span className="text-emerald-300">{hud.saved} saved</span> · <span className={hud.lost ? 'text-red-300' : ''}>{hud.lost} lost</span> · {hud.pets} pets
        </p>
        <button type="button" onClick={() => { dropAsk.current = true; }} disabled={!hud.crates}
          className="absolute bottom-4 end-4 z-10 inline-flex h-12 items-center gap-1.5 rounded-full bg-amber-300 px-4 text-sm font-black text-amber-950 shadow-[0_5px_0_rgba(0,0,0,0.35)] active:translate-y-1 active:shadow-none disabled:opacity-40">
          <Package className="h-4 w-4" aria-hidden />Drop ×{hud.crates}<kbd className="hidden rounded bg-black/15 px-1 text-[11px] font-medium [@media(pointer:fine)]:inline">D</kbd>
        </button>
        <div className="pointer-events-none absolute end-3 top-3 flex items-center gap-2">
          {hud.gust !== 0 && <span className="inline-flex items-center gap-1 rounded-full bg-sky-300 px-3 py-1 text-xs font-black text-sky-950"><Wind className="h-3.5 w-3.5" aria-hidden />Gust</span>}
          <div className="w-36 rounded-2xl bg-black/60 px-3 py-2 ring-1 ring-white/15">
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300"><Fuel className="h-3.5 w-3.5" aria-hidden />Fuel {Math.round(hud.fuel * 100)}%</p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"><div className={cn('h-full w-full origin-left rounded-full transition-transform duration-200 rtl:origin-right', hud.fuel > 0.25 ? 'bg-amber-300' : 'bg-red-500')} style={{ transform: `scaleX(${hud.fuel})` }} /></div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-zinc-400">Hover low and slow over a roof to winch people up · land on the H to drop them off, refuel and reload · D drops a crate on a roof (+6 s for everyone there) · ⚡ marks where lightning will strike.</p>
    </div>
  );
}
