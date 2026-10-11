import { describe, expect, it } from 'vitest';
import { embedHref, safeEmbed, videoEmbed } from './doc-embeds';

describe('doc embeds', () => {
  it('turns video links into embeds', () => {
    expect(videoEmbed('https://youtu.be/dQw4w9WgXcQ')).toEqual({ kind: 'youtube', src: 'dQw4w9WgXcQ' });
    expect(videoEmbed(' /api/files/abcdefghijklmnopqrstu/clip.mp4 ')).toEqual({ kind: 'video', src: '/api/files/abcdefghijklmnopqrstu/clip.mp4' });
    expect(videoEmbed('https://evil.example/x.mp4')).toBeNull();
  });
  it('only allows safe sources', () => {
    expect(safeEmbed({ kind: 'youtube', src: 'dQw4w9WgXcQ' })).toBe(true);
    expect(safeEmbed({ kind: 'youtube', src: '"><script>' })).toBe(false);
    expect(safeEmbed({ kind: 'pdf', src: 'javascript:alert(1)' })).toBe(false);
    expect(safeEmbed({ kind: 'board', src: 'cmv4028hv00028vhurdl2laue' })).toBe(true);
    expect(safeEmbed({ kind: 'tasks', src: '../admin' })).toBe(false);
  });
  it('links embeds for downloads', () => {
    expect(embedHref({ kind: 'youtube', src: 'dQw4w9WgXcQ' })).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(embedHref({ kind: 'board', src: 'cmv4028hv00028vhurdl2laue' }, 'https://u.app')).toBe('https://u.app/boards/cmv4028hv00028vhurdl2laue');
    expect(embedHref({ kind: 'pdf', src: '/api/files/abcdefghijklmnopqrstu/a.pdf' }, 'https://u.app')).toBe('https://u.app/api/files/abcdefghijklmnopqrstu/a.pdf');
    expect(embedHref({ kind: 'code', src: '' })).toBeNull();
  });
});
