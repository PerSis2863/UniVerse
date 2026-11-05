import { THREE, mergeGeometries } from './core';

// Nature for the 3D worlds (M102, the owner: "realistic graphics to all of them"): the parts that
// make a world read as real rather than a toy, each worked out on the graphics chip so nothing has to
// be drawn or downloaded first. A sea of clouds lit by the sun, craggy rock under floating islands,
// a starfield with the Milky Way, planets with oceans, deserts, ice, clouds and city lights on the
// night side, and the dusty beam of a torch.

/** Value noise and its octaves, shared by the shaders below (cheap: no textures, no tables). */
const NOISE = /* glsl */ `
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise2(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y); }
  float fbm2(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < OCT; i++) { s += a * noise2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
  float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }
  float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < OCT; i++) { s += a * noise3(p); p = p * 2.02 + 3.1; a *= 0.5; } return s; }
`;

/** Fewer octaves on phones: the same shapes, less fine grain, a third of the work. */
const octaves = () => (matchMedia('(pointer: coarse)').matches ? 3 : 5);

/** A sea of clouds far below (an endless layer: keep it under the camera with `follow`). Lit from the
 *  sun's side, brighter on top, fading into the horizon's colour far off. `amount` (0–1) fades it. */
export function cloudSea({ y, lit = 0xffffff, shade = 0x9aa6c4, horizon = 0xc7d3ee, sun = new THREE.Vector3(0.5, 0.5, -0.7), scale = 0.018, cover = 0.42, far = 360, opacity = 1 }: {
  y: number; lit?: number; shade?: number; horizon?: number; sun?: THREE.Vector3; scale?: number; cover?: number; far?: number; opacity?: number;
}) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    defines: { OCT: octaves() },
    uniforms: {
      time: { value: 0 }, amount: { value: opacity }, scale: { value: scale }, cover: { value: cover }, far: { value: far },
      lit: { value: new THREE.Color(lit) }, shade: { value: new THREE.Color(shade) }, horizon: { value: new THREE.Color(horizon) },
      sunDir: { value: new THREE.Vector2(sun.x, sun.z).normalize() },
    },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float time, amount, scale, cover, far; uniform vec3 lit, shade, horizon; uniform vec2 sunDir; varying vec3 vW;
      ${NOISE}
      void main() {
        vec2 p = vW.xz * scale + vec2(time * 0.012, time * 0.005);
        float d = fbm2(p);
        float dens = smoothstep(cover, cover + 0.22, d);
        // Light from the sun's side: thinner cloud toward the sun means a lit edge.
        float ahead = fbm2(p + sunDir * 0.06);
        float light = clamp(0.62 + (d - ahead) * 5.0, 0.0, 1.0);
        vec3 col = mix(shade, lit, light);
        col = mix(col, lit, smoothstep(0.62, 0.9, d) * 0.35);
        float dist = length(vW.xz - cameraPosition.xz);
        float near = smoothstep(far, far * 0.3, dist);
        col = mix(horizon, col, near);
        // Far off, many clouds overlap: the layer closes into a solid floor at the horizon.
        float a = mix(1.0, dens, near) * amount;
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * far + 200, 2 * far + 200), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return {
    mesh, mat,
    /** Keeps the layer under the camera (the clouds stay put in the world) and drifts them. */
    follow(cam: THREE.Vector3, t: number) { mesh.position.x = cam.x; mesh.position.z = cam.z; mat.uniforms.time.value = t; },
  };
}

/** A sea of lava far below (M102): a black crust cracking over glowing rock, the cracks flowing
 *  slowly, the hottest pools yellow-white, bright enough to glow. Fades into `haze` far off. */
