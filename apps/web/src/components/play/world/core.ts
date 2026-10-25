import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The 3D worlds of UniVerse Play (M36, the owner: "Roblox games… shooting, horror, science fiction…
// big games"): one renderer, scene and camera per round, a frame loop that pauses in a hidden tab,
// solid boxes to stand on and bump into, the player's controls (keys and mouse, or a joystick and
// a look pad on a phone), and a blocky character. three.js loads only with these games.

export { THREE };

const PHONE = () => matchMedia('(pointer: coarse)').matches;

/** The renderer, scene and camera, sized to the canvas's box; `loop` runs once per frame. */
export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  /** Everything solid: the player stands on and bumps into these. */
  solids: THREE.Box3[] = [];
  phone = PHONE();
  /** The sun from lights(): it follows a point (the player) so shadows go everywhere. */
  sun: THREE.DirectionalLight | null = null;
  private sunAt = new THREE.Vector3(30, 50, 20);
  private raf = 0;
  private last = 0;
  // Automatic quality: the pixel ratio steps down when frames come late, back up when there's room.
  private maxRatio = 1;
  private ratio = 1;
  private slow = 0;
  private fast = 0;
  private ro: ResizeObserver;
  private loop: ((dt: number, t: number) => void) | null = null;
  private vis = () => { if (document.hidden) this.pause(); else this.resume(); };

  constructor(public canvas: HTMLCanvasElement, { fov = 70, bg = 0x0b0b10, fog }: { fov?: number; bg?: number; fog?: [number, number, number] } = {}) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.phone, powerPreference: 'high-performance' });
    // Phones draw fewer pixels and no shadows, so the frame rate holds.
    this.maxRatio = this.ratio = Math.min(window.devicePixelRatio || 1, this.phone ? 1.5 : 2);
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.shadowMap.enabled = !this.phone;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color(bg);
    if (fog) this.scene.fog = new THREE.Fog(fog[0], fog[1], fog[2]);
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 400);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    document.addEventListener('visibilitychange', this.vis);
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start(loop: (dt: number, t: number) => void) { this.loop = loop; this.resume(); }
  pause() { cancelAnimationFrame(this.raf); this.raf = 0; this.last = 0; }
  resume() { if (!this.raf && this.loop) this.raf = requestAnimationFrame(this.frame); }
  private frame = (t: number) => {
    // A long gap (a stall, a slow phone) counts as one short step, so nothing jumps through walls.
    const raw = this.last ? (t - this.last) / 1000 : 1 / 60;
    const dt = Math.min(0.05, raw);
    this.last = t;
    this.tune(raw);
    this.loop?.(dt, t / 1000);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Half a second of late frames (under ~45 fps) lowers the resolution a step; two seconds of quick
   *  ones (over ~80 fps) raise it back. Never below 0.6× or above the starting ratio. */
  private tune(raw: number) {
    if (raw > 0.2) return; // a hidden tab or a stall, not a slow device
    if (raw > 1 / 45) { this.slow += raw; this.fast = 0; } else if (raw < 1 / 80) { this.fast += raw; this.slow = 0; } else { this.slow = Math.max(0, this.slow - raw); }
    const set = (r: number) => { this.ratio = r; this.renderer.setPixelRatio(r); this.resize(); this.slow = this.fast = 0; };
    if (this.slow > 0.5 && this.ratio > 0.6) set(Math.max(0.6, this.ratio - 0.25));
    else if (this.fast > 2 && this.ratio < this.maxRatio) set(Math.min(this.maxRatio, this.ratio + 0.25));
  }

  /** Keeps the sun (and its shadow box) over a point. */
  sunOver(at: THREE.Vector3) {
    if (!this.sun) return;
    this.sun.position.set(at.x + this.sunAt.x, at.y + this.sunAt.y, at.z + this.sunAt.z);
    this.sun.target.position.copy(at);
  }

  /** Many static boxes with one material as a single mesh (one draw call); their boxes stay solid. */
  boxes(list: { at: [number, number, number]; size: [number, number, number] }[], material: THREE.Material, solid = true, parent: THREE.Object3D = this.scene) {
    if (!list.length) return null;
    const geos = list.map(({ at, size }) => new THREE.BoxGeometry(...size).translate(...at));
    const mesh = new THREE.Mesh(mergeGeometries(geos), material);
    geos.forEach((g) => g.dispose());
    mesh.castShadow = mesh.receiveShadow = !this.phone;
    parent.add(mesh);
    if (solid) for (const { at, size } of list) this.solids.push(new THREE.Box3(new THREE.Vector3(at[0] - size[0] / 2, at[1] - size[1] / 2, at[2] - size[2] / 2), new THREE.Vector3(at[0] + size[0] / 2, at[1] + size[1] / 2, at[2] + size[2] / 2)));
    return mesh;
  }

  /** A box in the world; solid ones also block the player. */
  box(at: [number, number, number], size: [number, number, number], material: THREE.Material, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...at);
    mesh.castShadow = mesh.receiveShadow = !this.phone;
    this.scene.add(mesh);
    if (solid) this.solids.push(new THREE.Box3().setFromObject(mesh));
    return mesh;
  }

  /** A sun with soft shadows (computers) and a sky light. */
  lights({ sky = 0xbfd8ff, ground = 0x302838, sun = 0xffffff, power = 2.2, at = [30, 50, 20] as [number, number, number], ambient = 0.9 } = {}) {
    this.scene.add(new THREE.HemisphereLight(sky, ground, ambient));
    const d = new THREE.DirectionalLight(sun, power);
    d.position.set(...at);
    this.sunAt.set(...at);
    this.sun = d;
    this.scene.add(d.target);
    d.castShadow = !this.phone;
    d.shadow.mapSize.set(1024, 1024);
    Object.assign(d.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 140 });
    this.scene.add(d);
    return d;
  }

  dispose() {
    this.pause();
    this.loop = null;
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.vis);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const x of mats) { const map = (x as THREE.MeshStandardMaterial).map; if (map && ![...glows.values()].includes(map as THREE.CanvasTexture)) map.dispose(); x.dispose(); }
    });
    this.renderer.dispose();
  }
}

