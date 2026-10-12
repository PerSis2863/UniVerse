import { route } from '@/server/assignments';
import { getLectureMicroLesson, generateLectureMicroLesson } from '@/server/lecture-micro-lessons';

type Ctx = { params: Promise<{ id: string }> };

// Stage 5 · D3: Get or regenerate micro-lesson pack for a class session
export const GET = (req: Request, { params }: Ctx) =>
  route(req, async (user) => getLectureMicroLesson((await params).id, user));

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => generateLectureMicroLesson((await params).id, user, true));
