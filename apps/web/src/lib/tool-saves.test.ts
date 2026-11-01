import { describe, expect, it } from 'vitest';
import { cleanSave, isToken, shareToken } from './tool-saves';

describe('saved tool work', () => {
  it('keeps only "uv-" keys with text, within the size limit', () => {
    expect(cleanSave({ tool: 'mindmap', title: '  My   map ', data: { 'uv-mindmap': '[]' } })).toEqual({ tool: 'mindmap', title: 'My map', data: { 'uv-mindmap': '[]' } });
    expect(cleanSave({ tool: 'mindmap', data: { token: 'x' } })).toMatch(/can’t be saved/);
    expect(cleanSave({ tool: 'mindmap', data: { 'uv-a': 5 } })).toMatch(/can’t be saved/);
    expect(cleanSave({ tool: '../x', data: { 'uv-a': '1' } })).toBe('Unknown tool.');
    expect(cleanSave({ tool: 'x', data: { 'uv-a': 'y'.repeat(200_001) } })).toMatch(/too big/);
    expect(cleanSave({ tool: 'x', data: {} })).toMatch(/nothing to save/);
    expect(cleanSave({ title: 'New name' }, true)).toEqual({ title: 'New name' });
  });
  it('makes link tokens that are hard to guess', () => {
    const a = shareToken(), b = shareToken();
    expect(isToken(a)).toBe(true); expect(a).not.toBe(b);
    expect(isToken('short')).toBe(false);
  });
});
