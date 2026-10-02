// One-shot (non-streaming) Gemini call for server features such as error diagnosis. The chat
// assistant streams through /api/ai instead. Returns null when AI isn't configured or fails.

const PRIMARY = () => process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const FALLBACK = () => process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';

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
export async function geminiJson<T>(system: string, prompt: string, schema: object, maxOutputTokens = 800, lite = false): Promise<T | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens, responseMimeType: 'application/json', responseSchema: schema },
  };
  try {
    const [first, second] = lite ? [FALLBACK(), PRIMARY()] : [PRIMARY(), FALLBACK()];
    let res = await call(first, apiKey, body);
    if ((res.status === 404 || res.status === 400 || res.status === 429 || res.status >= 500) && second !== first) res = await call(second, apiKey, body);
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
    let res = await call(PRIMARY(), apiKey, body);
    if ((res.status === 404 || res.status === 400 || res.status === 429 || res.status >= 500) && FALLBACK() !== PRIMARY()) res = await call(FALLBACK(), apiKey, body);
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
