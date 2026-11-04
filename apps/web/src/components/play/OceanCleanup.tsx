'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Magnet, Recycle, Shield, Waves, Zap } from 'lucide-react';
import { GAMES } from '@/lib/play';
import { BOOST_SPEED, MAGNET_PX, OCEAN_COMBO_MS, OCEAN_HIT, OCEAN_PHASES, OIL_SLOW, POWER_MS, SEA, SWEEP_CHARGE, SWEEP_PX, isLife, isPower, isTrash, kgOf, oceanMultiplier, oceanPhase, oceanSchedule, type Drift, type SeaKind } from '@/lib/play/ocean';
import { cn } from '@/lib/utils';
import { useArena } from './arena';
import { calmMotion, steerBody, useSteer } from './steer';
import type { GameProps } from './game-props';
import { THREE, World, glowSprite, mergeGeometries, type SkyLook } from './world/core';
import { Board, ocean, rainField, swell } from './world/board';
import { haptic } from '@/lib/haptics';

// Ocean Cleanup (src/lib/play/ocean.ts): a boat on a living sea that turns from calm to a storm.
// Plastic drifts down; scoop it up for points and combos. Sea life costs points (unless a shield is
// up); oil slicks slow the boat. Power-ups: a magnet pulls plastic in, a shield takes one bump, a
// boost makes the boat faster and doubles points.
// Drawn in 3D since M103 (the rules still work in the box's pixels, world/board.ts): the open sea
// under a real sky (sun glitter, a swell that rocks everything on it, foam on the crests in the
// storm), a cleanup boat with its scoop, bottles, cups, bags, cans and ghost nets, turtles, fish and
// octopuses, oil with its rainbow sheen, a foam wake, rain and lightning.

interface Live { d: Drift; x: number; y: number; state: null | 'got' | 'hit' | 'used'; t: number; mesh?: THREE.Object3D; ring?: THREE.Mesh }

/** The weather over each stage of the round: a bright morning, a grey sky, a storm. */
const SKIES: SkyLook[] = [
  { elevation: 38, azimuth: 200, turbidity: 2.2, rayleigh: 1.8, mie: 0.004, mieG: 0.85, gain: 0.55, env: 0.9 },
  { elevation: 26, azimuth: 210, turbidity: 9, rayleigh: 1.2, mie: 0.01, mieG: 0.8, gain: 0.42, env: 0.7 },
  { elevation: 18, azimuth: 220, turbidity: 18, rayleigh: 0.6, mie: 0.02, mieG: 0.75, gain: 0.16, env: 0.45 },
];
const SEA_COLOR = [0x0d4c66, 0x0b3a50, 0x082634], SUN = [2.6, 1.6, 0.7];

/** A part of a model: a shape placed, turned and painted (vertex colours, so a whole model is one draw). */
function part(geo: THREE.BufferGeometry, color: number, at: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) {
  const g = geo;
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));
  const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const whole = (parts: THREE.BufferGeometry[]) => { const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p))); parts.forEach((p) => p.dispose()); return g; };

