import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { THREE } from '../world/core';

/** One mesh per material instead of a mesh per part (each mesh is a draw, and draws are what slow
 *  phones down). Parts in `keep` (wheels, doors: things that move) stay as they are. */
export function mergeByMaterial(src: THREE.Object3D, keep: ReadonlySet<THREE.Object3D> = new Set()) {
  src.updateMatrixWorld(true);
  const inv = src.matrixWorld.clone().invert(), by = new Map<THREE.Material, THREE.BufferGeometry[]>(), kept: THREE.Object3D[] = [];
  const walk = (o: THREE.Object3D) => {
    if (keep.has(o)) { kept.push(o); return; }
    const m = o as THREE.Mesh;
    if (m.isMesh && !Array.isArray(m.material)) {
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld.clone().premultiply(inv));
      for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      by.set(m.material, [...(by.get(m.material) ?? []), g]);
    }
    for (const c of o.children) walk(c);
  };
  for (const c of src.children) walk(c);
  const out = new THREE.Group();
  for (const [mat, list] of by) {
    const geo = mergeGeometries(list);
    list.forEach((x) => x.dispose());
    if (!geo) return src;
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = mesh.receiveShadow = true; out.add(mesh);
  }
  // Kept parts move with their own transforms, relative to the group as before.
  for (const k of kept) { const at = k.matrixWorld.clone().premultiply(inv); k.removeFromParent(); at.decompose(k.position, k.quaternion, k.scale); out.add(k); }
  return out;
}
