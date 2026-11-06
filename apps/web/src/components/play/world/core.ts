import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { GFX_CAP, GFX_EVENT, Pace, fitFor, gfxNow, saveFit, setGfx, type Gfx } from './gfx';

// The 3D worlds of UniVerse Play (M36, the owner: "Roblox games… shooting, horror, science fiction…
// big games"): one renderer, scene and camera per round, a frame loop that pauses in a hidden tab,
// solid boxes to stand on and bump into, the player's controls (keys and mouse, or a joystick and
// a look pad on a phone), and a blocky character. three.js loads only with these games.

export { THREE, RoundedBoxGeometry, mergeGeometries };

/** The last step of the effects chain, one full-screen pass instead of three (M118): the glow added
 *  in (the bloom pass's own additive step is skipped), the film curve and colour space (three's
 *  OutputPass keeps setting their defines), then the film finish (M39): a soft vignette, a touch of
 *  contrast and saturation, fine grain, and (M99) a colour fringe a game can raise (`World.look`). */
const FINISH = /* glsl */`precision highp float;
  uniform sampler2D tDiffuse, tBloom; uniform float glow, time, vignette, grain, saturation, contrast, aberr;
  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>
  varying vec2 vUv;
  float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){
    vec4 c = texture2D(tDiffuse, vUv);
    // Dread (M99): the colours split toward the edges, more as something gets close.
    if (aberr > 0.0) { vec2 o = (vUv - 0.5) * aberr; c.r = texture2D(tDiffuse, vUv + o).r; c.b = texture2D(tDiffuse, vUv - o).b; }
    vec4 b = texture2D(tBloom, vUv);
    c.rgb += glow * b.rgb * b.a;
    #if defined( ACES_FILMIC_TONE_MAPPING )
      c.rgb = ACESFilmicToneMapping(c.rgb);
    #elif defined( AGX_TONE_MAPPING )
      c.rgb = AgXToneMapping(c.rgb);
    #elif defined( NEUTRAL_TONE_MAPPING )
      c.rgb = NeutralToneMapping(c.rgb);
    #endif
    #ifdef SRGB_TRANSFER
      c = sRGBTransferOETF(c);
    #endif
    float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
    c.rgb = mix(vec3(l), c.rgb, saturation);
    c.rgb = (c.rgb - 0.5) * contrast + 0.5;
    float d = distance(vUv, vec2(0.5));
    c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.85, d);
    c.rgb += (rand(vUv * 731.0 + time) - 0.5) * grain;
    gl_FragColor = c;
  }`;

function finishPass(bloom: UnrealBloomPass | null) {
  const pass = new OutputPass();
  const u = pass.uniforms as Record<string, THREE.IUniform>;
  Object.assign(u, {
    tBloom: { value: bloom?.renderTargetsHorizontal[0].texture ?? null }, glow: { value: bloom ? 1 : 0 },
    time: { value: 0 }, vignette: { value: 0.35 }, grain: { value: 0.035 }, saturation: { value: 1.08 }, contrast: { value: 1.06 }, aberr: { value: 0 },
  });
  pass.material.fragmentShader = FINISH;
  if (bloom) {
    // The bloom pass ends by adding itself onto the picture (a full-screen pass into the 4× buffer):
    // this pass adds it instead. (three r180's internals: its quad and blend material.)
    const quad = (bloom as unknown as { _fsQuad: { material: THREE.Material; render: (r: THREE.WebGLRenderer) => void } })._fsQuad;
    const draw = quad.render.bind(quad);
    quad.render = (r) => { if (quad.material !== bloom.blendMaterial) draw(r); };
  }
  return { pass, u };
}

const PHONE = () => matchMedia('(pointer: coarse)').matches;
/** The buttons a game reads: jump, fire, act (E/F), and its special skill (Q/R); a shooter can also
 *  aim (right mouse), swap guns, heal and throw (its own keys, and phone buttons). */
export type Button = 'jump' | 'fire' | 'act' | 'skill' | 'aim' | 'swap' | 'heal' | 'throw' | 'crouch' | 'plate' | 'inv' | 'nvg';

/** The renderer, scene and camera, sized to the canvas's box; `loop` runs once per frame. */
/** A box, with rounded edges when `round` is set (kept under half its thinnest side). */
function shape(size: [number, number, number], round: number): THREE.BufferGeometry {
  const r = Math.min(round, Math.min(...size) / 2 - 0.01);
  return r > 0.01 ? new RoundedBoxGeometry(size[0], size[1], size[2], 2, r) : new THREE.BoxGeometry(...size);
}

/** UVs from where each face sits in the world (one texture tile every `tile` units), so stone,
 *  metal and tiles have the same grain on a small step and a long wall. */
