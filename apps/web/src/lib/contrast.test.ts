import { describe, expect, it } from 'vitest';
import { contrast, readable, textOn } from './contrast';

describe('readable colours', () => {
  it('works out contrast as WCAG does', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });
  it('keeps colours that read, and nudges those that don’t', () => {
    expect(readable('#2b3568', '#ffffff')).toBe('#2b3568');
    const onDark = readable('#b91c1c', '#131a3d');
    expect(contrast(onDark, '#131a3d')).toBeGreaterThanOrEqual(4.5);
    const onLight = readable('#fde68a', '#ffffff');
    expect(contrast(onLight, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
  it('picks black or white on a fill', () => {
    expect(textOn('#ffeb84')).toBe('#1d2650');
    expect(textOn('#1e3a8a')).toBe('#ffffff');
  });
});
