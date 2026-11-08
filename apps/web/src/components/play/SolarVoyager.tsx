'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Check, Orbit, Sparkles } from 'lucide-react';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  VOYAGER_BELT, VOYAGER_BONUS_S, VOYAGER_COMET, VOYAGER_DUST, VOYAGER_EDGE, VOYAGER_HIT, VOYAGER_PLANETS, VOYAGER_SCAN_S, VOYAGER_SUN_R, VOYAGER_SURVEY,
  cometAt, voyagerScanReach, voyagerSystem,
} from '@/lib/play/voyager';
import { useArena } from './arena';
import { lookHex, readLook } from './look';
import type { GameProps } from './game-props';
import { Controls, RoundedBoxGeometry, THREE, World, approach, follow, glowSprite } from './world/core';
import { Crowd, type Figure } from './world/crowd';
import { corona, lightBeam, milkyWay, planetAir, planetMaterial, ringMaterial, starfield, sunMaterial } from './world/nature';
import { surface } from './world/textures';
import { HudChip, SkillRing, WorldFrame } from './world/Stage';

// Solar Voyager (UniVerse Play M123, the owner: "something else related to space and technologies
// and shows beautiful planets and stars and system around that with realistic graphics"; rules in
// src/lib/play/voyager.ts). Fly a survey probe through our Solar System: the Sun boiling under its
// corona, all eight planets drawn on the graphics chip (oceans, clouds and city lights on Earth,
// canyons on Mars, Jupiter's bands and storm, Saturn's rings and their shadow), their big moons, the
// asteroid belt, a comet with its two tails, the Milky Way behind. Stay near a planet to survey it
// and learn what makes it special. In a room, the others fly beside you.

/** Each planet's colour on the map and its card. */
const DOT: Record<string, string> = { mercury: '#b8b0a6', venus: '#f5d6a0', earth: '#60a5fa', mars: '#ef8354', jupiter: '#d8b48c', saturn: '#eedc9f', uranus: '#9be7ef', neptune: '#5b8cf0' };
/** Speeds (units a second): cruising, boosting. The boost drains in 5 s and fills in 10. */
const CRUISE = 20, BOOST = 54, DRAIN = 0.2, FILL = 0.1;

/** A lumpy rock (the belt's asteroids, the comet's core): a ball pushed in and out by waves. */
function rockGeo(seed: number) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 2).deleteAttribute('normal'));
  const p = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3(), a = (seed * 1.37) % 6.28;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const k = 1 + 0.26 * Math.sin(v.x * 2.1 + a) * Math.sin(v.y * 1.7 + a * 2) + 0.16 * Math.sin(v.z * 3.3 + a * 3) * Math.sin(v.x * 2.9 + a) + 0.07 * Math.sin(v.y * 7.1 + a * 5);
    p.setXYZ(i, v.x * k, v.y * k * 0.82, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** The survey probe, pointing along −z: a gold-foil body, a white dish, two solar wings trimmed in
 *  the player's colour, an instrument boom and an engine that glows (brighter on boost). */
function probe(accent: number) {
  const g = new THREE.Group();
  const foil = new THREE.MeshStandardMaterial({ color: 0xc99a2e, metalness: 0.85, roughness: 0.3 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe9e7e2, metalness: 0.1, roughness: 0.42 });
  const cells = new THREE.MeshStandardMaterial({ color: 0x1b2a55, metalness: 0.6, roughness: 0.25, emissive: 0x0a1230, emissiveIntensity: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8f99, metalness: 0.9, roughness: 0.35 });
  const trim = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.45, roughness: 0.4 });
  g.add(new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.6, 1.2, 2, 0.08), foil));
  const dish = new THREE.Mesh(new THREE.LatheGeometry(Array.from({ length: 9 }, (_, i) => new THREE.Vector2((i / 8) * 0.78, (i / 8) ** 2 * 0.22)), 28), white);
  dish.material.side = THREE.DoubleSide;
  dish.position.set(0, 0.34, -0.05); dish.rotation.x = -0.25; g.add(dish);
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.42, 8), metal); feed.position.set(0, 0.55, -0.1); g.add(feed);
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6), metal);
    strut.rotation.z = Math.PI / 2; strut.position.set(side * 0.72, 0, 0.1); g.add(strut);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.035, 0.82), cells); wing.position.set(side * 1.95, 0, 0.1); g.add(wing);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.05, 0.05), trim); edge.position.set(side * 1.95, 0, 0.53); g.add(edge);
    const edge2 = edge.clone(); edge2.position.z = -0.33; g.add(edge2);
  }
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 6), metal);
  boom.rotation.x = Math.PI / 2.6; boom.position.set(0.3, -0.35, 0.75); g.add(boom);
  const pod = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), white); pod.position.set(0.3, -0.62, 1.45); g.add(pod);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.3, 14, 1, true), metal);
  nozzle.material.side = THREE.DoubleSide; nozzle.rotation.x = Math.PI / 2; nozzle.position.z = 0.74; g.add(nozzle);
  const flame = glowSprite(0x9fd8ff, 1.1); flame.position.z = 1.05; g.add(flame);
  return { g, flame };
}

