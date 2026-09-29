import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform';

// Starting layouts for new whiteboards. They're added on the first open of an empty board, as
// ordinary shapes everyone can move, edit or delete.

export type TemplateId = 'blank' | 'kanban' | 'mindmap' | 'week' | 'swot' | 'venn' | 'timeline' | 'cornell';

export const TEMPLATES: { id: TemplateId; name: string; description: string }[] = [
  { id: 'blank', name: 'Blank', description: 'An empty canvas' },
  { id: 'kanban', name: 'Kanban', description: 'To do, doing, done: plan a project' },
  { id: 'mindmap', name: 'Mind map', description: 'A central idea with branches' },
  { id: 'week', name: 'Weekly planner', description: 'Seven days to plan study time' },
  { id: 'swot', name: 'SWOT analysis', description: 'Strengths, weaknesses, opportunities, threats' },
  { id: 'venn', name: 'Venn diagram', description: 'Compare two ideas' },
  { id: 'timeline', name: 'Timeline', description: 'Events or milestones in order' },
  { id: 'cornell', name: 'Cornell notes', description: 'Cues, notes and a summary' },
];

const COLORS = ['#a5d8ff', '#b2f2bb', '#ffec99', '#ffc9c9', '#d0bfff', '#99e9f2', '#ffd8a8'];
const box = (x: number, y: number, width: number, height: number, text: string, bg = 'transparent', extra: Partial<Record<string, unknown>> = {}) =>
  ({ type: 'rectangle', x, y, width, height, backgroundColor: bg, fillStyle: 'solid', roundness: { type: 3 }, label: { text, fontSize: 20, verticalAlign: 'top' }, ...extra }) as ExcalidrawElementSkeleton;
const note = (x: number, y: number, text: string, bg: string) =>
  ({ type: 'rectangle', x, y, width: 200, height: 90, backgroundColor: bg, fillStyle: 'solid', strokeColor: 'transparent', roundness: { type: 3 }, label: { text, fontSize: 16 } }) as ExcalidrawElementSkeleton;
const text = (x: number, y: number, t: string, fontSize = 28) => ({ type: 'text', x, y, text: t, fontSize }) as ExcalidrawElementSkeleton;

export function templateElements(id: TemplateId): ExcalidrawElementSkeleton[] {
  switch (id) {
    case 'kanban':
      return [
        text(0, -70, 'Project board', 32),
        ...['To do', 'In progress', 'Done'].map((t, i) => box(i * 300, 0, 260, 600, t, 'transparent', { strokeStyle: 'dashed' })),
        note(30, 60, 'Research the topic', COLORS[2]),
        note(30, 170, 'Split the work', COLORS[0]),
        note(330, 60, 'Write the draft', COLORS[1]),
        note(630, 60, 'Choose a subject', COLORS[4]),
      ];
    case 'mindmap': {
      const centre = { type: 'ellipse', id: 'centre', x: 300, y: 250, width: 240, height: 120, backgroundColor: COLORS[4], fillStyle: 'solid', label: { text: 'Main idea', fontSize: 24 } } as ExcalidrawElementSkeleton;
      const spots = [[0, 0], [620, 0], [0, 500], [620, 500], [310, -130], [310, 620]];
      const branches = spots.map(([x, y], i) => ({ type: 'ellipse', id: `b${i}`, x, y, width: 200, height: 90, backgroundColor: COLORS[i % COLORS.length], fillStyle: 'solid', label: { text: `Idea ${i + 1}`, fontSize: 18 } }) as ExcalidrawElementSkeleton);
      const arrows = spots.map((_, i) => ({ type: 'arrow', x: 420, y: 310, start: { id: 'centre' }, end: { id: `b${i}` } }) as ExcalidrawElementSkeleton);
      return [centre, ...branches, ...arrows];
    }
    case 'week':
      return [
        text(0, -70, 'This week', 32),
        ...['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d, i) => box(i * 220, 0, 200, 520, d, i >= 5 ? '#f1f3f5' : 'transparent')),
      ];
    case 'swot':
      return [
        text(0, -70, 'SWOT analysis', 32),
        box(0, 0, 420, 300, 'Strengths', COLORS[1]),
        box(440, 0, 420, 300, 'Weaknesses', COLORS[3]),
        box(0, 320, 420, 300, 'Opportunities', COLORS[0]),
        box(440, 320, 420, 300, 'Threats', COLORS[2]),
      ];
    case 'venn':
      return [
        { type: 'ellipse', x: 0, y: 0, width: 420, height: 420, backgroundColor: COLORS[0], fillStyle: 'solid', opacity: 60 } as ExcalidrawElementSkeleton,
        { type: 'ellipse', x: 260, y: 0, width: 420, height: 420, backgroundColor: COLORS[3], fillStyle: 'solid', opacity: 60 } as ExcalidrawElementSkeleton,
        text(90, -60, 'Idea A'),
        text(500, -60, 'Idea B'),
        text(300, 190, 'Both', 22),
      ];
    case 'timeline':
      return [
        text(0, -110, 'Timeline', 32),
        { type: 'arrow', x: 0, y: 0, width: 1200, height: 0, points: [[0, 0], [1200, 0]], strokeWidth: 3 } as ExcalidrawElementSkeleton,
        ...[0, 1, 2, 3, 4].flatMap((i) => [
          { type: 'ellipse', x: 100 + i * 240 - 12, y: -12, width: 24, height: 24, backgroundColor: '#4c6ef5', fillStyle: 'solid' } as ExcalidrawElementSkeleton,
          note(100 + i * 240 - 100, i % 2 ? 40 : -140, `Event ${i + 1}\nDate`, COLORS[i]),
        ]),
      ];
    case 'cornell':
      return [
        text(0, -70, 'Topic:            Date:', 28),
        box(0, 0, 280, 640, 'Cues & questions', '#f8f9fa'),
        box(300, 0, 700, 640, 'Notes'),
        box(0, 660, 1000, 200, 'Summary', '#fff9db'),
      ];
    default:
      return [];
  }
}
