import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { THREE } from '../world/core';

// Ridgeline Ops' renderer (the owner: "PBR… cascaded shadow maps, ambient occlusion, bloom, subtle
// vignette, ACES filmic tone mapping… volumetric ground fog… night vision"): the world and, on top
// with its own depth, the first-person hands and gun (their own scene and camera, so they never
// clip into walls). On a computer the picture goes through an effects chain: ambient occlusion
// (GTAO), sun rays and lens flare, the hands, bloom, tone mapping, then a finish pass (vignette, grain, the flashbang's white,
// damage desaturation, night vision). Shadows: three cascades on high quality, one following
// shadow below that, none on phones. Quality steps down by itself when frames come late. Ground fog
// is the scene's FogExp2 plus a haze that thickens toward the valleys (patched into three's fog
// chunks while the game runs, restored after).

export type Quality = 'high' | 'medium' | 'low';

const FINISH = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.42 }, grain: { value: 0.03 }, saturation: { value: 0.92 }, contrast: { value: 1.12 },
    nvg: { value: 0 }, ads: { value: 0 }, flash: { value: 0 }, desat: { value: 0 }, lift: { value: new THREE.Vector3(0.0, 0.004, 0.012) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, vignette, grain, saturation, contrast, nvg, flash, desat, ads; uniform vec3 lift; varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation * (1.0 - desat));
      c.rgb = (c.rgb - 0.5) * contrast + 0.5 + lift;
      float d = distance(vUv, vec2(0.5));
      if (nvg > 0.5) {
        // Night vision: amplified light in green phosphor, sparkle noise, a round tube edge.
        float a = clamp(l * 5.0 + 0.04, 0.0, 1.0);
        vec3 g = vec3(0.18, 1.0, 0.32) * pow(a, 0.8) + (rand(vUv * 900.0 + time) - 0.5) * 0.16;
        float tube = smoothstep(0.52, 0.42, distance(vUv * vec2(1.0, 0.75), vec2(0.5, 0.375)));
        c.rgb = g * tube;
      } else {
        // Aiming darkens the edges more (the eye on the sight).
        c.rgb *= 1.0 - (vignette + ads * 0.35) * smoothstep(0.3 - ads * 0.1, 0.85 - ads * 0.2, d);
        c.rgb += (rand(vUv * 731.0 + time) - 0.5) * grain;
      }
      c.rgb = mix(c.rgb, vec3(1.0), flash);
      gl_FragColor = c;
    }`,
};

/** Sun rays and lens flare (M41c), on the world before the hands are drawn, in linear light: rays
 *  gather the bright sky on the way to the sun, so trees and hills in front of it cut them into
 *  shafts; the flare (a halo, ghosts along the line through the middle and a wide streak) shows
 *  only while the sun itself is in sight, and fades as something covers it. */
const RAYS = {
  uniforms: { tDiffuse: { value: null }, sun: { value: new THREE.Vector2(0.5, 0.5) }, on: { value: 0 }, flare: { value: 0 }, aspect: { value: 1 }, tint: { value: new THREE.Color(1, 0.85, 0.6) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 sun; uniform float on, flare, aspect; uniform vec3 tint; varying vec2 vUv;
    float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    float sky(vec2 p){ return smoothstep(0.7, 2.2, lum(texture2D(tDiffuse, clamp(p, 0.001, 0.999)).rgb)); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      if (on < 0.002) { gl_FragColor = c; return; }
      vec2 toSun = sun - vUv;
      float far = length(toSun * vec2(aspect, 1.0));
      // Rays: 36 steps toward the sun, each brighter the closer to it, weaker as they go.
      vec2 step = toSun / 36.0 * 0.92; vec2 p = vUv; float decay = 1.0, sum = 0.0;
      for (int i = 0; i < 36; i++) { p += step; sum += sky(p) * decay; decay *= 0.955; }
      float rays = sum / 36.0 * exp(-far * 1.4) * 3.6;
      c.rgb += tint * rays * on;
      // Flare: how much of the sun shows (a few taps round it), then the halo, ghosts and streak.
      if (flare > 0.002) {
        vec2 o = vec2(0.004 / aspect, 0.004);
        float vis = (sky(sun) + sky(sun + o) + sky(sun - o) + sky(sun + vec2(o.x, -o.y)) + sky(sun - vec2(o.x, -o.y))) / 5.0 * flare;
        vec2 q = vUv - sun; q.x *= aspect;
        float d = length(q);
        vec3 f = tint * (exp(-d * 9.0) * 0.5 + smoothstep(0.24, 0.22, d) * smoothstep(0.205, 0.22, d) * 0.08);
        f += tint * exp(-abs(q.y) * 140.0) * exp(-abs(q.x) * 2.2) * 0.35;
        vec2 axis = vec2(0.5) - sun;
        for (int i = 0; i < 5; i++) {
          float k = float(i), at = 0.35 + k * 0.38;
          vec2 g = sun + axis * at * 2.0 - vUv; g.x *= aspect;
          float r = 0.025 + 0.022 * mod(k * 1.7, 3.0);
          vec3 col = mix(vec3(0.5, 0.75, 1.0), vec3(1.0, 0.7, 0.4), mod(k, 2.0));
          f += col * smoothstep(r, r * 0.55, length(g)) * 0.06;
        }
        c.rgb += f * vis;
      }
      gl_FragColor = c;
    }`,
};