/** Another player's probe in a room: it turns toward where they fly. */
function probeFigure(color: number): Figure {
  const p = probe(color);
  let pitch = 0;
  return {
    group: p.g, facing: null,
    update(dt, vel) {
      const sp = vel.length();
      if (sp > 0.5) pitch = approach(pitch, Math.atan2(vel.y, Math.hypot(vel.x, vel.z)), 6, dt);
      p.g.rotation.set(pitch, this.facing ?? p.g.rotation.y, 0, 'YXZ');
      p.flame.scale.setScalar(0.5 + Math.min(1, sp / BOOST) * 1.4);
    },
  };
}

/** A name over a planet, the same size on screen near or far. */
function nameTag(text: string) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '700 34px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.strokeText(text, 128, 34);
  g.fillStyle = '#ffffff'; g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: false, opacity: 0.7 }));
  s.scale.set(0.14, 0.035, 1);
  return s;
}

/** Fine dust that streams past the camera, so flying through empty space feels like moving: points
 *  in a box that wraps round the camera, fading toward its edges. */
function nearDust(count: number, box = 70) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = Math.random() * box;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { center: { value: new THREE.Vector3() }, box: { value: box }, ratio: { value: Math.min(2, window.devicePixelRatio || 1) } },
    vertexShader: `uniform vec3 center; uniform float box, ratio; varying float vA;
      void main() { vec3 p = mod(position - center, box) - box * 0.5; vec4 mv = viewMatrix * vec4(center + p, 1.0);
        vA = 1.0 - smoothstep(box * 0.25, box * 0.5, length(p));
        gl_Position = projectionMatrix * mv; gl_PointSize = ratio * clamp(40.0 / max(-mv.z, 0.1), 1.0, 3.0); }`,
    fragmentShader: `varying float vA; void main() { float a = 1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(vec3(0.75, 0.82, 1.0) * a * vA * 0.55, 1.0); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { pts, u: mat.uniforms };
}

/** The scan's progress: a ring round the planet that fills clockwise from the top. */
function scanRing() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { prog: { value: 0 }, alpha: { value: 0 }, color: { value: new THREE.Color(0x67e8f9) } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float prog, alpha; uniform vec3 color; varying vec2 vP;
      void main() { float a = atan(vP.x, vP.y) / 6.28318 + 0.5; gl_FragColor = vec4(color * (0.22 + 0.78 * step(1.0 - prog, a)) * alpha, 1.0); }`,
  });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(1, 1.035, 128), mat);
  mesh.renderOrder = 5;
  return { mesh, u: mat.uniforms };
}