export function lavaSea({ y, size = 700, haze = 0x2a0d06, far = 320 }: { y: number; size?: number; haze?: number; far?: number }) {
  const mat = new THREE.ShaderMaterial({
    fog: false, defines: { OCT: octaves() },
    uniforms: { time: { value: 0 }, haze: { value: new THREE.Color(haze) }, far: { value: far } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float time, far; uniform vec3 haze; varying vec3 vW;
      ${NOISE}
      void main() {
        vec2 p = vW.xz * 0.045;
        vec2 q = vec2(fbm2(p + vec2(time * 0.02, 0.0)), fbm2(p + vec2(5.2, -time * 0.017)));
        float n = fbm2(p + q * 1.6 + time * 0.008);
        float vein = 1.0 - smoothstep(0.0, 0.05, abs(n - 0.5));
        float pool = smoothstep(0.64, 0.8, n);
        float heat = clamp(vein * 0.85 + pool, 0.0, 1.0);
        vec3 crust = vec3(0.035, 0.012, 0.008) * (0.6 + fbm2(p * 6.0) * 0.8);
        vec3 col = mix(crust, vec3(0.75, 0.08, 0.01), smoothstep(0.0, 0.35, heat));
        col = mix(col, vec3(1.0, 0.42, 0.06), smoothstep(0.35, 0.7, heat));
        col = mix(col, vec3(1.0, 0.86, 0.45), smoothstep(0.75, 1.0, heat));
        col *= 1.0 + heat * 2.2;
        float dist = length(vW.xz - cameraPosition.xz);
        col = mix(col, haze, smoothstep(far * 0.25, far, dist));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.frustumCulled = false;
  return { mesh, mat, follow(cam: THREE.Vector3, t: number) { mesh.position.x = cam.x; mesh.position.z = cam.z; mat.uniforms.time.value = t; } };
}

/** The craggy rock under a floating island: wide just under the top (inside a w × d pad), narrowing
 *  to a jagged point `depth` below. Its top sits at y = 0. Grain in world units (one tile per 3). */
export function islandRock(w: number, d: number, depth: number, seed: number) {
  const g = new THREE.CylinderGeometry(1, 0.05, 1, 10, 5, false).translate(0, -0.5, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  const bump = (x: number, y: number, z: number) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 1.37) * 43758.5453; return v - Math.floor(v); };
  const around = Math.max(1, Math.round((Math.PI * (w + d) * 0.48) / 3));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = -y, a = Math.atan2(z, x);
    // Outward bulges and dents from the position only (so the seam's twin vertices agree).
    const rough = t > 0.01 ? (Math.sin(a * 3 + seed) * 0.13 + Math.sin(a * 7 + seed * 2.1) * 0.07 + (bump(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50)) - 0.5) * 0.24) * Math.min(1, t * 2.5) : 0;
    // A bellied taper: it stays wide for a while, then drops to the point.
    const k = (1 + rough) * (t < 0.01 ? 1 : 1 - Math.pow(t, 1.6) * 0.9);
    p.setXYZ(i, x * k * w * 0.47, y * depth * (1 + (t > 0.2 ? (bump(a * 3, t * 7, seed) - 0.5) * 0.25 : 0)), z * k * d * 0.47);
    uv.setXY(i, uv.getX(i) * around, (1 - uv.getY(i)) * depth / 3);
  }
  g.computeVertexNormals();
  return g;
}

/** Many rocks as one mesh (one draw call), each placed under its pad. */
export function rocks(list: { w: number; d: number; depth: number; at: [number, number, number]; seed: number }[], mat: THREE.Material) {
  if (!list.length) return null;
  const geos = list.map((r) => islandRock(r.w, r.d, r.depth, r.seed).translate(...r.at));
  const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
  geos.forEach((x) => x.dispose());
  mesh.receiveShadow = true;
  return mesh;
}

/** A starfield: a few thousand stars of real colours (blue-white to orange) and brightnesses (most
 *  faint, a few bright), sized on screen, not in the world, so they stay sharp points. */
export function starfield(count = 2600, radius = 300, seed = 1) {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count);
  let s = seed >>> 0 || 1;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const tint = [[0.62, 0.72, 1], [0.8, 0.86, 1], [1, 1, 1], [1, 0.95, 0.82], [1, 0.82, 0.6], [1, 0.7, 0.5]];
  for (let i = 0; i < count; i++) {
    // Even over the sphere, with more stars toward a band (the galaxy's plane).
    let u = r() * 2 - 1;
    if (r() < 0.45) u *= 0.25;
    const a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * q * radius, u * radius * 0.9 + Math.sin(a) * q * radius * 0.25, Math.sin(a) * q * radius], i * 3);
    const b = Math.pow(r(), 6), c = tint[Math.min(tint.length - 1, Math.floor(r() * tint.length))];
    const lum = 0.35 + b * 2.2;
    col.set([c[0] * lum, c[1] * lum, c[2] * lum], i * 3);
    size[i] = 1.2 + b * 4.5;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { ratio: { value: Math.min(2, window.devicePixelRatio || 1) }, time: { value: 0 } },
    vertexShader: `attribute float size; attribute vec3 color; uniform float ratio, time; varying vec3 vC;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        float tw = 0.85 + 0.15 * sin(time * 2.0 + position.x * 0.37 + position.y * 0.11);
        vC = color * tw; gl_PointSize = size * ratio; }`,
    fragmentShader: `varying vec3 vC; void main() { vec2 d = gl_PointCoord - 0.5; float r = length(d);
      float core = smoothstep(0.5, 0.0, r); gl_FragColor = vec4(vC * core * core, 1.0);
      #include <colorspace_fragment>
    }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -2;
  return pts;
}

/** The Milky Way: a faint river of light with dark dust lanes across the sky (a sphere seen from
 *  inside). Keep it round the camera. */
export function milkyWay(radius = 320, tilt = 0.35, glow = 0x9fb4ff) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, transparent: true, blending: THREE.AdditiveBlending,
    defines: { OCT: octaves() },
    uniforms: { glow: { value: new THREE.Color(glow) }, tilt: { value: tilt } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 glow; uniform float tilt; varying vec3 vD;
      ${NOISE}
      void main() {
        vec3 d = normalize(vD);
        float c = cos(tilt), s = sin(tilt);
        float y = d.y * c - d.z * s;
        float band = exp(-y * y * 18.0);
        float dust = fbm3(d * 6.0);
        float lanes = smoothstep(0.35, 0.6, fbm3(d * 11.0 + 4.0));
        float lum = band * (0.35 + dust * 0.9) * (1.0 - lanes * 0.75 * band);
        vec3 col = mix(glow, vec3(1.0, 0.86, 0.72), smoothstep(0.4, 0.9, dust)) * lum * 0.16;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  mesh.renderOrder = -3;
  mesh.frustumCulled = false;
  return mesh;
}

export type PlanetKind = 'earth' | 'desert' | 'giant';

/** A planet drawn on the graphics chip: continents shaped by warped noise, oceans that are deep blue
 *  and shallow near the coast and catch the sun, forests, grassland and desert by rainfall and
 *  latitude, ice caps, clouds that drift, and city lights on the night side. A red desert world has
 *  canyons and dust; a gas giant has bands and storms. `sun` is the sun's direction in the world. */
export function planetMaterial(kind: PlanetKind, seed: number, sun: THREE.Vector3) {
  return new THREE.ShaderMaterial({
    defines: { OCT: matchMedia('(pointer: coarse)').matches ? 4 : 6, KIND: kind === 'earth' ? 0 : kind === 'desert' ? 1 : 2 },
    uniforms: { sunDir: { value: sun.clone().normalize() }, time: { value: 0 }, seed: { value: seed % 97 } },
    vertexShader: `varying vec3 vObj; varying vec3 vN; varying vec3 vW;
      void main() { vObj = normalize(position); vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 sunDir; uniform float time, seed; varying vec3 vObj; varying vec3 vN; varying vec3 vW;
      ${NOISE}
      void main() {
        vec3 n = normalize(vN), l = normalize(sunDir), v = normalize(cameraPosition - vW);
        float ndl = dot(n, l), day = smoothstep(-0.12, 0.2, ndl);
        vec3 p = vObj * 1.6 + seed;
        float lat = abs(vObj.y);
        vec3 col; float gloss = 0.0; vec3 night = vec3(0.0); float cloud = 0.0;
      #if KIND == 0
        vec3 q = p + vec3(fbm3(p * 1.4), fbm3(p * 1.4 + 5.2), fbm3(p * 1.4 + 9.7)) * 0.9;
        float h = fbm3(q * 1.3);
        float sea = 0.5;
        if (h < sea) {
          float depth = (sea - h) / sea;
          col = mix(vec3(0.06, 0.32, 0.46), vec3(0.008, 0.05, 0.16), smoothstep(0.0, 0.22, depth));
          gloss = 1.0;
        } else {
          // Rain by latitude: wet at the equator, dry deserts near 30°, wetter again further out.
          float wet = fbm3(p * 2.6 + 20.0) + 0.12 * (1.0 - smoothstep(0.0, 0.18, lat)) - 0.13 * (1.0 - smoothstep(0.0, 0.12, abs(lat - 0.33))) + 0.05 * (1.0 - smoothstep(0.0, 0.1, abs(lat - 0.55)));
          vec3 forest = vec3(0.07, 0.17, 0.05), grass = vec3(0.24, 0.31, 0.11), desert = vec3(0.63, 0.5, 0.33), tundra = vec3(0.34, 0.33, 0.27);
          col = mix(desert, mix(grass, forest, smoothstep(0.52, 0.64, wet)), smoothstep(0.4, 0.52, wet));
          col = mix(col, tundra, smoothstep(0.55, 0.7, lat));
          col = mix(col, vec3(0.32, 0.28, 0.25), smoothstep(0.66, 0.76, h));
          float coast = 1.0 - smoothstep(0.0, 0.08, h - sea);
          night = vec3(1.0, 0.72, 0.38) * smoothstep(0.66, 0.86, noise3(p * 46.0)) * (0.35 + coast) * smoothstep(0.62, 0.5, lat);
        }
        col = mix(col, vec3(0.9, 0.94, 0.98), smoothstep(0.76, 0.84, lat + (fbm3(p * 4.0) - 0.5) * 0.18));
        vec3 cp = vObj * 2.6 + vec3(time * 0.004, 0.0, time * 0.002) + seed;
        cloud = smoothstep(0.48, 0.74, fbm3(cp + fbm3(cp * 1.8) * 0.8));
      #elif KIND == 1
        float h = fbm3(p * 1.8);
        float ridge = 1.0 - abs(fbm3(p * 3.0 + 7.0) * 2.0 - 1.0);
        col = mix(vec3(0.42, 0.16, 0.07), vec3(0.74, 0.42, 0.22), smoothstep(0.3, 0.7, h));
        col = mix(col, vec3(0.2, 0.08, 0.05), smoothstep(0.82, 0.95, ridge) * 0.7);
        col = mix(col, vec3(0.93, 0.88, 0.84), smoothstep(0.86, 0.92, lat + (fbm3(p * 5.0) - 0.5) * 0.1));
        cloud = smoothstep(0.62, 0.85, fbm3(vObj * 3.0 + vec3(time * 0.003, 0.0, 0.0))) * 0.35;
      #else
        float warp = fbm3(vec3(vObj.x * 2.0, vObj.y * 9.0, vObj.z * 2.0) + vec3(time * 0.006, 0.0, 0.0) + seed);
        float bands = sin((vObj.y * 9.0 + warp * 1.6) * 3.14159);
        col = mix(vec3(0.62, 0.48, 0.36), vec3(0.88, 0.8, 0.68), bands * 0.5 + 0.5);
        col = mix(col, vec3(0.5, 0.36, 0.6), smoothstep(0.55, 0.75, fbm3(vObj * 5.0 + seed)) * 0.4);
        vec2 st = vec2(atan(vObj.z, vObj.x) - 0.8, vObj.y + 0.3);
        float storm = smoothstep(0.16, 0.0, length(st * vec2(1.0, 2.2)));
        col = mix(col, vec3(0.75, 0.3, 0.18), storm * 0.8);
      #endif
        vec3 h2 = normalize(l + v);
        float spec = gloss * pow(max(dot(n, h2), 0.0), 70.0) * day * (1.0 - cloud) * 1.6;
        vec3 lit = col * (0.012 + max(ndl, 0.0) * 1.25) * (1.0 - cloud * 0.35);
        lit = mix(lit, vec3(1.0) * (0.02 + max(ndl, 0.0) * 1.35), cloud);
        // The rim: thicker air seen edge-on scatters blue (or the world's dust colour).
        float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * day;
      #if KIND == 1
        vec3 air = vec3(0.9, 0.5, 0.3);
      #elif KIND == 2
        vec3 air = vec3(0.8, 0.7, 0.9);
      #else
        vec3 air = vec3(0.35, 0.6, 1.0);
      #endif
        vec3 c = lit + spec * vec3(1.0, 0.95, 0.85) + air * rim * 0.6 + night * (1.0 - day) * (1.0 - cloud) * 1.4;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** A gas giant's rings: bands of ice and rock of different density, with gaps, see-through, lit on
 *  the sun's side (use on a RingGeometry with inner/outer radius 90/125). */
export function ringMaterial(inner = 90, outer = 125) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    uniforms: { inner: { value: inner }, outer: { value: outer } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float inner, outer; varying vec2 vP;
      float h(float x) { return fract(sin(x * 91.7) * 43758.5453); }
      void main() {
        float r = (length(vP) - inner) / (outer - inner);
        float band = 0.0;
        for (int i = 0; i < 6; i++) { float f = pow(2.0, float(i)) * 7.0; band += (h(floor(r * f)) - 0.5) / pow(1.6, float(i)); }
        float dens = clamp(0.55 + band * 0.6, 0.0, 1.0) * smoothstep(0.0, 0.04, r) * smoothstep(1.0, 0.94, r);
        dens *= 1.0 - smoothstep(0.015, 0.0, abs(r - 0.62)) * 0.95;
        vec3 col = mix(vec3(0.62, 0.55, 0.48), vec3(0.95, 0.9, 0.82), h(floor(r * 40.0)));
        gl_FragColor = vec4(col * 0.9, dens * 0.75);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** A torch's beam through dusty air: a cone (apex at the origin, along +z: aim it by turning +z) that glows softly,
 *  brightest near the lens, fading with distance and toward its edges, with slow-moving dust in it.
 *  Additive and see-through, so walls cut it where it lands. */
export function lightBeam(length = 9, angle = Math.PI / 7.5, color = 0xfff1d0) {
  const radius = Math.tan(angle) * length;
  const geo = new THREE.ConeGeometry(radius, length, 40, 1, true).translate(0, -length / 2, 0).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    defines: { OCT: 3 },
    uniforms: { power: { value: 0.12 }, color: { value: new THREE.Color(color) }, len: { value: length }, time: { value: 0 } },
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main() { vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float power, len, time; uniform vec3 color; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      ${NOISE}
      void main() {
        float along = clamp(vP.z / len, 0.0, 1.0);
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.2);
        float fall = pow(1.0 - along, 1.8);
        float dust = 0.6 + 0.4 * fbm3(vP * 1.6 + vec3(0.0, time * 0.15, time * 0.05));
        gl_FragColor = vec4(color * power * edge * fall * dust, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  return { mesh, mat };
}
