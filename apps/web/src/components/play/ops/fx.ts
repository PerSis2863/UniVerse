import { THREE } from '../world/core';
import type { SolidGrid } from './grid';

// Effects for Ridgeline Ops, all pooled (nothing is made while you play): smoke, dust and debris
// (soft, alpha-blended), sparks, embers and flashes (additive), bullet holes that stay on what was
// hit, brass casings that tumble out of the gun and bounce, and tracer streaks. Each pool is one draw.

const PARTICLE_VERT = `attribute float size; attribute float alpha; attribute vec3 tint; varying float vAlpha; varying vec3 vTint;
  void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * (420.0 / -mv.z); vAlpha = alpha; vTint = tint; }`;
const PARTICLE_FRAG = `uniform sampler2D map; varying float vAlpha; varying vec3 vTint;
  void main(){ vec4 c = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vTint * c.rgb, c.a * vAlpha); if (gl_FragColor.a < 0.004) discard; }`;

function puffTexture(soft: boolean) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, img = g.createImageData(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x - 32, y - 32) / 32, n = soft ? 0.75 + 0.25 * Math.sin(x * 0.7) * Math.cos(y * 0.6 + x * 0.2) : 1;
    const a = Math.max(0, 1 - d) ** (soft ? 1.6 : 2.4) * n, o = (y * 64 + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

class Pool {
  points: THREE.Points;
  private n: number;
  private pos: Float32Array; private vel: Float32Array; private size: Float32Array; private alpha: Float32Array; private tint: Float32Array;
  private life: Float32Array; private max: Float32Array; private grow: Float32Array; private grav: Float32Array; private drag: Float32Array; private a0: Float32Array;
  private next = 0; private alive = 0;
  constructor(n: number, additive: boolean) {
    this.n = n;
    this.pos = new Float32Array(n * 3).fill(-9999); this.vel = new Float32Array(n * 3); this.size = new Float32Array(n); this.alpha = new Float32Array(n); this.tint = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.grow = new Float32Array(n); this.grav = new Float32Array(n); this.drag = new Float32Array(n); this.a0 = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('size', new THREE.BufferAttribute(this.size, 1)); g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1)); g.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3));
    const mat = new THREE.ShaderMaterial({ vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG, uniforms: { map: { value: puffTexture(!additive) } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false; this.points.renderOrder = additive ? 3 : 2;
  }
  emit(at: THREE.Vector3, v: THREE.Vector3, color: THREE.Color, size: number, grow: number, life: number, alpha: number, grav: number, drag: number) {
    const i = this.next; this.next = (this.next + 1) % this.n;
    this.pos.set([at.x, at.y, at.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3); this.tint.set([color.r, color.g, color.b], i * 3);
    this.size[i] = size; this.grow[i] = grow; this.life[i] = this.max[i] = life; this.a0[i] = alpha; this.alpha[i] = alpha; this.grav[i] = grav; this.drag[i] = drag;
    this.alive = this.n;
  }
  update(dt: number) {
    if (!this.alive) return;
    let any = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      any++;
      this.life[i] -= dt;
      const j = i * 3, k = Math.exp(-this.drag[i] * dt);
      this.vel[j] *= k; this.vel[j + 1] = this.vel[j + 1] * k - this.grav[i] * dt; this.vel[j + 2] *= k;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.max[i];
      this.alpha[i] = this.a0[i] * Math.min(1, t * 2.5) * Math.min(1, (1 - t) * 8 + 0.2);
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.pos[j + 1] = -9999; }
    }
    if (!any) this.alive = 0;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.alpha.needsUpdate = true; g.attributes.tint.needsUpdate = true;
  }
}

