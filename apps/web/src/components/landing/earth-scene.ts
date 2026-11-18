import * as THREE from 'three';

// M328 (the owner, 18 Nov 2026: "remove the globe we have currently and make the same one the tripist has"): a
// real-looking Earth, lit from the top left, oceans that catch the light, a thin blue rim of air, turning slowly;
// a drag turns it, an app chosen beside it turns it to that app's place. Its picture is made from Natural Earth's
// public-domain relief maps (scripts/earth-texture.py). The same code draws on a background thread (earth.worker.ts)
// or, in browsers without one, on the page.

export interface EarthInit {
  canvas: HTMLCanvasElement | OffscreenCanvas; w: number; h: number; dpr: number; still: boolean;
  map: ImageBitmap; water: ImageBitmap | null;
}
export type Facing = { lat: number; lon: number };

const RAD = Math.PI / 180;
/** The shorter way from one longitude to another (degrees, −180..180). */
export const lonStep = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;
/** Latitudes the globe may tip to (it shows the poles only a little). */
export const tipped = (lat: number) => Math.max(-35, Math.min(55, lat));

export function earthScene(o: EarthInit) {
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas as HTMLCanvasElement, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(o.dpr);
  renderer.setSize(o.w, o.h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, o.w / o.h, 0.1, 50);
  camera.position.set(0, 0, 4.3);

  // ImageBitmaps keep their rows top first: the sphere's texture rows are turned instead of the picture.
  const tex = (img: ImageBitmap, colour: boolean) => {
    const t = new THREE.Texture(img);
    t.flipY = false;
    if (colour) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.needsUpdate = true;
    return t;
  };
  const geo = new THREE.SphereGeometry(1, 128, 96);
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const earth = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
    map: tex(o.map, true), specularMap: o.water ? tex(o.water, false) : null, specular: new THREE.Color(0x46658c), shininess: 24,
  }));
  scene.add(earth);
  // The air: a blue rim brightest at the edge, and a faint haze over the day side.
  // A thin rim (normal blending, its own alpha, so it reads as blue air on a light page, not a grey halo).
  const air = new THREE.Mesh(new THREE.SphereGeometry(1.025, 96, 64), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vN; void main(){ float i = pow(clamp(0.62 + dot(vN, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 3.0); gl_FragColor = vec4(0.36, 0.62, 1.0, i * 0.75); }',
  }));
  scene.add(air);
  const haze = new THREE.Mesh(new THREE.SphereGeometry(1.002, 96, 64), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vN; void main(){ float f = pow(1.0 - clamp(dot(vN, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 2.6); gl_FragColor = vec4(0.55, 0.78, 1.0, 1.0) * f * 0.55; }',
  }));
  scene.add(haze);
  const sun = new THREE.DirectionalLight(0xffffff, 2.9);
  sun.position.set(-3.2, 2.4, 3.4);
  scene.add(sun, new THREE.AmbientLight(0xcfe0ff, 0.62));

  // Facing Europe and Africa first, tipped a little north (as tripist's).
  const at: Facing = { lat: 24, lon: 12 };
  let target: Facing | null = null, holding = false, spin = 0, still = o.still;
  const SPEED = 3.2; // degrees a second: a turn in under two minutes
  const place = () => { earth.rotation.set(tipped(at.lat) * RAD, -(at.lon * RAD + Math.PI / 2), 0); };
  place();

  return {
    /** One frame, `dt` seconds after the last. Whether it still moves (else the page may rest it). */
    frame(dt: number) {
      if (!holding) {
        if (target) {
          const k = still ? 1 : 1 - Math.exp(-dt * 3.2), dl = lonStep(at.lon, target.lon);
          at.lon += dl * k; at.lat += (tipped(target.lat) - at.lat) * k;
          if (Math.abs(dl) < 0.05 && Math.abs(tipped(target.lat) - at.lat) < 0.05) at.lon = target.lon;
        } else if (Math.abs(spin) > 0.01) { at.lon -= spin * dt; spin *= Math.exp(-dt * 2.4); }
        else if (!still) at.lon += SPEED * dt;
      }
      place();
      renderer.render(scene, camera);
      return !still || !!target || Math.abs(spin) > 0.01 || holding;
    },
    size(w: number, h: number, dpr: number) { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); },
    /** A drag of dx, dy pixels on a globe `px` pixels wide. */
    drag(dx: number, dy: number, px: number) {
      holding = true; target = null;
      const deg = (180 / Math.max(120, px)) * 1.1;
      at.lon -= dx * deg; at.lat = tipped(at.lat + dy * deg);
      spin = dx * deg * 30;
    },
    release() { holding = false; },
    face(f: Facing | null) { target = f; },
    setStill(s: boolean) { still = s; },
    dispose() { scene.traverse((x) => { if (x instanceof THREE.Mesh) { x.geometry.dispose(); const m = x.material as THREE.Material & { map?: THREE.Texture | null; specularMap?: THREE.Texture | null }; m.map?.dispose(); m.specularMap?.dispose(); m.dispose(); } }); renderer.dispose(); renderer.forceContextLoss(); },
  };
}
export type EarthScene = ReturnType<typeof earthScene>;

/** The Earth's picture for a globe `px` CSS pixels wide (the sharper one on big, sharp screens). */
export const earthPicture = (px: number, dpr: number) => (px * dpr > 900 ? '/geo/earth-4096.jpg' : '/geo/earth-2048.jpg');
export const WATER_PICTURE = '/geo/earth-water-1024.png';
/** A picture as an ImageBitmap (rows as stored). */
export async function bitmap(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return createImageBitmap(await r.blob());
}
