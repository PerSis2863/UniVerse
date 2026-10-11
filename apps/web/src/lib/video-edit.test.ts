import { describe, expect, it } from 'vitest';
import { clipBegins, fitRect, locate, moveClip, overlaysAt, parseCaptions, pickFormat, retrim, splitAt, toVtt, totalLength, wrapText, type Clip, type Overlay } from './video-edit';

const clip = (id: string, start: number, end: number, duration = 10, kind: Clip['kind'] = 'video'): Clip => ({ id, source: 's', kind, duration, start, end, volume: 1 });

describe('video editor helpers', () => {
  const clips = [clip('a', 2, 5), clip('b', 0, 4), clip('c', 1, 2)];
  it('finds the clip at a time and where in its source', () => {
    expect(totalLength(clips)).toBe(8);
    expect(locate(clips, 1)).toMatchObject({ index: 0, at: 3, begins: 0 });
    expect(locate(clips, 3)).toMatchObject({ index: 1, at: 0, begins: 3 });
    expect(locate(clips, 99)).toMatchObject({ index: 2, at: 2 });
    expect(locate([], 1)).toBeNull();
    expect(clipBegins(clips, 2)).toBe(7);
  });
  it('splits a clip at a time, but not right at its edges', () => {
    const out = splitAt(clips, 4, () => 'b2');
    expect(out.map((c) => [c.id, c.start, c.end])).toEqual([['a', 2, 5], ['b', 0, 1], ['b2', 1, 4], ['c', 1, 2]]);
    expect(splitAt(clips, 3.05, () => 'x')).toBe(clips);
  });
  it('moves clips and keeps trims inside the source', () => {
    expect(moveClip(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveClip(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(retrim(clip('a', 0, 5), -3, 50)).toMatchObject({ start: 0, end: 10 });
    expect(retrim(clip('a', 0, 5), 4, 4)).toMatchObject({ start: 4, end: 4.2 });
    expect(retrim(clip('p', 0, 4, 4, 'image'), 0, 7)).toMatchObject({ start: 0, end: 7 });
  });
  it('wraps text and fits pictures', () => {
    expect(wrapText('one two three four', 9, (s) => s.length)).toEqual(['one two', 'three', 'four']);
    expect(wrapText('a\nb', 9, (s) => s.length)).toEqual(['a', 'b']);
    expect(fitRect(200, 100, 100, 100, 'fit')).toEqual({ x: 0, y: 25, w: 100, h: 50 });
    expect(fitRect(200, 100, 100, 100, 'fill')).toEqual({ x: -50, y: 0, w: 200, h: 100 });
  });
  it('reads .srt and .vtt captions and writes .vtt', () => {
    const srt = '1\n00:00:01,000 --> 00:00:03,500\nHello <i>there</i>\n\n2\n00:00:04,000 --> 00:00:05,000\nSecond\nline\n';
    expect(parseCaptions(srt)).toEqual([{ from: 1, to: 3.5, text: 'Hello there' }, { from: 4, to: 5, text: 'Second\nline' }]);
    expect(parseCaptions('WEBVTT\n\n00:01.5 --> 00:02.25 align:start\nShort')).toEqual([{ from: 1.5, to: 2.25, text: 'Short' }]);
    const o: Overlay = { id: 'o', text: 'Hi', from: 61.5, to: 63, place: 'bottom', size: 0.06, color: '#fff', box: true };
    expect(toVtt([o])).toBe('WEBVTT\n\n00:01:01.500 --> 00:01:03.000\nHi\n');
    expect(overlaysAt([o], 62).length).toBe(1);
    expect(overlaysAt([o], 63).length).toBe(0);
  });
  it('picks a recording format', () => {
    expect(pickFormat((t) => t.startsWith('video/webm'))).toEqual({ type: 'video/webm;codecs=vp9,opus', ext: 'webm' });
    expect(pickFormat((t) => t === 'video/mp4')).toEqual({ type: 'video/mp4', ext: 'mp4' });
    expect(pickFormat(() => false)).toBeNull();
  });
});
