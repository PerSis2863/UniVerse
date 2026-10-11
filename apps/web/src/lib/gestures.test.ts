import { describe, expect, it } from 'vitest';
import { frameAction, gestureWatcher } from './gestures';

describe('call gestures', () => {
  it('reads one frame', () => {
    expect(frameAction({ gesture: 'Open_Palm', score: 0.9, wristY: 0.3 })).toBe('hand');
    expect(frameAction({ gesture: 'Open_Palm', score: 0.9, wristY: 0.8 })).toBeNull(); // a hand down low
    expect(frameAction({ gesture: 'Thumb_Up', score: 0.8, wristY: 0.7 })).toBe('👍');
    expect(frameAction({ gesture: 'Thumb_Up', score: 0.4, wristY: 0.7 })).toBeNull();
    expect(frameAction({ gesture: 'Closed_Fist', score: 0.9, wristY: 0.2 })).toBeNull();
  });
  it('acts only when held, once, then rests', () => {
    const w = gestureWatcher(700, 5000);
    const up = { gesture: 'Thumb_Up', score: 0.9, wristY: 0.5 };
    expect(w(up, 0)).toBeNull();
    expect(w(up, 400)).toBeNull();
    expect(w(up, 800)).toBe('👍');
    expect(w(up, 1200)).toBeNull(); // still held: not again
    expect(w({ gesture: null, score: 0, wristY: null }, 1500)).toBeNull();
    expect(w(up, 1600)).toBeNull();
    expect(w(up, 2400)).toBeNull(); // held again, but resting
    expect(w(up, 6000)).toBe('👍');
  });
});