/** Keys, mouse look (the pointer locks on a click) and, on phones, a joystick and a look pad. */
export class Controls {
  keys = new Set<string>();
  yaw = 0; pitch = -0.15;
  /** The joystick's push, -1…1 each way (phones). */
  stick = { x: 0, y: 0 };
  /** Buttons pressed since the game last read them. */
  pressed = new Set<'jump' | 'fire' | 'act'>();
  held = new Set<'fire' | 'act'>();
  private off: (() => void)[] = [];

  constructor(private el: HTMLElement, { lock = true, sensitivity = 0.0024 } = {}) {
    const on = <K extends keyof WindowEventMap>(t: EventTarget, k: K, f: (e: WindowEventMap[K]) => void, o?: AddEventListenerOptions) => {
      t.addEventListener(k, f as EventListener, o);
      this.off.push(() => t.removeEventListener(k, f as EventListener, o));
    };
    on(window, 'keydown', (e) => {
      if (e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (!e.repeat) {
        if (k === ' ') this.pressed.add('jump');
        if (k === 'e' || k === 'f') { this.pressed.add('act'); this.held.add('act'); }
      }
      this.keys.add(k);
    });
    on(window, 'keyup', (e) => { const k = e.key.toLowerCase(); this.keys.delete(k); if (k === 'e' || k === 'f') this.held.delete('act'); });
    on(window, 'blur', () => { this.keys.clear(); this.held.clear(); });
    // Mouse: click locks the pointer (Esc unlocks), then moving the mouse turns; holding fires.
    on(el, 'mousedown', (e) => {
      if (lock && document.pointerLockElement !== el && !matchMedia('(pointer: coarse)').matches) { el.requestPointerLock?.(); return; }
      if (e.button === 0) { this.pressed.add('fire'); this.held.add('fire'); }
    });
    on(window, 'mouseup', () => this.held.delete('fire'));
    on(window, 'mousemove', (e) => {
      if (document.pointerLockElement !== el) return;
      this.turn(e.movementX * sensitivity, e.movementY * sensitivity);
    });
  }

  setStick(x: number, y: number) { this.stick = { x, y }; }
  press(b: 'jump' | 'fire' | 'act') { this.pressed.add(b); if (b !== 'jump') this.held.add(b); }
  release(b: 'jump' | 'fire' | 'act') { if (b !== 'jump') this.held.delete(b); }

  turn(dx: number, dy: number) {
    this.yaw -= dx;
    this.pitch = Math.max(-1.2, Math.min(0.9, this.pitch - dy));
  }

  /** Where the player wants to go this frame, relative to where the camera faces (length ≤ 1). */
  wish(): THREE.Vector2 {
    const k = this.keys;
    let f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    let r = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    f += -this.stick.y; r += this.stick.x;
    const v = new THREE.Vector2(r, f);
    if (v.lengthSq() > 1) v.normalize();
    // Turn into world x/z by the camera's yaw (forward is -z).
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    return new THREE.Vector2(v.x * c - v.y * s, -v.x * s - v.y * c);
  }

  take(b: 'jump' | 'fire' | 'act') { const had = this.pressed.has(b); this.pressed.delete(b); return had; }
  get running() { return this.keys.has('shift'); }

  dispose() { this.off.forEach((f) => f()); if (document.pointerLockElement === this.el) document.exitPointerLock(); }
}

/** A body that walks, jumps and falls among the world's solid boxes (an upright box, resolved one
 *  axis at a time). */
export class Body {
  pos: THREE.Vector3;
  vel = new THREE.Vector3();
  ground = false;
  constructor(at: [number, number, number], public half = new THREE.Vector3(0.35, 0.9, 0.35)) { this.pos = new THREE.Vector3(...at); }

