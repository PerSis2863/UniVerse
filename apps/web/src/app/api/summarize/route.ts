import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getSessionUser } from '@/lib/server-auth';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const MAX_BYTES = 10 * 1024 * 1024;

// Only summarize files uploaded to this app's Vercel Blob store (prevents fetching arbitrary URLs).
function isAllowedFileUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (!url.hostname.endsWith('.public.blob.vercel-storage.com')) return null;
    return url;
  } catch {
    return null;
  }
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  txt: 'text/plain',
  md: 'text/plain',
};

export async function POST(request: Request) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });

    const { fileUrl } = await request.json().catch(() => ({}));
    const url = typeof fileUrl === 'string' ? isAllowedFileUrl(fileUrl) : null;
    if (!url) return NextResponse.json({ error: 'A valid uploaded file URL is required' }, { status: 400 });

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is missing' }, { status: 500 });
    }

    const ext = url.pathname.split('.').pop()?.toLowerCase() ?? '';
    const mimeType = MIME_BY_EXT[ext];
    if (!mimeType) {
      return NextResponse.json({ error: 'This file type cannot be summarized yet (PDF, images or text only).' }, { status: 415 });
    }

    // Previously the model was only given the URL, which it cannot open — so it invented a summary.
    // Now the file itself is downloaded and passed to the model.
    const fileRes = await fetch(url, { cache: 'no-store' });
    if (!fileRes.ok) return NextResponse.json({ error: 'Could not read the uploaded file' }, { status: 400 });
    const bytes = Buffer.from(await fileRes.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) return NextResponse.json({ error: 'File is too large to summarize' }, { status: 413 });

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: bytes.toString('base64') } },
            { text: 'Summarize this document for a student study group in 2-3 short paragraphs. Only use what is in the document.' },
          ],
        },
      ],
    });

    return NextResponse.json({ summary: response.text ?? '' });
  } catch (error) {
    console.error('Error generating summary:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