export function worldUv(geo: THREE.BufferGeometry, tile: number, at: readonly number[] = [0, 0, 0]) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + at[0], y = p.getY(i) + at[1], z = p.getZ(i) + at[2];
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, x / tile, z / tile);
    else if (ax >= az) uv.setXY(i, z / tile, y / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  uv.needsUpdate = true;
  return geo;
}

/** The physical sky's settings (M102): where the sun is (degrees above the horizon and round from
 *  north), how hazy the air is, and how bright the dome is drawn. */
export interface SkyLook { elevation?: number; azimuth?: number; turbidity?: number; rayleigh?: number; mie?: number; mieG?: number; gain?: number; env?: number }

/** three's physical sky (Preetham's daylight model) with a brightness the worlds can set: it's made
 *  for a darker exposure than ours. Drawn at the far plane, so it never hides anything. */
function skyDome() {
  const s = new Sky();
  const m = s.material as THREE.ShaderMaterial;
  m.uniforms.gain = { value: 0.55 };
  m.fragmentShader = `uniform float gain;\n${m.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * gain, 1.0 );')}`;
  return s;
}

/** Ambient occlusion (M102): corners, the ground under a figure and gaps between blocks darken the
 *  way real light does. Worked out at half size (it's soft anyway). Glows, sparks, clouds and other
 *  see-through things are left out of its view of the scene, or they'd cast dark halos. */
function occlusion(scene: THREE.Scene, camera: THREE.Camera, strength: number) {
  const pass = new GTAOPass(scene, camera, 1, 1);
  pass.blendIntensity = strength;
  pass.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12 });
  pass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
  const size = pass.setSize.bind(pass);
  pass.setSize = (w: number, h: number) => size(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
  // Its view of the scene is a second render, which would draw the sun's shadows again (M118: a
  // whole shadow map a frame for nothing): they're already drawn this frame.
  const render = pass.render.bind(pass);
  pass.render = (r, ...rest) => { const auto = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false; render(r, ...rest); r.shadowMap.autoUpdate = auto; };
  const hidden = (pass as unknown as { _visibilityCache: THREE.Object3D[] })._visibilityCache;
  (pass as unknown as { _overrideVisibility: () => void })._overrideVisibility = () => {
    scene.traverseVisible((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
      if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite || (mat && !Array.isArray(mat) && (mat.transparent || !mat.depthWrite))) hidden.push(o);
    });
    for (const o of hidden) o.visible = false;
  };
  return pass;
}

