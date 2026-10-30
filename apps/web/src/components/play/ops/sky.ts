import { THREE } from '../world/core';
import type { OpsRenderer } from './render';

// The sky, the time of day and the weather (the owner: "a real-time day/night cycle, volumetric
// ground fog, and toggleable dynamic rain with thunder/lightning"). The round runs from late
// afternoon (16:00) through sunset into night (23:00): the sun sinks and reddens, stars and the
// moon come out, the fog thickens and darkens. The dome draws a gradient, the sun and moon discs,
// stars and slow clouds in one shader. Rain is a few thousand streaks moved on the GPU around the
// camera (nothing per drop on the CPU); lightning flashes the sky and the light, thunder follows.

const SKY_VERT = 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.9999; }';
const SKY_FRAG = `uniform vec3 top, horizon, sunColor, sunDir, moonDir; uniform float stars, cloud, time, flash, overcast; varying vec3 vDir;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += n(p) * a; p *= 2.03; a *= 0.5; } return s; }
  void main(){
    vec3 d = normalize(vDir);
    float up = max(d.y, 0.0);
    vec3 c = mix(horizon, top, pow(up, 0.45));
    float s = max(dot(d, sunDir), 0.0);
    c += sunColor * (pow(s, 1400.0) * 30.0 + pow(s, 10.0) * 0.35 + pow(s, 3.0) * 0.12) * (1.0 - overcast * 0.8);
    // Stars (twinkling) and the moon at night.
    if (stars > 0.0 && d.y > 0.0) {
      vec2 g = floor(d.xz / (d.y + 0.25) * 260.0);
      float st = step(0.9975, h(g)) * (0.6 + 0.4 * sin(time * 3.0 + h(g + 7.0) * 40.0));
      c += vec3(st) * stars * (1.0 - overcast);
      float m = max(dot(d, moonDir), 0.0);
      c += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9993, 0.9996, m) * 1.6 + pow(m, 60.0) * 0.08) * stars;
    }
    // Clouds: two drifting layers projected on a dome.
    if (d.y > 0.0) {
      vec2 uv = d.xz / (d.y + 0.15) * 1.4 + vec2(time * 0.004, time * 0.0015);
      float k = smoothstep(0.42 - cloud * 0.25, 0.8, fbm(uv) * 0.7 + fbm(uv * 2.7 + 3.0) * 0.3);
      vec3 lit = mix(horizon * 0.9, sunColor, 0.25 + 0.5 * s) * (1.0 - overcast * 0.55);
      c = mix(c, lit, k * (0.85 + overcast * 0.15) * smoothstep(0.0, 0.12, d.y));
    }
    if (d.y < 0.0) c = mix(horizon, horizon * 0.6, min(1.0, -d.y * 4.0));
    c += vec3(0.8, 0.85, 1.0) * flash;
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** Colours by the hour (16:00 … 23:00): sky top, horizon, sun, fog. */
const KEYS: [number, number, number, number, number, number][] = [
  // hour, top, horizon, sun, fog, sun power
  [16, 0x4c86c6, 0xc9d9e4, 0xfff0d8, 0xbac7cf, 2.8],
  [18, 0x3f6fa8, 0xe8c9a0, 0xffc98a, 0xc7b8a4, 2.2],
  [19.3, 0x2d3e66, 0xf08a54, 0xff7a3d, 0x9c7a68, 1.3],
  [20.2, 0x141c33, 0x4a3a52, 0x9b5a6a, 0x3a3846, 0.25],
  [21, 0x070b16, 0x161b2b, 0x6a7ca8, 0x15192a, 0.12],
  [23, 0x04060c, 0x0d1220, 0x6a7ca8, 0x0c0f1a, 0.1],
];

export class Sky {
  dome: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  /** 0–1: how much it's raining (eases toward `rainWant`). */
  rain = 0;
  rainWant = 0;
  /** The hour now (16–23), and whether it's dark enough for night vision to matter. */
  hour = 16;
  night = false;
  sunDir = new THREE.Vector3();
  private rainMesh: THREE.LineSegments;
  private rainMat: THREE.ShaderMaterial;
  private flash = 0;
  private nextBolt = 0;
  private c = { top: new THREE.Color(), hor: new THREE.Color(), sun: new THREE.Color(), fog: new THREE.Color(), a: new THREE.Color(), b: new THREE.Color() };
  /** Lightning: called with the delay until its thunder. */
  onBolt: ((thunderIn: number) => void) | null = null;

  constructor(private r: OpsRenderer) {
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, moonDir: { value: new THREE.Vector3(-0.5, 0.45, -0.4).normalize() }, stars: { value: 0 }, cloud: { value: 0.3 }, time: { value: 0 }, flash: { value: 0 }, overcast: { value: 0 } },
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 40, 20), this.mat);
    this.dome.frustumCulled = false; this.dome.renderOrder = -1;
    r.scene.add(this.dome);

    // Rain: streaks scattered in a 60 m box; the vertex shader drops them and wraps them round the camera.
    const N = r.phone ? 1800 : 5000, pos = new Float32Array(N * 6), seedA = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = Math.random() * 60 - 30, y = Math.random() * 30, z = Math.random() * 60 - 30;
      pos.set([x, y, z, x, y, z], i * 6); seedA.set([0, 1], i * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('end', new THREE.BufferAttribute(seedA, 1));
    this.rainMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { time: { value: 0 }, eye: { value: new THREE.Vector3() }, amount: { value: 0 }, wind: { value: new THREE.Vector2(1.5, 0.6) } },
      vertexShader: `uniform float time; uniform vec3 eye; uniform vec2 wind; attribute float end; varying float vA;
        void main(){
          vec3 p = position;
          float fall = mod(p.y - time * 22.0, 30.0);
          vec3 w = vec3(mod(p.x - eye.x + time * wind.x + 30.0, 60.0) - 30.0, fall - 8.0, mod(p.z - eye.z + time * wind.y + 30.0, 60.0) - 30.0) + vec3(eye.x, eye.y, eye.z);
          w += vec3(wind.x, -22.0, wind.y) * 0.035 * end;
          vA = 1.0 - smoothstep(14.0, 30.0, length(w.xz - eye.xz));
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: 'uniform float amount; varying float vA; void main(){ gl_FragColor = vec4(0.72, 0.76, 0.82, 0.32 * vA * amount); }',
    });
    this.rainMesh = new THREE.LineSegments(g, this.rainMat);
    this.rainMesh.frustumCulled = false; this.rainMesh.visible = false;
    r.scene.add(this.rainMesh);
  }

  /** Moves the clock on: `k` is the round's progress (0–1). Returns what the world's lights should be. */
  update(k: number, t: number, dt: number, eye: THREE.Vector3) {
    this.hour = 16 + 7 * Math.min(1, Math.max(0, k));
    const { top, hor, sun, fog, a, b } = this.c;
    let i = 0;
    while (i < KEYS.length - 2 && this.hour > KEYS[i + 1][0]) i++;
    const [h0, t0, z0, s0, f0] = KEYS[i], [h1, t1, z1, s1, f1] = KEYS[i + 1], u = Math.min(1, Math.max(0, (this.hour - h0) / (h1 - h0)));
    top.set(t0).lerp(a.set(t1), u); hor.set(z0).lerp(a.set(z1), u); sun.set(s0).lerp(a.set(s1), u); fog.set(f0).lerp(a.set(f1), u);
    // The sun: from the west-south-west high in the afternoon down below the horizon by 20:15.
    const el = ((20.25 - this.hour) / 4.25) * 0.75, az = 2.2 + (this.hour - 16) * 0.12;
    this.sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
    this.night = this.hour > 20.4;
    // Rain eases in and out; the sky greys over and the fog closes in while it rains.
    this.rain += (this.rainWant - this.rain) * Math.min(1, dt * 0.25);
    const wet = this.rain;
    top.lerp(b.set(0x3a4048).multiplyScalar(this.night ? 0.25 : 1), wet * 0.7);
    hor.lerp(b.set(0x6b7178).multiplyScalar(this.night ? 0.25 : 1), wet * 0.6);
    fog.lerp(b.set(0x5d646a).multiplyScalar(this.night ? 0.3 : 1), wet * 0.6);
    const m = this.mat.uniforms;
    m.top.value.copy(top); m.horizon.value.copy(hor); m.sunColor.value.copy(sun); m.sunDir.value.copy(this.sunDir);
    m.stars.value = Math.min(1, Math.max(0, (this.hour - 20) / 0.8)); m.time.value = t; m.overcast.value = wet; m.cloud.value = 0.3 + wet * 0.7;
    (this.r.scene.fog as THREE.FogExp2).color.copy(fog);
    (this.r.scene.fog as THREE.FogExp2).density = 0.0024 + wet * 0.0034 + (this.night ? 0.0012 : 0);
    this.dome.position.copy(eye);
    // Lightning, only in heavy rain: a flash, then thunder a few seconds later.
    if (wet > 0.6 && t > this.nextBolt) {
      this.nextBolt = t + 7 + Math.random() * 16;
      this.flash = 1;
      this.onBolt?.(0.6 + Math.random() * 3);
    }
    this.flash = Math.max(0, this.flash - dt * 3.5);
    const flicker = this.flash * (0.6 + 0.4 * Math.sin(t * 90));
    m.flash.value = flicker * 0.6;
    this.rainMesh.visible = wet > 0.02;
    this.rainMat.uniforms.time.value = t; this.rainMat.uniforms.eye.value.copy(eye); this.rainMat.uniforms.amount.value = wet;
    // The light that goes with it: the sun by day, the moon by night (from the moon's side, blue).
    const moon = this.night || this.sunDir.y < 0.03;
    const dir = moon ? m.moonDir.value as THREE.Vector3 : this.sunDir;
    const power = (moon ? 0.35 : Math.max(0.05, KEYS[i][5] + (KEYS[i + 1][5] - KEYS[i][5]) * u)) * (1 - wet * 0.55) + flicker * 3;
    const light = moon ? a.set(0x8fa3d6) : sun;
    const skyPower = (this.night ? 0.22 : 0.55 + 0.6 * Math.max(0, this.sunDir.y)) * (1 - wet * 0.3) + flicker * 1.5;
    this.r.light(dir, light, power, top, b.set(0x3a3326).multiplyScalar(this.night ? 0.3 : 1), skyPower);
    // Sun rays and flare: strongest with the sun clear of the horizon, gone in rain and at night.
    const rs = this.r.sky;
    rs.dir.copy(this.sunDir); rs.color.copy(sun).lerp(b.set(0xffe2b0), 0.4);
    rs.k = this.night ? 0 : Math.min(1, Math.max(0, (this.sunDir.y + 0.01) / 0.08)) * (1 - wet);
    return { wet, night: this.night, fog };
  }
}
