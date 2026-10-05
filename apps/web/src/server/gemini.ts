import { withTextModels } from './ai-models';

// One-shot (non-streaming) Gemini call for server features such as error diagnosis. The chat
// assistant streams through /api/ai instead. Returns null when AI isn't configured or fails.
// The model comes from the owner's chain (src/server/ai-models.ts): a busy model hands over to
// the next one.

async function call(model: string, apiKey: string, body: unknown) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
}

/**
 * Asks Gemini for JSON matching `schema` (an OpenAPI-style schema). `lite` uses the smaller model
 * first (simple jobs such as translation): it has its own free allowance, so the main model's
 * lasts longer.
 */
export async function geminiJson<T>(system: string, prompt: string, schema: object, maxOutputTokens = 800, lite = false, model?: string): Promise<T | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens, responseMimeType: 'application/json', responseSchema: schema },
  };
  try {
    // A model the caller picked (e.g. the owner's choice for a diagnosis) goes first; the chain covers it if it's busy.
    let res = model ? await call(model, apiKey, body) : null;
    if (!res?.ok) res = (await withTextModels(lite, (m) => call(m, apiKey, body))) ?? res;
    if (!res) return null;
    if (!res.ok) {
      console.error('Gemini request failed:', res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return JSON.parse(text) as T;
  } catch (e) {
    console.error('Gemini request failed:', e);
    return null;
  }
}

/**
 * Plain text of a document (e.g. a PDF course handout), read by Gemini. Up to ~15 MB; long
 * documents may be cut short. Returns null when AI isn't configured or reading fails.
 */
export async function geminiFileText(bytes: Uint8Array, mimeType: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || bytes.length > 15 * 1024 * 1024) return null;
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: Buffer.from(bytes).toString('base64') } },
        { text: 'Transcribe the text of this document as plain text, in reading order, in its original language. Keep headings on their own lines and keep lists as lines starting with "- ". Describe any important diagram or table briefly in [brackets]. Output only the text.' },
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 16000 },
  };
  try {
    const res = await withTextModels(false, (m) => call(m, apiKey, body));
    if (!res) return null;
    if (!res.ok) {
      console.error('Gemini file read failed:', res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() || null;
  } catch (e) {
    console.error('Gemini file read failed:', e);
    return null;
  }
}

async function firstText(body: unknown, lite: boolean, what: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await withTextModels(lite, (m) => call(m, apiKey, body));
    if (!res) return null;
    if (!res.ok) {
      console.error(`Gemini ${what} failed:`, res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() || null;
  } catch (e) {
    console.error(`Gemini ${what} failed:`, e);
    return null;
  }
}

/** A short plain-text answer (chat catch-up summaries, /ask-ai, reply suggestions). */
export function geminiText(system: string, prompt: string, maxOutputTokens = 700, lite = false): Promise<string | null> {
  return firstText({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens },
  }, lite, 'text');
}

/** What is said in a voice message or voicemail, as text in its own language (up to ~15 MB). */
export function geminiAudioText(bytes: Uint8Array, mimeType: string): Promise<string | null> {
  if (bytes.length > 15 * 1024 * 1024) return Promise.resolve(null);
  return firstText({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: Buffer.from(bytes).toString('base64') } },
        { text: 'Transcribe what is said in this voice message, in the language spoken. Add punctuation. Output only the words said; if nothing intelligible is said, output "(no speech)".' },
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 2000 },
  }, true, 'audio transcription');
}
