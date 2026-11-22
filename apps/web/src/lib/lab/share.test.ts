import { describe, expect, it } from 'vitest';
import { cleanName, readShare, shareFragment } from './share';

describe('Hyperion shared links (M398)', () => {
  it('packs a script into a link and unpacks it again', async () => {
    const code = "%% Waves\nx = linspace(0, 2*pi, 200);   % é ü ✓\nplot(x, sin(x))\n".repeat(20);
    const frag = await shareFragment({ name: 'waves.m', code, view: 'note' });
    expect(frag.startsWith('s=h1.')).toBe(true);
    expect(frag).toMatch(/^s=[\w.-]+$/);
    expect(frag.length).toBeLessThan(code.length / 2);
    expect(await readShare(`#${frag}`)).toEqual({ name: 'waves.m', code, view: 'note' });
    expect(await readShare(`#x=1&${frag}`)).toEqual({ name: 'waves.m', code, view: 'note' });
  });
  it('refuses what isn’t a link of ours', async () => {
    expect(await readShare('')).toBeNull();
    expect(await readShare('#s=nope')).toBeNull();
    expect(await readShare('#s=h1.AAAA')).toBeNull();
  });
  it('keeps names safe', () => {
    expect(cleanName('../<b>evil</b>.m')).toBe('..bevilb.m');
    expect(cleanName('')).toBe('shared.m');
    expect(cleanName('plot')).toBe('plot.m');
  });
});
