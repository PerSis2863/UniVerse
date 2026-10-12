import { route } from '@/server/assignments';
import { listCourseMicroLessons } from '@/server/lecture-micro-lessons';

type Ctx = { params: Promise<{ id: string }> };

// Stage 5 · D3: Get all micro-lessons and revision packs for a course
export const GET = (req: Request, { params }: Ctx) =>
  route(req, async (user) => listCourseMicroLessons((await params).id, user));
