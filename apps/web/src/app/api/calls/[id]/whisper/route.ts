import { route } from '@/server/assignments';
import { whisper, whisperAction } from '@/server/whisper';

// The Whisper TA in a class call (Stage 5 · D2). GET: a student's own questions, or the teacher's
// topics. POST: a student asks { question, heard }, or the teacher { action: 'addressed', topics }.
type Ctx = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => whisper(user, (await params).id));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => whisperAction(user, (await params).id, (await req.json().catch(() => ({}))) as Record<string, unknown>));
