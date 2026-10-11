import { describe, expect, it } from 'vitest';
import { appLink, firstLink, youtubeId } from './app-links';

describe('links in messages', () => {
  it('finds the first link, without trailing punctuation', () => {
    expect(firstLink('see https://universeimpact.com/docs/cmabc12345, thanks')).toBe('https://universeimpact.com/docs/cmabc12345');
    expect(firstLink('no links here')).toBeNull();
  });
  it('recognises the app’s own docs, boards and task boards', () => {
    expect(appLink('https://universeimpact.com/docs/cmv1abcdefgh')).toEqual({ kind: 'doc', id: 'cmv1abcdefgh' });
    expect(appLink('https://www.universeimpact.com/boards/cmv1abcdefgh/')).toEqual({ kind: 'board', id: 'cmv1abcdefgh' });
    expect(appLink('http://localhost:3000/tasks/cmv1abcdefgh', 'http://localhost:3000')).toEqual({ kind: 'tasks', id: 'cmv1abcdefgh' });
    expect(appLink('http://localhost:3000/tasks/cmv1abcdefgh')).toBeNull();
    expect(appLink('https://evil.example/docs/cmv1abcdefgh')).toBeNull();
    expect(appLink('https://universeimpact.com/docs')).toBeNull();
    expect(appLink('https://universeimpact.com/docs/x/edit')).toBeNull();
  });
  it('finds YouTube video ids', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://www.youtube.com/channel/abc')).toBeNull();
    expect(youtubeId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });
});
