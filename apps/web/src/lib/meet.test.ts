import { describe, expect, it } from 'vitest';
import { callKey, inviteText, isPortrait, meetingPath, videoFit } from './meet';

describe('Meet & call (M227)', () => {
  it('turns a pasted link or a code into our own page, and nothing else', () => {
    expect(meetingPath('https://www.universeimpact.com/call/l_ab12CD?kind=video')).toBe('/call/l_ab12CD');
    expect(meetingPath('universeimpact.com/hall/hc_x9')).toBe('/hall/hc_x9');
    expect(meetingPath('  l_ab12CD ')).toBe('/call/l_ab12CD');
    expect(meetingPath('https://evil.example/phish')).toBeNull();
    expect(meetingPath('javascript:alert(1)')).toBeNull();
    expect(meetingPath('')).toBeNull();
  });
  it('writes the invitation with the link and the code', () => {
    expect(inviteText('https://x/call/l_1', 'l_1', 'Maya')).toContain('Maya is inviting you');
    expect(inviteText('https://x/call/l_1', 'l_1')).toContain('Meeting code: l_1');
  });
  it('knows the keys, but not while typing or with a modifier', () => {
    const k = (key: string, more = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, ...more });
    expect(callKey(k('m'), false)).toBe('mute');
    expect(callKey(k('V'), false)).toBe('camera');
    expect(callKey(k('m'), true)).toBeNull();
    expect(callKey(k('m', { metaKey: true }), false)).toBeNull();
    expect(callKey(k('x'), false)).toBeNull();
  });
});

describe('fitting a camera picture to its box (M230)', () => {
  it('fills when the shapes are close and shows it whole when far apart', () => {
    expect(videoFit(16 / 9, 16 / 9)).toBe('cover');
    expect(videoFit(4 / 3, 16 / 9)).toBe('cover');
    expect(videoFit(9 / 16, 16 / 9)).toBe('contain'); // a phone held upright in a wide box
    expect(videoFit(16 / 9, 390 / 700)).toBe('contain'); // a laptop filling a phone's tall screen
    expect(videoFit(9 / 16, 3 / 4)).toBe('cover');
    expect(videoFit(null, 1)).toBe('cover');
  });
  it('knows a phone held upright', () => {
    expect([isPortrait(9 / 16), isPortrait(16 / 9), isPortrait(null)]).toEqual([true, false, false]);
  });
});