/** The floating things, each about one unit across (scaled to the flat game's 30 px). */
function models(): Record<Exclude<SeaKind, 'oil'>, THREE.BufferGeometry> {
  const flipper = (x: number, z: number, r: number) => part(new THREE.BoxGeometry(0.34, 0.04, 0.14), 0x7a8f62, [x, 0.02, z], [0, r, x > 0 ? -0.2 : 0.2]);
  const buoy = () => [part(new THREE.TorusGeometry(0.42, 0.09, 8, 24), 0xf97316, [0, 0, 0], [Math.PI / 2, 0, 0]), ...[0, 1, 2, 3].map((i) => part(new THREE.TorusGeometry(0.42, 0.095, 8, 4, Math.PI / 4), 0xffffff, [0, 0, 0], [Math.PI / 2, 0, (i * Math.PI) / 2]))];
  const bolt = new THREE.Shape(); bolt.moveTo(0.06, 0.32); bolt.lineTo(-0.16, -0.02); bolt.lineTo(0.0, -0.02); bolt.lineTo(-0.08, -0.32); bolt.lineTo(0.16, 0.04); bolt.lineTo(0.0, 0.04); bolt.closePath();
  const crest = new THREE.Shape(); crest.moveTo(0, 0.3); crest.quadraticCurveTo(0.24, 0.26, 0.24, 0.16); crest.quadraticCurveTo(0.22, -0.16, 0, -0.3); crest.quadraticCurveTo(-0.22, -0.16, -0.24, 0.16); crest.quadraticCurveTo(-0.24, 0.26, 0, 0.3);
  const ext = (sh: THREE.Shape) => new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
  const rope = (a: [number, number], b: [number, number], c: number) => { const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); return part(new THREE.CylinderGeometry(0.025, 0.025, len, 5), c, [(a[0] + b[0]) / 2, 0.03 + Math.sin(a[0] * 9) * 0.03, (a[1] + b[1]) / 2], [Math.PI / 2, Math.atan2(dx, dz), 0]); };
  return {
    bottle: whole([part(new THREE.CylinderGeometry(0.15, 0.15, 0.56, 14), 0xb9e2ec, [0, 0.12, 0], [0, 0, Math.PI / 2]), part(new THREE.CylinderGeometry(0.065, 0.15, 0.16, 14), 0xb9e2ec, [0.36, 0.12, 0], [0, 0, -Math.PI / 2]), part(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 10), 0x1d4ed8, [0.48, 0.12, 0], [0, 0, Math.PI / 2]), part(new THREE.CylinderGeometry(0.152, 0.152, 0.2, 14), 0x22c55e, [-0.04, 0.12, 0], [0, 0, Math.PI / 2])]),
    cup: whole([part(new THREE.CylinderGeometry(0.17, 0.12, 0.5, 14, 1, true), 0xf8fafc, [0, 0.13, 0], [0, 0, Math.PI / 2]), part(new THREE.CylinderGeometry(0.172, 0.165, 0.1, 14, 1, true), 0xdc2626, [-0.12, 0.13, 0], [0, 0, Math.PI / 2]), part(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), 0xf472b6, [0.25, 0.2, 0.05], [0.3, 0, Math.PI / 2.4])]),
    bag: whole([(() => { const g = new THREE.CircleGeometry(0.42, 18, 0, Math.PI * 2).rotateX(-Math.PI / 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), r = 1 + Math.sin(a * 5) * 0.12 + Math.sin(a * 3 + 1) * 0.08; p.setXYZ(i, x * r * 1.15, Math.abs(Math.sin(x * 11 + z * 8)) * 0.08 + 0.03, z * r * 0.9); } g.computeVertexNormals(); return part(g, 0xdde7ee); })(), part(new THREE.TorusGeometry(0.12, 0.025, 6, 12, Math.PI), 0xe7edf2, [-0.2, 0.05, -0.35], [Math.PI / 2, 0, 0]), part(new THREE.TorusGeometry(0.12, 0.025, 6, 12, Math.PI), 0xe7edf2, [0.2, 0.05, -0.35], [Math.PI / 2, 0, 0])]),
    can: whole([part(new THREE.CylinderGeometry(0.14, 0.14, 0.4, 16), 0xdc2626, [0, 0.11, 0], [0, 0, Math.PI / 2]), part(new THREE.CylinderGeometry(0.13, 0.14, 0.03, 16), 0xd4d4d8, [0.215, 0.11, 0], [0, 0, Math.PI / 2]), part(new THREE.CylinderGeometry(0.14, 0.13, 0.03, 16), 0xd4d4d8, [-0.215, 0.11, 0], [0, 0, Math.PI / 2]), part(new THREE.CylinderGeometry(0.141, 0.141, 0.08, 16), 0xf8fafc, [0, 0.11, 0], [0, 0, Math.PI / 2])]),
    net: whole([
      ...[-0.45, -0.22, 0, 0.22, 0.45].flatMap((v, i) => [rope([-0.6, v + Math.sin(i) * 0.06], [0.6, v - 0.05], i % 2 ? 0x4d7c57 : 0x3f6b4d), rope([v, -0.55], [v + 0.08, 0.55], i % 2 ? 0x3f6b4d : 0x5b8a63)]),
      part(new THREE.SphereGeometry(0.1, 10, 8), 0xf97316, [0.5, 0.06, 0.4]), part(new THREE.SphereGeometry(0.1, 10, 8), 0xf97316, [-0.45, 0.06, -0.38]), part(new THREE.SphereGeometry(0.08, 10, 8), 0xfacc15, [0.1, 0.06, -0.5]),
    ]),
    turtle: whole([part(new THREE.SphereGeometry(0.5, 18, 12), 0x5b6b3a, [0, 0.1, 0], [0, 0, 0], [0.62, 0.24, 0.78]), part(new THREE.SphereGeometry(0.5, 16, 10), 0x7f8f55, [0, 0.13, 0], [0, 0, 0], [0.42, 0.22, 0.56]), part(new THREE.SphereGeometry(0.12, 12, 10), 0x8a9a70, [0, 0.12, -0.5]), flipper(0.36, -0.22, -0.5), flipper(-0.36, -0.22, 0.5), flipper(0.3, 0.3, 0.6), flipper(-0.3, 0.3, -0.6)]),
    fish: whole([part(new THREE.SphereGeometry(0.5, 16, 10), 0xf97316, [0, 0.08, 0], [0, 0, 0], [0.24, 0.26, 0.6]), part(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 12), 0xffffff, [0, 0.08, -0.08], [Math.PI / 2, 0, 0], [1, 1, 1.7]), part(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12), 0xffffff, [0, 0.08, 0.14], [Math.PI / 2, 0, 0], [1, 1, 1.9]), part(new THREE.ConeGeometry(0.16, 0.24, 4), 0xea580c, [0, 0.08, 0.38], [-Math.PI / 2, 0, 0], [1, 1, 0.3]), part(new THREE.SphereGeometry(0.03, 6, 6), 0x111111, [0.08, 0.13, -0.22]), part(new THREE.SphereGeometry(0.03, 6, 6), 0x111111, [-0.08, 0.13, -0.22])]),
    octopus: whole([part(new THREE.SphereGeometry(0.28, 16, 12), 0xb4436c, [0, 0.16, 0.05], [0, 0, 0], [1, 0.85, 1.2]), ...Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return part(new THREE.CylinderGeometry(0.02, 0.06, 0.62, 6), i % 2 ? 0xc0587e : 0xa83d63, [Math.cos(a) * 0.32, 0.04, Math.sin(a) * 0.32 - 0.02], [Math.PI / 2, -a + Math.PI / 2, 0.15]); }), part(new THREE.SphereGeometry(0.04, 6, 6), 0xfef3c7, [0.1, 0.22, -0.2]), part(new THREE.SphereGeometry(0.04, 6, 6), 0xfef3c7, [-0.1, 0.22, -0.2])]),
    magnet: whole([...buoy(), part(new THREE.TorusGeometry(0.17, 0.065, 8, 16, Math.PI), 0xdc2626, [0, 0.28, 0], [0, 0, 0]), part(new THREE.CylinderGeometry(0.065, 0.065, 0.12, 8), 0xe5e7eb, [0.17, 0.22, 0]), part(new THREE.CylinderGeometry(0.065, 0.065, 0.12, 8), 0xe5e7eb, [-0.17, 0.22, 0])]),
    shield: whole([...buoy(), part(ext(crest), 0x3b82f6, [0, 0.3, -0.04]), part(new THREE.SphereGeometry(0.06, 8, 6), 0xe0f2fe, [0, 0.36, 0.06])]),
    boost: whole([...buoy(), part(ext(bolt), 0xfacc15, [0, 0.32, -0.04])]),
  };
}

