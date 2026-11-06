'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Fish, Recycle, Sprout, Wind } from 'lucide-react';
import { GAMES } from '@/lib/play';
import {
  REEF_AIR_S, REEF_ALL, REEF_CUT_S, REEF_GRAB, REEF_HALF, REEF_LITTER, REEF_NETS, REEF_PER_SECOND, REEF_PIECE, REEF_PLANT, REEF_REACH, REEF_SPOTS, REEF_STING, REEF_STING_R, REEF_SURFACE, REEF_TURTLE,
  jellyAt, reefFloor, reefLayout,
} from '@/lib/play/reef';
import { cn } from '@/lib/utils';
import { useArena } from './arena';
import { lookHex, readLook } from './look';
import type { GameProps } from './game-props';
import { Controls, THREE, World, approach, follow, glowSprite, mergeGeometries } from './world/core';
import { Crowd } from './world/crowd';
import { lightBeam } from './world/nature';
import { bag, bottle, can, part, turtle, whole } from './world/props';
import { surface } from './world/textures';
import { HudChip, WorldFrame } from './world/Stage';

// Reef Rescue (UniVerse Play M105, a Green 3D world; rules in src/lib/play/reef.ts): dive a coral reef
// in trouble. Carry coral from the nursery to the bleached patches and plant it, cut turtles free from
// ghost nets, collect the plastic, keep clear of the jellyfish, and come up for air. Sunlight dances on
// the sand (caustics), shafts of light come down from the surface, sea grass sways, fish school round
// the reef. In a room, the others dive beside you.

const CORAL_HUES = [0xff6f61, 0xb45ad6, 0xffb347, 0x3cc6b8, 0xff8fb8, 0xf2d04b];

/** Sand with sunlight rippling across it (caustics added to the light, moving). */
function causticSand() {
  const mat = surface('sand', { color: 0xd9c9a0, rough: 0.95 });
  const u = { time: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = `varying vec3 vSea;\n${sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSea = (modelMatrix * vec4(transformed, 1.0)).xyz;')}`;
    sh.fragmentShader = `uniform float time; varying vec3 vSea;
      float caustic(vec2 p, float t) {
        vec2 q = p * 0.42; float c = 0.0;
        for (int i = 0; i < 3; i++) { q += vec2(sin(q.y * 1.6 + t * 0.8 + float(i) * 1.3), cos(q.x * 1.4 - t * 0.65 + float(i) * 2.1)) * 0.55; c += abs(sin(q.x + q.y)); }
        return pow(max(0.0, 1.0 - c / 3.0), 3.0);
      }
      ${sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.75, 0.95, 1.0) * caustic(vSea.xz, time) * 0.9;')}`;
  };
  return { mat, u };
}

