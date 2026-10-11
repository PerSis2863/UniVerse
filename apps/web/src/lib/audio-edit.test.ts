import { describe, expect, it } from 'vitest';
import { clock, cut, fade, gain, insert, matchChannels, normalize, peak, peaks, reduceNoise, resample, silence, toMono, trim, undoDepth } from './audio-edit';

const ch = (...v: number[]) => [new Float32Array(v)];
const arr = (c: Float32Array[]) => [...c[0]].map((x) => Math.round(x * 1000) / 1000);

describe('audio edits', () => {
  it('trims and cuts, in either selection direction', () => {
    expect(arr(trim(ch(1, 2, 3, 4, 5), { start: 1, end: 3 }))).toEqual([2, 3]);
    expect(arr(cut(ch(1, 2, 3, 4, 5), { start: 3, end: 1 }))).toEqual([1, 4, 5]);
    expect(arr(trim(ch(1, 2), { start: -5, end: 99 }))).toEqual([1, 2]);
  });
  it('fades in and out over a range', () => {
    expect(arr(fade(ch(1, 1, 1, 1, 1), { start: 0, end: 4 }, 'in'))).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(arr(fade(ch(1, 1, 1, 1), { start: 2, end: 4 }, 'out'))).toEqual([1, 1, 1, 0.5]);
  });
  it('changes loudness without clipping past full scale', () => {
    expect(arr(gain(ch(0.5, -0.5), 6.0206))).toEqual([1, -1]);
    expect(arr(gain(ch(0.9, 0.5), 20))).toEqual([1, 1]);
    expect(arr(gain(ch(0.5, 0.5, 0.5), -6.0206, { start: 1, end: 2 }))).toEqual([0.5, 0.25, 0.5]);
  });
  it('normalizes to the target peak', () => {
    const n = normalize([new Float32Array([0.1, -0.2]), new Float32Array([0.05, 0])], 0.8);
    expect(peak(n)).toBeCloseTo(0.8);
    expect(n[1][0]).toBeCloseTo(0.2);
    expect(arr(normalize(ch(0, 0)))).toEqual([0, 0]);
  });
  it('turns down quiet stretches but keeps loud ones', () => {
    const sr = 1000; // 10-sample windows
    const quiet = Array.from({ length: 30 }, () => 0.005), loud = Array.from({ length: 30 }, (_, i) => (i % 2 ? 0.5 : -0.5));
    const out = reduceNoise(ch(...quiet, ...loud), sr)[0];
    expect(Math.abs(out[5])).toBeLessThan(0.001);
    expect(Math.abs(out[55])).toBeCloseTo(0.5);
  });
  it('makes one peak per column and reads times', () => {
    expect([...peaks(ch(0.1, -0.9, 0.2, 0.3), 2)].map((x) => Math.round(x * 10) / 10)).toEqual([0.9, 0.3]);
    expect(clock(65.34)).toBe('1:05.3');
  });
  it('silences, mixes and matches channels', () => {
    expect(arr(silence(ch(1, 1, 1), { start: 1, end: 2 }))).toEqual([1, 0, 1]);
    expect([...toMono([new Float32Array([1, 0]), new Float32Array([0, 1])])]).toEqual([0.5, 0.5]);
    expect(matchChannels(ch(0.2), 2).map((c) => c[0])).toEqual([0.2, 0.2].map(Math.fround));
  });
  it('inserts another sound at a point, matching channels', () => {
    const stereo = [new Float32Array([1, 2]), new Float32Array([3, 4])];
    const out = insert(stereo, 1, ch(9));
    expect(out.map((c) => [...c])).toEqual([[1, 9, 2], [3, 9, 4]]);
    expect(arr(insert([], 0, ch(5)))).toEqual([5]);
  });
  it('resamples and sizes the undo history', () => {
    expect([...resample(new Float32Array([0, 1, 0, 1]), 4, 2)]).toEqual([0, 0]);
    expect(resample(new Float32Array(44100), 44100, 22050).length).toBe(22050);
    expect(arr([resample(new Float32Array([0, 1]), 1, 2)])).toEqual([0, 0.5, 1, 1]);
    expect(undoDepth(1000)).toBe(20);
    expect(undoDepth(60_000_000)).toBe(2);
  });
});