export class Fx {
  group = new THREE.Group();
  private soft: Pool; private glow: Pool;
  private c = new THREE.Color(); private v = new THREE.Vector3(); private p = new THREE.Vector3();
  // Bullet holes: a ring of small dark quads laid on what was hit.
  private holes: THREE.InstancedMesh; private holeNext = 0;
  // Casings: tumbling brass.
  private shells: THREE.InstancedMesh; private shell: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; s: THREE.Vector3; life: number; hits: number }[] = [];
  /** Things that fall and bounce (dropped magazines): a few at a time, the oldest taken away. */
  private props: { o: THREE.Object3D; v: THREE.Vector3; w: THREE.Vector3; life: number; hits: number }[] = [];
  /** A casing or a magazine landing (for its sound). */
  onBounce: ((what: 'shell' | 'mag', at: THREE.Vector3) => void) | null = null;
  private shellNext = 0;
  // Tracers: short bright streaks drawn where bullets are this frame.
  private tracerPos: Float32Array; private tracerCol: Float32Array; private tracers: THREE.LineSegments; private tracerN = 0; private tracerWas = 0;
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private one = new THREE.Vector3(1, 1, 1);
  constructor(phone: boolean, private grid: SolidGrid) {
    this.soft = new Pool(phone ? 700 : 1800, false); this.glow = new Pool(phone ? 300 : 800, true);
    this.group.add(this.soft.points, this.glow.points);
    const hc = document.createElement('canvas'); hc.width = hc.height = 32;
    const hg = hc.getContext('2d')!, grad = hg.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(10,10,10,0.95)'); grad.addColorStop(0.35, 'rgba(25,22,20,0.85)'); grad.addColorStop(0.6, 'rgba(60,55,50,0.35)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    hg.fillStyle = grad; hg.fillRect(0, 0, 32, 32);
    this.holes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.14, 0.14), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 1 }), phone ? 80 : 240);
    this.holes.count = 0; this.holes.frustumCulled = false;
    this.shells = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.006, 0.006, 0.045, 6), new THREE.MeshStandardMaterial({ color: 0xc9a34a, metalness: 1, roughness: 0.3 }), 40);
    this.shells.count = 0; this.shells.frustumCulled = false;
    for (let i = 0; i < 40; i++) this.shell.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), s: new THREE.Vector3(), life: 0, hits: 0 });
    this.tracerPos = new Float32Array(128 * 6); this.tracerCol = new Float32Array(128 * 6);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3));
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracers.frustumCulled = false;
    this.group.add(this.holes, this.shells, this.tracers);
  }

  /** Smoke rising (wrecks, the flare, burning things). */
  smoke(at: THREE.Vector3, dark = 0.25, size = 1.6, life = 5) {
    this.c.setRGB(dark, dark, dark * 1.02);
    this.soft.emit(this.p.copy(at).add(this.v.set((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)), this.v.set((Math.random() - 0.5) * 0.4 + 0.5, 1.4 + Math.random(), (Math.random() - 0.5) * 0.4 + 0.2), this.c, size, size * 0.9, life, 0.45, -0.05, 0.25);
  }
  /** Coloured smoke (the extraction flare). */
  flare(at: THREE.Vector3, color: number) {
    this.c.set(color);
    this.soft.emit(this.p.copy(at), this.v.set((Math.random() - 0.5) * 0.5 + 0.8, 2.2 + Math.random(), (Math.random() - 0.5) * 0.5 + 0.3), this.c, 1.2, 2.2, 6, 0.7, -0.04, 0.15);
    if (Math.random() < 0.5) this.glow.emit(this.p.copy(at), this.v.set((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2), this.c.set(0xffc9a0), 0.12, 0, 0.5, 1, 6, 0.5);
  }
  /** A bullet hitting something: dust (or sparks off metal), and a hole if it's a wall or the ground. */
  impact(at: THREE.Vector3, normal: THREE.Vector3, kind: 'dirt' | 'stone' | 'metal' | 'wood' | 'flesh' | 'armour', hole = true) {
    const base = kind === 'dirt' ? 0x6b5a44 : kind === 'wood' ? 0x8a6a48 : kind === 'flesh' ? 0x3a2622 : kind === 'armour' ? 0x9db7d6 : 0xb8b2a6;
    for (let i = 0; i < (kind === 'flesh' ? 6 : 8); i++) {
      this.v.copy(normal).multiplyScalar(1.5 + Math.random() * 2.5).add(this.p.set((Math.random() - 0.5) * 1.6, Math.random() * 1.4, (Math.random() - 0.5) * 1.6));
      this.soft.emit(at, this.v, this.c.set(base), 0.14 + Math.random() * 0.1, 0.5, 0.5 + Math.random() * 0.5, 0.7, 2.5, 3);
    }
    if (kind === 'metal' || kind === 'armour') for (let i = 0; i < 7; i++) {
      this.v.copy(normal).multiplyScalar(3 + Math.random() * 4).add(this.p.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4));
      this.glow.emit(at, this.v, this.c.set(kind === 'armour' ? 0x9ed0ff : 0xffc46b), 0.05, -0.04, 0.25 + Math.random() * 0.2, 1, 12, 1);
    }
    // Blood mist off people; a cloud of dust off the ground and stone.
    if (kind === 'flesh') for (let i = 0; i < 5; i++) {
      this.v.copy(normal).multiplyScalar(0.6 + Math.random()).add(this.p.set((Math.random() - 0.5) * 0.8, Math.random() * 0.5, (Math.random() - 0.5) * 0.8));
      this.soft.emit(at, this.v, this.c.setRGB(0.42 + Math.random() * 0.1, 0.03, 0.03), 0.22 + Math.random() * 0.12, 0.9, 0.45 + Math.random() * 0.3, 0.6, 0.6, 2.5);
    }
    if (kind === 'dirt' || kind === 'stone') for (let i = 0; i < 3; i++) {
      this.v.copy(normal).multiplyScalar(0.8 + Math.random() * 0.8).add(this.p.set((Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6));
      this.soft.emit(at, this.v, this.c.set(base).multiplyScalar(1.1), 0.35 + Math.random() * 0.25, 1.4, 1.1 + Math.random() * 0.7, 0.45, 0.15, 1.6);
    }
    if (hole && kind !== 'flesh' && kind !== 'armour') this.hole(at, normal);
  }
  /** Smoke curling up off a hot barrel after a burst. */
  barrelSmoke(at: THREE.Vector3) {
    this.v.set((Math.random() - 0.5) * 0.15, 0.35 + Math.random() * 0.3, (Math.random() - 0.5) * 0.15);
    this.soft.emit(at, this.v, this.c.setRGB(0.7, 0.7, 0.72), 0.06, 0.35, 1.2 + Math.random() * 0.6, 0.22, -0.15, 1.2);
  }
  /** A thing falling from the hands (a magazine): it tumbles, bounces on the ground and lies there a while. */
  drop(o: THREE.Object3D, at: THREE.Vector3, q: THREE.Quaternion, v: THREE.Vector3) {
    if (this.props.length >= 8) { const old = this.props.shift()!; this.group.remove(old.o); }
    o.position.copy(at); o.quaternion.copy(q); o.visible = true;
    this.group.add(o);
    this.props.push({ o, v: v.clone(), w: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6), life: 20, hits: 0 });
  }
  private hole(at: THREE.Vector3, normal: THREE.Vector3) {
    this.q.setFromUnitVectors(this.v.set(0, 0, 1), normal);
    const s = 0.7 + Math.random() * 0.6;
    this.holes.setMatrixAt(this.holeNext, this.m4.compose(this.p.copy(at).addScaledVector(normal, 0.01), this.q, this.v.set(s, s, s)));
    this.holeNext = (this.holeNext + 1) % this.holes.instanceMatrix.count;
    this.holes.count = Math.max(this.holes.count, this.holeNext || this.holes.instanceMatrix.count);
    this.holes.instanceMatrix.needsUpdate = true;
  }
  /** An explosion: a fireball, sparks, a column of smoke, debris. */
  boom(at: THREE.Vector3, big = 1) {
    for (let i = 0; i < 26 * big; i++) { this.v.set((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8).multiplyScalar(big); this.glow.emit(at, this.v, this.c.setHSL(0.07 + Math.random() * 0.05, 1, 0.55), 1.4 * big, 2.5, 0.45 + Math.random() * 0.3, 1, -1, 3); }
    for (let i = 0; i < 30 * big; i++) { this.v.set((Math.random() - 0.5) * 18, Math.random() * 14, (Math.random() - 0.5) * 18); this.glow.emit(at, this.v, this.c.set(0xffb347), 0.08, -0.05, 0.8 + Math.random() * 0.6, 1, 14, 0.6); }
    for (let i = 0; i < 18 * big; i++) { this.v.set((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3); this.soft.emit(at, this.v, this.c.setRGB(0.18, 0.17, 0.16), 2.2 * big, 2.4, 3 + Math.random() * 3, 0.65, -0.1, 0.6); }
    for (let i = 0; i < 16; i++) { this.v.set((Math.random() - 0.5) * 12, 4 + Math.random() * 8, (Math.random() - 0.5) * 12); this.soft.emit(at, this.v, this.c.setRGB(0.3, 0.26, 0.2), 0.18, 0, 1.6, 0.9, 16, 0.4); }
  }
  /** The muzzle's flash in the world (seen by others, lights the smoke). */
  muzzle(at: THREE.Vector3, dir: THREE.Vector3) {
    for (let i = 0; i < 3; i++) { this.v.copy(dir).multiplyScalar(2 + i * 2); this.glow.emit(at, this.v, this.c.set(0xffc06a), 0.35 - i * 0.08, -1, 0.05, 1, 0, 0); }
    this.v.copy(dir).multiplyScalar(1.2).add(this.p.set(0, 0.4, 0));
    this.soft.emit(at, this.v, this.c.setRGB(0.55, 0.55, 0.55), 0.18, 0.9, 0.7, 0.25, -0.2, 2);
  }
  /** A brass casing kicked out to the right of the gun. */
  eject(at: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3) {
    const s = this.shell[this.shellNext]; this.shellNext = (this.shellNext + 1) % this.shell.length;
    s.p.copy(at); s.v.copy(right).multiplyScalar(2.4 + Math.random()).addScaledVector(up, 1.6 + Math.random()); s.r.set(Math.random() * 6, Math.random() * 6, 0); s.s.set(12 + Math.random() * 10, 8, 4); s.life = 2.5; s.hits = 0;
    this.shells.count = this.shell.length;
  }
  /** A tracer streak this frame, from `a` to `b`. */
  streak(a: THREE.Vector3, b: THREE.Vector3, color: number, k = 1) {
    if (this.tracerN >= 128) return;
    const i = this.tracerN++;
    this.tracerPos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    this.c.set(color).multiplyScalar(k);
    this.tracerCol.set([this.c.r * 0.15, this.c.g * 0.15, this.c.b * 0.15, this.c.r, this.c.g, this.c.b], i * 6);
  }

  update(dt: number) {
    this.soft.update(dt); this.glow.update(dt);
    let live = false;
    for (let i = 0; i < this.shell.length; i++) {
      const s = this.shell[i];
      if (s.life <= 0) { this.shells.setMatrixAt(i, this.m4.makeScale(0, 0, 0)); continue; }
      live = true;
      s.life -= dt; s.v.y -= 9.8 * dt; s.p.addScaledVector(s.v, dt);
      s.r.x += s.s.x * dt; s.r.y += s.s.y * dt;
      const g = this.grid.ground(s.p.x, s.p.z);
      if (s.p.y < g + 0.006) {
        if (s.hits++ < 2 && Math.abs(s.v.y) > 0.6) this.onBounce?.('shell', s.p);
        s.p.y = g + 0.006; s.v.multiplyScalar(0.35); s.v.y = Math.abs(s.v.y) * 0.4; s.s.multiplyScalar(0.5);
      }
      this.shells.setMatrixAt(i, this.m4.compose(s.p, this.q.setFromEuler(s.r), this.one));
    }
    if (live || this.shells.count) this.shells.instanceMatrix.needsUpdate = true;
    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i], o = p.o;
      p.life -= dt;
      if (p.life <= 0) { this.group.remove(o); this.props.splice(i, 1); continue; }
      if (p.hits > 4 && p.v.lengthSq() < 0.01) continue;
      p.v.y -= 9.8 * dt; o.position.addScaledVector(p.v, dt);
      o.rotation.x += p.w.x * dt; o.rotation.y += p.w.y * dt; o.rotation.z += p.w.z * dt;
      const g = this.grid.ground(o.position.x, o.position.z) + 0.03;
      if (o.position.y < g) {
        if (p.hits++ === 0) this.onBounce?.('mag', o.position);
        o.position.y = g; p.v.y = Math.abs(p.v.y) * 0.3; p.v.x *= 0.5; p.v.z *= 0.5; p.w.multiplyScalar(0.4);
        if (p.hits > 3) { p.v.set(0, 0, 0); p.w.set(0, 0, 0); o.rotation.x = Math.round(o.rotation.x / (Math.PI / 2)) * (Math.PI / 2); o.rotation.z = Math.round(o.rotation.z / (Math.PI / 2)) * (Math.PI / 2); }
      }
    }
    // Tracers are redrawn every frame from what the bullets report; clear what's left over.
    if (this.tracerN || this.tracerWas) {
      if (this.tracerWas > this.tracerN) this.tracerCol.fill(0, this.tracerN * 6, this.tracerWas * 6);
      this.tracers.geometry.attributes.position.needsUpdate = true; this.tracers.geometry.attributes.color.needsUpdate = true;
    }
    this.tracerWas = this.tracerN; this.tracerN = 0;
  }
}
