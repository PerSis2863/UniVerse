import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform';

// Ready-made shapes for whiteboards (Stage 5 · B9.11): science, maths and geography drawings made of
// ordinary shapes (so they can be moved, recoloured or taken apart), and stamps. `place` puts any
// set of shapes at a spot with fresh ids, so the same thing can be added again and again.

type S = ExcalidrawElementSkeleton;
const BLUE = '#a5d8ff', RED = '#ffc9c9', GREEN = '#b2f2bb', YELLOW = '#ffec99', GREY = '#dee2e6', BROWN = '#d9a066';
const line = (points: [number, number][], extra: Record<string, unknown> = {}) => ({ type: 'line', x: points[0][0], y: points[0][1], points: points.map(([x, y]) => [x - points[0][0], y - points[0][1]]), ...extra }) as S;
const arrow = (points: [number, number][], extra: Record<string, unknown> = {}) => ({ ...line(points, extra), type: 'arrow' }) as S;
const rect = (x: number, y: number, width: number, height: number, extra: Record<string, unknown> = {}) => ({ type: 'rectangle', x, y, width, height, ...extra }) as S;
const ellipse = (x: number, y: number, width: number, height: number, extra: Record<string, unknown> = {}) => ({ type: 'ellipse', x, y, width, height, ...extra }) as S;
const label = (x: number, y: number, text: string, fontSize = 16) => ({ type: 'text', x, y, text, fontSize }) as S;
const fill = (color: string) => ({ backgroundColor: color, fillStyle: 'solid' });