/** The surface seen from below: bright straight up (the window to the sky), dimmer round it, rippling. */
function surfaceFromBelow() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: false, transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float time; varying vec3 vW;
      void main() {
        vec3 v = normalize(vW - cameraPosition);
        float up = max(0.0, v.y);
        float ripple = sin(vW.x * 0.7 + time * 1.3) * sin(vW.z * 0.6 - time * 1.1) * 0.5 + 0.5;
        vec3 deep = vec3(0.05, 0.32, 0.38), bright = vec3(0.75, 0.98, 1.0);
        vec3 c = mix(deep, bright, pow(up, 6.0)) + ripple * 0.08 * up;
        gl_FragColor = vec4(c, 0.92);
        #include <colorspace_fragment>
      }`,
  });
  return mat;
}

/** Living coral for the look of the reef, merged into one mesh: branches, brain coral, sea fans, tubes. */
function coralGeo(list: ReturnType<typeof reefLayout>['corals'], bleached = false) {
  const parts: THREE.BufferGeometry[] = [];
  for (const c of list) {
    const y = reefFloor(c.x, c.z), col = bleached ? 0xe9e4da : CORAL_HUES[c.hue], s = c.size;
    if (c.kind === 'branch') for (let b = 0; b < 5; b++) { const a = (b / 5) * Math.PI * 2 + c.x; parts.push(part(new THREE.CylinderGeometry(0.05 * s, 0.09 * s, 1.1 * s, 6).translate(0, 0.55 * s, 0), col, [c.x + Math.cos(a) * 0.18 * s, y, c.z + Math.sin(a) * 0.18 * s], [Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35])); }
    if (c.kind === 'brain') { const g = new THREE.IcosahedronGeometry(0.6 * s, 3), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); v.multiplyScalar(1 + Math.sin(v.x * 14 + Math.sin(v.z * 9) * 2) * 0.04); p.setXYZ(i, v.x, Math.max(0, v.y) * 0.75, v.z); } g.computeVertexNormals(); parts.push(part(g, col, [c.x, y - 0.05, c.z])); }
    if (c.kind === 'fan') parts.push(part(new THREE.CircleGeometry(0.8 * s, 14, 0, Math.PI), col, [c.x, y, c.z], [0, c.x * 3, 0]));
    if (c.kind === 'tube') for (let b = 0; b < 4; b++) parts.push(part(new THREE.CylinderGeometry(0.12 * s, 0.1 * s, (0.6 + b * 0.2) * s, 10, 1, true).translate(0, (0.3 + b * 0.1) * s, 0), col, [c.x + (b % 2) * 0.22 * s, y, c.z + Math.floor(b / 2) * 0.22 * s]));
  }
  return whole(parts);
}

/** A coral fragment (carried, then planted to grow). */
const sprig = (hue: number) => whole(Array.from({ length: 4 }, (_, b) => { const a = (b / 4) * Math.PI * 2; return part(new THREE.CylinderGeometry(0.035, 0.06, 0.6, 6).translate(0, 0.3, 0), CORAL_HUES[hue], [Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08], [Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4]); }));

/** A diver: a black wetsuit with pink stripes, a mask, a yellow tank, fins that kick. Head toward −z. */
function diver(color: number) {
  const g = new THREE.Group(), suit = new THREE.MeshStandardMaterial({ color: 0x16161a, roughness: 0.55 }), skin = new THREE.MeshStandardMaterial({ color: 0xd9a77e, roughness: 0.6 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, at: [number, number, number], rot: [number, number, number] = [0, 0, 0], parent: THREE.Object3D = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(...at); m.rotation.set(...rot); m.castShadow = true; parent.add(m); return m; };
  add(new THREE.CapsuleGeometry(0.22, 0.7, 6, 12), suit, [0, 0, 0], [Math.PI / 2, 0, 0]);
  add(new THREE.CapsuleGeometry(0.225, 0.2, 4, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }), [0, 0, -0.05], [Math.PI / 2, 0, 0]);
  add(new THREE.SphereGeometry(0.17, 14, 10), skin, [0, 0.08, -0.62]);
  add(new THREE.BoxGeometry(0.26, 0.11, 0.08), new THREE.MeshPhysicalMaterial({ color: 0x0b1622, roughness: 0.05, clearcoat: 1 }), [0, 0.1, -0.76]);
  add(new THREE.CapsuleGeometry(0.11, 0.42, 4, 10), new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35, metalness: 0.3 }), [0, 0.27, 0.02], [Math.PI / 2, 0, 0]);
  const fins = [-0.11, 0.11].map((x) => {
    const leg = new THREE.Group(); leg.position.set(x, -0.02, 0.45); g.add(leg);
    add(new THREE.CapsuleGeometry(0.08, 0.45, 4, 8), suit, [0, 0, 0.25], [Math.PI / 2, 0, 0], leg);
    add(new THREE.BoxGeometry(0.2, 0.02, 0.36), new THREE.MeshStandardMaterial({ color: 0xfe81d1, roughness: 0.5 }), [0, 0, 0.62], [0, 0, 0], leg);
    return leg;
  });
  const hand = new THREE.Group(); hand.position.set(0.28, -0.1, -0.5); g.add(hand);
  add(new THREE.CapsuleGeometry(0.06, 0.45, 4, 8), suit, [0.24, -0.05, -0.3], [Math.PI / 2.4, 0, -0.3]);
  add(new THREE.CapsuleGeometry(0.06, 0.45, 4, 8), suit, [-0.24, -0.05, -0.3], [Math.PI / 2.4, 0, 0.3]);
  return { g, fins, hand };
}

export function ReefRescue({ seed, endsAt, clock, onProgress, onDone, onStats, net }: GameProps) {
  const reef = useMemo(() => reefLayout(seed), [seed]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const controls = useRef<Controls | null>(null);
  const arena = useArena();
  const [hud, setHud] = useState({ air: 100, planted: 0, freed: 0, plastic: 0, carrying: false, prompt: '', cut: 0, others: 0, stung: false });
  const out = useRef({ arena, onProgress, onDone, onStats, clock, endsAt, net });
  useEffect(() => { out.current = { arena, onProgress, onDone, onStats, clock, endsAt, net }; });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const w = new World(el, { fov: 68, bg: 0x0b4a5c, haze: [0x0c5568, 0.034], glow: { strength: 0.65, radius: 0.6, threshold: 0.78 }, env: 0.5, ao: 0.45 });
    const crowd = new Crowd(w, () => out.current.net);
    const c = new Controls(el, { pitch: [-1.3, 1.1] });
    controls.current = c;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Light from above, tinted by the water.
    w.lights({ sky: 0xa8f0ff, ground: 0x1d4a4a, sun: 0xdffaff, power: 2.1, at: [8, 40, 6], ambient: 0.85 });
    // The sea floor, the surface above, shafts of light, marine snow.
    const sand = causticSand();
    const floorGeo = new THREE.PlaneGeometry(REEF_HALF * 2 + 60, REEF_HALF * 2 + 60, 120, 120).rotateX(-Math.PI / 2);
    const fp = floorGeo.attributes.position, fuv = floorGeo.attributes.uv;
    for (let i = 0; i < fp.count; i++) { fp.setY(i, reefFloor(fp.getX(i), fp.getZ(i))); fuv.setXY(i, fp.getX(i) / 4, fp.getZ(i) / 4); }
    floorGeo.computeVertexNormals();
    const floor = new THREE.Mesh(floorGeo, sand.mat); floor.receiveShadow = true; w.scene.add(floor);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(500, 500).rotateX(Math.PI / 2), surfaceFromBelow()); top.position.y = REEF_SURFACE; w.scene.add(top);
    const shafts = Array.from({ length: w.phone ? 4 : 8 }, (_, i) => { const b = lightBeam(26, 0.12, 0xcffcff); b.mat.uniforms.power.value = 0.05; b.mesh.position.set(Math.sin(i * 2.4) * 22, REEF_SURFACE, Math.cos(i * 1.7) * 22); b.mesh.lookAt(b.mesh.position.x + 6, 0, b.mesh.position.z + 3); w.scene.add(b.mesh); return b; });
    const SNOW = 700, snowPos = new Float32Array(SNOW * 3);
    for (let i = 0; i < SNOW; i++) snowPos.set([(Math.random() - 0.5) * 40, Math.random() * REEF_SURFACE, (Math.random() - 0.5) * 40], i * 3);
    const snow = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(snowPos, 3)), new THREE.PointsMaterial({ color: 0xdff6ff, size: 0.06, transparent: true, opacity: 0.6, depthWrite: false }));
    snow.frustumCulled = false; w.scene.add(snow);
    // Rocks and the living reef.
    const rockGeos = reef.rocks.map((rk, i) => { const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position; for (let k = 0; k < p.count; k++) { const v = new THREE.Vector3().fromBufferAttribute(p, k); const n = 1 + Math.sin(v.x * 3 + i) * 0.12 + Math.sin(v.y * 4 + v.z * 3) * 0.1; p.setXYZ(k, v.x * n, v.y * n, v.z * n); } g.computeVertexNormals(); return g.scale(rk.r, rk.h, rk.r * 0.9).translate(rk.x, reefFloor(rk.x, rk.z) + rk.h * 0.35, rk.z); });
    const rocks = new THREE.Mesh(mergeGeometries(rockGeos), surface('rock', { color: 0xa3aea6 })); rocks.castShadow = rocks.receiveShadow = true; w.scene.add(rocks);
    const living = new THREE.Mesh(coralGeo(reef.corals), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide })); living.castShadow = true; w.scene.add(living);
    // Sea grass in patches, swaying (moved on the graphics chip).
    const BLADES = w.phone ? 260 : 600;
    const grassU = { time: { value: 0 } };
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x3f8a4a, roughness: 0.7, side: THREE.DoubleSide });
    grassMat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, grassU); sh.vertexShader = `uniform float time;\n${sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 wp = instanceMatrix * vec4(transformed, 1.0); transformed.x += sin(time * 1.4 + wp.x * 0.7 + wp.z * 0.5) * position.y * position.y * 0.25;')}`; };
    const blades = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 1.4, 1, 4).translate(0, 0.7, 0), grassMat, BLADES);
    const gr = (k: number) => { const v = Math.sin(seed * 0.3 + k * 12.9898) * 43758.5453; return v - Math.floor(v); };
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
    for (let i = 0; i < BLADES; i++) {
      const patch = Math.floor(gr(i) * 9), a = gr(i * 3) * Math.PI * 2, d = gr(i * 7) * 3.5;
      const x = Math.sin(patch * 2.3 + seed) * 32 + Math.cos(a) * d, z = Math.cos(patch * 1.9 + seed) * 32 + Math.sin(a) * d;
      M.compose(P.set(x, reefFloor(x, z), z), Q.setFromEuler(E.set(0, gr(i * 5) * 6.28, 0)), S.set(1, 0.6 + gr(i * 11) * 0.9, 1)); blades.setMatrixAt(i, M);
    }
    w.scene.add(blades);
    // Fish: three schools circling the reef (one instanced mesh, a colour per school).
    const FISH = 72;
    const fishGeo = whole([part(new THREE.SphereGeometry(0.5, 10, 6), 0xffffff, [0, 0, 0], [0, 0, 0], [0.12, 0.2, 0.5]), part(new THREE.ConeGeometry(0.14, 0.22, 4), 0xffffff, [0, 0, 0.32], [-Math.PI / 2, 0, 0], [1, 1, 0.25])]);
    const fish = new THREE.InstancedMesh(fishGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3 }), FISH);
    fish.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fish.frustumCulled = false;
    const SCHOOL = [0xfacc15, 0x60a5fa, 0xe5e7eb];
    for (let i = 0; i < FISH; i++) fish.setColorAt(i, new THREE.Color(SCHOOL[i % 3]));
    w.scene.add(fish);
    // The nursery: a white frame of pipes with coral fragments hanging, a glow so it's found.
    const nursery = new THREE.Group(); nursery.position.set(reef.nursery.x, reefFloor(reef.nursery.x, reef.nursery.z), reef.nursery.z); w.scene.add(nursery);
    const pipe = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 });
    for (const [x, y, z, l, r] of [[-1.5, 1, 0, 2, 0], [1.5, 1, 0, 2, 0], [0, 2, 0, 3, Math.PI / 2], [0, 1.2, 0, 3, Math.PI / 2]] as const) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, l, 8), pipe); m.position.set(x, y, z); m.rotation.z = r; nursery.add(m); }
    for (let k = 0; k < 6; k++) { const s2 = new THREE.Mesh(sprig(k % 6), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })); s2.position.set(-1.2 + k * 0.48, k % 2 ? 1.25 : 2.05, 0); s2.rotation.x = Math.PI; nursery.add(s2); }
    const nurseryGlow = glowSprite(0x5eead4, 5); nurseryGlow.position.y = 1.6; nursery.add(nurseryGlow);
    // The bleached patches (white skeletons and a ring) and the coral that grows when planted.
    const sprigMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
    const spots = reef.spots.map((sp, i) => {
      const y = reefFloor(sp.x, sp.z);
      const dead = new THREE.Mesh(coralGeo([{ x: sp.x, z: sp.z, kind: 'branch', size: 1.2, hue: 0 }, { x: sp.x + 0.8, z: sp.z + 0.4, kind: 'brain', size: 0.7, hue: 0 }], true), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
      w.scene.add(dead);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.75, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.55, depthWrite: false }));
      ring.position.set(sp.x, y + 0.15, sp.z); w.scene.add(ring);
      const grow = new THREE.Group(); grow.position.set(sp.x - 0.3, y, sp.z - 0.4); grow.visible = false; w.scene.add(grow);
      for (let k = 0; k < 5; k++) { const g2 = new THREE.Mesh(sprig((i + k) % 6), sprigMat); g2.position.set(Math.cos(k * 1.3) * 0.45, 0, Math.sin(k * 1.3) * 0.45); g2.scale.setScalar(1.6); grow.add(g2); }
      return { ...sp, y, ring, grow, done: false, at: 0 };
    });
    // Ghost nets with a turtle caught in each.
    const turtleGeo = turtle(), tMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    const nets = reef.nets.map((n) => {
      const y = reefFloor(n.x, n.z) + 1.4;
      const t = new THREE.Mesh(turtleGeo, tMat); t.scale.setScalar(2.2); t.position.set(n.x, y, n.z); t.rotation.y = n.turn; w.scene.add(t);
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k < 9; k++) for (let j = 0; j < 9; j++) {
        const a = (k / 8) * Math.PI, b = (j / 8) * Math.PI;
        const p1 = new THREE.Vector3(Math.cos(a) * Math.sin(b) * 1.8, Math.cos(b) * 1.4, Math.sin(a) * Math.sin(b) * 1.8);
        const p2 = new THREE.Vector3(Math.cos(a + Math.PI / 8) * Math.sin(b) * 1.8, Math.cos(b) * 1.4, Math.sin(a + Math.PI / 8) * Math.sin(b) * 1.8);
        pts.push(p1, p2);
        if (j < 8) pts.push(p1, new THREE.Vector3(Math.cos(a) * Math.sin(b + Math.PI / 8) * 1.8, Math.cos(b + Math.PI / 8) * 1.4, Math.sin(a) * Math.sin(b + Math.PI / 8) * 1.8));
      }
      const mesh = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8fb39a, transparent: true, opacity: 0.9 }));
      mesh.position.set(n.x, y - 0.4, n.z); mesh.rotation.y = n.turn; w.scene.add(mesh);
      return { ...n, y, turtle: t, net: mesh, cut: 0, freed: false, at: 0 };
    });
    // Plastic on the floor and drifting.
    const litterGeo = { bottle: bottle(), can: can(), bag: bag(0xe2e8f0) }, litterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 });
    const litter = reef.litter.map((l) => { const m = new THREE.Mesh(litterGeo[l.kind], litterMat); const y = l.y < 1 ? reefFloor(l.x, l.z) + 0.1 : l.y; m.position.set(l.x, y, l.z); m.rotation.set(0, l.turn, l.y < 1 ? 0 : 0.6); m.scale.setScalar(1.6); w.scene.add(m); return { ...l, y, m, got: false }; });
    // Jellyfish: a glowing bell and trailing tentacles.
    const bellMat = new THREE.MeshPhysicalMaterial({ color: 0xffb3e0, emissive: 0xff5cc8, emissiveIntensity: 0.45, roughness: 0.2, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    const tentacles = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return Array.from({ length: 6 }, (__, k) => new THREE.Vector3(Math.cos(a) * 0.3 + Math.sin(k + i) * 0.05, -k * 0.25, Math.sin(a) * 0.3)); }).flatMap((line) => line.slice(1).flatMap((p, k) => [line[k], p])));
    const jellies = reef.jellies.map((j) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), bellMat), new THREE.LineSegments(tentacles, new THREE.LineBasicMaterial({ color: 0xffc6e8, transparent: true, opacity: 0.7 })));
      g.add(glowSprite(0xff7ad9, 1.6)); w.scene.add(g); return { j, g };
    });
    // The diver.
    const look = readLook(), me = diver(lookHex(look));
    w.scene.add(me.g);
    const carried = new THREE.Mesh(sprig(2), sprigMat); carried.visible = false; me.hand.add(carried);
    const pos = new THREE.Vector3(reef.nursery.x, 4, reef.nursery.z + 8), vel = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), want = new THREE.Vector3();
    let air = 100, gasping = false, stun = 0, score = 0, planted = 0, freed = 0, plastic = 0, carrying = false, done = false, kick = 0, hudAt = 0;
    const report = () => {
      out.current.onProgress(score, planted + freed + plastic);
      out.current.onStats?.([{ label: 'Coral planted', value: `${planted} of ${REEF_SPOTS}` }, { label: 'Turtles freed', value: `${freed} of ${REEF_NETS}` }, { label: 'Plastic collected', value: `${plastic} of ${REEF_LITTER}` }]);
    };
    report();
    const finishIfDone = () => {
      if (done || planted < REEF_SPOTS || freed < REEF_NETS || plastic < REEF_LITTER) return;
      done = true;
      const left = Math.max(0, Math.round((out.current.endsAt - out.current.clock()) / 1000));
      score += REEF_ALL + left * REEF_PER_SECOND; report();
      out.current.arena.announce('The reef is alive again!', 'gold'); out.current.arena.sfx('win');
      setTimeout(() => out.current.onDone(score, planted + freed + plastic), 1800);
    };

    w.camera.position.set(pos.x, pos.y + 2, pos.z + 6);
    w.flyIn(new THREE.Vector3(pos.x + 10, REEF_SURFACE - 1, pos.z + 22), 2);
    w.start((dt, t) => {
      sand.u.time.value = t; grassU.time.value = t; (top.material as THREE.ShaderMaterial).uniforms.time.value = t;
      shafts.forEach((b, i) => { b.mat.uniforms.time.value = t; b.mat.uniforms.power.value = 0.04 + Math.sin(t * 0.3 + i) * 0.015; });
      // Swimming: forward along where you look (up and down too), sideways flat; Space/Q up, C down.
      const k = c.keys, f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) - c.stick.y;
      const r2 = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + c.stick.x;
      const up = (k.has(' ') || c.held.has('skill') ? 1 : 0) - (k.has('c') || k.has('control') || c.held.has('crouch') ? 1 : 0);
      fwd.set(-Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), -Math.cos(c.yaw) * Math.cos(c.pitch));
      right.set(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
      want.set(0, 0, 0).addScaledVector(fwd, f).addScaledVector(right, r2);
      want.y += up;
      if (want.lengthSq() > 1) want.normalize();
      const speed = (c.running ? 7.5 : 4.6) * (stun > 0 ? 0.4 : 1);
      want.multiplyScalar(speed);
      if (gasping) want.set(0, 6, 0);
      vel.x = approach(vel.x, want.x, 3, dt); vel.y = approach(vel.y, want.y, 3, dt); vel.z = approach(vel.z, want.z, 3, dt);
      pos.addScaledVector(vel, dt);
      // The floor, the surface, the reef's edge and the rocks.
      pos.y = Math.max(reefFloor(pos.x, pos.z) + 0.7, Math.min(REEF_SURFACE - 0.35, pos.y));
      pos.x = Math.max(-REEF_HALF, Math.min(REEF_HALF, pos.x)); pos.z = Math.max(-REEF_HALF, Math.min(REEF_HALF, pos.z));
      for (const rk of reef.rocks) { const dx = pos.x - rk.x, dz = pos.z - rk.z, d = Math.hypot(dx, dz), ry = reefFloor(rk.x, rk.z) + rk.h * 1.2; if (d < rk.r + 0.6 && pos.y < ry) { const push = (rk.r + 0.6 - d) / Math.max(0.01, d); pos.x += dx * push; pos.z += dz * push; } }
      stun = Math.max(0, stun - dt);
      // Air: it runs down under water and fills back at the surface.
      const atSurface = pos.y > REEF_SURFACE - 1.4;
      air = atSurface ? Math.min(100, air + dt * 45) : Math.max(0, air - (dt / REEF_AIR_S) * 100);
      if (air <= 0 && !gasping) { gasping = true; out.current.arena.announce('Out of air! Up you go', 'bad'); out.current.arena.sfx('alarm'); }
      if (gasping && air > 35) gasping = false;
      // What's in reach: the nursery, a bleached patch, a net, plastic, a jellyfish.
      let prompt = '', cutting = 0;
      const act = c.take('act'), holding = c.held.has('act');
      const flat = (x: number, z: number) => Math.hypot(pos.x - x, pos.z - z);
      if (!carrying && flat(reef.nursery.x, reef.nursery.z) < REEF_REACH + 1 && pos.y < 6) {
        prompt = 'E: take a coral fragment';
        if (act) { carrying = true; out.current.arena.sfx('pick'); }
      }
      for (const sp of spots) {
        if (sp.done || flat(sp.x, sp.z) > REEF_REACH || pos.y > sp.y + 5) continue;
        prompt = carrying ? 'E: plant the coral here' : 'Bring coral from the nursery';
        if (carrying && act) {
          sp.done = true; sp.at = t; carrying = false; planted++; score += REEF_PLANT; sp.grow.visible = true;
          w.burst(new THREE.Vector3(sp.x, sp.y + 0.8, sp.z), 0x5eead4, 30, 3, -1); w.say(`+${REEF_PLANT}`, new THREE.Vector3(sp.x, sp.y + 2.4, sp.z), '#5eead4');
          out.current.arena.announce(`Coral planted! ${planted} of ${REEF_SPOTS}`, 'good'); out.current.arena.sfx('check'); report(); finishIfDone();
        }
      }
      for (const n of nets) {
        if (n.freed) continue;
        if (flat(n.x, n.z) < REEF_REACH + 0.6 && Math.abs(pos.y - n.y) < 3) {
          prompt = 'Hold E: cut the net';
          n.cut = holding ? n.cut + dt / REEF_CUT_S : Math.max(0, n.cut - dt);
          cutting = n.cut;
          if (holding && Math.random() < dt * 8) w.burst(n.turtle.position, 0xcbd5e1, 2, 1.5, 0);
          if (n.cut >= 1) {
            n.freed = true; n.at = t; freed++; score += REEF_TURTLE;
            w.say(`+${REEF_TURTLE}`, n.turtle.position.clone().setY(n.y + 2), '#86efac');
            out.current.arena.announce(`Turtle free! ${freed} of ${REEF_NETS}`, 'good'); out.current.arena.sfx('win'); report(); finishIfDone();
          }
        } else n.cut = Math.max(0, n.cut - dt);
      }
      for (const l of litter) {
        if (l.got || l.m.position.distanceTo(pos) > REEF_GRAB) continue;
        l.got = true; l.m.visible = false; plastic++; score += REEF_PIECE;
        w.burst(l.m.position, 0xa5f3fc, 12, 2, -1); w.say(`+${REEF_PIECE}`, l.m.position.clone().setY(l.m.position.y + 1), '#a5f3fc', 0.7);
        out.current.arena.sfx('coin', plastic % 8); report(); finishIfDone();
      }
      for (const { j, g } of jellies) {
        const at = jellyAt(j, t);
        g.position.set(at.x, at.y, at.z);
        const pulse = calm ? 1 : 1 + Math.sin(t * 2.4 + j.phase) * 0.12;
        g.scale.set(pulse, 2 - pulse, pulse);
        if (stun <= 0 && g.position.distanceTo(pos) < REEF_STING_R) {
          stun = 1.2; score = Math.max(0, score - REEF_STING);
          vel.copy(pos).sub(g.position).normalize().multiplyScalar(6);
          w.say(`−${REEF_STING}`, pos.clone().setY(pos.y + 1.2), '#f9a8d4'); w.shake(0.35);
          out.current.arena.announce('Stung by a jellyfish!', 'bad'); out.current.arena.sfx('hurt'); report();
        }
      }
      // Planted coral grows; freed turtles swim off and up; nets sink away.
      for (const sp of spots) { if (sp.done) { const g2 = Math.min(1, (t - sp.at) / 2.5); sp.grow.scale.setScalar(0.2 + g2 * 0.8); (sp.ring.material as THREE.MeshBasicMaterial).color.setHex(0x4ade80); } else (sp.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 3 + sp.x) * 0.2; }
      for (const n of nets) if (n.freed) { const a = t - n.at; n.turtle.position.y = n.y + a * 1.2; n.turtle.position.x += Math.sin(n.turn) * dt * 2; n.turtle.position.z += Math.cos(n.turn) * dt * 2; n.turtle.visible = a < 6; n.net.position.y -= dt * 0.4; (n.net.material as THREE.LineBasicMaterial).opacity = Math.max(0, 0.9 - a * 0.25); }
      // Fish school round three moving centres.
      for (let i = 0; i < FISH; i++) {
        const sc = i % 3, cx = Math.sin(t * 0.05 + sc * 2.1) * 18, cz = Math.cos(t * 0.04 + sc * 1.7) * 18, cy = 4 + sc * 2.5;
        const a = t * (0.35 + sc * 0.08) + (i / FISH) * Math.PI * 6, rad = 3 + (i % 7) * 0.35;
        P.set(cx + Math.cos(a) * rad, cy + Math.sin(i * 1.7 + t) * 0.6, cz + Math.sin(a) * rad);
        Q.setFromEuler(E.set(0, -a, Math.sin(t * 10 + i) * 0.15));
        M.compose(P, Q, S.setScalar(1.3)); fish.setMatrixAt(i, M);
      }
      fish.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < SNOW; i++) { const j3 = i * 3; snowPos[j3 + 1] -= dt * 0.12; if (snowPos[j3 + 1] < 0) snowPos[j3 + 1] = REEF_SURFACE; }
      snow.position.set(Math.round(pos.x / 40) * 40, 0, Math.round(pos.z / 40) * 40);
      snow.geometry.attributes.position.needsUpdate = true;
      // The diver: lies along the way they swim, fins kicking with speed; bubbles rise.
      const sp2 = vel.length();
      me.g.position.copy(pos);
      if (sp2 > 0.3) { const yaw = Math.atan2(-vel.x, -vel.z), pitch = Math.atan2(vel.y, Math.hypot(vel.x, vel.z)); me.g.rotation.set(pitch * 0.8, yaw, 0, 'YXZ'); }
      kick += dt * (2 + sp2 * 2.2);
      me.fins.forEach((leg, i) => { leg.rotation.x = Math.sin(kick + i * Math.PI) * (0.15 + Math.min(1, sp2 / 5) * 0.35); });
      carried.visible = carrying;
      if (!calm && !atSurface && Math.random() < dt * 3) w.burst(P.copy(pos).add(new THREE.Vector3(0, 0.3, 0)), 0xe0f2fe, 2, 0.6, -2.5);
      follow(w.camera, pos, c, dt, { dist: 6.5, height: 1.1 });
      w.focus.copy(pos);
      w.sunOver(pos);
      crowd.update(dt, { pos, ry: me.g.rotation.y, air: true, part: 0, color: lookHex(look), hat: look.hat });
      hudAt += dt;
      if (hudAt > 0.15) {
        hudAt = 0;
        const next = { air: Math.round(air), planted, freed, plastic, carrying, prompt, cut: Math.round(cutting * 20) / 20, others: crowd.count, stung: stun > 0 };
        setHud((p) => ((Object.keys(next) as (keyof typeof next)[]).every((key) => p[key] === next[key]) ? p : next));
      }
    });
    return () => { c.dispose(); controls.current = null; w.dispose(); };
  }, [seed, reef]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <WorldFrame net={net} canvas={canvas} controls={controls} buttons={[{ id: 'act', label: 'Use' }, { id: 'skill', label: 'Up' }, { id: 'crouch', label: 'Down' }]} keys="WASD swim · Space up · C down · E use (hold to cut) · Shift fast" label="Reef Rescue: a 3D coral reef under water" others={hud.others}>
        {hud.stung && <div className="pointer-events-none absolute inset-0 bg-pink-500/15" aria-hidden />}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap gap-2">
          <div className="w-40 rounded-2xl bg-black/55 px-3.5 py-2 ring-1 ring-white/15">
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300"><Wind className="h-3.5 w-3.5" aria-hidden />Air {hud.air}%</p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"><div className={cn('h-full w-full origin-left rounded-full transition-transform duration-150 rtl:origin-right', hud.air > 30 ? 'bg-cyan-300' : 'bg-red-500')} style={{ transform: `scaleX(${hud.air / 100})` }} /></div>
          </div>
          <HudChip label="Coral" value={<span className="inline-flex items-center gap-1"><Sprout className="h-4 w-4" aria-hidden />{hud.planted}/{REEF_SPOTS}</span>} tone="good" />
          <HudChip label="Turtles" value={<span className="inline-flex items-center gap-1"><Fish className="h-4 w-4" aria-hidden />{hud.freed}/{REEF_NETS}</span>} tone="gold" />
          <HudChip label="Plastic" value={<span className="inline-flex items-center gap-1"><Recycle className="h-4 w-4" aria-hidden />{hud.plastic}/{REEF_LITTER}</span>} />
        </div>
        {(hud.prompt || hud.carrying) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-20 flex justify-center [@media(pointer:coarse)]:bottom-36">
            <p className="rounded-full bg-black/65 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15" aria-live="polite">
              {hud.prompt || 'Coral in hand: find a white patch'}
              {hud.cut > 0 && <span className="ms-2 inline-block h-1.5 w-16 overflow-hidden rounded-full bg-white/15 align-middle"><span className="block h-full origin-left rounded-full bg-emerald-400 rtl:origin-right" style={{ transform: `scaleX(${Math.min(1, hud.cut)})` }} /></span>}
            </p>
          </div>
        )}
      </WorldFrame>
      <p className="mt-2 text-center text-xs text-zinc-400">{GAMES.reef.how}</p>
    </div>
  );
}
