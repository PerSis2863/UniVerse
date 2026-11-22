import { describe, expect, it, vi } from 'vitest';
import { isOptIn, parseSwitches } from '@/lib/feature-switches';
import { isHard, streamWords, wholeAnswer } from './ghidra-think';

vi.mock('./moderation', () => ({ featureOff: vi.fn().mockResolvedValue(true) }));

describe('Ghidra thinks harder with DeepSeek (M371)', () => {
  it('sends maths, code and logic to careful thinking, everything else to the everyday model', () => {
    for (const t of ['What is 17 * 23?', 'Solve x^2 - 4 = 0', 'Why does my Python function return None?', 'Explain this step by step', 'prove that root 2 is irrational']) expect(isHard(t)).toBe(true);
    for (const t of ['Write a poem about rain', 'Who are you?', 'Plan a trip to Goa', 'Summarise the French revolution']) expect(isHard(t)).toBe(false);
  });
  it('shows only the answer from the stream, never the thinking', () => {
    expect(streamWords('data: {"response":"Hello"}')).toBe('Hello');
    expect(streamWords('data: {"choices":[{"delta":{"content":"391"}}]}')).toBe('391');
    expect(streamWords('data: {"choices":[{"delta":{"reasoning_content":"17×20=340…"}}]}')).toBe('');
    expect(streamWords('data: [DONE]')).toBe('');
    expect(streamWords(': keep-alive')).toBe('');
    expect(wholeAnswer({ choices: [{ message: { content: ' 391 ' } }] })).toBe('391');
    expect(wholeAnswer({ response: 'ok' })).toBe('ok');
    expect(wholeAnswer(null)).toBe('');
  });
  it('is off until the owner turns it on', () => {
    expect(isOptIn('deepseek')).toBe(true);
    expect(parseSwitches('[]')).toContain('deepseek');
    expect(parseSwitches('["deepseek:on"]')).not.toContain('deepseek');
  });
});
