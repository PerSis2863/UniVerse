import { describe, expect, it } from 'vitest';
import { BOUNCE, takeOrigin, zoomFrames } from './tap-motion';

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

describe('tap motion (M2)', () => {
  it('opens the page out of the tapped card: its outline first, then the whole page', () => {
    const [from, to] = zoomFrames(rect(20, 300, 350, 120), rect(0, 100, 390, 2000));
    expect(from.clipPath).toBe('inset(200px 20px 1680px 20px round 18px)');
    expect(from.transformOrigin).toBe('195px 260px');
    expect(to).toMatchObject({ clipPath: 'inset(0px 0px 0px 0px round 0px)', transform: 'none', opacity: 1 });
  });

  it('never insets past the page (a card partly above it)', () => {
    const [from] = zoomFrames(rect(-10, 40, 420, 100), rect(0, 100, 390, 800));
    expect(from.clipPath).toBe('inset(0px 0px 760px 0px round 18px)');
  });

  it('remembers nothing when nothing was tapped', () => {
    expect(takeOrigin('/student/courses/x')).toBeNull();
  });

  it('bounces and comes back to rest', () => {
    expect(BOUNCE[0].transform).toBe('scale(1)');
    expect(BOUNCE.at(-1)!.transform).toBe('scale(1)');
  });
});