/** The cleanup boat, two units long, bow along −z: a white hull with a pink rail, a cabin with dark
 *  windows, an outboard, and the scoop (two yellow booms with a net between) at the bow. */
function boat() {
  const g = new THREE.Group();
  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, 1); hullShape.quadraticCurveTo(0.44, 0.5, 0.44, -0.1); hullShape.lineTo(0.38, -0.92); hullShape.lineTo(-0.38, -0.92); hullShape.lineTo(-0.44, -0.1); hullShape.quadraticCurveTo(-0.44, 0.5, 0, 1);
  const flat = (sh: THREE.Shape, depth: number, bevel = 0.05) => new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 14 }).rotateX(-Math.PI / 2);
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, y = 0) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = true; g.add(m); return m; };
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf4f6f8, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  const pink = new THREE.MeshPhysicalMaterial({ color: 0xfe81d1, roughness: 0.35, clearcoat: 0.8 });
  const deck = new THREE.MeshStandardMaterial({ color: 0x9a7b5b, roughness: 0.8 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0b1622, roughness: 0.04, clearcoat: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: 0.5, metalness: 0.4 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 });
  mk(flat(hullShape, 0.3), white, -0.16);
  // The rail: the hull's outline with its middle cut out.
  const railShape = new THREE.Shape(hullShape.getPoints(16).map((p) => p.clone().multiplyScalar(1.02)));
  railShape.holes.push(new THREE.Path(hullShape.getPoints(16).map((p) => p.clone().multiplyScalar(0.9)).reverse()));
  mk(flat(railShape, 0.05, 0.015), pink, 0.17);
  const inner = flat(hullShape, 0.02, 0); inner.scale(0.86, 1, 0.9); mk(inner, deck, 0.2);
  const cabin = mk(new THREE.BoxGeometry(0.52, 0.34, 0.56), white, 0.38); cabin.position.z = 0.18;
  const win = mk(new THREE.BoxGeometry(0.5, 0.14, 0.5), glass, 0.45); win.position.z = 0.15; win.scale.set(1.02, 1, 1.02);
  const roof = mk(new THREE.BoxGeometry(0.58, 0.04, 0.62), white, 0.57); roof.position.z = 0.18;
  const stripe = mk(new THREE.BoxGeometry(0.6, 0.045, 0.12), pink, 0.575); stripe.position.z = 0.05;
  const motor = mk(new THREE.BoxGeometry(0.18, 0.36, 0.16), dark, 0.18); motor.position.z = 1.0;
  for (const x of [-1, 1]) {
    const boom = mk(new THREE.BoxGeometry(0.06, 0.06, 0.7), yellow, 0.12); boom.position.set(x * 0.36, 0.12, -1.12); boom.rotation.y = x * 0.42;
  }
  const net = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 6 }, (_, i) => { const x = -0.48 + i * 0.19; return [new THREE.Vector3(x, 0.1, -1.38 + Math.abs(x) * 0.6), new THREE.Vector3(x * 0.7, 0.1, -0.95)]; }).flat()), new THREE.LineBasicMaterial({ color: 0x5eead4 }));
  g.add(net);
  return g;
}