/** Height fog: the scene's FogExp2 plus a ground haze that's thickest low down. */
const FOG_CHUNKS = {
  fog_pars_vertex: '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec3 vFogWorld;\n#endif',
  fog_vertex: '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n\tvFogWorld = cameraPosition + transpose( mat3( viewMatrix ) ) * mvPosition.xyz;\n#endif',
  fog_pars_fragment: '#ifdef USE_FOG\n\tuniform vec3 fogColor;\n\tvarying float vFogDepth;\n\tvarying vec3 vFogWorld;\n\t#ifdef FOG_EXP2\n\t\tuniform float fogDensity;\n\t#else\n\t\tuniform float fogNear;\n\t\tuniform float fogFar;\n\t#endif\n#endif',
  fog_fragment: `#ifdef USE_FOG
	#ifdef FOG_EXP2
		vec3 fogRay = vFogWorld - cameraPosition;
		float fogDist = length( fogRay );
		float fogK = 0.05, fogY0 = clamp( cameraPosition.y - 5.0, -20.0, 200.0 ), fogDy = clamp( fogRay.y, -200.0, 400.0 );
		// (Exponents clamped: tiny results are slow on some renderers and change nothing on screen.)
		float fogSpan = abs( fogDy ) > 0.05 ? ( 1.0 - exp( clamp( - fogK * fogDy, -20.0, 20.0 ) ) ) / ( fogK * fogDy ) : 1.0;
		float fogGround = clamp( fogDensity * 7.0 * exp( clamp( - fogK * fogY0, -20.0, 2.0 ) ) * fogDist * fogSpan, 0.0, 6.0 );
		float fogFactor = 1.0 - exp( - min( fogDensity * fogDensity * fogDist * fogDist + fogGround, 24.0 ) );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,
};

type Hook = (shader: THREE.WebGLProgramParametersWithUniforms) => void;

export class OpsRenderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(72, 1, 0.05, 1100);
  /** The first-person hands and gun, drawn last over everything with their own depth. */
  vm = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(52, 1, 0.01, 20) };
  phone: boolean;
  quality: Quality;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  csm: CSM | null = null;
  /** The finish pass's settings (night vision, flash, desaturation). */
  finish = { nvg: 0, flash: 0, desat: 0, ads: 0 };
  /** The 8× scope's picture: the world from a narrow camera into a small texture. */
  scope = { target: new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType }), camera: new THREE.PerspectiveCamera(5, 1, 0.5, 1100), on: false };
  private composer: EffectComposer | null = null;
  private gtao: GTAOPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private post: ShaderPass | null = null;
  private rays: ShaderPass | null = null;
  /** The sun for the rays and flare: its direction, how strongly it shows (0 at night, in rain), its colour. */
  sky = { dir: new THREE.Vector3(0, 1, 0), k: 0, color: new THREE.Color(1, 0.85, 0.6) };
  private sunAt = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private vmLight: THREE.DirectionalLight;
  private vmHemi: THREE.HemisphereLight;
  private ratio = 1;
  private maxRatio = 1;
  private slow = 0;
  private fast = 0;
  private hooks = new WeakMap<THREE.Material, Hook[]>();
  private prepared = new WeakSet<THREE.Material>();
  private csmHooks = new WeakMap<THREE.Material, THREE.Material['onBeforeCompile']>();
  private ro: ResizeObserver;
  private chunks: Record<string, string> = {};
  private sunDir = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
  private shadowBox = 70;

  constructor(public canvas: HTMLCanvasElement) {
    this.phone = matchMedia('(pointer: coarse)').matches;
    // Quality: a choice saved on the device wins; otherwise phones low, strong computers high.
    let saved: string | null = null;
    try { saved = localStorage.getItem('uv-ops-quality'); } catch { /* private mode */ }
    this.quality = saved === 'low' || saved === 'medium' || saved === 'high' ? saved : this.phone ? 'low' : (navigator.hardwareConcurrency ?? 8) >= 8 ? 'high' : 'medium';
    if (this.quality === 'low') this.phone = true;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.phone, powerPreference: 'high-performance' });
    this.maxRatio = this.ratio = Math.min(window.devicePixelRatio || 1, this.phone ? 1.4 : 1.75);
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = !this.phone;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Height fog while the game runs.
    for (const [k, v] of Object.entries(FOG_CHUNKS)) { this.chunks[k] = (THREE.ShaderChunk as Record<string, string>)[k]; (THREE.ShaderChunk as Record<string, string>)[k] = v; }
    this.scene.fog = new THREE.FogExp2(0xb8c4cc, 0.0028);
    // Light from all around for metal and wet surfaces.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = env; this.scene.environmentIntensity = 0.35;
    this.vm.scene.environment = env; this.vm.scene.environmentIntensity = 0.6;

    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x4a3e2c, 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    if (this.quality === 'high') {
      // CSM swaps two of three's light chunks; they're put back on dispose with the fog's.
      for (const k of ['lights_fragment_begin', 'lights_pars_begin']) this.chunks[k] = (THREE.ShaderChunk as Record<string, string>)[k];
      this.csm = new CSM({ camera: this.camera, parent: this.scene, cascades: 3, maxFar: 260, mode: 'practical', shadowMapSize: 2048, lightDirection: this.sunDir.clone().negate(), lightIntensity: 2.6, lightMargin: 120, shadowBias: -0.0003 });
      this.csm.fade = true;
    } else {
      this.sun.castShadow = !this.phone;
      this.sun.shadow.mapSize.set(2048, 2048);
      this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
      Object.assign(this.sun.shadow.camera, { left: -this.shadowBox, right: this.shadowBox, top: this.shadowBox, bottom: -this.shadowBox, near: 1, far: 400 });
      this.scene.add(this.sun, this.sun.target);
    }
    // The hands' own light, matched to the world's each frame.
    this.vmHemi = new THREE.HemisphereLight(0xbfd6ff, 0x4a3e2c, 1);
    this.vmLight = new THREE.DirectionalLight(0xfff0d8, 2);
    this.vmLight.position.set(1, 2, 1);
    this.vm.scene.add(this.vmHemi, this.vmLight);

    if (!this.phone) this.buildChain();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
  }

  private buildChain() {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const c = new EffectComposer(this.renderer, target);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (this.quality === 'high') {
      this.gtao = new GTAOPass(this.scene, this.camera, 512, 512);
      this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.6, thickness: 1.2, scale: 1, samples: 12 });
      this.gtao.blendIntensity = 0.85;
      c.addPass(this.gtao);
    }
    this.rays = new ShaderPass(RAYS);
    c.addPass(this.rays);
    const vmPass = new RenderPass(this.vm.scene, this.vm.camera);
    vmPass.clear = false; vmPass.clearDepth = true;
    c.addPass(vmPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.45, 0.92);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.post = new ShaderPass(FINISH);
    c.addPass(this.post);
    this.composer = c;
  }

  /** A shader change for a material (wind on trees, the blended terrain), kept alongside the shadows'. */
  patch(mat: THREE.Material, hook: Hook, key: string) {
    this.hooks.set(mat, [...(this.hooks.get(mat) ?? []), hook]);
    mat.customProgramCacheKey = () => key;
    this.wire(mat);
  }
  /** Gets every material under `root` ready for the cascaded shadows (once per material). */
  prep(root: THREE.Object3D) {
    root.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        if (this.prepared.has(mat)) continue;
        this.prepared.add(mat);
        if (this.csm && (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) { this.csm.setupMaterial(mat); this.csmHooks.set(mat, mat.onBeforeCompile); }
        this.wire(mat);
      }
    });
  }
  /** One onBeforeCompile per material: the shadows' first, then the game's own changes. */
  private wire(mat: THREE.Material) {
    const base = this.csmHooks.get(mat), hooks = this.hooks.get(mat) ?? [];
    if (!hooks.length) return;
    mat.onBeforeCompile = (shader, r) => { base?.(shader, r); for (const h of hooks) h(shader); };
    mat.needsUpdate = true;
  }

  /** The sun (or the moon) and the sky light for this moment. */
  light(dir: THREE.Vector3, color: THREE.Color, power: number, sky: THREE.Color, ground: THREE.Color, skyPower: number) {
    this.sunDir.copy(dir);
    this.hemi.color.copy(sky); this.hemi.groundColor.copy(ground); this.hemi.intensity = skyPower;
    if (this.csm) { this.csm.lightDirection.copy(dir).negate(); for (const l of this.csm.lights) { l.color.copy(color); l.intensity = power; } }
    else { this.sun.color.copy(color); this.sun.intensity = power; }
    this.vmHemi.color.copy(sky); this.vmHemi.groundColor.copy(ground); this.vmHemi.intensity = skyPower * 0.9;
    this.vmLight.color.copy(color); this.vmLight.intensity = power * 0.7;
  }

  /** Before drawing: the shadows follow the camera. */
  update(focus: THREE.Vector3) {
    if (this.csm) this.csm.update();
    else if (this.sun.castShadow) {
      // Snap to shadow-map texels so shadows don't shimmer as you move.
      const step = (this.shadowBox * 2) / 2048, fx = Math.round(focus.x / step) * step, fz = Math.round(focus.z / step) * step;
      this.sun.position.set(fx + this.sunDir.x * 180, focus.y + this.sunDir.y * 180, fz + this.sunDir.z * 180);
      this.sun.target.position.set(fx, focus.y, fz);
    }
    // The hands are lit from where the sun is relative to the view.
    this.vmLight.position.copy(this.sunDir).applyQuaternion(this.camera.quaternion.clone().invert()).multiplyScalar(5);
  }

  /** Draws a frame: the scope's picture first if needed, then the world and the hands. */
  render(t: number) {
    if (this.scope.on) {
      this.scope.camera.position.copy(this.camera.position); this.scope.camera.quaternion.copy(this.camera.quaternion); this.scope.camera.updateMatrixWorld();
      this.renderer.setRenderTarget(this.scope.target);
      this.renderer.render(this.scene, this.scope.camera);
      this.renderer.setRenderTarget(null);
    }
    if (this.composer && this.post) {
      const u = this.post.uniforms;
      u.time.value = t % 100; u.ads.value = this.finish.ads; u.nvg.value = this.finish.nvg; u.flash.value = this.finish.flash; u.desat.value = this.finish.desat;
      if (this.rays) this.aimRays(this.rays.uniforms);
      this.composer.render();
    } else {
      this.renderer.toneMappingExposure = this.finish.nvg ? 3.2 : 1;
      this.renderer.autoClear = true;
      this.renderer.render(this.scene, this.camera);
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.vm.scene, this.vm.camera);
      this.renderer.autoClear = true;
    }
  }

  /** Where the sun is on screen, and how much rays and flare it gives this frame. */
  private aimRays(u: Record<string, THREE.IUniform>) {
    this.camera.getWorldDirection(this.fwd);
    const ahead = this.fwd.dot(this.sky.dir), k = this.finish.nvg || this.scope.on ? 0 : this.sky.k;
    this.sunAt.copy(this.camera.position).addScaledVector(this.sky.dir, 500).project(this.camera);
    const x = this.sunAt.x * 0.5 + 0.5, y = this.sunAt.y * 0.5 + 0.5;
    // Rays reach in from a sun just off the screen; the flare needs the sun itself in view.
    const edge = Math.min(x, y, 1 - x, 1 - y);
    (u.sun.value as THREE.Vector2).set(x, y);
    u.on.value = ahead > 0.05 ? k * Math.min(1, Math.max(0, (edge + 0.35) / 0.35)) * Math.min(1, (ahead - 0.05) * 4) : 0;
    u.flare.value = ahead > 0.2 && edge > 0 ? k * Math.min(1, edge / 0.08) * (1 - this.finish.ads * 0.6) : 0;
    u.aspect.value = this.camera.aspect;
    (u.tint.value as THREE.Color).copy(this.sky.color);
  }

  /** Late frames (under ~45 fps for half a second) step quality down: ambient occlusion, the sun rays, then the
   *  cascades for one shadow, then resolution, then the effects chain; quick frames raise the resolution back. */
  tune(raw: number) {
    if (raw > 1) return;
    if (raw > 1 / 45) { this.slow += raw; this.fast = 0; } else if (raw < 1 / 75) { this.fast += raw; this.slow = 0; } else this.slow = Math.max(0, this.slow - raw);
    if (this.slow < 0.6 && this.fast < 3) return;
    if (this.slow >= 0.6) {
      this.slow = 0;
      if (this.gtao?.enabled) { this.gtao.enabled = false; return; }
      if (this.rays?.enabled) { this.rays.enabled = false; return; }
      if (this.bloom?.enabled && this.ratio <= 1) { this.bloom.enabled = false; return; }
      if (this.ratio > 0.7) { this.setRatio(Math.max(0.7, this.ratio - 0.2)); return; }
      if (this.composer) { this.composer.dispose(); this.composer = null; this.post = null; this.bloom = null; this.gtao = null; this.rays = null; return; }
    } else if (this.fast >= 3) { this.fast = 0; if (this.ratio < this.maxRatio) this.setRatio(Math.min(this.maxRatio, this.ratio + 0.15)); }
  }
  private setRatio(r: number) { this.ratio = r; this.renderer.setPixelRatio(r); this.resize(); }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(this.ratio); this.composer.setSize(w, h); this.bloom?.resolution.set(w / 2, h / 2); this.gtao?.setSize(w * this.ratio * 0.5, h * this.ratio * 0.5); }
    for (const cam of [this.camera, this.vm.camera]) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
    this.csm?.updateFrustums();
  }

  /** Tuning: three's own fog chunks instead of the ground haze (true), or back (false). */
  stockFog(on: boolean) {
    for (const k of Object.keys(FOG_CHUNKS)) (THREE.ShaderChunk as Record<string, string>)[k] = on ? this.chunks[k] : FOG_CHUNKS[k as keyof typeof FOG_CHUNKS];
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
  }

  dispose() {
    this.ro.disconnect();
    this.composer?.dispose();
    this.csm?.dispose();
    this.scope.target.dispose();
    for (const s of [this.scene, this.vm.scene]) s.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const x of mats) x.dispose();
    });
    this.renderer.dispose();
    for (const [k, v] of Object.entries(this.chunks)) (THREE.ShaderChunk as Record<string, string>)[k] = v;
  }
}
