import { THREE, type World } from './core';
import { surfaceMaps } from './textures';

// The flat games drawn in 3D (M103, the owner: "realistic graphics to all of them"). A game keeps its
// own rules in its box's pixels (x right, y down), exactly as before; a camera looks at a plane (a
// wall for side views, the sea for top-down ones) so that every pixel lands on the point the game
// means. Things in front of and behind the plane give depth: a town behind, rain in front.

/** The camera fitted to a box and the way between its pixels and the plane. */
export class Board {
  /** The box in CSS pixels. */
  W = 0; H = 0;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private plane: THREE.Plane;
  private tmp = new THREE.Vector3();
  /**
   * `side`: the plane is z = 0 and the camera looks along −z, tipped down by `tilt` degrees (roofs
   * and pads show their tops). `top`: the plane is the ground (y = 0), seen from above, tipped toward
   * the bottom of the screen by `tilt` degrees. `span` is how many world units the box is tall.
   */
  constructor(private w: World, private view: 'side' | 'top', private span = 16, private tilt = 0) {
    this.plane = view === 'side' ? new THREE.Plane(new THREE.Vector3(0, 0, 1), 0) : new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  /** Fits the camera to the canvas; true when the size changed (lay the scenery out again then). */
  fit(): boolean {
    const W = this.w.canvas.clientWidth, H = this.w.canvas.clientHeight;
    if (!W || !H || (W === this.W && H === this.H)) return false;
    this.W = W; this.H = H;
    const cam = this.w.camera;
    cam.aspect = W / H; cam.updateProjectionMatrix();
    const d = this.span / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), a = THREE.MathUtils.degToRad(this.tilt);
    if (this.view === 'side') { cam.up.set(0, 1, 0); cam.position.set(0, Math.sin(a) * d, Math.cos(a) * d); }
    else { cam.up.set(0, 0, -1); cam.position.set(0, Math.cos(a) * d, Math.sin(a) * d); }
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld(true);
    return true;
  }

  /** The point on the plane under a pixel of the box. */
  at(px: number, py: number, out = new THREE.Vector3()) {
    this.ndc.set((px / this.W) * 2 - 1, 1 - (py / this.H) * 2);
    this.ray.setFromCamera(this.ndc, this.w.camera);
    return this.ray.ray.intersectPlane(this.plane, out) ?? out.set(0, 0, 0);
  }

  /** World units per pixel at a point of the box (the plane is a little nearer at the bottom). */
  scale(px: number, py: number) {
    const a = this.at(px, py, this.tmp).clone();
    return a.distanceTo(this.at(px + 10, py, this.tmp)) / 10;
  }
}

/** Rain: streaks that fall, slant with the wind and wrap round a box in front of the camera, moved
 *  entirely on the graphics chip (nothing to update per drop). `wind` is sideways units a second. */
