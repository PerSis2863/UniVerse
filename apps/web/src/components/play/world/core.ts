import * as THREE from 'three';

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
  private raf = 0;
  private last = 0;
  private ro: ResizeObserver;
  private loop: ((dt: number, t: number) => void) | null = null;
  private vis = () => { if (document.hidden) this.pause(); else this.resume(); };

  constructor(public canvas: HTMLCanvasElement, { fov = 70, bg = 0x0b0b10, fog }: { fov?: number; bg?: number; fog?: [number, number, number] } = {}) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.phone, powerPreference: 'high-performance' });
    // Phones draw fewer pixels and no shadows, so the frame rate holds.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.phone ? 1.5 : 2));
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
    const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 1 / 60;
    this.last = t;
    this.loop?.(dt, t / 1000);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.frame);
  };

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
      for (const x of mats) { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose(); }
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
  constructor(color = 0xec4899, { skin = 0xf5c9a0, legs = 0x1f2937, face = true } = {}) {
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
    this.limbs = [
      part([0.32, 0.85, 0.32], [-0.62, 1.68, 0], mat(skin), true), part([0.32, 0.85, 0.32], [0.62, 1.68, 0], mat(skin), true),
      part([0.42, 0.85, 0.42], [-0.23, 0.85, 0], mat(legs), true), part([0.42, 0.85, 0.42], [0.23, 0.85, 0], mat(legs), true),
    ];
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

/** The camera behind and above a point, looking where the controls face; pulled in front of walls. */
export function follow(cam: THREE.Camera, at: THREE.Vector3, c: Controls, dt: number, { dist = 7, height = 2.4, solids = [] as THREE.Box3[] } = {}) {
  const dir = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), -Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
  const head = at.clone().add(new THREE.Vector3(0, height, 0));
  let d = dist;
  if (solids.length) {
    const ray = new THREE.Ray(head, dir), hit = new THREE.Vector3();
    for (const s of solids) if (ray.intersectBox(s, hit)) d = Math.min(d, Math.max(1.2, hit.distanceTo(head) - 0.3));
  }
  const want = head.clone().addScaledVector(dir, d);
  cam.position.lerp(want, 1 - Math.exp(-18 * dt));
  cam.lookAt(head.x - dir.x * 4, head.y - dir.y * 4, head.z - dir.z * 4);
}

/** First person: the camera at the eyes, turned by the controls. */
export function eyes(cam: THREE.Camera, at: THREE.Vector3, c: Controls, height = 1.6, bob = 0) {
  cam.position.set(at.x, at.y + height + bob, at.z);
  cam.rotation.set(c.pitch, c.yaw, 0, 'YXZ');
}

/** A soft round glow sprite in a colour (cheap stand-in for bloom). */
export function glowSprite(color: number, size = 2) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  const col = new THREE.Color(color);
  grad.addColorStop(0, `rgba(${col.r * 255},${col.g * 255},${col.b * 255},1)`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.set(size, size, 1);
  return s;
}
