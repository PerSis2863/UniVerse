import { describe, expect, it } from 'vitest';
import { LIBRARIES, place, STAMPS, stamp } from './library';
import { TEMPLATES, templateElements } from './templates';

describe('whiteboard shapes', () => {
  it('builds every library shape from plain, numeric shapes', () => {
    for (const lib of LIBRARIES) for (const item of lib.items) {
      const shapes = item.build();
      expect(shapes.length, item.id).toBeGreaterThan(0);
      for (const s of shapes) {
        const o = s as { x: number; y: number; points?: number[][] };
        expect(Number.isFinite(o.x) && Number.isFinite(o.y), item.id).toBe(true);
        if (o.points) expect(o.points[0], item.id).toEqual([0, 0]);
      }
    }
    expect(LIBRARIES.map((l) => l.items.length)).toEqual([8, 7, 8]);
  });
  it('places shapes with fresh ids, keeping arrows joined', () => {
    const mind = templateElements('mindmap');
    const a = place(mind, { x: 1000, y: 50 }), b = place(mind, { x: 1000, y: 50 });
    const ids = (xs: typeof a) => xs.map((s) => (s as { id?: string }).id).filter(Boolean);
    expect(new Set([...ids(a), ...ids(b)]).size).toBe(ids(a).length * 2);
    const centre = a.find((s) => (s as { id?: string }).id?.startsWith('centre-')) as { id: string; x: number };
    expect(centre.x).toBe(1300);
    const arrowEnd = a.find((s) => s.type === 'arrow') as { start: { id: string } };
    expect(arrowEnd.start.id).toBe(centre.id);
  });
  it('has the new templates and stamps', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(expect.arrayContaining(['retro', 'lesson']));
    expect(templateElements('retro').length).toBeGreaterThan(4);
    expect(templateElements('lesson').length).toBeGreaterThan(5);
    expect(stamp(STAMPS[0])[0]).toMatchObject({ type: 'text', text: '👍' });
  });
});
