import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { THREE } from './core';
import { can, part, sortables, whole } from './props';

// Product photos for Spot the Fake's passports (M104, the owner: "realistic graphics to all of them"):
// each product is modelled, lit like a studio shot (soft light from all round, a key light, a shadow
// under it) and photographed once into a small picture, then the renderer is let go. Nothing is
// downloaded; the same product always gets the same picture.

const lathe = (pts: [number, number][], seg = 28) => new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg);

/** The products of src/lib/play/fakes.ts, by name, standing upright, about one unit tall. */
function model(product: string): THREE.BufferGeometry {
  if (product.startsWith('Olive oil')) return whole([part(lathe([[0, 0], [0.2, 0], [0.21, 0.04], [0.21, 0.62], [0.12, 0.78], [0.06, 0.86], [0.06, 0.92], [0, 0.92]]), 0x2f5a1f), part(new THREE.CylinderGeometry(0.215, 0.215, 0.3, 28, 1, true), 0xf5ead0, [0, 0.33, 0]), part(new THREE.CylinderGeometry(0.075, 0.075, 0.1, 18), 0xc9a227, [0, 0.95, 0])]);
  if (product.startsWith('Honey')) return whole([part(lathe([[0, 0], [0.26, 0], [0.28, 0.05], [0.28, 0.46], [0.22, 0.54], [0, 0.54]]), 0xd99a1b), part(new THREE.CylinderGeometry(0.282, 0.282, 0.2, 28, 1, true), 0xfdf6e3, [0, 0.24, 0]), part(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 28), 0x8a5a2b, [0, 0.58, 0])]);
  if (product.startsWith('Face cream')) return whole([part(new THREE.CylinderGeometry(0.34, 0.32, 0.3, 32), 0xf8fafc, [0, 0.15, 0]), part(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 32), 0xd4af37, [0, 0.36, 0]), part(new THREE.CylinderGeometry(0.341, 0.341, 0.06, 32, 1, true), 0xf9a8d4, [0, 0.15, 0])]);
  if (product.startsWith('Cold brew')) { const g = can(); g.rotateZ(Math.PI / 2); g.scale(1.6, 1.6, 1.6); return g; }
  if (product.startsWith('Saffron')) return whole([part(lathe([[0, 0], [0.13, 0], [0.14, 0.03], [0.14, 0.4], [0, 0.4]]), 0xd8e3ea), part(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 18), 0xb91c1c, [0, 0.13, 0]), part(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 18), 0x1f2937, [0, 0.45, 0])]);
  if (product.startsWith('Basmati')) return whole([part(new THREE.CapsuleGeometry(0.28, 0.4, 6, 16), 0xf5f0e1, [0, 0.48, 0], [0, 0, 0], [1, 1, 0.55]), part(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 4, 1, true), 0xc9a227, [0, 0.5, 0], [0, Math.PI / 4, 0], [1, 1, 0.56])]);
  if (product.startsWith('Kids')) return whole([part(lathe([[0, 0], [0.17, 0], [0.18, 0.03], [0.18, 0.4], [0.1, 0.5], [0.08, 0.54], [0, 0.54]]), 0x8a4a12), part(new THREE.CylinderGeometry(0.181, 0.181, 0.2, 24, 1, true), 0xffffff, [0, 0.2, 0]), part(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 20), 0xf8fafc, [0, 0.6, 0])]);
  if (product.startsWith('Running shoes')) return whole([part(new THREE.BoxGeometry(0.42, 0.08, 1.0), 0xf8fafc, [0, 0.04, 0]), part(new THREE.CapsuleGeometry(0.2, 0.55, 6, 16), 0xfe81d1, [0, 0.2, 0.06], [Math.PI / 2, 0, 0], [1, 1, 0.7]), part(new THREE.CylinderGeometry(0.17, 0.2, 0.2, 18), 0xfe81d1, [0, 0.3, -0.32]), part(new THREE.BoxGeometry(0.22, 0.02, 0.36), 0xffffff, [0, 0.33, 0.12]), part(new THREE.BoxGeometry(0.44, 0.03, 0.4), 0x111827, [0, 0.015, 0.25])]);
  if (product.startsWith('Handbag')) return whole([part(new THREE.BoxGeometry(0.8, 0.52, 0.32), 0x7c2d12, [0, 0.27, 0]), part(new THREE.TorusGeometry(0.22, 0.03, 8, 24, Math.PI), 0x5b2310, [0, 0.53, 0]), part(new THREE.BoxGeometry(0.16, 0.08, 0.02), 0xd4af37, [0, 0.4, 0.17])]);
  // The rest are things Recycle Rush already models (stood up for the photo).
  const i = product.startsWith('Headphones') ? 24 : product.startsWith('Phone charger') ? 27 : 29;
  const all = sortables(), g = all[i];
  all.forEach((x, k) => { if (k !== i) x.dispose(); });
  g.rotateX(product.startsWith('Wristwatch') ? -1.1 : 0);
  return g;
}

const shots = new Map<string, string>();
let pending: Promise<void> | null = null;

/** Photographs every product not yet taken (one renderer, then released); pictures by product name. */
export function productShots(products: string[]): Promise<Map<string, string>> {
  const want = products.filter((p) => !shots.has(p));
  if (!want.length) return Promise.resolve(shots);
  pending = (pending ?? Promise.resolve()).then(() => {
    const todo = want.filter((p) => !shots.has(p));
    if (!todo.length) return;
    const canvas = document.createElement('canvas');
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(256, 256, false);
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2, 4, 3); key.castShadow = true; key.shadow.mapSize.set(512, 512);
    Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: 0.5, far: 12 });
    key.shadow.radius = 6;
    scene.add(key, new THREE.HemisphereLight(0xffffff, 0x6b6b70, 0.6));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.28 }));
    floor.receiveShadow = true; scene.add(floor);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
    const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    for (const p of todo) {
      const geo = model(p);
      geo.computeBoundingBox();
      const b = geo.boundingBox!, size = b.getSize(new THREE.Vector3()), mid = b.getCenter(new THREE.Vector3());
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.position.set(-mid.x, -b.min.y, -mid.z);
      mesh.rotation.y = -0.5;
      scene.add(mesh);
      const reach = Math.max(size.x, size.y, size.z);
      cam.position.set(reach * 1.15, reach * 0.9 + size.y * 0.25, reach * 1.95);
      cam.lookAt(0, size.y * 0.45, 0);
      r.render(scene, cam);
      shots.set(p, canvas.toDataURL('image/png'));
      scene.remove(mesh); geo.dispose();
    }
    scene.environment?.dispose();
    r.dispose(); r.forceContextLoss();
  });
  return pending.then(() => shots);
}
