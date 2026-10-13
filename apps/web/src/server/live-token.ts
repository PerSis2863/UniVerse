import { GoogleGenAI, Modality } from '@google/genai';
import { aiModels } from './ai-models';

// A short-lived, single-use token for a spoken conversation with Gemini Live (the voice tutor, and
// the oral examiner in Stage 5 · D11). The browser streams the microphone straight to Gemini with it,
// so audio never passes through our Worker. The model and the instructions are locked into the
// token: the browser can't change them. Throws when Gemini doesn't hand one out.

export async function liveToken(systemInstruction: string, minutes: number) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('No AI key');
  const model = (await aiModels()).live;
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });
  const now = Date.now();
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(now + minutes * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 60_000).toISOString(),
      liveConnectConstraints: {
        model,
        config: { responseModalities: [Modality.AUDIO], systemInstruction, inputAudioTranscription: {}, outputAudioTranscription: {} },
      },
    },
  });
  if (!token.name) throw new Error('No token returned');
  return { token: token.name, model };
}
