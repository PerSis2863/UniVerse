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

/** Asks Gemini for JSON matching `schema` (an OpenAPI-style schema). */
export async function geminiJson<T>(system: string, prompt: string, schema: object, maxOutputTokens = 800): Promise<T | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens, responseMimeType: 'application/json', responseSchema: schema },
  };
  try {
    let res = await call(PRIMARY(), apiKey, body);
    if ((res.status === 404 || res.status === 400) && FALLBACK() !== PRIMARY()) res = await call(FALLBACK(), apiKey, body);
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
