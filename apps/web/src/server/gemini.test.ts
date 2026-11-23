import { afterEach, describe, expect, it, vi } from 'vitest';
// The test setup stands in for ./gemini everywhere; these tests need the real one.
const { geminiFetch, quickThinking } = await vi.importActual<typeof import('./gemini')>('./gemini');

// M453: newer models' thinking used up the small answer limits (cut or empty answers, slow first words).
describe('quick thinking for Gemini', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks Gemini 3 for low thinking, 2.5 Flash for none, and gives every answer at least 1,024 tokens', () => {
    const body = { generationConfig: { temperature: 0.2, maxOutputTokens: 200 } };
    expect(quickThinking('gemini-3.6-flash', body)).toEqual({ generationConfig: { temperature: 0.2, maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: 'low' } } });
    expect(quickThinking('gemini-2.5-flash', body)).toMatchObject({ generationConfig: { thinkingConfig: { thinkingBudget: 0 } } });
    expect(quickThinking('other-model', { generationConfig: { maxOutputTokens: 4000 } })).toEqual({ generationConfig: { maxOutputTokens: 4000 } });
  });

  it('asks again without the setting when a model refuses it, with the safety settings both times', async () => {
    const seen: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => { seen.push(JSON.parse(init.body)); return new Response('', { status: seen.length === 1 ? 400 : 200 }); }));
    const res = await geminiFetch('gemini-3.6-flash', 'k', 'generateContent', { generationConfig: { maxOutputTokens: 300 } });
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(2);
    expect((seen[0].generationConfig as Record<string, unknown>).thinkingConfig).toBeTruthy();
    expect(seen[1].generationConfig).toEqual({ maxOutputTokens: 300 });
    expect(seen.every((b) => Array.isArray(b.safetySettings))).toBe(true);
  });
});
