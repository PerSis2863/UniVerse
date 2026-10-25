import { describe, expect, it } from 'vitest';
import { contrast, readable, textOn } from './contrast';

describe('readable colours', () => {
  it('works out contrast as WCAG does', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });
  it('keeps colours that read, and nudges those that don’t', () => {
    expect(readable('#2a2927', '#ffffff')).toBe('#2a2927');
    const onDark = readable('#b91c1c', '#111112');
    expect(contrast(onDark, '#111112')).toBeGreaterThanOrEqual(4.5);
    const onLight = readable('#fde68a', '#ffffff');
    expect(contrast(onLight, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
  it('picks black or white on a fill', () => {
    expect(textOn('#ffeb84')).toBe('#141416');
    expect(textOn('#1e3a8a')).toBe('#ffffff');
  });
});
