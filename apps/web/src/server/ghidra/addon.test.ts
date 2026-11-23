import { beforeEach, describe, expect, it, vi } from 'vitest';

const gemini = vi.hoisted(() => ({ geminiJson: vi.fn(async () => ({ from: 'gemini' })), geminiText: vi.fn(async () => 'gemini'), geminiJsonImage: vi.fn(), geminiFileText: vi.fn(), geminiAudioText: vi.fn() }));
vi.mock('../gemini', () => gemini);

import { ghidraJson, ghidraText, setOwnModel } from './brain';

describe('the brain with Ghidra’s own add-on (M451)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('takes the add-on’s answer when it gives one, as Ghidra', async () => {
    const own = vi.fn(async (...a: unknown[]) => ({ from: 'addon', n: a.length }));
    setOwnModel(own);
    expect(await ghidraJson('safety', 'Check it.', 'hi', { type: 'OBJECT' })).toMatchObject({ from: 'addon' });
    expect(own.mock.calls[0][2]).toBe('hi');
    expect(String(own.mock.calls[0][1])).toMatch(/^You are Ghidra/);
    expect(gemini.geminiJson).not.toHaveBeenCalled();
  });

  it('falls back to Gemini when the add-on gives nothing or fails', async () => {
    setOwnModel(async () => null);
    expect(await ghidraText('chat', 'Sum up.', 'hi')).toBe('gemini');
    setOwnModel(async () => { throw new Error('down'); });
    expect(await ghidraJson('safety', 'Check it.', 'hi', { type: 'OBJECT' })).toEqual({ from: 'gemini' });
  });

  it('never sends a call that names its own model to the add-on', async () => {
    const own = vi.fn(async (...a: unknown[]) => ({ from: 'addon', n: a.length }));
    setOwnModel(own);
    await ghidraJson('diagnose', 'x', 'y', { type: 'OBJECT' }, 800, true, 'some-model');
    expect(own).not.toHaveBeenCalled();
  });
});
