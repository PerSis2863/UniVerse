import type { WeaponClass } from '@/lib/play/ops';

// Side-on outlines of each kind of gun for the weapon card (120 × 40, muzzle to the right). Each
// is a few polygons: stock, receiver, handguard, barrel, magazine, grip and any optic.
type Poly = readonly (readonly [number, number])[];
const R = (x: number, y: number, w: number, h: number): Poly => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const SHAPES: Record<WeaponClass, Poly[]> = {
  ar: [[[2, 14], [18, 12], [22, 14], [22, 22], [16, 26], [4, 26]], R(22, 12, 48, 10), [[70, 12], [72, 14], [98, 14], [98, 21], [72, 21], [70, 22]], R(98, 16, 18, 2.5), [[48, 22], [56, 22], [60, 36], [52, 37]], [[30, 22], [37, 22], [34, 33], [28, 33]], R(40, 9, 24, 3)],
  smg: [[[4, 15], [16, 14], [18, 16], [18, 22], [6, 23]], R(18, 12, 44, 10), R(62, 15, 18, 3.5), [[40, 22], [46, 22], [47, 38], [41, 38]], [[24, 22], [31, 22], [28, 32], [22, 32]], R(30, 9, 20, 3)],
  lmg: [[[2, 13], [20, 12], [22, 22], [4, 26]], R(22, 11, 52, 12), R(74, 13, 26, 8), R(100, 15.5, 18, 3), R(44, 23, 18, 11), [[28, 23], [35, 23], [32, 33], [26, 33]], [[98, 21], [100, 21], [106, 33], [104, 33]], R(36, 8, 28, 3)],
  shotgun: [[[2, 15], [22, 12], [24, 22], [6, 26]], R(24, 12, 28, 10), R(52, 13, 62, 3.5), R(52, 17, 48, 3), R(62, 16.5, 20, 5.5), [[28, 22], [34, 22], [31, 30], [25, 30]]],
  marksman: [[[2, 14], [20, 12], [24, 14], [24, 22], [18, 27], [4, 27]], R(24, 12, 44, 10), R(68, 14, 28, 7), R(96, 16, 22, 2.5), [[46, 22], [54, 22], [55, 31], [47, 31]], [[30, 22], [37, 22], [34, 33], [28, 33]], R(34, 4, 30, 5), R(40, 9, 3, 3), R(56, 9, 3, 3)],
  pistol: [R(30, 12, 52, 8), R(34, 20, 46, 3), [[36, 23], [50, 23], [46, 38], [32, 38]], [[50, 23], [58, 23], [56, 28], [50, 28]], R(78, 10, 3, 2), R(32, 10, 4, 2)],
};

/** The gun's outline in the current colour (decorative: the name sits beside it). */
export function GunSilhouette({ cls, className }: { cls: WeaponClass; className?: string }) {
  return (
    <svg viewBox="0 0 120 40" className={className} aria-hidden fill="currentColor">
      {(SHAPES[cls] ?? SHAPES.ar).map((p, i) => <polygon key={i} points={p.map(([x, y]) => `${x},${y}`).join(' ')} />)}
    </svg>
  );
}