/** A soft round foam patch (one picture for the wake). */
function foamTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.35)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** An oil slick: black with a thin film's rainbow, its edge slowly wobbling. */
function slickMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 }, seed: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time, seed; varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5; float a = atan(p.y, p.x), r = length(p) * 2.0;
        float edge = 0.78 + 0.1 * sin(a * 3.0 + seed + time * 0.6) + 0.06 * sin(a * 7.0 - time * 0.9 + seed * 2.0);
        float inside = smoothstep(edge, edge - 0.12, r);
        float film = r * 9.0 + sin(a * 2.0 + time * 0.4 + seed) * 1.5;
        vec3 rainbow = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + film * 0.12));
        vec3 col = mix(vec3(0.015, 0.015, 0.02), rainbow * 0.55, 0.32 * smoothstep(0.15, 0.9, r));
        gl_FragColor = vec4(col, inside * 0.9);
        #include <colorspace_fragment>
      }`,
  });
}

export function OceanCleanup({ seed, startsAt, clock, onProgress, onStats }: GameProps) {
  const sea = useMemo(() => oceanSchedule(seed, GAMES.ocean.seconds), [seed]);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const steer = useSteer(box);
  const arena = useArena();
  const [hud, setHud] = useState({ magnet: 0, boost: 0, shield: false, oily: false, phase: 0, sweep: 0, combo: 0, comboLeft: 0, picked: 0, kg: 0 });
  const sweepAsk = useRef(false);
  const out = useRef({ arena, onProgress, onStats, clock, startsAt });
  useEffect(() => { out.current = { arena, onProgress, onStats, clock, startsAt }; });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const w = new World(el, { fov: 34, bg: 0x0b2a3a, glow: { strength: 0.55, radius: 0.5, threshold: 0.85 }, env: 0.9 });
    const board = new Board(w, 'top', 16, 24);
    const calm = calmMotion();
    const sun = w.lights({ sky: 0xcfe3ff, ground: 0x0b3a50, power: SUN[0], at: [20, 40, 18], ambient: 0.55 });
    const hemi = w.scene.children.find((o) => o instanceof THREE.HemisphereLight) as THREE.HemisphereLight;
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24 });
    w.sky(SKIES[0]);
    const flashLight = new THREE.DirectionalLight(0xe8eeff, 0); flashLight.position.set(0, 30, 0); w.scene.add(flashLight);
    const water = ocean(260, w.phone ? 120 : 180, SEA_COLOR[0]);
    w.scene.add(water.mesh);
    const rain = rainField(w.phone ? 700 : 1600, new THREE.Vector3(44, 22, 34), new THREE.Vector3(0, 9, 4), { opacity: 0.38, speed: 26, length: 0.9 });
    rain.lines.visible = false; w.scene.add(rain.lines);

    const geos = models();
    const itemMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.04 });
    const ringGeo = new THREE.RingGeometry(0.62, 0.7, 40).rotateX(-Math.PI / 2);
    const ringMat = (c: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthWrite: false });
    const RING = { life: ringMat(0xf87171), power: ringMat(0xfde68a), net: ringMat(0xff9fdc) };
    const slickGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const make = (o: Live) => {
      const k = o.d.kind;
      if (k === 'oil') {
        const m = new THREE.Mesh(slickGeo, slickMaterial());
        (m.material as THREE.ShaderMaterial).uniforms.seed.value = o.d.wobble;
        m.renderOrder = 1; o.mesh = m;
      } else {
        const m = new THREE.Mesh(geos[k], itemMat);
        m.castShadow = !w.phone; m.rotation.y = o.d.wobble;
        if (isPower(k)) { const gl = glowSprite(0xfde68a, 1.8); gl.position.y = 0.3; m.add(gl); }
        o.mesh = m;
        const rk = isLife(k) ? RING.life : isPower(k) ? RING.power : k === 'net' ? RING.net : null;
        if (rk) { o.ring = new THREE.Mesh(ringGeo, rk); o.ring.renderOrder = 2; w.scene.add(o.ring); }
      }
      w.scene.add(o.mesh);
    };
    const drop = (o: Live) => {
      if (o.mesh) { w.scene.remove(o.mesh); if (o.d.kind === 'oil') (o.mesh as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>).material.dispose(); else (o.mesh.children[0] as THREE.Sprite | undefined)?.material.dispose(); }
      if (o.ring) w.scene.remove(o.ring);
    };

    // The boat, its shield and magnet's reach, the sweep's ring, the wake.
    const ship = boat();
    w.scene.add(ship);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x93c5fd, emissive: 0x3b82f6, emissiveIntensity: 0.4, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
    dome.visible = false; w.scene.add(dome);
    const reach = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.35, depthWrite: false }));
    reach.visible = false; w.scene.add(reach);
    const wave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xcffafe, transparent: true, opacity: 0, depthWrite: false }));
    wave.visible = false; w.scene.add(wave);
    const WAKE = 90;
    const wake = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: foamTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), WAKE);
    wake.instanceMatrix.setUsage(THREE.DynamicDrawUsage); wake.frustumCulled = false; wake.renderOrder = 3;
    const puffs = Array.from({ length: WAKE }, () => ({ x: 0, z: 0, age: 9, size: 1, dx: 0, dz: 0 }));
    for (let i = 0; i < WAKE; i++) wake.setColorAt(i, new THREE.Color(0, 0, 0));
    w.scene.add(wake);
    let nextPuff = 0;
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3(), P3 = new THREE.Vector3(), C = new THREE.Color(), V = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

    // The round's state (the flat game's: positions in the box's pixels).
    const s = {
      boat: { x: -1, y: 0, vx: 0, vy: 0 }, next: 0, live: [] as Live[], score: 0, combo: 0, best: 0, lastPick: -1e9, stunUntil: 0, picked: 0, kg: 0, hits: 0,
      magnetUntil: 0, boostUntil: 0, shield: false, oilUntil: 0, phase: -1, flash: 0, nextBolt: 0, reported: -1, hudAt: 0, sweep: 0, sweepT: -1, swept: 0,
      look: 0, yaw: 0,
    };
    let unit = 0.03;
    const pop = (px: number, py: number, color: number, n: number, speedPx = 160) => w.burst(board.at(px, py).setY(0.3), color, calm ? Math.min(n, 4) : n, speedPx * unit, 9);
    const say = (px: number, py: number, text: string, color: string) => w.say(text, board.at(px, py).setY(1.2), color, 0.55);

    w.start((dt, now) => {
      if (board.fit()) unit = board.scale(board.W / 2, board.H / 2);
      const W = board.W, H = board.H;
      if (!W) return;
      const { arena, onProgress, onStats, clock, startsAt } = out.current;
      const t = clock() - startsAt, b = s.boat;
      if (b.x < 0) { b.x = W / 2; b.y = H * 0.78; }
      // The sea's stage: calm → choppy → storm, announced.
      const phase = oceanPhase(Math.max(0, t), GAMES.ocean.seconds);
      if (phase !== s.phase) {
        if (s.phase >= 0) { arena.announce(OCEAN_PHASES[phase], phase === 2 ? 'bad' : 'pink'); arena.sfx(phase === 2 ? 'thunder' : 'whoosh'); }
        s.phase = phase; s.nextBolt = t + 2500;
      }
      if (phase === 2 && t > s.nextBolt && !calm) { s.flash = 1; s.nextBolt = t + 5000 + Math.random() * 4000; arena.sfx('thunder'); arena.shake(0.5); }
      s.flash = Math.max(0, s.flash - dt * 2.5);

      // Things drift in on the shared schedule.
      while (s.next < sea.length && sea[s.next].at <= t) {
        const d = sea[s.next++];
        const o: Live = { d, x: d.x * W, y: -40, state: null, t: 0 };
        make(o); s.live.push(o);
      }
      const stunned = t < s.stunUntil, boosted = t < s.boostUntil, magnet = t < s.magnetUntil, oily = t < s.oilUntil;
      const top = (stunned ? 120 : 560) * (boosted ? BOOST_SPEED : 1) * (oily ? OIL_SLOW : 1);
      steerBody(b, steer.current, dt, top, { x0: 30, x1: W - 30, y0: H * 0.3, y1: H - 36 });

      // Scooping a piece: points with the combo (and the boost); it also charges the sweep.
      const take = (o: Live, charge: boolean) => {
        const k = o.d.kind;
        o.state = 'got';
        s.combo = t - s.lastPick < OCEAN_COMBO_MS ? s.combo + 1 : 0;
        s.best = Math.max(s.best, s.combo);
        s.lastPick = t;
        const pts = Math.round(SEA[k].pts * oceanMultiplier(s.combo)) * (boosted ? 2 : 1);
        s.score += pts; s.picked++; s.kg += kgOf(k);
        if (charge) s.sweep = Math.min(SWEEP_CHARGE, s.sweep + 1);
        say(o.x, o.y - 10, s.combo ? `+${pts} ×${oceanMultiplier(s.combo).toFixed(1)}` : `+${pts}`, k === 'net' ? '#ffc0e6' : '#a5f3fc');
        pop(o.x, o.y, k === 'net' ? 0xff9fdc : 0x67e8f9, 18);
        arena.sfx(k === 'net' ? 'coin' : 'pick', s.combo);
        if (s.combo === 5 || s.combo === 10) arena.announce(s.combo === 10 ? 'Max combo!' : 'Combo ×1.5!', 'pink');
        haptic('tap', false);
      };
      // The sweep: a ring of bubbles from the boat collects all the plastic in reach.
      if (sweepAsk.current) {
        sweepAsk.current = false;
        if (s.sweep >= SWEEP_CHARGE) {
          s.sweep = 0; s.sweepT = 0;
          let n = 0;
          for (const o of s.live) if (!o.state && isTrash(o.d.kind) && Math.hypot(o.x - b.x, o.y - b.y) < SWEEP_PX) { take(o, false); n++; }
          s.swept += n;
          arena.announce(n ? `Sweep! ${n} pieces` : 'Sweep! (nothing in reach)', 'gold'); arena.sfx('boost'); arena.shake(0.3);
        }
      }

      // Move, pull, collide, drop what's gone.
      let inOil = false;
      for (let i = s.live.length - 1; i >= 0; i--) {
        const o = s.live[i], k = o.d.kind;
        if (o.state) { o.t += dt; o.y += (o.state === 'hit' ? 220 : -30) * dt; if (o.t > 0.45) { drop(o); s.live.splice(i, 1); } continue; }
        o.y += o.d.speed * H * dt * (phase === 2 ? 1.15 : 1);
        o.x += Math.sin(t / 700 + o.d.wobble) * (phase === 2 ? 34 : 18) * dt;
        if (o.y > H + 60) { drop(o); s.live.splice(i, 1); continue; }
        const dist = Math.hypot(o.x - b.x, o.y - b.y);
        if (magnet && isTrash(k) && dist < MAGNET_PX) { o.x += (b.x - o.x) * Math.min(1, dt * 5); o.y += (b.y - o.y) * Math.min(1, dt * 5); }
        if (k === 'oil') { if (dist < 58) inOil = true; continue; }
        if (dist >= 38) continue;
        if (isLife(k)) {
          if (stunned) continue;
          o.state = 'hit';
          if (s.shield) {
            s.shield = false;
            say(o.x, o.y - 10, 'Shield!', '#93c5fd');
            pop(b.x, b.y, 0x93c5fd, 18);
            arena.sfx('hit');
            continue;
          }
          s.score = Math.max(0, s.score - OCEAN_HIT); s.combo = 0; s.hits++;
          s.stunUntil = t + 750;
          if (!calm) w.shake(0.3);
          say(o.x, o.y - 10, `−${OCEAN_HIT}`, '#f87171');
          pop(o.x, o.y, 0xfca5a5, 14);
          arena.sfx('hurt'); arena.shake(0.4);
          haptic('warning', false);
        } else if (isPower(k)) {
          o.state = 'used';
          if (k === 'magnet') s.magnetUntil = t + POWER_MS;
          if (k === 'boost') s.boostUntil = t + POWER_MS;
          if (k === 'shield') s.shield = true;
          arena.announce(k === 'magnet' ? 'Magnet!' : k === 'boost' ? 'Boost! ×2 points' : 'Shield up', 'gold');
          arena.sfx('power');
          pop(o.x, o.y, 0xfde68a, 22);
        } else take(o, true);
      }
      if (inOil) { if (!oily) arena.sfx('splash'); s.oilUntil = t + 900; }
      if (s.score !== s.reported) {
        s.reported = s.score;
        onProgress(s.score, s.picked);
        onStats?.([{ label: 'Pieces cleared', value: String(s.picked) }, { label: 'Plastic out', value: `${s.kg.toFixed(2)} kg` }, { label: 'Best combo', value: `×${oceanMultiplier(s.best).toFixed(1)}` }, { label: 'Swept up', value: String(s.swept) }, { label: 'Bumps', value: String(s.hits) }]);
      }
      if (t - s.hudAt > 150) {
        s.hudAt = t;
        const comboLeft = s.combo > 0 ? Math.max(0, 1 - (t - s.lastPick) / OCEAN_COMBO_MS) : 0;
        const next = { magnet: magnet ? Math.ceil((s.magnetUntil - t) / 1000) : 0, boost: boosted ? Math.ceil((s.boostUntil - t) / 1000) : 0, shield: s.shield, oily, phase, sweep: s.sweep / SWEEP_CHARGE, combo: comboLeft > 0 ? s.combo : 0, comboLeft: Math.round(comboLeft * 10) / 10, picked: s.picked, kg: Math.round(s.kg * 10) / 10 };
        setHud((p) => (Object.keys(next) as (keyof typeof next)[]).every((key) => p[key] === next[key]) ? p : next);
      }

      // ── The picture ──
      // The weather follows the stage (over about two seconds), then its light is made again.
      if (s.look !== phase && s.look < phase) {
        const k = Math.min(1, (t - (phase === 1 ? 0.35 : 0.68) * GAMES.ocean.seconds * 1000) / 2000);
        const a = SKIES[phase - 1], c = SKIES[phase];
        const mixed = Object.fromEntries((Object.keys(c) as (keyof SkyLook)[]).map((key) => [key, (a[key] ?? 0) + ((c[key] ?? 0) - (a[key] ?? 0)) * Math.max(0, k)])) as SkyLook;
        w.sky(mixed, k >= 1);
        if (k >= 1) s.look = phase;
      }
      const ease = 1 - Math.exp(-0.8 * dt);
      water.u.rough.value += ([0.15, 0.55, 1][phase] - water.u.rough.value) * ease;
      water.u.foam.value += ([0, 0.35, 0.9][phase] - water.u.foam.value) * ease;
      water.mat.color.lerp(C.setHex(SEA_COLOR[phase]), ease);
      sun.intensity += (SUN[phase] - sun.intensity) * ease;
      water.u.time.value = now;
      flashLight.intensity = s.flash * 5; hemi.intensity = 0.55 + s.flash * 1.5;
      rain.lines.visible = phase === 2 && !calm;
      rain.mat.uniforms.time.value = now; rain.mat.uniforms.wind.value = 6;
      const rough = water.u.rough.value;
      // Everything afloat rides the swell: up and down, and tipped by the slope.
      const ride = (obj: THREE.Object3D, px: number, py: number, lift: number, size: number, tilt = 1) => {
        board.at(px, py, P3);
        const h = swell(P3.x, P3.z, now, rough), hx = swell(P3.x + 0.5, P3.z, now, rough), hz = swell(P3.x, P3.z + 0.5, now, rough);
        obj.position.set(P3.x, h + lift * size, P3.z);
        V.set(-(hx - h) * 2 * tilt, 1, -(hz - h) * 2 * tilt).normalize();
        Q.setFromUnitVectors(UP, V);
        obj.quaternion.copy(Q);
        obj.scale.setScalar(size);
      };
      for (const o of s.live) {
        if (!o.mesh) continue;
        const k = o.d.kind, life = isLife(k), size = unit * (k === 'oil' ? 120 : k === 'net' ? 64 : life ? (k === 'turtle' ? 48 : 40) : isPower(k) ? 46 : 34);
        ride(o.mesh, o.x, o.y, k === 'oil' ? 0.004 : 0, size, k === 'oil' ? 0.3 : 1);
        if (k === 'oil') { o.mesh.scale.set(size, 1, size * 0.68); (o.mesh as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>).material.uniforms.time.value = now; continue; }
        // Turn slowly; sea life swims (a fish wags, a turtle and an octopus drift round).
        o.mesh.rotateY(o.d.wobble + (life ? Math.sin(now * (k === 'fish' ? 6 : 1.2) + o.d.wobble) * (k === 'fish' ? 0.35 : 0.2) + Math.PI : now * 0.25));
        if (o.state === 'got') { const f = Math.max(0, 1 - o.t / 0.45); o.mesh.scale.setScalar(size * f); o.mesh.position.y += (1 - f) * 0.8; }
        if (o.state === 'used') o.mesh.scale.setScalar(size * (1 + o.t * 2));
        if (o.state === 'hit') o.mesh.position.y -= o.t * 1.6;
        if (o.ring) {
          o.ring.visible = !o.state;
          o.ring.position.set(o.mesh.position.x, swell(o.mesh.position.x, o.mesh.position.z, now, rough) + 0.14, o.mesh.position.z);
          o.ring.scale.setScalar(size * (isPower(k) ? 1 + Math.sin(now * 5) * 0.1 : 1));
        }
      }
      // The boat leans into turns, bucks when it hits something, rocks in the storm.
      const size = unit * 42;
      ride(ship, b.x, b.y, 0.03, size, 0.8);
      s.yaw += (-Math.max(-0.45, Math.min(0.45, b.vx / 1100)) - s.yaw) * (1 - Math.exp(-5 * dt));
      ship.rotateY(s.yaw + (stunned && !calm ? Math.sin(t / 40) * 0.35 : 0));
      ship.rotateZ(-b.vx / 4000);
      dome.visible = s.shield; dome.position.copy(ship.position); dome.scale.setScalar(unit * 46);
      (dome.material as THREE.MeshStandardMaterial).opacity = 0.16 + Math.sin(now * 6) * 0.05;
      reach.visible = magnet; reach.position.set(ship.position.x, ship.position.y + 0.04, ship.position.z); reach.scale.setScalar(MAGNET_PX * unit);
      (reach.material as THREE.MeshBasicMaterial).opacity = 0.28 + Math.sin(now * 8) * 0.1;
      if (s.sweepT >= 0) {
        s.sweepT += dt;
        const k = Math.min(1, s.sweepT / 0.5);
        wave.visible = true; wave.position.copy(reach.position); wave.scale.setScalar(SWEEP_PX * unit * (1 - (1 - k) ** 3));
        (wave.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
        if (s.sweepT > 0.6) { s.sweepT = -1; wave.visible = false; }
      }
      // The wake: foam left behind the stern, spreading and fading (longer with the boost).
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 40 && now > nextPuff) {
        nextPuff = now + (boosted ? 0.018 : 0.03);
        const p = puffs.find((q) => q.age > (boosted ? 1.6 : 1.1)) ?? puffs[0];
        ship.localToWorld(V.set((Math.random() - 0.5) * 0.4, 0, 1.0));
        Object.assign(p, { x: V.x, z: V.z, age: 0, size: unit * (16 + Math.random() * 10), dx: (Math.random() - 0.5) * 0.6, dz: (Math.random() - 0.5) * 0.6 });
      }
      puffs.forEach((p, i) => {
        p.age += dt;
        const life = boosted ? 1.6 : 1.1, f = Math.max(0, 1 - p.age / life);
        p.x += p.dx * dt; p.z += p.dz * dt;
        M.compose(P3.set(p.x, swell(p.x, p.z, now, rough) + 0.05, p.z), Q.identity(), S3.setScalar(p.size * (1 + p.age * 2.2)));
        wake.setMatrixAt(i, M);
        wake.setColorAt(i, C.setRGB(f * 0.8, f * 0.85, f * 0.9));
      });
      wake.instanceMatrix.needsUpdate = true; if (wake.instanceColor) wake.instanceColor.needsUpdate = true;
      if (sp > 120 && !calm && Math.random() < dt * 20) pop(b.x + (Math.random() - 0.5) * 16, b.y - 24, 0xe0f2fe, 3, 60);
    });

    // Space (or E) fires the sweep.
    const key = (e: KeyboardEvent) => { if ((e.key === ' ' || e.key.toLowerCase() === 'e') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); sweepAsk.current = true; } };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); w.dispose(); };
  }, [seed, sea, steer]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div ref={box} className="relative h-[min(72vh,700px)] min-h-80 w-full touch-none select-none overflow-hidden rounded-[1.75rem] bg-[#0b2a3a] ring-1 ring-white/10">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" role="img" aria-label="Ocean Cleanup: a boat on the open sea. Steer with the mouse, a finger or the arrow keys to scoop up plastic and avoid sea life." />
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          {hud.combo > 0 ? (
            <div className="w-36 rounded-2xl bg-black/60 px-3 py-2 ring-1 ring-white/15">
              <p className="text-sm font-black text-pink-200">Combo ×{oceanMultiplier(hud.combo).toFixed(1)}</p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full w-full origin-left rounded-full bg-pink-400 transition-transform duration-150 rtl:origin-right" style={{ transform: `scaleX(${hud.comboLeft})` }} /></div>
            </div>
          ) : <span />}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-sky-50 ring-1 ring-white/15"><Recycle className="h-3.5 w-3.5" aria-hidden />{hud.picked} cleared · {hud.kg.toFixed(1)} kg</span>
        </div>
        <button type="button" onClick={() => { sweepAsk.current = true; }} disabled={hud.sweep < 1}
          className="absolute bottom-14 end-4 z-10 inline-flex h-12 items-center gap-2 overflow-hidden rounded-full bg-cyan-300 px-4 text-sm font-black text-cyan-950 shadow-[0_5px_0_rgba(0,0,0,0.35)] active:translate-y-1 active:shadow-none disabled:bg-zinc-800 disabled:text-zinc-300">
          <span className="absolute inset-y-0 start-0 bg-cyan-200/60 transition-[width] duration-200" style={{ width: `${hud.sweep * 100}%` }} aria-hidden />
          <Waves className="relative h-4 w-4" aria-hidden /><span className="relative">{hud.sweep >= 1 ? 'Sweep!' : `Sweep ${Math.round(hud.sweep * 100)}%`}</span><kbd className="relative hidden rounded bg-black/15 px-1 text-[11px] font-medium [@media(pointer:fine)]:inline">Space</kbd>
        </button>
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap justify-center gap-2">
          <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-sky-100 ring-1 ring-white/15">{OCEAN_PHASES[hud.phase]}</span>
          {hud.magnet > 0 && <Power icon={Magnet} text={`Magnet ${hud.magnet}s`} />}
          {hud.boost > 0 && <Power icon={Zap} text={`Boost ×2 · ${hud.boost}s`} />}
          {hud.shield && <Power icon={Shield} text="Shield" tone="blue" />}
          {hud.oily && <span className="rounded-full bg-zinc-900/85 px-3 py-1 text-xs font-bold text-zinc-200 ring-1 ring-white/20">Oil! Slowed down</span>}
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-zinc-400">Steer: move the mouse or drag · arrow keys or WASD. Pink rings are ghost nets (150); gold rings are power-ups; red rings are sea life; dark slicks are oil. Every 15 pieces charge the sweep: Space collects all plastic near the boat.</p>
    </div>
  );
}

function Power({ icon: Icon, text, tone = 'gold' }: { icon: typeof Zap; text: string; tone?: 'gold' | 'blue' }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black', tone === 'gold' ? 'bg-amber-300 text-amber-950' : 'bg-sky-300 text-sky-950')}><Icon className="h-3.5 w-3.5" aria-hidden />{text}</span>;
}