export interface LibraryItem { id: string; name: string; build: () => S[] }
export const LIBRARIES: { id: 'science' | 'maths' | 'geography'; name: string; items: LibraryItem[] }[] = [
  {
    id: 'science', name: 'Science', items: [
      { id: 'beaker', name: 'Beaker', build: () => [rect(4, 60, 92, 58, { ...fill(BLUE), strokeColor: 'transparent' }), line([[0, 0], [0, 120], [100, 120], [100, 0]], { strokeWidth: 2 }), label(20, 130, 'Beaker')] },
      { id: 'flask', name: 'Conical flask', build: () => [line([[35, 0], [35, 40], [0, 120], [100, 120], [65, 40], [65, 0]], { strokeWidth: 2 }), line([[14, 90], [86, 90], [100, 120], [0, 120], [14, 90]], { ...fill(GREEN), strokeColor: 'transparent' }), label(10, 130, 'Conical flask')] },
      { id: 'tube', name: 'Test tube', build: () => [rect(0, 0, 30, 120, { roundness: { type: 3 } }), rect(2, 70, 26, 48, { ...fill(RED), strokeColor: 'transparent', roundness: { type: 3 } }), label(-8, 130, 'Test tube')] },
      { id: 'atom', name: 'Atom', build: () => [ellipse(60, 45, 30, 30, fill('#ff8787')), ellipse(0, 40, 150, 40), ellipse(0, 40, 150, 40, { angle: Math.PI / 3 }), ellipse(0, 40, 150, 40, { angle: -Math.PI / 3 }), label(52, 130, 'Atom')] },
      { id: 'cell', name: 'Animal cell', build: () => [ellipse(0, 0, 220, 150, fill('#fff3bf')), ellipse(85, 50, 55, 45, fill('#d0bfff')), ellipse(30, 40, 40, 18, fill('#ffc078')), ellipse(150, 95, 40, 18, fill('#ffc078')), label(92, 64, 'nucleus', 12), label(60, 160, 'Animal cell')] },
      { id: 'magnet', name: 'Magnet', build: () => [rect(0, 0, 80, 50, { ...fill('#ff6b6b'), label: { text: 'N', fontSize: 24 } }), rect(80, 0, 80, 50, { ...fill('#4dabf7'), label: { text: 'S', fontSize: 24 } })] },
      { id: 'circuit', name: 'Circuit: cell and bulb', build: () => [line([[40, 0], [0, 0], [0, 120], [200, 120], [200, 0], [70, 0]]), line([[40, -20], [40, 20]], { strokeWidth: 3 }), line([[55, -10], [55, 10]], { strokeWidth: 3 }), line([[70, 0], [55, 0]]), ellipse(180, 40, 40, 40, fill('#fff9db')), line([[186, 46], [214, 74]]), line([[214, 46], [186, 74]]), label(20, 25, 'cell', 12), label(150, 85, 'bulb', 12)] },
      { id: 'thermometer', name: 'Thermometer', build: () => [rect(10, 0, 20, 120, { roundness: { type: 3 } }), rect(14, 60, 12, 62, { ...fill('#ff6b6b'), strokeColor: 'transparent' }), ellipse(0, 110, 40, 40, fill('#ff6b6b')), label(42, 0, '100°C', 12), label(42, 100, '0°C', 12)] },
    ],
  },
  {
    id: 'maths', name: 'Maths', items: [
      { id: 'axes', name: 'Axes', build: () => [arrow([[0, 200], [260, 200]]), arrow([[30, 230], [30, 0]]), label(262, 190, 'x'), label(38, -6, 'y'), label(14, 204, '0', 14)] },
      { id: 'numberline', name: 'Number line', build: () => [arrow([[0, 20], [380, 20]], { startArrowhead: 'arrow' }), ...[-3, -2, -1, 0, 1, 2, 3].flatMap((n, i) => [line([[40 + i * 50, 12], [40 + i * 50, 28]]), label(34 + i * 50 - (n < 0 ? 4 : 0), 32, String(n), 14)])] },
      { id: 'triangle', name: 'Right-angled triangle', build: () => [line([[0, 0], [0, 140], [180, 140], [0, 0]], { strokeWidth: 2 }), rect(0, 124, 16, 16), label(-18, 62, 'a'), label(84, 146, 'b'), label(96, 54, 'c')] },
      { id: 'circle', name: 'Circle with radius', build: () => [ellipse(0, 0, 160, 160), ellipse(76, 76, 8, 8, fill('#212529')), line([[80, 80], [160, 80]]), label(112, 58, 'r')] },
      { id: 'cube', name: 'Cube', build: () => [rect(0, 40, 110, 110), rect(40, 0, 110, 110, { strokeStyle: 'dashed' }), line([[0, 40], [40, 0]]), line([[110, 40], [150, 0]]), line([[110, 150], [150, 110]]), line([[0, 150], [40, 110]], { strokeStyle: 'dashed' })] },
      { id: 'fraction', name: 'Fraction bar (1/4)', build: () => [...[0, 1, 2, 3].map((i) => rect(i * 60, 0, 60, 40, i === 0 ? fill(BLUE) : {})), label(100, 48, '¼')] },
      { id: 'grid', name: 'Grid', build: () => [...[0, 1, 2, 3, 4, 5, 6].flatMap((i) => [line([[i * 40, 0], [i * 40, 240]], { strokeColor: '#adb5bd' }), line([[0, i * 40], [240, i * 40]], { strokeColor: '#adb5bd' })])] },
    ],
  },
  {
    id: 'geography', name: 'Geography', items: [
      { id: 'compass', name: 'Compass rose', build: () => [arrow([[70, 140], [70, 0]], { strokeWidth: 2 }), line([[0, 70], [140, 70]], { strokeWidth: 2 }), label(64, -24, 'N', 18), label(64, 144, 'S', 18), label(146, 60, 'E', 18), label(-18, 60, 'W', 18)] },
      { id: 'mountain', name: 'Mountain', build: () => [line([[0, 110], [70, 0], [140, 110], [0, 110]], fill(GREY)), line([[48, 34], [70, 0], [92, 34], [80, 28], [70, 36], [60, 28], [48, 34]], fill('#ffffff'))] },
      { id: 'river', name: 'River', build: () => [line([[0, 0], [60, 40], [40, 100], [110, 150], [100, 220]], { strokeColor: '#339af0', strokeWidth: 4, roundness: { type: 2 } })] },
      { id: 'sun', name: 'Sun', build: () => [ellipse(30, 30, 60, 60, fill(YELLOW)), ...Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return line([[60 + Math.cos(a) * 40, 60 + Math.sin(a) * 40], [60 + Math.cos(a) * 58, 60 + Math.sin(a) * 58]], { strokeColor: '#f59f00', strokeWidth: 2 }); })] },
      { id: 'rain', name: 'Rain cloud', build: () => [ellipse(0, 20, 70, 50, fill(GREY)), ellipse(40, 0, 80, 60, fill(GREY)), ellipse(90, 20, 70, 50, fill(GREY)), ...[30, 70, 110].map((x) => line([[x, 80], [x - 10, 110]], { strokeColor: '#339af0', strokeWidth: 2 }))] },
      { id: 'tree', name: 'Tree', build: () => [rect(40, 70, 20, 60, fill(BROWN)), ellipse(0, 0, 100, 90, fill(GREEN))] },
      { id: 'house', name: 'House', build: () => [rect(0, 50, 100, 80, fill('#fff3bf')), line([[-10, 50], [50, 0], [110, 50], [-10, 50]], fill('#ff8787')), rect(40, 90, 22, 40, fill(BROWN))] },
      { id: 'scale', name: 'Scale bar', build: () => [line([[0, 10], [200, 10]], { strokeWidth: 2 }), ...[0, 1, 2].flatMap((k) => [line([[k * 100, 0], [k * 100, 20]]), label(k * 100 - 4, 24, String(k), 14)]), label(210, 0, 'km', 14)] },
    ],
  },
];

export const STAMPS = ['👍', '⭐', '✅', '❌', '❓', '❗', '💡', '❤️', '🎯', '🔥'];
export const stamp = (emoji: string): S[] => [label(0, 0, emoji, 56)];

let seq = 0;
/** Shapes moved to a spot, with fresh ids (and arrows kept joined to the shapes they point at). */
export function place(shapes: S[], origin: { x: number; y: number }): S[] {
  const tag = `${Date.now().toString(36)}${(seq++).toString(36)}`;
  const ids = new Map<string, string>();
  for (const s of shapes) { const id = (s as { id?: string }).id; if (id) ids.set(id, `${id}-${tag}`); }
  const remap = (end: unknown) => (end && typeof end === 'object' && 'id' in end && typeof end.id === 'string' && ids.has(end.id) ? { ...end, id: ids.get(end.id) } : end);
  return shapes.map((s) => {
    const o = s as S & { id?: string; start?: unknown; end?: unknown };
    return { ...o, x: (o.x ?? 0) + origin.x, y: (o.y ?? 0) + origin.y, ...(o.id ? { id: ids.get(o.id) } : {}), ...(o.start ? { start: remap(o.start) } : {}), ...(o.end ? { end: remap(o.end) } : {}) } as S;
  });
}
