import { describe, expect, it } from 'vitest';
import { activeEditors, cleanSave, isToken, mergePart, shareToken, touchEditors } from './tool-saves';

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

describe('live editing', () => {
  it('changes one part and keeps the rest', () => {
    expect(mergePart('{"uv-a":"1","uv-b":"2"}', 'uv-a', '3')).toBe('{"uv-a":"3","uv-b":"2"}');
    expect(mergePart('{"uv-a":"1"}', 'uv-a', null)).toBe('{}');
    expect(mergePart('{}', 'token', '1')).toEqual({ error: expect.any(String) });
    expect(mergePart('{}', 'uv-a', 5)).toEqual({ error: expect.any(String) });
    expect(mergePart('{}', 'uv-a', 'x'.repeat(200_001))).toEqual({ error: expect.stringMatching(/too big/) });
  });
  it('keeps who is editing, writing at most once a minute', () => {
    const a = touchEditors(null, { id: 'u1', name: 'Aisha Khan' }, 1_000_000);
    expect(a).toEqual({ list: [{ id: 'u1', name: 'Aisha', at: 1_000_000 }], changed: true });
    expect(touchEditors(JSON.stringify(a.list), { id: 'u1', name: 'Aisha' }, 1_030_000).changed).toBe(false);
    const b = touchEditors(JSON.stringify(a.list), { id: 'u2', name: 'Ben' }, 1_050_000);
    expect(activeEditors(b.list, 1_100_000, 'u2')).toEqual(['Aisha']);
    expect(activeEditors(b.list, 1_000_000 + 130_000)).toEqual(['Ben']);
  });
});
