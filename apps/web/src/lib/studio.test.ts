import { describe, expect, it } from 'vitest';
import { FILTERS, NO_ADJUST, exportName, filterString, fitScale, hits, isLook, ratioDrag, ratioRect, rectFrom, sharpen, toLayer } from './studio';

describe('adjustments as a canvas filter', () => {
  it('is none when nothing is set', () => {
    expect(filterString(NO_ADJUST)).toBe('none');
  });
  it('maps each slider, in a fixed order', () => {
    expect(filterString({ ...NO_ADJUST, brightness: 20, contrast: -10, saturation: 50, blur: 3 })).toBe('brightness(120%) contrast(90%) saturate(150%) blur(3px)');
    expect(filterString({ ...NO_ADJUST, warmth: 50 })).toBe('sepia(20%)');
    expect(filterString({ ...NO_ADJUST, warmth: -40, hue: 10 })).toBe('hue-rotate(20deg)');
    expect(filterString({ ...NO_ADJUST, grayscale: 100, brightness: 500 })).toBe('brightness(200%) grayscale(100%)');
  });
});

describe('geometry', () => {
  it('fits without enlarging', () => {
    expect(fitScale(4000, 2000, 2048, 2048)).toBeCloseTo(0.512);
    expect(fitScale(800, 600, 2048, 2048)).toBe(1);
  });
  it('makes a rectangle from any two corners, inside the canvas', () => {
    expect(rectFrom(50, 80, 10, 20, 100, 100)).toEqual({ x: 10, y: 20, w: 40, h: 60 });
    expect(rectFrom(-20, 90, 130, 150, 100, 100)).toEqual({ x: 0, y: 90, w: 100, h: 10 });
  });
  const layer = { x: 100, y: 100, w: 200, h: 100, rotation: 0, flipX: false, flipY: false };
  it('turns canvas points into a layer’s own pixels', () => {
    expect(toLayer({ x: 100, y: 100 }, layer, 400, 200)).toEqual({ x: 0, y: 0 });
    expect(toLayer({ x: 300, y: 200 }, layer, 400, 200)).toEqual({ x: 400, y: 200 });
    const flipped = toLayer({ x: 100, y: 100 }, { ...layer, flipX: true }, 400, 200);
    expect(flipped.x).toBeCloseTo(400);
    // Turned a quarter: the box's centre stays put.
    const turned = toLayer({ x: 200, y: 150 }, { ...layer, rotation: 90 }, 200, 100);
    expect(turned.x).toBeCloseTo(100);
    expect(turned.y).toBeCloseTo(50);
  });
  it('knows when a point is on a layer', () => {
    expect(hits({ x: 150, y: 150 }, layer)).toBe(true);
    expect(hits({ x: 99, y: 150 }, layer)).toBe(false);
    // A quarter turn makes the 200×100 box 100×200 around the same centre.
    expect(hits({ x: 200, y: 240 }, { ...layer, rotation: 90 })).toBe(true);
    expect(hits({ x: 120, y: 150 }, { ...layer, rotation: 90 })).toBe(false);
  });
});

describe('export names and sharpening', () => {
  it('makes safe file names', () => {
    expect(exportName('My poster!', 'jpeg')).toBe('My-poster.jpg');
    expect(exportName('  ', 'png')).toBe('image.png');
  });
  it('sharpens the middle and leaves edges alone', () => {
    const w = 3, h = 3;
    const data = new Uint8ClampedArray(w * h * 4).fill(100);
    data[(1 * w + 1) * 4] = 150; // the centre is brighter
    const out = sharpen(data, w, h, 0.5);
    expect(out[(1 * w + 1) * 4]).toBe(250); // 150*3 - 0.5*400
    expect(out[0]).toBe(100);
  });

  it('crops to a chosen shape in the simple editor', () => {
    expect(ratioRect(4000, 3000, 1)).toEqual({ x: 500, y: 0, w: 3000, h: 3000 });
    expect(ratioRect(4000, 3000, 16 / 9)).toEqual({ x: 0, y: 375, w: 4000, h: 2250 });
    expect(ratioRect(1000, 800, null)).toEqual({ x: 0, y: 0, w: 1000, h: 800 });
    // Dragging keeps the shape, from the corner where the drag began, and stays inside the picture.
    expect(ratioDrag(100, 100, 500, 300, 1, 1000, 1000)).toEqual({ x: 100, y: 100, w: 200, h: 200 });
    expect(ratioDrag(500, 500, 100, 450, 2, 1000, 1000)).toEqual({ x: 400, y: 450, w: 100, h: 50 });
    expect(ratioDrag(900, 100, 1200, 900, 1, 1000, 1000)).toEqual({ x: 900, y: 100, w: 100, h: 100 });
    expect(ratioDrag(10, 10, 60, 90, null, 1000, 1000)).toEqual({ x: 10, y: 10, w: 50, h: 80 });
  });

  it('knows which look a picture has', () => {
    const vivid = FILTERS.find((f) => f.id === 'vivid')!;
    expect(isLook({ ...NO_ADJUST, ...vivid.adjust }, vivid.adjust)).toBe(true);
    expect(isLook({ ...NO_ADJUST, ...vivid.adjust, brightness: 5 }, vivid.adjust)).toBe(false);
    expect(isLook(NO_ADJUST, {})).toBe(true);
  });
});