export function SolarVoyager({ seed, startsAt, endsAt, clock, onProgress, onDone, onStats, net }: GameProps) {
  const at = useMemo(() => voyagerSystem(seed, 0).at, [seed]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const controls = useRef<Controls | null>(null);
  const mark = useRef<HTMLDivElement>(null), markArrow = useRef<HTMLSpanElement>(null), markText = useRef<HTMLSpanElement>(null);
  const me = useRef<SVGGElement>(null), cometDot = useRef<SVGCircleElement>(null);
  const arena = useArena();
  const calm = useReducedMotion();
  const [hud, setHud] = useState({ done: 0, dust: 0, boost: 1, boosting: false, scan: '', scanP: 0, hot: false, others: 0 });
  const [surveyed, setSurveyed] = useState<string[]>([]);
  const [fact, setFact] = useState<{ id: string; key: number } | null>(null);
  const out = useRef({ arena, onProgress, onDone, onStats, clock, startsAt, endsAt, net });
  useEffect(() => { out.current = { arena, onProgress, onDone, onStats, clock, startsAt, endsAt, net }; });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const w = new World(el, { fov: 62, bg: 0x010208, glow: { strength: 0.85, radius: 0.65, threshold: 0.8 }, env: 0.3, exposure: 1 });
    // Space is big: the camera sees across the whole system.
    w.camera.near = 0.3; w.camera.far = 4000; w.camera.updateProjectionMatrix();
    const sys = voyagerSystem(seed, w.phone ? 180 : 420);
    const crowd = new Crowd(w, () => out.current.net, (color) => probeFigure(color));
    const c = new Controls(el, { pitch: [-1.35, 1.35] });
    controls.current = c;
    const say = out.current.arena.announce, sfx = out.current.arena.sfx;
    let factTimer = 0;

    // The Sun: its surface, its corona, a wide glare, and the light every planet is lit by.
    const sunMat = sunMaterial();
    w.scene.add(new THREE.Mesh(new THREE.SphereGeometry(VOYAGER_SUN_R, w.phone ? 64 : 96, w.phone ? 40 : 64), sunMat));
    const halo = corona(VOYAGER_SUN_R, 8);
    w.scene.add(halo.mesh);
    const glare = glowSprite(0xffb066, VOYAGER_SUN_R * 9);
    (glare.material as THREE.SpriteMaterial).opacity = 0.12;
    w.scene.add(glare);
    w.scene.add(new THREE.PointLight(0xfff1dc, 3.4, 0, 0), new THREE.HemisphereLight(0x8fa8d8, 0x0b0d14, 0.22));
    // The sky: thousands of stars of real colours, and the Milky Way (computers: it's fine detail).
    const stars = starfield(w.phone ? 2200 : 4200, 1400, seed), galaxy = w.phone ? null : milkyWay(1800, 0.55);
    w.scene.add(stars);
    if (galaxy) w.scene.add(galaxy);
    const dustNear = nearDust(w.phone ? 260 : 600);
    w.scene.add(dustNear.pts);

    // The planets: each on its tilted axis, spinning, its air glowing at the edge, rings and moons.
    const Z = new THREE.Vector3(0, 0, 1);
    const planets = VOYAGER_PLANETS.map((p, i) => {
      const pos = new THREE.Vector3(sys.at[i].x, sys.at[i].y, sys.at[i].z), toSun = pos.clone().negate().normalize();
      const tilt = new THREE.Group();
      tilt.position.copy(pos); tilt.rotation.z = p.tilt;
      w.scene.add(tilt);
      const mat = planetMaterial(p.look, seed + i * 31, toSun, { bands: p.bands, storm: p.storm, air: p.air, tint: p.look === 'rock' ? 0x8c8378 : undefined, ring: p.ring && [p.ring[0] / p.r, p.ring[1] / p.r] });
      const big = p.r > 6, seg = w.phone ? (big ? 64 : 40) : big ? 112 : 72;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(p.r, seg, Math.round(seg * 0.66)), mat);
      tilt.add(ball);
      if (p.air) {
        const thick = p.look === 'venus' ? 1.08 : p.look === 'giant' ? 1.04 : p.look === 'desert' ? 1.035 : 1.06;
        const air = planetAir(p.r, p.air, toSun, { thick, power: p.look === 'venus' ? 1.2 : 1 });
        air.position.copy(pos); w.scene.add(air);
      }
      if (p.ring) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(p.ring[0], p.ring[1], w.phone ? 96 : 192, 1), ringMaterial(p.ring[0], p.ring[1], toSun, pos, p.r, p.id === 'uranus' ? { tint: 0x7d8a92, alpha: 0.45 } : {}));
        ring.rotation.x = -Math.PI / 2;
        tilt.add(ring);
      }
      const moons = p.moons.map((m, k) => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(m.r, 32, 20), planetMaterial('rock', seed + i * 31 + k * 7 + 3, toSun, { tint: m.tint }));
        w.scene.add(mesh);
        return { m, mesh, phase: k * 2.1 + i };
      });
      // Its orbit, a faint line round the Sun (green once surveyed).
      const pts = Array.from({ length: 257 }, (_, k) => new THREE.Vector3(Math.cos((k / 256) * Math.PI * 2) * p.orbit, pos.y, Math.sin((k / 256) * Math.PI * 2) * p.orbit));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.13, depthWrite: false }));
      w.scene.add(line);
      const tag = nameTag(p.name);
      tag.position.copy(pos).add(new THREE.Vector3(0, p.r * 1.25 + 1.5, 0));
      w.scene.add(tag);
      return { p, pos, ball, mat, moons, line, tag, done: false, scan: 0 };
    });

    // The asteroid belt between Mars and Jupiter: rocks in three shapes, fine dust, slowly turning.
    const belt = new THREE.Group();
    w.scene.add(belt);
    const rockMat = surface('rock', { color: 0xffffff, rough: 0.95 });
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3(), C = new THREE.Color();
    const per = Math.ceil(sys.rocks.length / 3);
    for (let k = 0; k < 3; k++) {
      const list = sys.rocks.slice(k * per, (k + 1) * per);
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(rockGeo(seed + k), rockMat, list.length);
      list.forEach((r, j) => {
        M.compose(P.set(r.x, r.y, r.z), Q.setFromEuler(E.set(j * 1.3, j * 2.1, j * 0.7)), S.set(r.s, r.s * (0.7 + (j % 5) * 0.08), r.s * (0.8 + (j % 3) * 0.1)));
        im.setMatrixAt(j, M);
        im.setColorAt(j, C.setHSL(0.06 + (j % 7) * 0.008, 0.16, 0.28 + (j % 9) * 0.025));
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      belt.add(im);
    }
    {
      const n = w.phone ? 1200 : 3000, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, d = VOYAGER_BELT[0] - 6 + Math.random() * (VOYAGER_BELT[1] - VOYAGER_BELT[0] + 12); pos.set([Math.cos(a) * d, (Math.random() - 0.5) * 16, Math.sin(a) * d], i * 3); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      belt.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.4, sizeAttenuation: false, color: 0x9a8f80, transparent: true, opacity: 0.55, depthWrite: false })));
    }

    // Stardust to collect along the way (one draw: taken specks move far away).
    const glowTex = (glowSprite(0xffffff).material as THREE.SpriteMaterial).map;
    const dustPos = new Float32Array(sys.dust.length * 3);
    sys.dust.forEach((d, i) => dustPos.set([d.x, d.y, d.z], i * 3));
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({ size: 2.4, map: glowTex, color: 0xa5f3fc, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const dustPts = new THREE.Points(dustGeo, dustMat);
    dustPts.frustumCulled = false;
    w.scene.add(dustPts);
    const taken = new Uint8Array(sys.dust.length);

    // The comet: an icy core in a glowing coma, the blue ion tail straight away from the Sun, the
    // broader dust tail curving behind.
    const comet = new THREE.Group();
    w.scene.add(comet);
    const core = new THREE.Mesh(rockGeo(seed + 9), new THREE.MeshStandardMaterial({ color: 0x5b544c, roughness: 1 }));
    core.scale.setScalar(1.3);
    const coma = glowSprite(0xe6f7ff, 14), coma2 = glowSprite(0x9fd8ff, 40);
    (coma2.material as THREE.SpriteMaterial).opacity = 0.35;
    comet.add(core, coma, coma2);
    const ion = lightBeam(170, 0.035, 0x7fc4ff), dustTail = lightBeam(120, 0.075, 0xfff0d0);
    ion.mat.uniforms.power.value = 0.42; dustTail.mat.uniforms.power.value = 0.3;
    w.scene.add(ion.mesh, dustTail.mesh);
    const cometPos = new THREE.Vector3(), cometPrev = new THREE.Vector3(), away = new THREE.Vector3(), trail = new THREE.Vector3();

    // The probe.
    const look = readLook(), ship = probe(lookHex(look));
    w.scene.add(ship.g);
    const scan = scanRing();
    w.scene.add(scan.mesh);
    const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.frustumCulled = false;
    w.scene.add(beam);

    const pos = new THREE.Vector3(sys.start.x, sys.start.y, sys.start.z), vel = new THREE.Vector3();
    c.yaw = sys.start.yaw; c.pitch = Math.max(-1.3, Math.min(1.3, sys.start.pitch));
    const fwd = new THREE.Vector3(), right = new THREE.Vector3(), want = new THREE.Vector3(), D = new THREE.Vector3(), V = new THREE.Vector3(), moonAt = new THREE.Vector3();
    const qWant = new THREE.Quaternion(), eWant = new THREE.Euler(0, 0, 0, 'YXZ');
    let score = 0, done = 0, dust = 0, hits = 0, cometGot = false, energy = 1, boosting = false, lastHit = -9, edgeSaid = -9, wasHot = false, roll = 0, lastYaw = c.yaw, over = false, hudAt = 0, labelAt = 0;
    const report = () => {
      out.current.onProgress(score, done);
      out.current.onStats?.([
        { label: 'Planets surveyed', value: `${done} of ${VOYAGER_PLANETS.length}` }, { label: 'Stardust', value: String(dust) },
        { label: 'Comet flyby', value: cometGot ? 'Yes' : 'Not yet' }, { label: 'Bumps', value: String(hits) },
      ]);
    };
    report();
    /** Keeps the probe out of a ball (a planet, a moon, the Sun, a rock): pushed back to its surface,
     *  bounced, and (no more than once a second or so) a bump that costs points. */
    const keepOut = (centre: THREE.Vector3, radius: number, why: string, T: number) => {
      D.subVectors(pos, centre);
      const d = D.length(), min = radius + 1.2;
      if (d >= min) return;
      D.multiplyScalar(1 / Math.max(d, 1e-3));
      pos.copy(centre).addScaledVector(D, min);
      const vn = vel.dot(D);
      if (vn < 0) vel.addScaledVector(D, -vn * 1.6);
      if (T - lastHit < 1.2) return;
      lastHit = T; hits++; score = Math.max(0, score - VOYAGER_HIT);
      say(why, 'bad'); sfx('hurt'); w.shake(0.5); report();
    };

    w.camera.position.set(pos.x, pos.y + 3, pos.z + 8);
    w.focus.copy(pos);
    w.flyIn(new THREE.Vector3(pos.x * 1.3, pos.y + 150, pos.z * 1.3), 2.6);
    let t0 = -1;
    w.start((dt, t) => {
      if (t0 < 0) t0 = t;
      const T = t - t0;
      const round = out.current;
      sunMat.uniforms.time.value = T; halo.u.time.value = T;
      (stars.material as THREE.ShaderMaterial).uniforms.time.value = T;
      ion.mat.uniforms.time.value = T; dustTail.mat.uniforms.time.value = T;
      halo.mesh.quaternion.copy(w.camera.quaternion);
      stars.position.copy(w.camera.position);
      galaxy?.position.copy(w.camera.position);
      dustNear.u.center.value.copy(w.camera.position);
      belt.rotation.y = T * 0.006;
      dustMat.size = 2.4 + Math.sin(T * 3) * 0.35;

      // Flying: forward along where you look, sideways level, Space and C straight up and down.
      if (!over) {
        const k = c.keys, f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) - c.stick.y;
        const r2 = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + c.stick.x;
        const up = (k.has(' ') || c.held.has('skill') ? 1 : 0) - (k.has('c') || k.has('control') || c.held.has('crouch') ? 1 : 0);
        fwd.set(-Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), -Math.cos(c.yaw) * Math.cos(c.pitch));
        right.set(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
        want.set(0, 0, 0).addScaledVector(fwd, f).addScaledVector(right, r2);
        want.y += up;
        if (want.lengthSq() > 1) want.normalize();
        const wantsBoost = (c.running || c.held.has('act')) && want.lengthSq() > 0.04;
        const nowBoost = wantsBoost && energy > (boosting ? 0 : 0.15);
        if (nowBoost && !boosting) { sfx('boost'); w.fovBy(14); }
        if (!nowBoost && boosting) w.fovBy(0);
        boosting = nowBoost;
        energy = boosting ? Math.max(0, energy - dt * DRAIN) : Math.min(1, energy + dt * FILL);
        want.multiplyScalar(boosting ? BOOST : CRUISE);
        const grip = boosting ? 2.2 : 1.6;
        vel.x = approach(vel.x, want.x, grip, dt); vel.y = approach(vel.y, want.y, grip, dt); vel.z = approach(vel.z, want.z, grip, dt);
      } else vel.multiplyScalar(Math.exp(-2 * dt));
      pos.addScaledVector(vel, dt);

      // What's in the way: the Sun (too hot close by), the planets, their moons, the belt's rocks.
      const dSun = pos.length(), hot = dSun < VOYAGER_SUN_R + 24;
      if (hot && !wasHot) { say('Too hot! Turn away from the Sun', 'bad'); sfx('alarm'); }
      wasHot = hot;
      keepOut(V.set(0, 0, 0), VOYAGER_SUN_R + 2, `Scorched by the Sun! −${VOYAGER_HIT}`, T);
      if (dSun > VOYAGER_EDGE) {
        D.copy(pos).normalize(); pos.setLength(VOYAGER_EDGE);
        const vn = vel.dot(D);
        if (vn > 0) vel.addScaledVector(D, -vn * 1.5);
        if (T - edgeSaid > 4) { edgeSaid = T; say('The edge of the survey zone: turn back', 'pink'); }
      }
      let target = -1, best = Infinity;
      for (let i = 0; i < planets.length; i++) {
        const pl = planets[i];
        pl.ball.rotation.y += dt * pl.p.spin * (Math.PI / 30);
        pl.mat.uniforms.time.value = T;
        keepOut(pl.pos, pl.p.r, `Bumped into ${pl.p.name}! −${VOYAGER_HIT}`, T);
        for (const mo of pl.moons) {
          const a = mo.phase + (T / mo.m.turn) * Math.PI * 2;
          moonAt.set(Math.cos(a) * mo.m.d, 0, Math.sin(a) * mo.m.d).applyAxisAngle(Z, pl.p.tilt).add(pl.pos);
          mo.mesh.position.copy(moonAt);
          mo.mesh.rotation.y = -a;
          keepOut(moonAt, mo.m.r, `Hit ${mo.m.name}! −${VOYAGER_HIT}`, T);
        }
        const d = pos.distanceTo(pl.pos);
        if (!pl.done && d < best) { best = d; target = i; }
      }
      const flat = Math.hypot(pos.x, pos.z);
      if (flat > VOYAGER_BELT[0] - 8 && flat < VOYAGER_BELT[1] + 8 && Math.abs(pos.y) < 14) {
        // In the belt: test the rocks where they are now (the belt turns).
        V.copy(pos).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -belt.rotation.y);
        for (const r of sys.rocks) {
          const dx = V.x - r.x, dy = V.y - r.y, dz = V.z - r.z, reach = r.s * 1.05 + 1.2;
          if (dx * dx + dy * dy + dz * dz < reach * reach) {
            P.set(r.x, r.y, r.z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, belt.rotation.y);
            keepOut(P, r.s * 1.05, `Asteroid! −${VOYAGER_HIT}`, T);
            break;
          }
        }
      }

      // Stardust.
      for (let i = 0; i < sys.dust.length; i++) {
        if (taken[i]) continue;
        const d = sys.dust[i], dx = pos.x - d.x, dy = pos.y - d.y, dz = pos.z - d.z;
        if (dx * dx + dy * dy + dz * dz > 22) continue;
        taken[i] = 1; dust++; score += VOYAGER_DUST;
        dustPos.set([0, -1e5, 0], i * 3); dustGeo.attributes.position.needsUpdate = true;
        w.burst(P.set(d.x, d.y, d.z), 0xa5f3fc, 10, 4, 0);
        sfx('coin', dust % 6);
        report();
      }

      // The comet: where it is in the round (the room's clock: everyone sees it in the same place).
      const k01 = (round.clock() - round.startsAt) / Math.max(1, round.endsAt - round.startsAt);
      cometPrev.copy(cometPos);
      const cp = cometAt(sys.comet, k01);
      cometPos.set(cp.x, cp.y, cp.z);
      comet.position.copy(cometPos);
      core.rotation.x += dt * 0.2; core.rotation.y += dt * 0.13;
      away.copy(cometPos).normalize();
      ion.mesh.position.copy(cometPos); ion.mesh.lookAt(P.copy(cometPos).add(away));
      trail.subVectors(cometPrev, cometPos);
      if (trail.lengthSq() > 1e-6) trail.normalize();
      dustTail.mesh.position.copy(cometPos); dustTail.mesh.lookAt(P.copy(cometPos).add(away).addScaledVector(trail, 0.45));
      if (!cometGot && pos.distanceTo(cometPos) < 16) {
        cometGot = true; score += VOYAGER_COMET;
        say(`Comet flyby! +${VOYAGER_COMET}`, 'gold'); sfx('power'); w.burst(cometPos, 0xe6f7ff, 40, 8, 0); report();
      }

      // Surveying: stay near the nearest planet not yet surveyed.
      let scanning = -1;
      if (target >= 0 && !over) {
        const pl = planets[target];
        if (best - pl.p.r < voyagerScanReach(pl.p)) {
          scanning = target;
          const before = pl.scan;
          pl.scan = Math.min(1, pl.scan + dt / VOYAGER_SCAN_S);
          if (Math.floor(pl.scan * 8) !== Math.floor(before * 8)) sfx('repair', Math.floor(pl.scan * 8));
          if (pl.scan >= 1) {
            pl.done = true; done++; score += VOYAGER_SURVEY;
            (pl.line.material as THREE.LineBasicMaterial).color.setHex(0x34d399);
            (pl.line.material as THREE.LineBasicMaterial).opacity = 0.3;
            pl.tag.material.color.setHex(0x86efac);
            w.say(`+${VOYAGER_SURVEY}`, P.copy(pl.pos).add(V.set(0, pl.p.r + 3, 0)), '#86efac', 1.6);
            setSurveyed((s) => [...s, pl.p.id]);
            setFact({ id: pl.p.id, key: done });
            window.clearTimeout(factTimer);
            factTimer = window.setTimeout(() => setFact(null), 9000);
            if (done === planets.length) {
              over = true;
              const left = Math.max(0, Math.round((round.endsAt - round.clock()) / 1000));
              score += left * VOYAGER_BONUS_S;
              say('Grand tour complete!', 'gold'); sfx('win');
              report();
              window.setTimeout(() => out.current.onDone(score, done), 2600);
            } else { say(`${pl.p.name} surveyed!`, 'good'); sfx('check'); report(); }
          }
        }
      }
      planets.forEach((pl, i) => { if (!pl.done && i !== scanning) pl.scan = Math.max(0, pl.scan - dt * 0.4); });
      // The scan ring and beam.
      const sp = scanning >= 0 ? planets[scanning] : null;
      scan.u.alpha.value = approach(scan.u.alpha.value as number, sp ? 1 : 0, 8, dt);
      if (sp) {
        scan.mesh.position.copy(sp.pos); scan.mesh.scale.setScalar(sp.p.r * 1.45); scan.u.prog.value = sp.scan;
        const pts = beam.geometry.attributes.position as THREE.BufferAttribute;
        pts.setXYZ(0, pos.x, pos.y, pos.z); pts.setXYZ(1, sp.pos.x, sp.pos.y, sp.pos.z); pts.needsUpdate = true;
      }
      scan.mesh.quaternion.copy(w.camera.quaternion);
      scan.mesh.visible = (scan.u.alpha.value as number) > 0.01;
      (beam.material as THREE.LineBasicMaterial).opacity = sp ? 0.35 + Math.sin(T * 12) * 0.15 : 0;

      // The probe: turns to where you fly, banks into turns, its engine brighter on boost.
      const yawRate = (c.yaw - lastYaw) / Math.max(dt, 1e-3);
      lastYaw = c.yaw;
      const r2now = (c.keys.has('d') || c.keys.has('arrowright') ? 1 : 0) - (c.keys.has('a') || c.keys.has('arrowleft') ? 1 : 0) + c.stick.x;
      roll = approach(roll, Math.max(-0.7, Math.min(0.7, yawRate * 0.18 - r2now * 0.35)), 5, dt);
      eWant.set(c.pitch, c.yaw, roll);
      qWant.setFromEuler(eWant);
      ship.g.quaternion.slerp(qWant, 1 - Math.exp(-9 * dt));
      ship.g.position.copy(pos);
      const thrust = vel.length() / BOOST;
      ship.flame.scale.setScalar(0.5 + thrust * 1.4 + (boosting ? Math.sin(T * 40) * 0.15 : 0));
      if (boosting && Math.random() < dt * 30) w.burst(P.copy(pos).addScaledVector(fwd, -1.2), 0x9fd8ff, 2, 2, 0);

      follow(w.camera, pos, c, dt, { dist: 7.5, height: 1.5 });
      w.camera.updateMatrixWorld();
      w.focus.copy(pos);
      crowd.update(dt, { pos, ry: c.yaw, air: true, part: 0, color: lookHex(look), hat: look.hat });

      // The marker on the planet to survey next (or at the screen's edge, pointing to it), and the map.
      const m = mark.current;
      if (m) {
        const tp = target >= 0 ? planets[target] : null;
        m.style.opacity = tp && scanning < 0 && T > 3 ? '1' : '0';
        if (tp) {
          const W = el.clientWidth, H = el.clientHeight;
          V.copy(tp.pos).applyMatrix4(w.camera.matrixWorldInverse);
          const behind = V.z > 0;
          V.applyMatrix4(w.camera.projectionMatrix);
          let x = behind ? -V.x : V.x, y = behind ? -V.y : V.y;
          const on = !behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.82;
          if (!on) {
            if (Math.hypot(x, y) < 0.05) y = -0.8;
            const s = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.78);
            x /= s; y /= s;
          }
          const sx = (x * 0.5 + 0.5) * W, sy = (0.5 - y * 0.5) * H;
          m.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
          if (markArrow.current) {
            markArrow.current.style.opacity = on ? '0' : '1';
            markArrow.current.style.transform = `rotate(${Math.atan2(sy - H / 2, sx - W / 2).toFixed(3)}rad)`;
          }
          if (t - labelAt > 0.25 && markText.current) {
            labelAt = t;
            markText.current.textContent = `${tp.p.name} · ${Math.max(1, Math.round((best - tp.p.r - voyagerScanReach(tp.p)) / CRUISE))} s away`;
          }
        }
      }
      me.current?.setAttribute('transform', `translate(${pos.x.toFixed(1)} ${pos.z.toFixed(1)}) rotate(${((-c.yaw * 180) / Math.PI).toFixed(1)})`);
      cometDot.current?.setAttribute('cx', cometPos.x.toFixed(1));
      cometDot.current?.setAttribute('cy', cometPos.z.toFixed(1));

      hudAt += dt;
      if (hudAt > 0.12) {
        hudAt = 0;
        const sc = scanning >= 0 ? planets[scanning] : null;
        const next = { done, dust, boost: Math.round(energy * 20) / 20, boosting, scan: sc?.p.name ?? '', scanP: sc ? Math.round(sc.scan * 20) / 20 : 0, hot, others: crowd.count };
        setHud((p) => ((Object.keys(next) as (keyof typeof next)[]).every((key) => p[key] === next[key]) ? p : next));
      }
    });
    return () => { window.clearTimeout(factTimer); c.dispose(); controls.current = null; w.dispose(); };
  }, [seed]);

  const info = fact ? VOYAGER_PLANETS.find((p) => p.id === fact.id) : null;
  return (
    <div className="mx-auto w-full">
      <WorldFrame net={net} canvas={canvas} controls={controls} buttons={[{ id: 'act', label: 'Boost' }, { id: 'skill', label: 'Up' }, { id: 'crouch', label: 'Down' }]}
        keys="WASD fly · Space up · C down · Shift boost" label="Solar Voyager: a 3D flight through the Solar System" others={hud.others}>
        {hud.hot && <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,transparent_45%,rgba(249,115,22,0.35))]" aria-hidden />}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start gap-2 pe-28 sm:pe-48">
          <HudChip label="Surveyed" value={<span className="inline-flex items-center gap-1"><Orbit className="h-4 w-4" aria-hidden />{hud.done}/{VOYAGER_PLANETS.length}</span>} tone="good" />
          <HudChip label="Stardust" value={<span className="inline-flex items-center gap-1"><Sparkles className="h-4 w-4" aria-hidden />{hud.dust}</span>} tone="gold" />
          <SkillRing label="Boost" keyName="Shift" charge={hud.boost} active={hud.boosting} />
        </div>

        {/* The map: the Sun, the orbits, the belt, every planet (ticked once surveyed), the comet, you. */}
        <svg viewBox="-590 -590 1180 1180" className="pointer-events-none absolute end-3 top-3 h-24 w-24 rounded-full bg-black/60 ring-1 ring-white/15 sm:h-44 sm:w-44" aria-hidden>
          <circle r={(VOYAGER_BELT[0] + VOYAGER_BELT[1]) / 2} fill="none" stroke="rgba(190,170,150,0.16)" strokeWidth={VOYAGER_BELT[1] - VOYAGER_BELT[0]} />
          {VOYAGER_PLANETS.map((p) => <circle key={p.id} r={p.orbit} fill="none" stroke={surveyed.includes(p.id) ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.13)'} strokeWidth={4} />)}
          <circle r={VOYAGER_SUN_R * 1.3} fill="#fbbf24" />
          {VOYAGER_PLANETS.map((p, i) => (
            <g key={p.id} transform={`translate(${at[i].x.toFixed(1)} ${at[i].z.toFixed(1)})`}>
              <circle r={Math.max(14, p.r * 1.8)} fill={DOT[p.id]} />
              {surveyed.includes(p.id) && <circle r={Math.max(14, p.r * 1.8) + 12} fill="none" stroke="#34d399" strokeWidth={9} />}
            </g>
          ))}
          <circle ref={cometDot} r={10} fill="#e0f2fe" />
          <g ref={me}><path d="M0 -30 L20 22 L0 12 L-20 22 Z" fill="#fe81d1" stroke="#fff" strokeWidth={5} /></g>
        </svg>

        {/* The planet to survey next. */}
        <div ref={mark} style={{ left: 0, top: 0, opacity: 0 }} className="pointer-events-none absolute transition-opacity duration-200" aria-hidden>
          <span className="absolute -start-5 -top-5 h-10 w-10 rounded-full border-2 border-cyan-300/80" />
          <span ref={markArrow} className="absolute -start-3 -top-3 grid h-6 w-6 place-items-center text-cyan-200">
            <svg viewBox="0 0 24 24" className="h-6 w-6"><path d="M4 12h12M12 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span ref={markText} className="absolute start-7 top-[-0.7rem] whitespace-nowrap rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold text-white ring-1 ring-white/15" />
        </div>

        {hud.scan && (
          <div className="pointer-events-none absolute inset-x-0 bottom-20 flex justify-center [@media(pointer:coarse)]:bottom-36">
            <div className="w-64 rounded-2xl bg-black/65 px-4 py-2.5 text-center ring-1 ring-cyan-300/40">
              <p className="text-sm font-bold text-white">Surveying {hud.scan}…</p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-full origin-left rounded-full bg-cyan-300 transition-transform duration-150 rtl:origin-right" style={{ transform: `scaleX(${hud.scanP})` }} /></div>
            </div>
          </div>
        )}

        <AnimatePresence>
          {info && fact && (
            <motion.div key={fact.key} role="status" initial={{ opacity: 0, y: calm ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-none absolute inset-x-3 top-[9.5rem] max-w-sm rounded-2xl bg-[#0b0b0c]/90 p-4 ring-1 ring-white/15 sm:inset-x-auto sm:end-4 sm:top-56 sm:w-80">
              <p className="flex items-center gap-2 text-lg font-bold text-white">
                <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: DOT[info.id] }} aria-hidden />{info.name}
                <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-semibold text-emerald-300"><Check className="h-3.5 w-3.5" aria-hidden />Surveyed</span>
              </p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-200">{info.fact}</p>
              <p className="mt-3 flex flex-wrap gap-1.5">{info.stats.map((s) => <span key={s} className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-zinc-100">{s}</span>)}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </WorldFrame>
    </div>
  );
}