export function rainField(count: number, size: THREE.Vector3, center: THREE.Vector3, { color = 0xc8d4e4, opacity = 0.32, speed = 22, length = 0.55 } = {}) {
  const seeds = new Float32Array(count * 2 * 3), ends = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const s = [Math.random(), Math.random(), Math.random()];
    seeds.set([...s, ...s], i * 6);
    ends[i * 2 + 1] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 3));
  geo.setAttribute('end', new THREE.BufferAttribute(ends, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { time: { value: 0 }, wind: { value: 0 }, size: { value: size.clone() }, center: { value: center.clone() }, speed: { value: speed }, len: { value: length }, color: { value: new THREE.Color(color) }, opacity: { value: opacity } },
    vertexShader: `attribute vec3 seed; attribute float end; uniform float time, wind, speed, len; uniform vec3 size, center; varying float vA;
      void main() {
        float v = speed * (0.75 + seed.y * 0.5);
        float fall = mod(seed.y * size.y + time * v, size.y);
        vec3 p = center + vec3((seed.x - 0.5) * size.x, size.y * 0.5 - fall, (seed.z - 0.5) * size.z);
        p.x = center.x + mod(p.x - center.x + wind * time + size.x * 0.5, size.x) - size.x * 0.5;
        vec3 dir = normalize(vec3(wind, -v, 0.0));
        p -= dir * len * end * (0.7 + seed.z * 0.6);
        vA = 1.0 - end * 0.85;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: 'uniform vec3 color; uniform float opacity; varying float vA; void main(){ gl_FragColor = vec4(color, opacity * vA); }',
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 8;
  return { lines, mat };
}

/** A storm's sky on a far wall: heavy, slowly rolling clouds, lit from inside by lightning (`flash`
 *  0–1) and faintly from below by the town. */
export function stormSky(width: number, height: number) {
  const mat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: { time: { value: 0 }, flash: { value: 0 }, at: { value: new THREE.Vector2(0.5, 0.7) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time, flash; uniform vec2 at; varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1.0, 0.0)), u.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), u.x), u.y); }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n(p); p = p * 2.07 + vec2(3.1, 1.7); a *= 0.5; } return s; }
      void main() {
        vec2 p = vUv * vec2(6.0, 3.0) + vec2(time * 0.01, 0.0);
        float c = fbm(p + fbm(p * 1.7 - time * 0.006) * 0.9);
        float lit = clamp((c - fbm(p + vec2(0.0, 0.05))) * 6.0 + 0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.018, 0.024, 0.04), vec3(0.09, 0.1, 0.13), c * lit);
        col += vec3(0.16, 0.11, 0.06) * smoothstep(0.55, 0.0, vUv.y) * 0.35;
        float near = exp(-distance(vUv * vec2(2.0, 1.0), at * vec2(2.0, 1.0)) * 2.2);
        col += vec3(0.75, 0.8, 1.0) * flash * (0.25 + near * 1.6) * (0.4 + c);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return { mesh: new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat), mat };
}

/** The swell's waves (direction x, z, wavelength, height at full roughness, speed): the same sum
 *  drives the sea's surface on the graphics chip and the bobbing of floating things here. */
const WAVES = [[1, 0.35, 9, 0.22, 1.1], [-0.6, 1, 6.5, 0.16, 1.3], [0.3, -1, 4.2, 0.1, 1.6], [0.9, 0.8, 2.8, 0.06, 2]] as const;
/** The sea's height at a point (world x, z) at a time, for a roughness 0 (calm) … 1 (storm). */
export function swell(x: number, z: number, t: number, rough: number) {
  let h = 0;
  for (const [dx, dz, len, amp, sp] of WAVES) { const k = (Math.PI * 2) / len, l = Math.hypot(dx, dz); h += Math.sin(((dx * x + dz * z) / l) * k + t * sp) * amp * (0.35 + rough * 1.6); }
  return h;
}

/** An open sea (seen from above): a swell that moves, two layers of ripples, the sky and the sun on
 *  the water, and white foam on the crests when it's rough (`rough` 0–1, `foam` 0–1 uniforms). */
export function ocean(size = 260, segments = 180, color = 0x0b4058) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments).rotateX(-Math.PI / 2);
  const ripples = waterNormals().clone();
  ripples.repeat.set(size / 7, size / 7);
  ripples.needsUpdate = true;
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.1, metalness: 0, normalMap: ripples, normalScale: new THREE.Vector2(0.55, 0.55), clearcoat: 0.5, clearcoatRoughness: 0.12 });
  const u = { time: { value: 0 }, rough: { value: 0 }, foam: { value: 0 } };
  const waves = WAVES.map(([dx, dz, len, amp, sp]) => `vec4(${(dx / Math.hypot(dx, dz)).toFixed(4)}, ${(dz / Math.hypot(dx, dz)).toFixed(4)}, ${((Math.PI * 2) / len).toFixed(4)}, ${amp.toFixed(3)}), ${sp.toFixed(2)}`);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = `uniform float time, rough; varying float vCrest;
      void sea(vec2 p, out float h, out vec2 d) {
        h = 0.0; d = vec2(0.0); float a = 0.35 + rough * 1.6;
        vec4 W[4]; float S[4];
        ${waves.map((x, i) => `W[${i}] = ${x.split('), ')[0]}); S[${i}] = ${x.split('), ')[1]};`).join(' ')}
        for (int i = 0; i < 4; i++) { float ph = dot(W[i].xy, p) * W[i].z + time * S[i]; h += sin(ph) * W[i].w * a; d += W[i].xy * W[i].z * cos(ph) * W[i].w * a; }
      }
      ${sh.vertexShader}`
      .replace('#include <beginnormal_vertex>', 'float sh0; vec2 sd0; sea((modelMatrix * vec4(position, 1.0)).xz, sh0, sd0); vec3 objectNormal = normalize(vec3(-sd0.x, 1.0, -sd0.y));')
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position); transformed.y += sh0; vCrest = sh0 / (0.35 + rough * 1.6);');
    sh.fragmentShader = `uniform float time, foam; varying float vCrest;
      ${sh.fragmentShader}`
      .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `vec3 n1 = texture2D(normalMap, vNormalMapUv + vec2(time * 0.011, time * 0.007)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, vNormalMapUv * 1.9 - vec2(time * 0.008, -time * 0.012)).xyz * 2.0 - 1.0;
        vec3 mapN = normalize(vec3(n1.xy + n2.xy, n1.z * n2.z));`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float fn = texture2D(normalMap, vNormalMapUv * 0.37 + vec2(time * 0.004)).x;
        float crest = smoothstep(0.32, 0.55, vCrest + (fn - 0.5) * 0.5) * foam;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.92), crest);`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return { mesh, mat, u };
}

/** Ripples for reflective water: a seamless normal map from the same noise as the surfaces. */
export const waterNormals = () => {
  const t = surfaceMaps('water').normal;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

/** A word or number as a sprite, its picture made once (counts over a roof, labels). */
const labels = new Map<string, THREE.CanvasTexture>();
export function label(text: string, { color = '#ffffff', bg = 'rgba(10,10,12,0.72)', size = 1 } = {}) {
  const key = `${text}|${color}|${bg}`;
  let tex = labels.get(key);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill();
    g.font = '800 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color;
    g.fillText(text, 64, 68);
    tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    labels.set(key, tex);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}

/** A ring that empties as time runs out (a person's wait): `left` 0–1 and its colour, set per frame. */
export function timerRing() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, fog: false,
    uniforms: { left: { value: 1 }, color: { value: new THREE.Color(0x4ade80) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float left; uniform vec3 color; varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5; float r = length(p);
        float band = smoothstep(0.5, 0.46, r) * smoothstep(0.3, 0.34, r);
        float a = fract(atan(p.x, p.y) / 6.28318 + 1.0);
        float on = step(a, left);
        gl_FragColor = vec4(mix(vec3(0.0), color, on), band * mix(0.45, 1.0, on));
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.renderOrder = 12;
  return { mesh, mat };
}
