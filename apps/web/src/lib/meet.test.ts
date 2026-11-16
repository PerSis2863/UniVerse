import { describe, expect, it } from 'vitest';
import { callKey, inviteText, meetingPath } from './meet';

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