/** A glowing shell around a planet: bright where it meets the planet's edge, fading out into space. */
export function atmosphere(radius: number, color: number, power = 1) {
  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.15, 48, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { glow: { value: new THREE.Color(color) }, power: { value: power } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 glow; uniform float power; varying vec3 vN; varying vec3 vV; void main(){ float r = pow(clamp(-dot(vN, vV) * 2.0, 0.0, 1.0), 2.5) * power; gl_FragColor = vec4(glow * r, r); }',
  }));
}

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
  /** The graphics choice this world was made with (gfx.ts). */
  private gfx = gfxNow();
  // Automatic sharpness (M118): the pixel ratio steps down when frames come late, back up when
  // there's room; the one that holds is kept for the next round.
  private maxRatio = 1;
  private ratio = 1;
  private pace = new Pace();
  /** Seconds the lightest picture still came late (from 1.5 the next round starts a choice lower). */
  private late = 0;
  private ro: ResizeObserver;
  private loop: ((dt: number, t: number) => void) | null = null;
  private vis = () => { if (document.hidden) this.pause(); else this.resume(); };
  private onGfx = (e: Event) => this.choose((e as CustomEvent<Gfx>).detail);

  // The big-game layer (M38): glow (bloom) on computers, camera shake ("trauma"), a field of view
  // that eases (wider at speed), hit-stop, sparks, floating numbers and a fly-in at the start.
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private trauma = 0;
  private freezeUntil = 0;
  private fovBase = 70;
  private fovWant = 70;
  private intro: { from: THREE.Vector3; start: number; dur: number } | null = null;
  /** Where the camera should look during the fly-in (the game keeps it on the player). */
  focus = new THREE.Vector3();
  private sparks: Sparks;
  private texts: { s: THREE.Sprite; life: number; v: number }[] = [];
  /** Floating words' pictures, made once per word and colour. */
  private words = new Map<string, THREE.CanvasTexture>();

  /** The last pass's settings: film curve, glow and film finish (FINISH). */
  private finish: Record<string, THREE.IUniform> | null = null;
  /** Where the scene is drawn, with 4 samples a pixel (the passes after it need only one). */
  private sceneBuffer: THREE.WebGLRenderTarget | null = null;
  /** Soft shadow in corners and under things (M102, computers, Sharp): ambient occlusion, at half size. */
  private ao: GTAOPass | null = null;
  /** The physical sky (M102), kept round the camera; its light is the world's environment. */
  private dome: Sky | null = null;
  private envTex: THREE.Texture | null = null;

  constructor(public canvas: HTMLCanvasElement, { fov = 70, bg = 0x0b0b10, fog, haze, glow, env = 0.6, ao = 0, tone = 'aces', exposure = 1.05 }: {
    fov?: number; bg?: number; fog?: [number, number, number];
    /** Fog that thickens with distance like real air (colour, density), instead of `fog`'s straight fade. */
    haze?: [number, number];
    glow?: { strength: number; radius: number; threshold: number }; env?: number;
    /** How dark corners and contact shadows get (0 none … 1), computers only. */
    ao?: number;
    /** The film curve: ACES (punchy), AgX (natural, real-camera highlights) or neutral. */
    tone?: 'aces' | 'agx' | 'neutral'; exposure?: number;
  } = {}) {
    // The graphics choice (M118, gfx.ts). Computers draw through the effects chain unless Smooth, which
    // (like phones) draws straight to the screen, smoothing edges there instead. Phones never draw
    // shadows, so the frame rate holds.
    const chain = !this.phone && this.gfx !== 'smooth';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.phone && !chain, powerPreference: 'high-performance' });
    // Sharpness starts where the last round with this choice held the frame rate, a step higher (it
    // finds the room again when there is some), at most the choice's cap.
    this.maxRatio = Math.min(window.devicePixelRatio || 1, GFX_CAP[this.gfx]);
    const fit = fitFor(this.gfx);
    this.ratio = fit ? Math.min(this.maxRatio, fit + 0.25) : this.maxRatio;
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.shadowMap.enabled = chain;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = tone === 'agx' ? THREE.AgXToneMapping : tone === 'neutral' ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = exposure;
    this.scene.background = new THREE.Color(bg);
    if (haze) this.scene.fog = new THREE.FogExp2(haze[0], haze[1]);
    else if (fog) this.scene.fog = new THREE.Fog(fog[0], fog[1], fog[2]);
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 400);
    this.fovBase = this.fovWant = fov;
    // Light from all around (image-based): what makes metal, plastic and polished floors look real.
    if (env > 0) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environment = this.envTex;
      this.scene.environmentIntensity = env;
      pmrem.dispose();
    }
    // The effects chain: the scene with smoothed edges (4× samples, only where it's drawn: the passes
    // after it read one sample a pixel), ambient occlusion (made when the game asks, on in Sharp), the
    // glow (works at half size: it's soft anyway, and costs a quarter), then one pass for the film
    // curve, the glow and the film finish.
    if (chain) {
      this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }));
      this.sceneBuffer = this.composer.readBuffer;
      this.sceneBuffer.samples = 4;
      this.sceneBuffer.depthBuffer = true;
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      if (ao > 0) { this.ao = occlusion(this.scene, this.camera, ao); this.ao.enabled = this.gfx === 'sharp'; this.composer.addPass(this.ao); }
      if (glow) { this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), glow.strength, glow.radius, glow.threshold); this.composer.addPass(this.bloom); }
      const last = finishPass(this.bloom);
      this.composer.addPass(last.pass);
      this.finish = last.u;
    }
    this.sparks = new Sparks(this.scene);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    document.addEventListener('visibilitychange', this.vis);
    window.addEventListener(GFX_EVENT, this.onGfx);
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(this.ratio); this.composer.setSize(w, h); }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** A new graphics choice mid-round: the sharpness and the effects change now; shadows and how edges
   *  are smoothed from the next round (changing them now would rebuild every shader mid-play). */
  private choose(g: Gfx) {
    this.gfx = g;
    this.maxRatio = Math.min(window.devicePixelRatio || 1, GFX_CAP[g]);
    this.setRatio(this.maxRatio);
    if (this.ao) this.ao.enabled = g === 'sharp';
    this.glow(g !== 'smooth');
    this.late = 0;
  }

  private setRatio(r: number) {
    this.ratio = r; this.renderer.setPixelRatio(r);
    this.resize(); this.pace.reset();
  }

  /** The glow on or off (the finish pass adds it in). */
  private glow(on: boolean) {
    if (!this.bloom || !this.finish) return;
    this.bloom.enabled = on;
    this.finish.glow.value = on ? 1 : 0;
  }

  start(loop: (dt: number, t: number) => void) {
    this.loop = loop;
    // The shaders are built before the first frame (in parallel where the browser can), not in the
    // first seconds of play, which stuttered (M100). Through the effects chain they're built for its
    // picture, the version that chain draws with.
    // (Not compileAsync: its readiness check throws from a timer if the world closes first.)
    const r = this.renderer, was = r.getRenderTarget();
    if (this.composer) r.setRenderTarget(this.composer.readBuffer);
    const mats = [...r.compile(this.scene, this.camera)];
    r.setRenderTarget(was);
    const t0 = performance.now();
    const wait = () => {
      if (!this.loop) return; // closed meanwhile
      const ready = mats.every((m) => (r.properties.get(m) as { currentProgram?: { isReady(): boolean } }).currentProgram?.isReady() ?? true);
      if (ready || performance.now() - t0 > 1500) this.resume(); else setTimeout(wait, 16);
    };
    wait();
  }
  pause() { cancelAnimationFrame(this.raf); this.raf = 0; this.last = 0; }
  resume() { if (!this.raf && this.loop) this.raf = requestAnimationFrame(this.frame); }
  private frame = (t: number) => {
    // A long gap (a stall, a slow phone) counts as one short step, so nothing jumps through walls.
    const raw = this.last ? (t - this.last) / 1000 : 1 / 60;
    const dt = Math.min(0.05, raw);
    this.last = t;
    this.tune(raw);
    // Hit-stop: a few frames almost still, so a big hit lands.
    const frozen = t < this.freezeUntil;
    this.loop?.(frozen ? dt * 0.06 : dt, t / 1000);
    this.sparks.update(dt);
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const f = this.texts[i];
      f.life -= dt; f.s.position.y += f.v * dt; f.v *= Math.pow(0.15, dt);
      (f.s.material as THREE.SpriteMaterial).opacity = Math.min(1, f.life * 2.5);
      if (f.life <= 0) { this.scene.remove(f.s); f.s.material.dispose(); this.texts.splice(i, 1); }
    }
    // The fly-in: from high above down to where the game put the camera.
    if (this.intro) {
      if (this.intro.start < 0) this.intro.start = t / 1000; // counted from the first frame drawn
      const k = Math.min(1, (t / 1000 - this.intro.start) / this.intro.dur), e = 1 - Math.pow(1 - k, 3);
      this.camera.position.lerpVectors(this.intro.from, this.camera.position, e);
      this.camera.lookAt(this.focus.x, this.focus.y + 1.4, this.focus.z);
      if (k >= 1) this.intro = null;
    }
    // Field of view eases toward what the game asked for.
    if (Math.abs(this.camera.fov - this.fovWant) > 0.05) { this.camera.fov += (this.fovWant - this.camera.fov) * (1 - Math.exp(-6 * dt)); this.camera.updateProjectionMatrix(); }
    // Shake: offset the camera only for this frame's picture.
    const shake = this.trauma * this.trauma;
    const ox = shake ? (Math.sin(t * 0.091) + Math.sin(t * 0.037)) * 0.18 * shake : 0, oy = shake ? (Math.sin(t * 0.083 + 1) + Math.sin(t * 0.029)) * 0.18 * shake : 0, rz = shake ? Math.sin(t * 0.071) * 0.03 * shake : 0;
    if (shake) { this.camera.position.x += ox; this.camera.position.y += oy; this.camera.rotation.z += rz; }
    if (this.finish) this.finish.time.value = (t / 1000) % 100;
    this.dome?.position.copy(this.camera.position);
    if (this.composer) {
      this.composer.render();
      // The chain swaps its two buffers as it goes: the scene is always drawn into the 4× one.
      if (this.composer.readBuffer !== this.sceneBuffer) this.composer.swapBuffers();
    } else this.renderer.render(this.scene, this.camera);
    if (shake) { this.camera.position.x -= ox; this.camera.position.y -= oy; this.camera.rotation.z -= rz; }
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Holding 60 frames a second (M118; M100's ladder waited for under 45, so 45–59 juddered on, and it
   *  rebuilt every shader mid-play to drop shadows or the effects chain). When frames come late
   *  (`Pace`, gfx.ts) the sharpness steps down a quarter (to 0.6× at least: the step that holds is
   *  kept for the next round); at 0.6× the soft corner shadows go, then the glow; if even that is
   *  late, the next round starts a choice lower. A quick screen with room raises the sharpness back.
   *  Nothing here rebuilds a shader. */
  private tune(raw: number) {
    const go = this.pace.feed(raw);
    if (go === 'down') {
      if (this.ratio > 0.6) { this.setRatio(Math.max(0.6, this.ratio - 0.25)); saveFit(this.gfx, this.ratio); }
      else if (this.ao?.enabled) this.ao.enabled = false;
      else if (this.bloom?.enabled) this.glow(false);
      else this.late += 0.5;
    } else if (go === 'up' && this.ratio < this.maxRatio) { this.setRatio(Math.min(this.maxRatio, this.ratio + 0.25)); saveFit(this.gfx, this.ratio); }
  }

  /** The film finish's settings: vignette, grain, saturation, contrast and the dread fringe (0–0.02).
   *  Phones and Smooth draw without the finish, so this changes nothing there. */
  look(o: Partial<Record<'vignette' | 'grain' | 'saturation' | 'contrast' | 'aberr', number>>) {
    if (this.finish) for (const [k, v] of Object.entries(o)) this.finish[k].value = v;
  }

  /** Shakes the camera (0–1; it adds up and calms down by itself). */
  shake(power: number) { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) this.trauma = Math.min(1, this.trauma + power); }
  /** Holds the action almost still for a moment (a big hit). */
  freeze(ms: number) { this.freezeUntil = performance.now() + ms; }
  /** Widens or narrows the view by some degrees from the start (eased). */
  fovBy(deg: number) { this.fovWant = this.fovBase + deg; }
  /** The camera flies in from a point over `dur` seconds, looking at `focus`. */
  flyIn(from: THREE.Vector3, dur = 1.6) { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) this.intro = { from: from.clone(), start: -1, dur }; }
  /** Sparks or dust from a point. */
  burst(at: THREE.Vector3, color: number, n = 16, speed = 6, gravity = 12) { this.sparks.emit(at, color, n, speed, gravity); }
  /** A number or word that rises and fades where something happened ("+100"). */
  say(text: string, at: THREE.Vector3, color = '#ffffff', size = 1) {
    const key = `${text}|${color}`;
    let tex = this.words.get(key);
    if (!tex) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 96;
      const g = c.getContext('2d')!;
      g.font = '900 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeText(text, 128, 50);
      g.fillStyle = color; g.fillText(text, 128, 50);
      tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      if (this.words.size > 48) { const [k0, t0] = this.words.entries().next().value!; t0.dispose(); this.words.delete(k0); }
      this.words.set(key, tex);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(2.4 * size, 0.9 * size, 1); s.position.copy(at); s.renderOrder = 10;
    this.scene.add(s);
    this.texts.push({ s, life: 0.9, v: 2.6 });
  }

  /** A real sky (M102): the physical daylight model, kept round the camera, and the same sky as the
   *  world's light from all around, so metal, glass and water reflect it and shade with its colour.
   *  The sun from lights() moves to shine from where the sky's sun is (call lights() first). Call
   *  again to change it (a new world, sunset): the light is made again then (a few milliseconds);
   *  `relight` false only moves the dome, for a change in steps (relight once at the end). */
  sky({ elevation = 32, azimuth = 150, turbidity = 3.5, rayleigh = 1.4, mie = 0.004, mieG = 0.82, gain = 0.55, env }: SkyLook = {}, relight = true) {
    if (!this.dome) { this.dome = skyDome(); this.dome.scale.setScalar(120); this.dome.frustumCulled = false; this.scene.add(this.dome); }
    const dir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevation), THREE.MathUtils.degToRad(azimuth));
    const set = (m: THREE.ShaderMaterial) => {
      const u = m.uniforms;
      u.turbidity.value = turbidity; u.rayleigh.value = rayleigh; u.mieCoefficient.value = mie; u.mieDirectionalG.value = mieG; u.gain.value = gain;
      u.sunPosition.value.copy(dir);
    };
    set(this.dome.material as THREE.ShaderMaterial);
    this.sunAt.copy(dir).multiplyScalar(80);
    if (this.sun) this.sun.position.copy(this.sun.target.position).add(this.sunAt);
    if (!relight) return dir;
    const copy = skyDome();
    copy.scale.setScalar(50);
    set(copy.material as THREE.ShaderMaterial);
    const room = new THREE.Scene();
    room.add(copy);
    this.envFrom(room, env);
    copy.geometry.dispose(); (copy.material as THREE.Material).dispose();
    return dir;
  }

  /** The world's light from all around, taken from a scene (a sky, a starfield, a nebula). */
  envFrom(room: THREE.Scene, intensity = this.scene.environmentIntensity) {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const tex = pmrem.fromScene(room, 0, 0.1, 200).texture;
    pmrem.dispose();
    this.envTex?.dispose();
    this.envTex = tex;
    this.scene.environment = tex;
    this.scene.environmentIntensity = intensity;
  }

  /** Keeps the sun (and its shadow box) over a point. */
  sunOver(at: THREE.Vector3) {
    if (!this.sun) return;
    this.sun.position.set(at.x + this.sunAt.x, at.y + this.sunAt.y, at.z + this.sunAt.z);
    this.sun.target.position.copy(at);
  }

  /** Many static boxes with one material as a single mesh (one draw call); their boxes stay solid.
   *  `tile` gives textures a fixed size in world units; `round` bevels the edges (they catch light). */
  boxes(list: { at: [number, number, number]; size: [number, number, number] }[], material: THREE.Material | THREE.Material[], solid = true, parent: THREE.Object3D = this.scene, { tile = 0, round = 0 } = {}) {
    if (!list.length) return null;
    const geos = list.map(({ at, size }) => {
      const g = shape(size, round).translate(...at);
      return tile ? worldUv(g, tile) : g;
    });
    const mesh = new THREE.Mesh(mergeGeometries(geos), material);
    geos.forEach((g) => g.dispose());
    mesh.castShadow = mesh.receiveShadow = !this.phone;
    parent.add(mesh);
    if (solid) for (const { at, size } of list) this.solids.push(new THREE.Box3(new THREE.Vector3(at[0] - size[0] / 2, at[1] - size[1] / 2, at[2] - size[2] / 2), new THREE.Vector3(at[0] + size[0] / 2, at[1] + size[1] / 2, at[2] + size[2] / 2)));
    return mesh;
  }

  /** A box in the world; solid ones also block the player. A list of six materials dresses each
   *  side apart (+x, −x, top, bottom, +z, −z): grass on top, rock round the sides. */
  box(at: [number, number, number], size: [number, number, number], material: THREE.Material | THREE.Material[], solid = true, { tile = 0, round = 0 } = {}) {
    const geo = shape(size, round);
    const mesh = new THREE.Mesh(tile ? worldUv(geo, tile, at) : geo, material);
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
    d.shadow.mapSize.set(2048, 2048);
    d.shadow.bias = -0.0004; d.shadow.normalBias = 0.03;
    Object.assign(d.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 160 });
    this.scene.add(d);
    return d;
  }

  dispose() {
    this.pause();
    window.removeEventListener(GFX_EVENT, this.onGfx);
    // What this round learned (M118): the sharpness that held (once it had a fair go), or, when even
    // the lightest picture came late, a lighter choice for the next round.
    if (this.pace.age > 5) saveFit(this.gfx, this.ratio);
    if (this.late >= 1.5 && this.gfx !== 'smooth') setGfx(this.gfx === 'sharp' ? 'balanced' : 'smooth', true);
    // The effects chain doesn't free its own passes (glow, occlusion, finish): free them here.
    this.composer?.passes.forEach((p) => p.dispose());
    this.composer?.dispose();
    this.envTex?.dispose();
    this.words.forEach((t) => t.dispose());
    this.loop = null;
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.vis);
    // Every texture (not only the colour map: surfaces have normal, roughness and glow maps, shaders
    // their own), every light's shadow map: a round left them behind in graphics memory (M118).
    const tex = (v: unknown) => { if (v instanceof THREE.Texture) v.dispose(); };
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const x of mats) {
        Object.values(x).forEach(tex);
        for (const u of Object.values((x as THREE.ShaderMaterial).uniforms ?? {})) tex(u.value);
        x.dispose();
      }
      if ((o as THREE.Light).isLight) (o as THREE.Light).dispose();
    });
    this.renderer.dispose();
    // The canvas has left the page (the round is over): give its graphics memory back now, not
    // whenever the browser collects it. A canvas still on the page (React's second run of an effect
    // in development) keeps its context for the next world.
    if (!this.canvas.isConnected) this.renderer.forceContextLoss();
  }
}

