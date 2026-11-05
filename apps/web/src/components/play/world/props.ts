import { THREE, mergeGeometries } from './core';

// Everyday things as small 3D models (M104): bottles, cans, cartons, peel, phones… Each is one
// geometry painted with vertex colours (draw it with a material that has `vertexColors: true`), about
// one unit across, resting on y = 0 and lying along x. Built once per game and shared by every copy.
// Recycle Rush sorts all thirty of its items with these; Ocean Cleanup floats some of them.

type V3 = [number, number, number];

/** A part of a model: a shape placed, turned, scaled and painted one colour. */
export function part(geo: THREE.BufferGeometry, color: number, at: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]) {
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));
  const c = new THREE.Color(color), n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
/** The parts as one geometry (one draw call). */
export function whole(parts: THREE.BufferGeometry[]) {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const g = mergeGeometries(flat);
  parts.forEach((p) => p.dispose());
  flat.forEach((p) => p.dispose());
  return g;
}

const cyl = (r1: number, r2: number, h: number, seg = 14) => new THREE.CylinderGeometry(r1, r2, h, seg);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const ball = (r: number, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
/** A lathe (a shape turned round its axis) from [radius, height] points. */
const lathe = (pts: [number, number][], seg = 18) => new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg);
const SIDE: V3 = [0, 0, Math.PI / 2];

/** A plastic drinks bottle lying down: clear blue body, a label, a cap. */
export const bottle = () => whole([part(lathe([[0, -0.3], [0.15, -0.29], [0.155, 0.12], [0.07, 0.24], [0.065, 0.3], [0, 0.3]]), 0xb9e2ec, [0, 0.155, 0], SIDE), part(cyl(0.158, 0.158, 0.2), 0x22c55e, [-0.04, 0.155, 0], SIDE), part(cyl(0.07, 0.07, 0.07, 10), 0x1d4ed8, [-0.33, 0.155, 0], SIDE)]);
/** A drinks can lying down: red with a white band, silver ends. */
export const can = () => whole([part(cyl(0.14, 0.14, 0.4, 18), 0xdc2626, [0, 0.14, 0], SIDE), part(cyl(0.142, 0.142, 0.1, 18), 0xf8fafc, [0, 0.14, 0], SIDE), part(cyl(0.125, 0.14, 0.03, 18), 0xd4d4d8, [0.215, 0.14, 0], SIDE), part(cyl(0.14, 0.125, 0.03, 18), 0xd4d4d8, [-0.215, 0.14, 0], SIDE)]);
/** A takeaway cup on its side with a straw. */
export const cup = () => whole([part(cyl(0.17, 0.12, 0.5, 16), 0xf8fafc, [0, 0.16, 0], SIDE), part(cyl(0.172, 0.165, 0.1, 16), 0xdc2626, [-0.12, 0.16, 0], SIDE), part(cyl(0.02, 0.02, 0.5, 6), 0xf472b6, [0.25, 0.24, 0.05], [0.3, 0, Math.PI / 2.4])]);
/** A crumpled plastic bag. */
export function bag(color = 0xdde7ee) {
  const g = new THREE.CircleGeometry(0.42, 18).rotateX(-Math.PI / 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), r = 1 + Math.sin(a * 5) * 0.12 + Math.sin(a * 3 + 1) * 0.08; p.setXYZ(i, x * r * 1.15, Math.abs(Math.sin(x * 11 + z * 8)) * 0.08 + 0.03, z * r * 0.9); }
  g.computeVertexNormals();
  return whole([part(g, color), part(new THREE.TorusGeometry(0.12, 0.025, 6, 12, Math.PI), color, [-0.2, 0.05, -0.35], [Math.PI / 2, 0, 0]), part(new THREE.TorusGeometry(0.12, 0.025, 6, 12, Math.PI), color, [0.2, 0.05, -0.35], [Math.PI / 2, 0, 0])]);
}

