import { route } from '@/server/assignments';
import { importClassroom } from '@/server/connection-items';
import { NotFoundException } from '@/server/http';

type Ctx = { params: Promise<{ service: string }> };

// POST { courseId }: a Google Classroom class becomes a UniVersity course (M200). Only `classroom`.
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => {
  if ((await params).service !== 'classroom') throw new NotFoundException('Nothing to import from that service.');
  return importClassroom(user, (await req.json().catch(() => ({}))) ?? {});
});
