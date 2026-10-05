import { NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { spendAi } from '@/server/ai-budget';
import { tutorAccess } from '@/server/tutor';
import { aiModels } from '@/server/ai-models';

// POST { courseId? } → a short-lived, single-use token for a spoken conversation with the AI
// tutor (Gemini Live). The browser streams microphone audio straight to Gemini with it, so audio
// never passes through our Worker. The model, the tutor's instructions and the course context
// are locked into the token: the browser can't change them. A session counts as one AI request
// toward the person's daily limit and ends after 10 minutes.

// The Live model is the owner's choice (owner console → Server → AI models). Default: Gemini 2.5
// Flash native audio: natural voice, and on the free tier no per-minute request limit (1M tokens/min).
const SESSION_MINUTES = 10;

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'The voice tutor isn’t set up yet.' }, { status: 503 });

  const b = await req.json().catch(() => ({}));
  let context = '';
  if (typeof b.courseId === 'string' && b.courseId) {
    const a = await tutorAccess(user, b.courseId);
    if (!a) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
    const [course, sources] = await Promise.all([
      prisma.course.findUnique({ where: { id: b.courseId }, select: { code: true, name: true, description: true } }),
      prisma.courseSource.findMany({ where: { courseId: b.courseId, status: 'READY' }, select: { title: true }, take: 30 }),
    ]);
    if (course) {
      context = `\nThe student is studying ${course.code} "${course.name}".${course.description ? ` Course description: ${course.description.slice(0, 500)}` : ''}${sources.length ? ` Course materials include: ${sources.map((s) => s.title).join('; ').slice(0, 1500)}.` : ''}`;
    }
  }

  const spend = await spendAi(user);
  if (!spend.ok) return NextResponse.json({ error: spend.message, code: 'ai-limit' }, { status: 429 });

  const first = (user.name || '').split(' ')[0];
  const systemInstruction = `You are UniVerse's friendly spoken study tutor, talking with ${first || 'a student'}.${context}
Speak naturally and briefly (a few sentences at a time), then check understanding with a question. Guide the student to the answer step by step instead of just giving it, especially for homework or graded work. Use simple language and real examples. If you are not sure, say so. Reply in the language the student speaks. Stay on learning topics; for anything about safety or wellbeing, kindly suggest they talk to a trusted adult or the school's support team.`;

  const liveModel = (await aiModels()).live;
  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });
    const now = Date.now();
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + SESSION_MINUTES * 60_000).toISOString(),
        newSessionExpireTime: new Date(now + 60_000).toISOString(),
        liveConnectConstraints: {
          model: liveModel,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction,
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        },
      },
    });
    if (!token.name) throw new Error('No token returned');
    return NextResponse.json({ token: token.name, model: liveModel, minutes: SESSION_MINUTES, aiLeft: spend.left }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('voice tutor token failed:', e);
    return NextResponse.json({ error: 'The voice tutor is busy right now. Please try again in a moment.' }, { status: 503 });
  }
}