/** A sea turtle (shell, belly, head, four flippers), head toward −z. */
export function turtle() {
  const flipper = (x: number, z: number, r: number) => part(new THREE.BoxGeometry(0.34, 0.04, 0.14), 0x7a8f62, [x, 0.02, z], [0, r, x > 0 ? -0.2 : 0.2]);
  return whole([part(new THREE.SphereGeometry(0.5, 18, 12), 0x5b6b3a, [0, 0.1, 0], [0, 0, 0], [0.62, 0.24, 0.78]), part(new THREE.SphereGeometry(0.5, 16, 10), 0x7f8f55, [0, 0.13, 0], [0, 0, 0], [0.42, 0.22, 0.56]), part(new THREE.SphereGeometry(0.12, 12, 10), 0x8a9a70, [0, 0.12, -0.5]), flipper(0.36, -0.22, -0.5), flipper(-0.36, -0.22, 0.5), flipper(0.3, 0.3, 0.6), flipper(-0.3, 0.3, -0.6)]);
}

/** Recycle Rush's thirty things, in the order of its ITEMS list (src/lib/play/sort.ts). */
export function sortables(): THREE.BufferGeometry[] {
  const leaf = (x: number, z: number, r: number, c: number) => { const g = ball(0.16, 10, 6); return part(g, c, [x, 0.03, z], [0, r, 0.1], [1.4, 0.15, 0.7]); };
  return [
    bottle(),
    can(),
    // Newspaper: a folded stack of grey pages with dark print bands.
    whole([part(box(0.62, 0.06, 0.44), 0xe5e2da, [0, 0.03, 0]), part(box(0.5, 0.005, 0.06), 0x52525b, [0, 0.063, -0.12]), part(box(0.3, 0.005, 0.18), 0x9ca3af, [-0.1, 0.063, 0.06]), part(box(0.15, 0.005, 0.18), 0x71717a, [0.17, 0.063, 0.06])]),
    // Cardboard box with tape.
    whole([part(box(0.62, 0.42, 0.46), 0xb98a5a, [0, 0.21, 0]), part(box(0.64, 0.005, 0.08), 0xd6c19a, [0, 0.423, 0])]),
    // Glass jar with a lid.
    whole([part(lathe([[0, 0], [0.16, 0.0], [0.17, 0.05], [0.17, 0.32], [0.13, 0.38], [0.13, 0.42], [0, 0.42]]), 0x9fd7c0), part(cyl(0.14, 0.14, 0.06), 0xc0c4ca, [0, 0.44, 0])]),
    // Milk carton with its gable top.
    whole([part(box(0.3, 0.46, 0.3), 0xf8fafc, [0, 0.23, 0]), part(new THREE.CylinderGeometry(0.001, 0.213, 0.14, 4, 1).rotateY(Math.PI / 4), 0xf8fafc, [0, 0.53, 0], [0, 0, 0], [1, 1, 0.99]), part(box(0.302, 0.12, 0.302), 0x60a5fa, [0, 0.2, 0])]),
    // Paper bag, open at the top.
    whole([part(cyl(0.2, 0.2, 0.5, 4).rotateY(Math.PI / 4), 0xa47b4f, [0, 0.25, 0], [0, 0, 0], [1.2, 1, 0.7]), part(box(0.34, 0.03, 0.2), 0x8a6a45, [0, 0.5, 0])]),
    // Envelope.
    whole([part(box(0.56, 0.03, 0.36), 0xf5f5f4, [0, 0.015, 0]), part(new THREE.CylinderGeometry(0.001, 0.2, 0.004, 3).rotateY(Math.PI / 6), 0xe7e5e4, [0, 0.033, -0.06], [0, 0, 0], [1.4, 1, 0.8])]),
    // Banana peel: three curved yellow strips with brown tips.
    whole([0, 1, 2].map((i) => part(new THREE.TorusGeometry(0.28, 0.05, 6, 12, Math.PI * 0.8), i === 1 ? 0xf2c94c : 0xe9b949, [0, 0.05, 0], [Math.PI / 2, 0, (i - 1) * 0.9], [1, 1, 0.4])).concat([part(cyl(0.035, 0.03, 0.1, 6), 0x5b4636, [0, 0.06, 0], SIDE)])),
    // Apple core: thin waist, a stem, pips.
    whole([part(lathe([[0, 0], [0.12, 0.01], [0.15, 0.06], [0.06, 0.16], [0.05, 0.22], [0.13, 0.32], [0.1, 0.38], [0, 0.38]]), 0xf5e6c4), part(lathe([[0.121, 0.0], [0.151, 0.06], [0.135, 0.05], [0.105, 0.0]]), 0xb91c1c), part(lathe([[0.131, 0.32], [0.101, 0.38], [0.09, 0.37], [0.12, 0.31]]), 0xb91c1c), part(cyl(0.012, 0.012, 0.1, 5), 0x5b4636, [0, 0.43, 0])]),
    // Egg shells: two broken halves.
    whole([part(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xf3e8d6, [-0.12, 0, 0], [Math.PI, 0, 0.3]), part(new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xefe0c6, [0.14, 0.02, 0.05], [Math.PI * 0.85, 0, -0.3])]),
    // Coffee grounds in a paper filter.
    whole([part(cyl(0.22, 0.12, 0.2, 16), 0xf1e7d0, [0, 0.1, 0]), part(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x3b2a20, [0, 0.16, 0], [0, 0, 0], [1, 0.4, 1])]),
    // Leaves: a little heap of autumn leaves.
    whole([leaf(-0.12, 0, 0.3, 0xd97706), leaf(0.1, 0.06, 1.4, 0xb45309), leaf(0.02, -0.1, 2.2, 0xea580c), leaf(0.16, -0.08, 0.8, 0x92400e), leaf(-0.06, 0.12, 2.8, 0xca8a04)]),
    // Bread crust.
    whole([part(new THREE.CapsuleGeometry(0.11, 0.42, 4, 10), 0xb7793f, [0, 0.11, 0], SIDE, [1, 1, 0.8]), part(box(0.44, 0.02, 0.14), 0xf1d9a8, [0, 0.2, 0])]),
    // Tea bag: the bag, its string and tag.
    whole([part(box(0.3, 0.05, 0.26), 0xd6c6a8, [0, 0.025, 0]), part(box(0.24, 0.052, 0.2), 0x8a5a33, [0, 0.026, 0], [0, 0, 0], [1, 1, 1]), part(cyl(0.005, 0.005, 0.3, 4), 0xf5f5f4, [0.28, 0.02, 0], SIDE), part(box(0.1, 0.01, 0.08), 0xdc2626, [0.46, 0.01, 0])]),
    // Carrot tops: orange stubs and green fronds.
    whole([part(new THREE.ConeGeometry(0.08, 0.2, 10), 0xf97316, [-0.1, 0.08, 0], [0, 0, -Math.PI / 2]), part(new THREE.ConeGeometry(0.07, 0.18, 10), 0xea580c, [0.02, 0.07, 0.1], [0, 0.4, -Math.PI / 2]), ...[0, 1, 2, 3].map((i) => part(new THREE.ConeGeometry(0.04, 0.38, 5), 0x4d7c0f, [0.12 + i * 0.02, 0.06, -0.06 + i * 0.05], [0, 0.3 * i, -Math.PI / 2 + 0.3]))]),
    // Crisp packet: a puffy foil bag.
    whole([part(new THREE.CapsuleGeometry(0.16, 0.24, 4, 10), 0xc0c4ca, [0, 0.12, 0], [Math.PI / 2, 0, 0], [1.4, 1, 0.5]), part(box(0.46, 0.02, 0.08), 0xdc2626, [0, 0.13, 0.25]), part(box(0.46, 0.02, 0.08), 0xdc2626, [0, 0.13, -0.25]), part(box(0.24, 0.03, 0.18), 0xfacc15, [0, 0.2, 0])]),
    // Nappy: a puffy folded pad.
    whole([part(new THREE.CapsuleGeometry(0.14, 0.32, 4, 10), 0xf8fafc, [0, 0.12, 0], SIDE, [1, 1, 1.4]), part(box(0.1, 0.02, 0.36), 0x93c5fd, [0.15, 0.25, 0])]),
    // Broken mug: a mug with a chip out, its handle.
    whole([part(new THREE.CylinderGeometry(0.16, 0.15, 0.32, 16, 1, true, 0, Math.PI * 1.7), 0x3b82f6, [0, 0.16, 0]), part(cyl(0.15, 0.15, 0.02, 16), 0x3b82f6, [0, 0.01, 0]), part(new THREE.TorusGeometry(0.08, 0.025, 6, 12, Math.PI), 0x3b82f6, [0.17, 0.16, 0], [0, 0, -Math.PI / 2])]),
    // Chewing gum: a squashed pink blob.
    whole([part(ball(0.12), 0xf472b6, [0, 0.05, 0], [0, 0, 0], [1.3, 0.45, 1])]),
    // Toothbrush.
    whole([part(new THREE.CapsuleGeometry(0.025, 0.56, 4, 8), 0x22d3ee, [0, 0.04, 0], SIDE), part(box(0.14, 0.07, 0.05), 0xf8fafc, [0.26, 0.09, 0])]),
    // Sponge: yellow with a green scourer.
    whole([part(box(0.36, 0.14, 0.24), 0xfacc15, [0, 0.07, 0]), part(box(0.36, 0.04, 0.24), 0x16a34a, [0, 0.16, 0])]),
    // Old phone: dark body, a cracked screen.
    whole([part(box(0.3, 0.035, 0.58), 0x18181b, [0, 0.018, 0]), part(box(0.27, 0.005, 0.52), 0x1e3a5f, [0, 0.038, 0]), part(box(0.2, 0.006, 0.006), 0xe0f2fe, [0.02, 0.041, 0.05], [0, 0.6, 0])]),
    // Battery: a cylinder with its band and terminal.
    whole([part(cyl(0.1, 0.1, 0.42, 14), 0x18181b, [0, 0.1, 0], SIDE), part(cyl(0.102, 0.102, 0.16, 14), 0xf59e0b, [0.1, 0.1, 0], SIDE), part(cyl(0.035, 0.035, 0.04, 8), 0xd4d4d8, [0.23, 0.1, 0], SIDE)]),
    // Headphones: the band and two cups.
    whole([part(new THREE.TorusGeometry(0.24, 0.03, 6, 18, Math.PI), 0x27272a, [0, 0.12, 0], [0, 0, 0]), part(cyl(0.1, 0.1, 0.08, 14), 0x3f3f46, [-0.24, 0.1, 0], SIDE), part(cyl(0.1, 0.1, 0.08, 14), 0x3f3f46, [0.24, 0.1, 0], SIDE)]),
    // Laptop, half open.
    whole([part(box(0.66, 0.035, 0.46), 0x9ca3af, [0, 0.018, 0]), part(box(0.6, 0.006, 0.3), 0x27272a, [0, 0.038, 0.04]), part(box(0.66, 0.025, 0.46), 0x9ca3af, [0, 0.2, -0.32], [-1.15, 0, 0]), part(box(0.6, 0.006, 0.4), 0x0f172a, [0, 0.2, -0.305], [-1.15, 0, 0])]),
    // LED bulb: a frosted glass bulb and its base.
    whole([part(ball(0.16), 0xf5f5f4, [0.1, 0.16, 0]), part(cyl(0.08, 0.1, 0.16, 12), 0xd4d4d8, [-0.1, 0.16, 0], SIDE)]),
    // Charger: the plug, its prongs and a cable.
    whole([part(box(0.18, 0.14, 0.2), 0xf8fafc, [0, 0.07, 0]), part(box(0.03, 0.03, 0.1), 0xd4d4d8, [-0.04, 0.07, -0.14]), part(box(0.03, 0.03, 0.1), 0xd4d4d8, [0.04, 0.07, -0.14]), part(new THREE.TorusGeometry(0.16, 0.012, 5, 20, Math.PI * 1.6), 0xf8fafc, [0.1, 0.02, 0.2], [Math.PI / 2, 0, 0])]),
    // Remote control with buttons.
    whole([part(box(0.16, 0.05, 0.56), 0x27272a, [0, 0.025, 0]), part(cyl(0.025, 0.025, 0.01, 10), 0xdc2626, [0, 0.055, -0.2]), ...[0, 1, 2].map((i) => part(box(0.1, 0.01, 0.04), 0x52525b, [0, 0.055, -0.05 + i * 0.08]))]),
    // Watch: a round face and its strap.
    whole([part(cyl(0.13, 0.13, 0.05, 20), 0xd4d4d8, [0, 0.06, 0]), part(cyl(0.11, 0.11, 0.01, 20), 0x0f172a, [0, 0.09, 0]), part(box(0.12, 0.02, 0.5), 0x7c2d12, [0, 0.02, 0])]),
  ];
}