  box(at = this.pos) { return new THREE.Box3(new THREE.Vector3(at.x - this.half.x, at.y, at.z - this.half.z), new THREE.Vector3(at.x + this.half.x, at.y + this.half.y * 2, at.z + this.half.z)); }

  /** Moves by the velocity for dt, stopping at solids; returns the solid it stands on, if any. */
  step(dt: number, solids: THREE.Box3[], gravity = 28): THREE.Box3 | null {
    this.vel.y -= gravity * dt;
    let floor: THREE.Box3 | null = null;
    this.ground = false;
    for (const axis of ['x', 'y', 'z'] as const) {
      this.pos[axis] += this.vel[axis] * dt;
      const me = this.box();
      for (const s of solids) {
        if (!me.intersectsBox(s)) continue;
        if (axis === 'y') {
          if (this.vel.y <= 0) { this.pos.y = s.max.y; this.ground = true; floor = s; } else this.pos.y = s.min.y - this.half.y * 2;
          this.vel.y = 0;
        } else {
          // A low step (under 0.45) is climbed instead of blocking.
          if (s.max.y - this.pos.y < 0.45 && this.vel.y <= 0) { this.pos.y = s.max.y; continue; }
          this.pos[axis] = this.vel[axis] > 0 ? s.min[axis] - this.half[axis] - 0.001 : s.max[axis] + this.half[axis] + 0.001;
          this.vel[axis] = 0;
        }
        me.copy(this.box());
      }
    }
    return floor;
  }
}

/** Eases a value toward a target, the same at any frame rate. */
export const approach = (v: number, to: number, rate: number, dt: number) => v + (to - v) * (1 - Math.exp(-rate * dt));

/** Walking and jumping from the controls: speeds up and slows down smoothly, faces where it goes. */
export function walk(b: Body, c: Controls, dt: number, { speed = 7, run = 1.45, jump = 10.5, air = 0.35 } = {}) {
  const w = c.wish(), top = speed * (c.running ? run : 1), grip = b.ground ? 14 : 14 * air;
  b.vel.x = approach(b.vel.x, w.x * top, grip, dt);
  b.vel.z = approach(b.vel.z, w.y * top, grip, dt);
  const jumped = c.take('jump') && b.ground;
  if (jumped) b.vel.y = jump;
  return jumped;
}

/** A Roblox-style blocky character: head with a face, body, arms and legs that swing as it walks. */
export class Avatar {
  group = new THREE.Group();
  private limbs: THREE.Mesh[] = [];
  private swing = 0;
  constructor(color = 0xec4899, { skin = 0xf5c9a0, legs = 0x1f2937, face = true, hat = 'none' as string } = {}) {
    const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c });
    const part = (size: [number, number, number], at: [number, number, number], m: THREE.Material, pivotTop = false) => {
      const g = new THREE.BoxGeometry(...size);
      if (pivotTop) g.translate(0, -size[1] / 2, 0);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(...at);
      mesh.castShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    part([0.9, 0.9, 0.45], [0, 1.25, 0], mat(color));
    const head = part([0.55, 0.55, 0.55], [0, 1.98, 0], face ? [mat(skin), mat(skin), mat(skin), mat(skin), new THREE.MeshLambertMaterial({ map: faceTexture() }), mat(skin)] as unknown as THREE.Material : mat(skin));
    head.castShadow = true;
    this.hat(hat, head.position.y + 0.28);
    this.limbs = [
      part([0.32, 0.85, 0.32], [-0.62, 1.68, 0], mat(skin), true), part([0.32, 0.85, 0.32], [0.62, 1.68, 0], mat(skin), true),
      part([0.42, 0.85, 0.42], [-0.23, 0.85, 0], mat(legs), true), part([0.42, 0.85, 0.42], [0.23, 0.85, 0], mat(legs), true),
    ];
  }
  /** A hat on the head (the looks unlocked by level, PlayerCard.tsx). */
  private hat(kind: string, top: number) {
    const add = (g: THREE.BufferGeometry, color: number, at: [number, number, number], glow = false) => {
      const m = new THREE.Mesh(g, glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }));
      m.position.set(...at); m.castShadow = true; this.group.add(m); return m;
    };
    if (kind === 'cap') { add(new THREE.BoxGeometry(0.6, 0.16, 0.6), 0xec4899, [0, top + 0.06, 0]); add(new THREE.BoxGeometry(0.5, 0.05, 0.3), 0xbe185d, [0, top, 0.4]); }
    if (kind === 'antenna') { add(new THREE.CylinderGeometry(0.02, 0.02, 0.4), 0x94a3b8, [0, top + 0.2, 0]); add(new THREE.SphereGeometry(0.08, 10, 8), 0x22d3ee, [0, top + 0.42, 0], true); }
    if (kind === 'tophat') { add(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20), 0x111827, [0, top + 0.03, 0]); add(new THREE.CylinderGeometry(0.27, 0.27, 0.42, 20), 0x111827, [0, top + 0.25, 0]); add(new THREE.CylinderGeometry(0.275, 0.275, 0.07, 20), 0xec4899, [0, top + 0.09, 0]); }
    if (kind === 'crown') for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; add(new THREE.ConeGeometry(0.08, 0.24, 6), 0xfacc15, [Math.cos(a) * 0.22, top + 0.12, Math.sin(a) * 0.22]); }
    if (kind === 'crown') add(new THREE.CylinderGeometry(0.29, 0.29, 0.08, 20, 1, true), 0xfacc15, [0, top + 0.03, 0]);
    if (kind === 'halo') { const h = add(new THREE.TorusGeometry(0.3, 0.04, 8, 32), 0xfde68a, [0, top + 0.28, 0], true); h.rotation.x = Math.PI / 2; }
    if (kind === 'horns') for (const x of [-0.2, 0.2]) { const h = add(new THREE.ConeGeometry(0.07, 0.3, 8), 0xdc2626, [x, top + 0.1, 0]); h.rotation.z = x > 0 ? -0.4 : 0.4; }
  }

  /** Faces a fixed direction (an angle about y) instead of where it moves (shooters aim). */
  facing: number | null = null;
  /** Turns toward where it moves and swings its limbs by its speed. */
  update(dt: number, vel: THREE.Vector3, ground: boolean) {
    const sp = Math.hypot(vel.x, vel.z);
    if (this.facing !== null) this.group.rotation.y = this.facing;
    else if (sp > 0.3) {
      const want = Math.atan2(vel.x, vel.z);
      let d = want - this.group.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.group.rotation.y += d * (1 - Math.exp(-14 * dt));
    }
    this.swing += dt * sp * 1.6;
    const a = ground ? Math.sin(this.swing) * Math.min(1, sp / 6) * 0.9 : -0.6;
    this.limbs[0].rotation.x = a; this.limbs[1].rotation.x = -a;
    this.limbs[2].rotation.x = ground ? -a : 0.4; this.limbs[3].rotation.x = ground ? a : -0.3;
  }
}