/** Sparks and dust: one Points object of recycled particles, each with its own colour and fall. */
class Sparks {
  private max = 400;
  private alive = 0;
  private pts: THREE.Points;
  private pos = new Float32Array(this.max * 3);
  private col = new Float32Array(this.max * 3);
  private vel = new Float32Array(this.max * 3);
  private life = new Float32Array(this.max);
  private grav = new Float32Array(this.max);
  private next = 0;
  private geo = new THREE.BufferGeometry();
  private color = new THREE.Color();
  constructor(scene: THREE.Scene) {
    for (let i = 0; i < this.max; i++) this.pos[i * 3 + 1] = -9999; // unused ones out of sight
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const pts = new THREE.Points(this.geo, new THREE.PointsMaterial({ size: 0.24, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: glowSprite(0xffffff).material.map }));
    pts.frustumCulled = false; pts.visible = false;
    scene.add(pts);
    this.pts = pts;
  }
  emit(at: THREE.Vector3, color: number, n: number, speed: number, gravity: number) {
    this.color.set(color);
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.max;
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u), v = speed * (0.4 + Math.random() * 0.8);
      this.pos.set([at.x, at.y, at.z], i * 3);
      this.vel.set([Math.cos(a) * r * v, Math.abs(u) * v * 0.9 + speed * 0.2, Math.sin(a) * r * v], i * 3);
      this.col.set([this.color.r, this.color.g, this.color.b], i * 3);
      this.life[i] = 0.5 + Math.random() * 0.5; this.grav[i] = gravity;
    }
    this.alive = Math.min(this.max, this.alive + n);
  }
  update(dt: number) {
    // Nothing flying: nothing to move or draw.
    if (!this.alive) { this.pts.visible = false; return; }
    this.pts.visible = true;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      alive++;
      const j = i * 3;
      this.vel[j + 1] -= this.grav[i] * dt;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      const fade = Math.max(0, Math.min(1, this.life[i] * 2));
      if (this.life[i] <= 0) { this.pos[j + 1] = -9999; }
      this.col[j] *= 0.985 + 0.015 * fade; this.col[j + 1] *= 0.985 + 0.015 * fade; this.col[j + 2] *= 0.985 + 0.015 * fade;
    }
    this.alive = alive;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

