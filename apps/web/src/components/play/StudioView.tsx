'use client';

import { useEffect, useRef } from 'react';
import { THREE, World, glowSprite } from './world/core';
import { lightBeam } from './world/nature';

// Quiz Clash's studio, in 3D (M104, the owner: "realistic graphics to all of them"): a television quiz
// set seen from the audience: a glossy black floor, a round stage with a lit rim, a wall of LED panels,
// moving-head lights on a truss whose beams cut the haze, the crowd in the dark. It answers the game:
// a right answer turns the wall and the beams green and the crowd jumps, a wrong one flashes red, a
// boss question goes gold, the lightning round strobes. The questions sit on top of it.

export interface StudioFeed { tint: string; beat: number; ok: boolean | null; boss: boolean; lightning: boolean }

/** The LED wall: a grid of soft pixels running a slow wave in the colour of the moment. */
function ledWall() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, color: { value: new THREE.Color(0xfe81d1) }, flash: { value: 0 }, flashColor: { value: new THREE.Color(0x4ade80) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time, flash; uniform vec3 color, flashColor; varying vec2 vUv;
      void main() {
        vec2 grid = vec2(96.0, 40.0), cell = fract(vUv * grid) - 0.5, id = floor(vUv * grid);
        float dotMask = smoothstep(0.5, 0.28, length(cell));
        float wave = 0.5 + 0.5 * sin(id.x * 0.18 + id.y * 0.12 - time * 1.6) * sin(id.y * 0.21 - time * 0.9);
        float ring = 0.5 + 0.5 * sin(length(id - grid * 0.5) * 0.35 - time * 3.0);
        vec3 c = color * (0.05 + wave * 0.32) + flashColor * flash * (0.4 + ring * 0.7);
        gl_FragColor = vec4(c * dotMask * 1.3, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return { mesh: new THREE.Mesh(new THREE.PlaneGeometry(26, 9), mat), mat };
}

export function StudioView({ feed }: { feed: React.RefObject<StudioFeed> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const w = new World(el, { fov: 40, bg: 0x07060c, haze: [0x0e0b18, 0.035], glow: { strength: 0.9, radius: 0.6, threshold: 0.7 }, env: 0.25 });
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    w.scene.add(new THREE.HemisphereLight(0x5b4a8a, 0x07060c, 0.35));
    // The floor and the stage.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 60).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x0b0b10, roughness: 0.16, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 }));
    floor.receiveShadow = true; w.scene.add(floor);
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.3, 0.5, 64), new THREE.MeshPhysicalMaterial({ color: 0x15151c, roughness: 0.25, metalness: 0.4, clearcoat: 0.8 }));
    stage.position.set(0, 0.25, -4); stage.receiveShadow = true; w.scene.add(stage);
    const rimMat = new THREE.MeshBasicMaterial({ color: 0xfe81d1 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(7.15, 0.06, 8, 96).rotateX(Math.PI / 2), rimMat);
    rim.position.set(0, 0.48, -4); w.scene.add(rim);
    // Three podiums on the stage, the host's desk in the middle.
    const desk = new THREE.MeshPhysicalMaterial({ color: 0x1c1c26, roughness: 0.3, metalness: 0.5, clearcoat: 1 });
    const fronts: THREE.MeshBasicMaterial[] = [];
    for (const x of [-4.2, 0, 4.2]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, 1.5, 6), desk); p.position.set(x, 1.25, -3.2 - Math.abs(x) * 0.2); p.castShadow = true; w.scene.add(p);
      const f = new THREE.MeshBasicMaterial({ color: 0xfe81d1 }); fronts.push(f);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.05), f); strip.position.set(x, 1.7, -2.3 - Math.abs(x) * 0.2); w.scene.add(strip);
    }
    const wall = ledWall();
    wall.mesh.position.set(0, 5.2, -11); w.scene.add(wall.mesh);
    // The truss and its moving heads: real spot lights (three) and beams in the haze (six).
    const truss = new THREE.Mesh(new THREE.BoxGeometry(24, 0.35, 0.35), new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.4, metalness: 0.9 }));
    truss.position.set(0, 10.5, -5); w.scene.add(truss);
    // Phones run three heads (each beam is a see-through cone over much of the screen).
    const n = w.phone ? 3 : 6;
    const heads = Array.from({ length: n }, (_, i) => {
      const x = -10 + i * (20 / (n - 1));
      const g = new THREE.Group(); g.position.set(x, 10.2, -5); w.scene.add(g);
      const beam = lightBeam(13, 0.16, 0xffffff); beam.mat.uniforms.power.value = 0.22; g.add(beam.mesh);
      const lens = glowSprite(0xffffff, 1.2); g.add(lens);
      let spot: THREE.SpotLight | null = null;
      if (i % 2 === 1) {
        spot = new THREE.SpotLight(0xffffff, 70, 26, 0.22, 0.5, 1.2); spot.castShadow = !w.phone && i === 3; spot.shadow.mapSize.set(512, 512);
        g.add(spot, spot.target);
      }
      return { g, beam, lens, spot, phase: i * 1.3 };
    });
    // The crowd: dark heads and shoulders in rows, lit from the stage behind.
    const ROWS = 3, PER = 22;
    const crowd = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.32, 0.5, 4, 8), new THREE.MeshStandardMaterial({ color: 0x15131c, roughness: 0.9 }), ROWS * PER);
    const heads2 = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshStandardMaterial({ color: 0x1b1824, roughness: 0.8 }), ROWS * PER);
    crowd.instanceMatrix.setUsage(THREE.DynamicDrawUsage); heads2.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    w.scene.add(crowd, heads2);
    const seats = Array.from({ length: ROWS * PER }, (_, i) => ({ x: -11 + (i % PER) * 1.05 + (Math.floor(i / PER) % 2) * 0.5, z: 7 + Math.floor(i / PER) * 1.3, y: Math.floor(i / PER) * 0.45, jump: 0, seed: (i * 7.13) % 6.28 }));
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3(), AIM = new THREE.Vector3(), ZAX = new THREE.Vector3(0, 0, 1);
    const rimLight = new THREE.PointLight(0xfe81d1, 25, 30, 1.4); rimLight.position.set(0, 3, -6); w.scene.add(rimLight);

    w.camera.position.set(0, 3.6, 13);
    let lastBeat = feed.current.beat, flash = 0, flashOk = true;
    const tint = new THREE.Color(), base = new THREE.Color(), GREEN = new THREE.Color(0x4ade80), RED = new THREE.Color(0xf87171), GOLD = new THREE.Color(0xfbbf24), WHITE = new THREE.Color(0xffffff);
    w.start((dt, now) => {
      const f = feed.current;
      if (f.beat !== lastBeat) {
        lastBeat = f.beat; flash = 1; flashOk = !!f.ok;
        if (f.ok) { seats.forEach((s) => { s.jump = 0.6 + Math.random() * 0.4; }); if (!calm) w.burst(new THREE.Vector3(0, 2.5, -4), 0x4ade80, 40, 8, 6); }
        else if (!calm) w.shake(0.25);
      }
      flash = Math.max(0, flash - dt * 1.3);
      base.set(f.boss ? '#fbbf24' : f.tint);
      tint.copy(base).lerp(flashOk ? GREEN : RED, Math.min(1, flash * 1.4));
      wall.mat.uniforms.time.value = now; wall.mat.uniforms.color.value.copy(base); wall.mat.uniforms.flash.value = flash; wall.mat.uniforms.flashColor.value.copy(flashOk ? GREEN : RED);
      rimMat.color.copy(tint).multiplyScalar(2.2); fronts.forEach((m) => m.color.copy(tint).multiplyScalar(1.8)); rimLight.color.copy(tint);
      // Beams sweep slowly; on a right answer they swing to the stage; the lightning round strobes.
      const strobe = f.lightning && !calm && Math.sin(now * 22) > 0.4;
      heads.forEach((h) => {
        // Where the beam lands: wandering over the stage and the crowd, or all on the stage.
        if (flash > 0.3) AIM.set(0, 1, -4);
        else AIM.set(h.g.position.x * 0.5 + (calm ? 0 : Math.sin(now * 0.55 + h.phase) * 6), 0, (calm ? 2 : Math.sin(now * 0.37 + h.phase * 1.7) * 6) + 1);
        h.g.quaternion.setFromUnitVectors(ZAX, AIM.sub(h.g.position).normalize());
        const c = flash > 0.05 ? tint : strobe ? GOLD : h.phase % 2.6 < 1.3 ? base : WHITE;
        h.beam.mat.uniforms.color.value.copy(c); h.beam.mat.uniforms.time.value = now;
        h.beam.mat.uniforms.power.value = strobe ? 0.42 : 0.2 + flash * 0.25;
        (h.lens.material as THREE.SpriteMaterial).color.copy(c);
        if (h.spot) { h.spot.color.copy(c); h.spot.target.position.set(0, 0, 12); }
      });
      // The crowd sways, and jumps for a right answer.
      seats.forEach((s, i) => {
        s.jump = Math.max(0, s.jump - dt * 1.6);
        const hop = Math.abs(Math.sin(s.jump * 9)) * s.jump * 0.5 + (calm ? 0 : Math.sin(now * 1.3 + s.seed) * 0.03);
        M.compose(P.set(s.x, s.y + 0.55 + hop, s.z), Q.identity(), S); crowd.setMatrixAt(i, M);
        M.compose(P.set(s.x, s.y + 1.25 + hop, s.z), Q.identity(), S); heads2.setMatrixAt(i, M);
      });
      crowd.instanceMatrix.needsUpdate = true; heads2.instanceMatrix.needsUpdate = true;
      // A slow camera drift, like a crane shot.
      if (!calm) { w.camera.position.set(Math.sin(now * 0.12) * 2.2, 3.6 + Math.sin(now * 0.17) * 0.3, 13); }
      w.camera.lookAt(0, 3.2, -4);
    });
    return () => w.dispose();
  }, [feed]);
  return <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden />;
}