/** A smiling face, drawn once. */
let faceTex: THREE.CanvasTexture | null = null;
function faceTexture() {
  if (faceTex) return faceTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f5c9a0'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#111'; g.fillRect(18, 20, 7, 11); g.fillRect(39, 20, 7, 11);
  g.strokeStyle = '#111'; g.lineWidth = 4; g.beginPath(); g.arc(32, 36, 13, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  faceTex = new THREE.CanvasTexture(c);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.magFilter = THREE.NearestFilter;
  return faceTex;
}

/** The camera behind and above a point, looking where the controls face; pulled in front of walls.
 *  (Reuses its vectors: nothing new is made each frame.) */
const F = { dir: new THREE.Vector3(), head: new THREE.Vector3(), want: new THREE.Vector3(), hit: new THREE.Vector3(), ray: new THREE.Ray() };
export function follow(cam: THREE.Camera, at: THREE.Vector3, c: Controls, dt: number, { dist = 7, height = 2.4, solids = [] as THREE.Box3[] } = {}) {
  const { dir, head, want, hit, ray } = F;
  dir.set(Math.sin(c.yaw) * Math.cos(c.pitch), -Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
  head.set(at.x, at.y + height, at.z);
  let d = dist;
  if (solids.length) {
    ray.set(head, dir);
    for (const s of solids) if (ray.intersectBox(s, hit)) d = Math.min(d, Math.max(1.2, hit.distanceTo(head) - 0.3));
  }
  want.copy(head).addScaledVector(dir, d);
  cam.position.lerp(want, 1 - Math.exp(-18 * dt));
  cam.lookAt(head.x - dir.x * 4, head.y - dir.y * 4, head.z - dir.z * 4);
}

/** First person: the camera at the eyes, turned by the controls. */
export function eyes(cam: THREE.Camera, at: THREE.Vector3, c: Controls, height = 1.6, bob = 0) {
  cam.position.set(at.x, at.y + height + bob, at.z);
  cam.rotation.set(c.pitch, c.yaw, 0, 'YXZ');
}

/** A soft round glow sprite in a colour (cheap stand-in for bloom). The glow image is made once per
 *  colour and shared (a new texture per bolt or spark made the GPU stutter). */
const glows = new Map<number, THREE.CanvasTexture>();
export function glowSprite(color: number, size = 2) {
  let tex = glows.get(color);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    const col = new THREE.Color(color);
    grad.addColorStop(0, `rgba(${col.r * 255},${col.g * 255},${col.b * 255},1)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    tex = new THREE.CanvasTexture(c);
    glows.set(color, tex);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.set(size, size, 1);
  return s;
}