/** Keys, mouse look (the pointer locks on a click) and, on phones, a joystick and a look pad. */
export class Controls {
  keys = new Set<string>();
  yaw = 0; pitch = -0.15;
  /** The joystick's push, -1…1 each way (phones). */
  stick = { x: 0, y: 0 };
  /** Buttons pressed since the game last read them. */
  pressed = new Set<Button>();
  held = new Set<Exclude<Button, 'jump'>>();
  private off: (() => void)[] = [];

  /** How far down and up the view can tilt (first person needs more than the chase camera). */
  private pitchRange: [number, number];
  constructor(private el: HTMLElement, { lock = true, sensitivity = 0.0024, pitch = [-1.2, 0.9] as [number, number] } = {}) {
    this.pitchRange = pitch;
    const on = <K extends keyof WindowEventMap>(t: EventTarget, k: K, f: (e: WindowEventMap[K]) => void, o?: AddEventListenerOptions) => {
      t.addEventListener(k, f as EventListener, o);
      this.off.push(() => t.removeEventListener(k, f as EventListener, o));
    };
    on(window, 'keydown', (e) => {
      if (e.metaKey || e.ctrlKey || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (!e.repeat) {
        if (k === ' ') this.pressed.add('jump');
        if (k === 'e' || k === 'f') { this.pressed.add('act'); this.held.add('act'); }
        if (k === 'q' || k === 'r') { this.pressed.add('skill'); this.held.add('skill'); }
        if (k === 'g') this.pressed.add('throw');
      }
      this.keys.add(k);
    });
    on(window, 'keyup', (e) => { const k = e.key.toLowerCase(); this.keys.delete(k); if (k === 'e' || k === 'f') this.held.delete('act'); if (k === 'q' || k === 'r') this.held.delete('skill'); });
    on(window, 'blur', () => { this.keys.clear(); this.held.clear(); });
    // Mouse: click locks the pointer (Esc unlocks), then moving the mouse turns; holding fires.
    on(el, 'mousedown', (e) => {
      if (lock && document.pointerLockElement !== el && !matchMedia('(pointer: coarse)').matches) { el.requestPointerLock?.(); return; }
      if (e.button === 0) { this.pressed.add('fire'); this.held.add('fire'); }
    });
    on(window, 'mouseup', () => this.held.delete('fire'));
    on(window, 'mousemove', (e) => {
      if (document.pointerLockElement !== el) return;
      // Browsers sometimes report one huge jump just after the pointer locks: skip it, or the view spins.
      if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
      this.turn(e.movementX * sensitivity, e.movementY * sensitivity);
    });
  }

  setStick(x: number, y: number) { this.stick = { x, y }; }
  press(b: Button) { this.pressed.add(b); if (b !== 'jump') this.held.add(b); }
  release(b: Button) { if (b !== 'jump') this.held.delete(b); }

  turn(dx: number, dy: number) {
    this.yaw -= dx;
    this.pitch = Math.max(this.pitchRange[0], Math.min(this.pitchRange[1], this.pitch - dy));
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

  take(b: Button) { const had = this.pressed.has(b); this.pressed.delete(b); return had; }
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
          // Standing on it (or touching it overhead) isn't walking into it: without this, a jump
          // (rising, so not on the ground) pushed you out sideways to the edge of what you stood on.
          if (s.max.y <= this.pos.y + 1e-3 || s.min.y >= this.pos.y + this.half.y * 2 - 1e-3) continue;
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

/** Walking and jumping from the controls: speeds up and slows down smoothly, faces where it goes.
 *  `grip` is how fast you change speed on the ground (low on ice, so you slide). */
export function walk(b: Body, c: Controls, dt: number, { speed = 7, run = 1.45, jump = 10.5, air = 0.35, grip: hold = 14 } = {}) {
  const w = c.wish(), top = speed * (c.running ? run : 1), grip = b.ground ? hold : 14 * air;
  b.vel.x = approach(b.vel.x, w.x * top, grip, dt);
  b.vel.z = approach(b.vel.z, w.y * top, grip, dt);
  const jumped = c.take('jump') && b.ground;
  if (jumped) b.vel.y = jump;
  return jumped;
}

/** A Roblox-style blocky character: head with a face, body, arms and legs that swing as it walks. */
export class Avatar {
  group = new THREE.Group();
  /** Arms (0, 1) then legs (2, 3); shooters pose the arms after `update`. */
  limbs: THREE.Mesh[] = [];
  private swing = 0;
  constructor(color = 0xec4899, { skin = 0xf5c9a0, legs = 0x1f2937, face = true, hat = 'none' as string } = {}) {
    const mat = (c: number, rough = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 });
    const part = (size: [number, number, number], at: [number, number, number], m: THREE.Material, pivotTop = false) => {
      // Softly rounded blocks catch highlights along their edges, like a real toy figure.
      const g = new RoundedBoxGeometry(size[0], size[1], size[2], 3, Math.min(...size) * 0.18);
      if (pivotTop) g.translate(0, -size[1] / 2, 0);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(...at);
      mesh.castShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    part([0.9, 0.9, 0.45], [0, 1.25, 0], mat(color, 0.85));
    const head = part([0.55, 0.55, 0.55], [0, 1.98, 0], mat(skin, 0.55));
    if (face) {
      // The face as a thin plate on the front, so the rounded head keeps its shape.
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), new THREE.MeshStandardMaterial({ map: faceTexture(), transparent: true, roughness: 0.5 }));
      plate.position.set(0, 1.98, 0.279); this.group.add(plate);
    }
    head.castShadow = true;
    this.hat(hat, head.position.y + 0.28);
    this.limbs = [
      part([0.32, 0.85, 0.32], [-0.62, 1.68, 0], mat(skin, 0.55), true), part([0.32, 0.85, 0.32], [0.62, 1.68, 0], mat(skin, 0.55), true),
      part([0.42, 0.85, 0.42], [-0.23, 0.85, 0], mat(legs, 0.9), true), part([0.42, 0.85, 0.42], [0.23, 0.85, 0], mat(legs, 0.9), true),
    ];
  }
  /** A hat on the head (the looks unlocked by level, PlayerCard.tsx). */
  private hat(kind: string, top: number) {
    const add = (g: THREE.BufferGeometry, color: number, at: [number, number, number], glow = false) => {
      const m = new THREE.Mesh(g, glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1 }));
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
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  // Eyes: white, a dark iris, a highlight; brows; a smile; a little blush.
  for (const x of [84, 172]) {
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x, 104, 26, 32, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1f2937'; g.beginPath(); g.ellipse(x + 2, 110, 15, 19, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + 8, 100, 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3b2a1e'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - 24, 62); g.quadraticCurveTo(x, 50, x + 24, 60); g.stroke();
  }
  g.fillStyle = 'rgba(255,159,220,0.28)'; g.beginPath(); g.ellipse(58, 160, 22, 12, 0, 0, Math.PI * 2); g.ellipse(198, 160, 22, 12, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#3b2a1e'; g.lineWidth = 10; g.lineCap = 'round'; g.beginPath(); g.arc(128, 150, 40, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  faceTex = new THREE.CanvasTexture(c);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = 4;
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

/** A light that can be handed one of a pool's lights (a lamp, a sign, a flare). */
export interface LightSource { at: THREE.Vector3; color: number; power: number; reach: number; weight?: number }

/** A fixed set of point lights handed each frame to the sources that matter most near a point (M99).
 *  The number of lights never changes, so no shader is rebuilt mid-game (adding a light does that),
 *  and every pixel adds up a few lights instead of every lamp on the floor: dark, lamp-lit scenes
 *  stay cheap enough for 60 frames a second. */
export class LightPool {
  readonly lights: THREE.PointLight[] = [];
  private pick: (LightSource | null)[];
  private score: number[];
  constructor(parent: THREE.Object3D, size = 4, decay = 1.6) {
    for (let i = 0; i < size; i++) { const l = new THREE.PointLight(0xffffff, 0, 8, decay); parent.add(l); this.lights.push(l); }
    this.pick = Array(size).fill(null);
    this.score = Array(size).fill(-1);
  }
  /** Gives the lights to the strongest sources near `near` (power and weight over distance²). */
  update(near: THREE.Vector3, sources: readonly LightSource[]) {
    const n = this.lights.length;
    this.pick.fill(null); this.score.fill(-1);
    for (const s of sources) {
      if (s.power <= 0) continue;
      const sc = ((s.weight ?? 1) * s.power) / (1 + s.at.distanceToSquared(near));
      let i = n - 1;
      if (sc <= this.score[i]) continue;
      while (i > 0 && this.score[i - 1] < sc) { this.score[i] = this.score[i - 1]; this.pick[i] = this.pick[i - 1]; i--; }
      this.score[i] = sc; this.pick[i] = s;
    }
    for (let i = 0; i < n; i++) {
      const l = this.lights[i], s = this.pick[i];
      if (!s) { l.intensity = 0; continue; }
      l.position.copy(s.at); l.color.setHex(s.color); l.intensity = s.power; l.distance = s.reach;
    }
  }
}
