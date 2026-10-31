import { beforeEach, describe, expect, it, vi } from 'vitest';
import { givePhotos, pendingShare, sharedText, stashShare } from './share-in';

describe('sharedText', () => {
  it('joins title, text and link without repeats', () => {
    expect(sharedText({ title: 'Flood map', text: 'Look at this https://x.org/a', url: 'https://x.org/a' })).toBe('Flood map Look at this https://x.org/a');
    expect(sharedText({ text: '  ', url: 'https://x.org' })).toBe('https://x.org');
    expect(sharedText({})).toBe('');
  });
  it('keeps it to 2000 characters', () => {
    expect(sharedText({ text: 'a'.repeat(3000) })).toHaveLength(2000);
  });
});

describe('shared photos', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
  });
  it('wait for a chat, then belong to the one picked', () => {
    expect(stashShare('?photos=3')).toBe(true);
    expect(pendingShare()).toEqual({ text: null, photos: 3 });
    givePhotos('c1');
    expect(pendingShare().photos).toBe(0);
  });
  it('are at most 10, and nothing shared keeps nothing', () => {
    expect(stashShare('?photos=99&text=hi')).toBe(true);
    expect(pendingShare()).toEqual({ text: 'hi', photos: 10 });
    expect(stashShare('?photos=abc')).toBe(false);
  });
});
